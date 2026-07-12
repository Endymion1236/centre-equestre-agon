/**
 * Calcul de prix AUTORITATIF côté serveur.
 *
 * Objectif (chantier « serveur seul maître des prix ») : recalculer le montant
 * d'un panier à partir des VRAIS prix des créneaux (rechargés via l'Admin SDK)
 * et de la dégressivité configurée, sans faire confiance aux prix envoyés par
 * le navigateur.
 *
 * Le client choisit QUELS créneaux (creneauId) et POUR QUI (childId) — ça, le
 * serveur le lit dans le document paiement — mais c'est le serveur qui fixe LE
 * PRIX de chaque créneau et applique les réductions.
 *
 * ⚠️ Les fonctions de calcul de réduction ci-dessous sont une COPIE FIDÈLE de
 * src/lib/discounts.ts (calculateFamilyDiscount / calculateMultiStageDiscount /
 * getPeriodForDate / applyDiscounts). Elles sont dupliquées ici uniquement pour
 * éviter d'importer le `db` client (firebase web) dans une route serveur. Toute
 * évolution du barème doit être répercutée dans LES DEUX fichiers.
 *
 * Utilisation prévue en 2 temps :
 *   1) MODE OBSERVATION : on compare le total serveur au total client et on
 *      journalise les écarts, sans rien imposer (aucun risque de surfacturer).
 *   2) Après validation sur preprod : le serveur impose son montant / refuse
 *      les écarts.
 */

import { adminDb } from "@/lib/firebase-admin";

const STAGE_TYPES = ["stage", "stage_journee"];

// ── Types (miroir de discounts.ts) ───────────────────────────────────────────
interface DiscountRule { nth: number; discount: number }
interface VacationPeriod { id: string; startDate: string; endDate: string }
interface DiscountSettings {
  familyDiscount: DiscountRule[];
  multiStageDiscount: DiscountRule[];
  prixPlancherStage: number;
}
interface StageInscription { childId: string; activityType: string; date: string; creneauId?: string }

// ── Fonctions de réduction pures (COPIE de discounts.ts) ─────────────────────
function getPeriodForDate(date: string, periods: VacationPeriod[]): string | null {
  if (!date) return null;
  for (const p of periods) {
    if (date >= p.startDate && date <= p.endDate) return p.id;
  }
  return null;
}

function calculateFamilyDiscount(existingStages: StageInscription[], newChildId: string, familyRules: DiscountRule[]): { percent: number; nth: number } {
  if (!familyRules || familyRules.length === 0) return { percent: 0, nth: 0 };
  const distinctChildren = new Set(existingStages.map((s) => s.childId));
  if (distinctChildren.has(newChildId)) return { percent: 0, nth: 0 };
  const nth = distinctChildren.size + 1;
  if (nth < 2) return { percent: 0, nth };
  const sortedRules = [...familyRules].sort((a, b) => a.nth - b.nth);
  let applicableRule: DiscountRule | null = null;
  for (const rule of sortedRules) { if (rule.nth <= nth) applicableRule = rule; else break; }
  return { percent: applicableRule?.discount ?? 0, nth };
}

function calculateMultiStageDiscount(existingStages: StageInscription[], newChildId: string, multiStageRules: DiscountRule[]): { percent: number; nth: number } {
  if (!multiStageRules || multiStageRules.length === 0) return { percent: 0, nth: 0 };
  const childStages = existingStages.filter((s) => s.childId === newChildId);
  const nth = childStages.length + 1;
  if (nth < 2) return { percent: 0, nth };
  const sortedRules = [...multiStageRules].sort((a, b) => a.nth - b.nth);
  let applicableRule: DiscountRule | null = null;
  for (const rule of sortedRules) { if (rule.nth <= nth) applicableRule = rule; else break; }
  return { percent: applicableRule?.discount ?? 0, nth };
}

function applyStageDiscount(params: {
  existingStages: StageInscription[];
  newChildId: string;
  stageDate: string;
  originalPriceTTC: number;
  settings: DiscountSettings;
  periods: VacationPeriod[];
}): number {
  const { existingStages, newChildId, stageDate, originalPriceTTC, settings, periods } = params;
  const periodId = getPeriodForDate(stageDate, periods);
  if (!periodId) return originalPriceTTC; // hors vacances = pas de réduction
  const period = periods.find((p) => p.id === periodId);
  if (!period) return originalPriceTTC;
  const inPeriod = existingStages.filter((s) => s.date >= period.startDate && s.date <= period.endDate);
  const family = calculateFamilyDiscount(inPeriod, newChildId, settings.familyDiscount);
  const multi = calculateMultiStageDiscount(inPeriod, newChildId, settings.multiStageDiscount);
  const totalPercent = family.percent + multi.percent;
  if (totalPercent === 0) return originalPriceTTC;
  const capped = Math.min(totalPercent, 50);
  const rawDiscount = Math.round(originalPriceTTC * capped) / 100;
  let finalPriceTTC = Math.round((originalPriceTTC - rawDiscount) * 100) / 100;
  const plancher = settings.prixPlancherStage || 0;
  if (plancher > 0 && finalPriceTTC < plancher) finalPriceTTC = Math.round(plancher * 100) / 100;
  return finalPriceTTC;
}

