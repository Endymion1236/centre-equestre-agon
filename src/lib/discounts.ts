// ═══════════════════════════════════════════════════════════════════
// src/lib/discounts.ts — Logique centralisée des réductions
// ═══════════════════════════════════════════════════════════════════
//
// OBJECTIF : Regrouper toute la logique de calcul des réductions
//            (famille + multi-stages) et la logique de fusion
//            d'un nouveau paiement dans un impayé existant.
//
// POURQUOI : Cette logique est appelée depuis plusieurs endroits
//            (/admin/planning, /admin/paiements, à l'encaissement,
//            revérification avant création du payment). Le fait
//            d'avoir un seul endroit évite les divergences de calcul.
//
// RÈGLES MÉTIER (décidées avec Nicolas) :
//
//   1. La réduction famille s'applique UNIQUEMENT aux stages
//      (pas aux cours, balades, compétitions…).
//
//   2. "Même semaine" = même période de vacances scolaires,
//      définie dans la collection Firestore `vacationPeriods`.
//
//   3. Famille + multi-stages sont CUMULABLES.
//
//   4. Fusion d'impayé : on ajoute une inscription à un payment
//      existant UNIQUEMENT si son status === "pending" ET qu'il
//      date de moins de 7 jours. Sinon, nouvelle commande.
//      On ne merge JAMAIS dans un payment "paid" ni "partial".
//
// ═══════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Types ──────────────────────────────────────────────────────────

export interface VacationPeriod {
  id: string;
  name: string; // ex: "Vacances de Pâques 2026"
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
}

export interface DiscountRule {
  nth: number; // rang (2, 3, 4…)
  discount: number; // pourcentage (20 = -20%)
}

export interface DiscountSettings {
  familyDiscount: DiscountRule[]; // ex: [{ nth: 2, discount: 20 }, { nth: 3, discount: 30 }]
  multiStageDiscount: DiscountRule[]; // ex: [{ nth: 2, discount: 10 }, { nth: 3, discount: 15 }]
}

export interface StageInscription {
  childId: string;
  childName: string;
  familyId: string;
  stageDate: string; // "YYYY-MM-DD" (date du stage, pas d'inscription)
  stageTitle: string;
  creneauId: string;
  priceTTC: number; // prix plein de référence
}

export interface DiscountResult {
  originalPriceTTC: number;
  finalPriceTTC: number;
  discountPercent: number; // total cumulé
  discountAmount: number; // en €
  reasons: string[]; // ex: ["2ème enfant famille (-20%)", "3ème stage consécutif (-15%)"]
}

export type PaymentStatus = "paid" | "pending" | "partial" | "refunded";

export interface ExistingPayment {
  id: string;
  familyId: string;
  status: PaymentStatus;
  date: Timestamp | { seconds: number; nanoseconds: number } | null;
  totalTTC: number;
  paidAmount: number;
  items: any[];
}

// ─── Constantes ─────────────────────────────────────────────────────

const MERGE_WINDOW_DAYS = 7; // fusion autorisée si impayé < 7 jours
const STAGE_TYPES = ["stage", "stage_journee"]; // types éligibles à la réduction famille

// ─── Périodes de vacances ───────────────────────────────────────────

/**
 * Récupère toutes les périodes de vacances depuis Firestore.
 * À appeler une fois au chargement de la page qui fait les calculs.
 */
export async function fetchVacationPeriods(): Promise<VacationPeriod[]> {
  try {
    const snap = await getDocs(collection(db, "vacationPeriods"));
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as VacationPeriod));
  } catch (e) {
    console.error("[discounts] fetchVacationPeriods failed:", e);
    return [];
  }
}

/**
 * Retourne l'id de la période de vacances contenant la date donnée,
 * ou null si la date ne tombe dans aucune période définie.
 *
 * @param date - date au format "YYYY-MM-DD"
 * @param periods - liste des périodes (déjà chargées)
 */
export function getPeriodForDate(
  date: string,
  periods: VacationPeriod[]
): string | null {
  if (!date) return null;
  for (const p of periods) {
    if (date >= p.startDate && date <= p.endDate) return p.id;
  }
  return null;
}

// ─── Récupération des inscriptions existantes ───────────────────────

/**
 * Récupère toutes les réservations "stage" actives d'une famille
 * tombant dans une période de vacances donnée.
 *
 * Utilisé pour savoir combien d'enfants/stages sont déjà inscrits
 * avant d'appliquer la réduction sur une nouvelle inscription.
 */
export async function fetchFamilyStagesInPeriod(
  familyId: string,
  period: VacationPeriod,
  excludeCreneauId?: string
): Promise<StageInscription[]> {
  try {
    // Query simple sur familyId uniquement (index simple déjà présent).
    // Filtrage des dates + activityType fait en mémoire : volume faible
    // par famille (quelques dizaines de réservations max).
    // NOTE : on évite ainsi d'avoir à créer un index composite
    // familyId + date dans Firestore.
    const q1 = query(
      collection(db, "reservations"),
      where("familyId", "==", familyId)
    );
    const snap = await getDocs(q1);
    const allRes = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as any);

    // Log de diagnostic (utile pour debug si réductions ne se déclenchent pas)
    if (typeof window !== "undefined" && (window as any).__DEBUG_DISCOUNTS__) {
      console.log("[discounts] fetchFamilyStagesInPeriod", {
        familyId,
        period: `${period.startDate} → ${period.endDate}`,
        totalReservations: allRes.length,
        types: Array.from(new Set(allRes.map((r: any) => r.activityType))),
        excludeCreneauId,
      });
    }

    return allRes
      .filter((r: any) => {
        if (r.status === "cancelled") return false;
        if (!STAGE_TYPES.includes(r.activityType)) return false;
        if (!r.date) return false;
        // Comparaison lexicographique OK pour "YYYY-MM-DD"
        if (r.date < period.startDate || r.date > period.endDate) return false;
        // Exclure la réservation du créneau en cours de traitement
        // (cas où handleEnroll appelle createReservation avant applyDiscounts)
        if (excludeCreneauId && r.creneauId === excludeCreneauId) return false;
        return true;
      })
      .map((r: any) => ({
        childId: r.childId,
        childName: r.childName,
        familyId: r.familyId,
        stageDate: r.date,
        stageTitle: r.activityTitle,
        creneauId: r.creneauId || "",
        priceTTC: r.priceTTC || 0,
      }));
  } catch (e) {
    console.error("[discounts] fetchFamilyStagesInPeriod failed:", e);
    return [];
  }
}

// ─── Calcul des réductions ──────────────────────────────────────────

/**
 * Calcule la réduction famille pour une nouvelle inscription stage,
 * en tenant compte des inscriptions existantes de la même famille
 * dans la même période.
 *
 * Règle : on compte le nombre d'ENFANTS DISTINCTS déjà inscrits
 * dans la période. Si ce nombre est N, la nouvelle inscription
 * (pour un enfant non encore inscrit) est considérée comme la
 * (N+1)ème — la règle du barème pour nth=N+1 s'applique.
 *
 * Si l'enfant qu'on inscrit est DÉJÀ inscrit ailleurs dans la même
 * période, on ne compte pas de nouvelle réduction famille
 * (il est déjà compté dans son enfant existant).
 *
 * @returns pourcentage de réduction famille (0 si pas applicable)
 */