// ── Chargeurs Admin SDK ──────────────────────────────────────────────────────
async function loadDiscountSettings(): Promise<DiscountSettings> {
  try {
    const snap = await adminDb.collection("settings").doc("degressivite").get();
    const data = (snap.exists ? snap.data() : {}) as any;
    return {
      familyDiscount: Array.isArray(data?.familyDiscount) ? data.familyDiscount : [],
      multiStageDiscount: Array.isArray(data?.multiStageDiscount) ? data.multiStageDiscount : [],
      prixPlancherStage: typeof data?.prixPlancherStage === "number" ? data.prixPlancherStage : 0,
    };
  } catch { return { familyDiscount: [], multiStageDiscount: [], prixPlancherStage: 0 }; }
}

async function loadVacationPeriods(): Promise<VacationPeriod[]> {
  try {
    const snap = await adminDb.collection("vacationPeriods").get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as VacationPeriod[];
  } catch { return []; }
}

/** Réservations "stage" existantes de la famille (pour la dégressivité). */
async function loadFamilyStages(familyId: string, excludeCreneauIds: Set<string>): Promise<StageInscription[]> {
  try {
    const snap = await adminDb.collection("reservations").where("familyId", "==", familyId).get();
    const out: StageInscription[] = [];
    for (const d of snap.docs) {
      const r = d.data() as any;
      if (!STAGE_TYPES.includes(r.activityType)) continue;
      if (r.creneauId && excludeCreneauIds.has(r.creneauId)) continue;
      out.push({ childId: r.childId, activityType: r.activityType, date: r.date, creneauId: r.creneauId });
    }
    return out;
  } catch { return []; }
}

/** Prix TTC autoritatif d'un créneau (rechargé depuis Firestore). */
async function creneauPriceTTC(creneauId: string): Promise<number | null> {
  try {
    const snap = await adminDb.collection("creneaux").doc(creneauId).get();
    if (!snap.exists) return null;
    const c = snap.data() as any;
    const ttc = typeof c.priceTTC === "number" ? c.priceTTC : (c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100);
    return Math.round(ttc * 100) / 100;
  } catch { return null; }
}

/**
 * Recalcule le total PLEIN (hors acompte) d'un panier de paiement, à partir des
 * items du document paiement (creneauId(s) + childId + activityType + date).
 *
 * Retourne { serverTotal, perItem, missing } — `missing` liste les items qu'on
 * n'a pas pu repricer (créneau introuvable) : dans ce cas on retombe sur le prix
 * client pour cet item afin de ne pas fausser la comparaison.
 */
export async function computePaymentFullTotalServer(payment: {
  familyId?: string;
  items?: any[];
}): Promise<{ serverTotal: number; clientTotal: number; perItem: any[]; missing: number }> {
  const items = Array.isArray(payment.items) ? payment.items : [];
  const familyId = payment.familyId || "";

  const [settings, periods] = await Promise.all([loadDiscountSettings(), loadVacationPeriods()]);

  // Exclure du comptage dégressif les créneaux du panier courant.
  const cartCreneauIds = new Set<string>();
  for (const it of items) {
    (Array.isArray(it.creneauIds) ? it.creneauIds : (it.creneauId ? [it.creneauId] : [])).forEach((c: string) => c && cartCreneauIds.add(c));
  }
  const existingStages = familyId ? await loadFamilyStages(familyId, cartCreneauIds) : [];

  // Pour la dégressivité multi-items dans le même panier, on accumule au fur et
  // à mesure les stages "déjà comptés" (comme le client le fait item par item).
  const accumulated: StageInscription[] = [...existingStages];

  let serverTotal = 0;
  let clientTotal = 0;
  let missing = 0;
  const perItem: any[] = [];

  for (const it of items) {
    const clientPrice = typeof it.priceTTC === "number" ? it.priceTTC : 0;
    clientTotal += clientPrice;

    const isStage = STAGE_TYPES.includes(it.activityType);
    const ids: string[] = Array.isArray(it.creneauIds) && it.creneauIds.length
      ? it.creneauIds
      : (it.creneauId ? [it.creneauId] : []);

    // Prix de base autoritatif = somme des prix TTC des créneaux de l'item.
    let base = 0;
    let couldPrice = ids.length > 0;
    for (const cid of ids) {
      const p = await creneauPriceTTC(cid);
      if (p == null) { couldPrice = false; break; }
      base += p;
    }
    base = Math.round(base * 100) / 100;

    let serverPrice: number;
    if (!couldPrice) {
      // Créneau introuvable : on retombe sur le prix client pour ne pas fausser.
      serverPrice = clientPrice;
      missing++;
    } else if (!isStage) {
      serverPrice = base; // cours / balade : prix plein, pas de réduction
    } else {
      serverPrice = applyStageDiscount({
        existingStages: accumulated,
        newChildId: it.childId,
        stageDate: it.date || (Array.isArray(it.stageDates) && it.stageDates[0]?.date) || "",
        originalPriceTTC: base,
        settings, periods,
      });
      // Comptabiliser cet item pour la dégressivité des items suivants.
      for (const cid of ids) accumulated.push({ childId: it.childId, activityType: "stage", date: it.date || "", creneauId: cid });
    }

    serverPrice = Math.round(serverPrice * 100) / 100;
    serverTotal += serverPrice;
    perItem.push({ childId: it.childId, isStage, base, clientPrice, serverPrice });
  }

  return {
    serverTotal: Math.round(serverTotal * 100) / 100,
    clientTotal: Math.round(clientTotal * 100) / 100,
    perItem,
    missing,
  };
}