export function calculateFamilyDiscount(
  existingStages: StageInscription[],
  newChildId: string,
  familyRules: DiscountRule[]
): { percent: number; nth: number } {
  if (!familyRules || familyRules.length === 0) return { percent: 0, nth: 0 };

  // Compter les enfants distincts déjà inscrits
  const distinctChildren = new Set(existingStages.map((s) => s.childId));

  // Est-ce que le nouvel enfant est déjà inscrit ?
  const alreadyInscribed = distinctChildren.has(newChildId);

  // Si oui : on ne lui applique PAS la réduction famille sur cette
  // nouvelle inscription — il est déjà le même "enfant".
  // Par contre il pourrait bénéficier du multi-stages (voir autre fonction).
  if (alreadyInscribed) return { percent: 0, nth: 0 };

  // Sinon : le nouvel enfant sera le (N+1)ème enfant distinct
  const nth = distinctChildren.size + 1;

  // 1er enfant = pas de réduction
  if (nth < 2) return { percent: 0, nth };

  // Chercher la règle correspondant à ce rang (ou la plus proche au-dessus)
  const sortedRules = [...familyRules].sort((a, b) => a.nth - b.nth);
  let applicableRule: DiscountRule | null = null;
  for (const rule of sortedRules) {
    if (rule.nth <= nth) applicableRule = rule;
    else break;
  }

  return {
    percent: applicableRule?.discount ?? 0,
    nth,
  };
}

/**
 * Calcule la réduction multi-stages pour un enfant donné,
 * selon le nombre de stages qu'il a déjà dans la période.
 *
 * Règle : si l'enfant a déjà N stages dans la période, cette
 * nouvelle inscription est la (N+1)ème — la règle du barème
 * pour nth=N+1 s'applique.
 */
export function calculateMultiStageDiscount(
  existingStages: StageInscription[],
  newChildId: string,
  multiStageRules: DiscountRule[]
): { percent: number; nth: number } {
  if (!multiStageRules || multiStageRules.length === 0)
    return { percent: 0, nth: 0 };

  const childStages = existingStages.filter((s) => s.childId === newChildId);
  const nth = childStages.length + 1;

  if (nth < 2) return { percent: 0, nth };

  const sortedRules = [...multiStageRules].sort((a, b) => a.nth - b.nth);
  let applicableRule: DiscountRule | null = null;
  for (const rule of sortedRules) {
    if (rule.nth <= nth) applicableRule = rule;
    else break;
  }

  return {
    percent: applicableRule?.discount ?? 0,
    nth,
  };
}

/**
 * Fonction principale : calcule le prix final d'une nouvelle
 * inscription stage, en appliquant famille + multi-stages.
 *
 * À appeler :
 *   - Au moment de l'inscription (calcul live pour affichage)
 *   - Au moment de l'encaissement (revérification avant création payment)
 */
export async function applyDiscounts(params: {
  familyId: string;
  newChildId: string;
  stageDate: string;
  stageType: string;
  originalPriceTTC: number;
  settings: DiscountSettings;
  periods: VacationPeriod[];
  excludeCreneauId?: string; // créneau en cours d'inscription à exclure du comptage
}): Promise<DiscountResult> {
  const {
    familyId,
    newChildId,
    stageDate,
    stageType,
    originalPriceTTC,
    settings,
    periods,
    excludeCreneauId,
  } = params;

  // Par défaut : pas de réduction
  const noDiscount: DiscountResult = {
    originalPriceTTC,
    finalPriceTTC: originalPriceTTC,
    discountPercent: 0,
    discountAmount: 0,
    reasons: [],
  };

  // 1. Ne s'applique qu'aux stages
  if (!STAGE_TYPES.includes(stageType)) return noDiscount;

  // 2. Identifier la période de vacances
  const periodId = getPeriodForDate(stageDate, periods);
  if (!periodId) return noDiscount; // hors vacances scolaires = pas de réduction

  const period = periods.find((p) => p.id === periodId);
  if (!period) return noDiscount;

  // 3. Charger les inscriptions existantes de la famille dans la période
  //    (en excluant la résa qu'on vient juste de créer pour le créneau courant)
  const existingStages = await fetchFamilyStagesInPeriod(familyId, period, excludeCreneauId);

  // 4. Calculer les deux types de réduction
  const family = calculateFamilyDiscount(
    existingStages,
    newChildId,
    settings.familyDiscount
  );
  const multi = calculateMultiStageDiscount(
    existingStages,
    newChildId,
    settings.multiStageDiscount
  );

  // 5. Cumul (additif, pas multiplicatif — convention du projet)
  const totalPercent = family.percent + multi.percent;
  if (totalPercent === 0) return noDiscount;

  // Plafond de sécurité à 50% pour éviter les dérives
  const cappedPercent = Math.min(totalPercent, 50);

  const discountAmount = Math.round(originalPriceTTC * cappedPercent) / 100;
  const finalPriceTTC = Math.round((originalPriceTTC - discountAmount) * 100) / 100;

  const reasons: string[] = [];
  if (family.percent > 0) {
    reasons.push(`${family.nth}ème enfant famille (-${family.percent}%)`);
  }
  if (multi.percent > 0) {
    reasons.push(`${multi.nth}ème stage (-${multi.percent}%)`);
  }
  if (cappedPercent < totalPercent) {
    reasons.push(`(plafonné à 50%)`);
  }

  return {
    originalPriceTTC,
    finalPriceTTC,
    discountPercent: cappedPercent,
    discountAmount: Math.round(discountAmount * 100) / 100,
    reasons,
  };
}

// ─── Fusion d'impayé ────────────────────────────────────────────────

/**
 * Détermine si une nouvelle inscription peut être ajoutée à un
 * payment existant, selon la règle métier :
 *   - Seulement si status === "pending"
 *   - Et si le payment date de moins de MERGE_WINDOW_DAYS jours
 *   - Jamais si "paid", "partial", ou "refunded"
 *
 * Retourne le payment mergeable, ou null pour créer une nouvelle commande.
 */
export async function findMergeablePayment(
  familyId: string
): Promise<ExistingPayment | null> {
  try {
    const q1 = query(
      collection(db, "payments"),
      where("familyId", "==", familyId),
      where("status", "==", "pending")
    );
    const snap = await getDocs(q1);
    if (snap.empty) return null;

    const now = Date.now();
    const windowMs = MERGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    // Garder uniquement ceux dans la fenêtre de 7 jours
    const candidates = snap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }) as any)
      .filter((p: any) => {
        if (!p.date) return false;
        const ms =
          p.date.seconds !== undefined
            ? p.date.seconds * 1000
            : new Date(p.date).getTime();
        if (isNaN(ms)) return false;
        return now - ms <= windowMs;
      })
      .sort((a: any, b: any) => {
        // Prendre le plus récent d'abord
        const aMs = a.date?.seconds ? a.date.seconds * 1000 : 0;
        const bMs = b.date?.seconds ? b.date.seconds * 1000 : 0;
        return bMs - aMs;
      });

    return (candidates[0] as ExistingPayment) || null;
  } catch (e) {
    console.error("[discounts] findMergeablePayment failed:", e);
    return null;
  }
}

// ─── Chargement des settings ────────────────────────────────────────

/**
 * Charge les barèmes de réduction depuis Firestore.
 * Fallback : valeurs par défaut si pas configuré.
 */
export async function fetchDiscountSettings(): Promise<DiscountSettings> {
  const defaults: DiscountSettings = {
    familyDiscount: [
      { nth: 2, discount: 5 },
      { nth: 3, discount: 10 },
    ],
    multiStageDiscount: [
      { nth: 2, discount: 10 },
      { nth: 3, discount: 15 },
      { nth: 4, discount: 20 },
    ],
  };

  try {
    // Source unique : /settings/degressivite (édité depuis /admin/parametres → onglet Dégressivité)
    //   Champs : { multiStage: [...], familyDiscount: [...] }
    const snap = await getDoc(doc(db, "settings", "degressivite"));
    if (!snap.exists()) return defaults;
    const data = snap.data() as any;
    return {
      familyDiscount: Array.isArray(data.familyDiscount) && data.familyDiscount.length > 0
        ? data.familyDiscount
        : defaults.familyDiscount,
      // Le champ est stocké sous le nom "multiStage" dans Firestore (legacy),
      // on le mappe vers multiStageDiscount côté interne.
      multiStageDiscount: Array.isArray(data.multiStage) && data.multiStage.length > 0
        ? data.multiStage
        : defaults.multiStageDiscount,
    };
  } catch (e) {
    console.error("[discounts] fetchDiscountSettings failed, using defaults:", e);
    return defaults;
  }
}
