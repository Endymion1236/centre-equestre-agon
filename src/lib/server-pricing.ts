// ═══════════════════════════════════════════════════════════════════
// src/lib/server-pricing.ts — Vérification serveur des prix (autoritaire)
// ═══════════════════════════════════════════════════════════════════
//
// OBJECTIF : garantir côté serveur qu'un client ne peut jamais sous-payer,
//            SANS répliquer la logique fragile de rang dégressif du panier
//            famille (qui dépend de l'ordre et du timing d'ajout au panier).
//
// APPROCHE (Option B — vérification bornée) :
//   Le serveur recharge le tarif SOURCE de chaque créneau depuis Firestore
//   (le client ne peut pas le falsifier) et borne chaque item :
//
//     • Cours        : aucune remise autorisée → prix == tarif créneau (±ε).
//     • Stage        : plancher ≤ prixFinal ≤ tarif semaine du créneau.
//     • Total        : dans [Σ planchers/cours ; Σ tarifs semaine].
//     • Acompte      : recalculé = min(30€ × enfants stage ; total).
//
//   Tout écart est REMONTÉ (findings) mais RIEN n'est imposé ici : c'est
//   l'appelant qui décide (shadow = journalise seulement ; enforce = refuse).
//
// POURQUOI PAS une réplique exacte du prix : le prix famille dépend d'un
//   `rang` ordonné (0€,10€,20€,30€…) calculé au moment de l'ajout panier.
//   Le reproduire au centre près côté serveur est fragile et risque de
//   surfacturer un vrai client sur un simple décalage d'ordre. La borne
//   basse (plancher) suffit à rendre le sous-paiement impossible.
//
// NB : ce module couvre le chemin FAMILLE (reserver). Les chemins admin
//   (applyDiscounts en %) et l'avoir seront branchés dans un second temps.
// ═══════════════════════════════════════════════════════════════════

import { adminDb } from "@/lib/firebase-admin";

const TVA_STAGE_DEFAUT = 5.5;
const ACOMPTE_PAR_ENFANT = 30; // doit rester synchro avec reserver/page.tsx
const EPSILON = 0.02; // tolérance d'arrondi (2 centimes)

const STAGE_TYPES = ["stage", "stage_journee"];

// ─── Types ──────────────────────────────────────────────────────────

export interface PricingAuditItemFinding {
  index: number;
  activityTitle: string;
  childId: string | null;
  activityType: string;
  creneauId: string | null;
  claimedBaseTTC: number; // originalPriceTTC du doc payment (prix plein annoncé)
  claimedFinalTTC: number; // priceTTC du doc payment (prix payé annoncé)
  refWeekTTC: number | null; // tarif semaine autoritaire (source créneau) — null si créneau introuvable
  floor: number; // plancher stage applicable (0 = pas de plancher)
  issues: string[]; // anomalies détectées sur cet item
}

export interface PricingAuditResult {
  paymentId: string;
  ok: boolean; // true = aucune anomalie détectée
  isDeposit: boolean;
  claimedTotalTTC: number; // totalTTC du doc payment
  claimedChargeTTC: number; // ce que le checkout s'apprête à facturer maintenant
  minLegitTotalTTC: number; // borne basse autoritaire (Σ planchers + prix cours)
  maxLegitTotalTTC: number; // borne haute autoritaire (Σ tarifs semaine)
  nbStageChildren: number;
  expectedDepositTTC: number | null; // acompte recalculé (si isDeposit)
  items: PricingAuditItemFinding[];
  globalIssues: string[];
}

// ─── Utilitaires ────────────────────────────────────────────────────

function weekPriceFromCreneau(cr: any): number | null {
  if (!cr) return null;
  if (typeof cr.priceTTC === "number" && cr.priceTTC > 0) {
    return Math.round(cr.priceTTC * 100) / 100;
  }
  if (typeof cr.priceHT === "number" && cr.priceHT > 0) {
    const tva = typeof cr.tvaTaux === "number" ? cr.tvaTaux : TVA_STAGE_DEFAUT;
    return Math.round(cr.priceHT * (1 + tva / 100) * 100) / 100;
  }
  return null;
}

// Lundi (YYYY-MM-DD) de la semaine contenant `dateStr`. Parse en UTC midi pour
// être déterministe côté serveur Vercel (process UTC) et éviter les décalages.
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=dim .. 6=sam
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Réplique locale de sameStage (admin/planning/types.ts) — pure, pas d'import
// cross-module pour rester autonome côté serveur.
function sameStageServer(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a.stageGroupId && b.stageGroupId) return a.stageGroupId === b.stageGroupId;
  if (a.activityId && b.activityId)
    return a.activityId === b.activityId && a.activityTitle === b.activityTitle;
  return a.activityTitle === b.activityTitle && a.startTime === b.startTime;
}

// ─── Vérification principale ────────────────────────────────────────

/**
 * Recharge le doc payment + les créneaux source et calcule les bornes
 * autoritaires. Ne lève jamais (retourne null en cas d'échec de chargement)
 * pour ne jamais casser un paiement réel depuis le mode shadow.
 *
 * @param chargeTTC  Montant (en euros) que le checkout s'apprête à facturer
 *                   maintenant (acompte ou total).
 */
export async function auditPaymentPricing(opts: {
  paymentId: string;
  chargeTTC: number;
  isDeposit: boolean;
}): Promise<PricingAuditResult | null> {
  const { paymentId, chargeTTC, isDeposit } = opts;

  try {
    // 1. Charger le doc payment
    const paySnap = await adminDb.collection("payments").doc(paymentId).get();
    if (!paySnap.exists) return null;
    const payment = paySnap.data() as any;
    const items: any[] = Array.isArray(payment.items) ? payment.items : [];
    if (items.length === 0) return null;

    // 2. Charger le plancher stage (settings/degressivite)
    let prixPlancherStage = 0;
    try {
      const setSnap = await adminDb.collection("settings").doc("degressivite").get();
      const s = setSnap.exists ? (setSnap.data() as any) : null;
      if (s && typeof s.prixPlancherStage === "number") prixPlancherStage = s.prixPlancherStage;
    } catch {
      /* défaut 0 */
    }

    // 3. Batch-load de tous les créneaux référencés (source de vérité)
    const creneauIds = new Set<string>();
    for (const it of items) {
      const ref = it.creneauId || (Array.isArray(it.creneauIds) ? it.creneauIds[0] : null);
      if (ref) creneauIds.add(ref);
    }
    const creneauMap = new Map<string, any>();
    const ids = Array.from(creneauIds);
    if (ids.length > 0) {
      const refs = ids.map((id) => adminDb.collection("creneaux").doc(id));
      const snaps = await adminDb.getAll(...refs);
      for (const snap of snaps) {
        if (snap.exists) creneauMap.set(snap.id, snap.data());
      }
    }

    // 4. Analyse item par item
    const findings: PricingAuditItemFinding[] = [];
    let minLegit = 0;
    let maxLegit = 0;
    const stageChildren = new Set<string>();

    // Compte le nombre TOTAL de jours d'un stage (dénominateur du prorata quand
    // priceTTCDay n'est pas renseigné). Réplique le regroupement famille :
    // même stage (sameStage) dans la même semaine. Mis en cache par stage.
    const stageDayCountCache = new Map<string, number>();
    async function getStageDayCount(cr: any): Promise<number> {
      if (!cr || !cr.date) return 1;
      const monday = mondayOf(cr.date);
      const key = cr.stageGroupId
        ? `g:${cr.stageGroupId}:${monday}`
        : `a:${cr.activityId || cr.activityTitle}:${cr.startTime}:${monday}`;
      const cached = stageDayCountCache.get(key);
      if (cached !== undefined) return cached;
      try {
        const snap = await adminDb
          .collection("creneaux")
          .where("date", ">=", monday)
          .where("date", "<=", addDaysStr(monday, 6))
          .get();
        const dates = new Set<string>();
        snap.forEach((d) => {
          const c = d.data() as any;
          if (
            (c.activityType === "stage" || c.activityType === "stage_journee") &&
            sameStageServer(c, cr) &&
            c.date
          ) {
            dates.add(c.date);
          }
        });
        const n = Math.max(1, dates.size);
        stageDayCountCache.set(key, n);
        return n;
      } catch {
        return 1;
      }
    }

    // Boucle async : le prorata jour peut nécessiter une lecture Firestore.
    for (let index = 0; index < items.length; index++) {
      const it = items[index];
      const activityType: string = it.activityType || "cours";
      const isStage = STAGE_TYPES.includes(activityType);
      const creneauRef: string | null =
        it.creneauId || (Array.isArray(it.creneauIds) ? it.creneauIds[0] : null);
      const cr = creneauRef ? creneauMap.get(creneauRef) : null;
      const refWeek = weekPriceFromCreneau(cr);

      const claimedFinal = Math.round(Number(it.priceTTC || 0) * 100) / 100;
      const claimedBase = Math.round(Number(it.originalPriceTTC || it.priceTTC || 0) * 100) / 100;

      // Mode jour = réservation partielle : la base annoncée est < tarif semaine.
      // Le plancher est un minimum SEMAINE — il ne s'applique JAMAIS au mode jour
      // (cohérent avec addStageToCart : mode jour = prix jour brut, aucun plancher).
      const isDayMode = isStage && refWeek !== null && claimedBase < refWeek - EPSILON;
      const dayPrice =
        cr && typeof cr.priceTTCDay === "number" && cr.priceTTCDay > 0 ? cr.priceTTCDay : null;
      const nbDaysItem = Array.isArray(it.creneauIds) ? it.creneauIds.length : 1;
      const floor = isStage && !isDayMode && prixPlancherStage > 0 ? prixPlancherStage : 0;

      const issues: string[] = [];

      if (refWeek === null) {
        issues.push("créneau source introuvable — prix invérifiable");
        // On ne peut pas borner : on prend le prix annoncé comme référence
        // pour ne pas fausser les totaux, mais on marque l'anomalie.
        minLegit += floor > 0 ? floor : claimedFinal;
        maxLegit += claimedBase;
      } else if (isStage && isDayMode) {
        stageChildren.add(it.childId);
        // MODE JOUR (partiel) : borne haute = tarif semaine ; borne basse =
        // prix jour × nb jours. Si priceTTCDay absent → prorata = tarif semaine
        // ÷ nb TOTAL de jours du stage (identique au panier famille). Pas de plancher.
        let effDayPrice = dayPrice;
        if (effDayPrice === null && refWeek !== null) {
          const totalDays = await getStageDayCount(cr);
          effDayPrice = Math.round((refWeek / totalDays) * 100) / 100;
        }
        const dayMin = effDayPrice !== null ? Math.round(effDayPrice * nbDaysItem * 100) / 100 : 0;
        if (claimedBase > refWeek + EPSILON) {
          issues.push(`base jour ${claimedBase}€ > tarif semaine ${refWeek}€`);
        }
        if (claimedFinal > claimedBase + EPSILON) {
          issues.push(`prix payé ${claimedFinal}€ > base jour ${claimedBase}€`);
        }
        if (effDayPrice !== null && claimedFinal < dayMin - EPSILON) {
          issues.push(`prix payé ${claimedFinal}€ < prix jour minimum ${dayMin}€`);
        }
        minLegit += dayMin;
        maxLegit += refWeek;
      } else if (isStage) {
        stageChildren.add(it.childId);
        // MODE SEMAINE : borne haute = tarif semaine ; borne basse = plancher.
        if (claimedFinal > refWeek + EPSILON) {
          issues.push(`prix payé ${claimedFinal}€ > tarif semaine ${refWeek}€`);
        }
        if (floor > 0 && claimedFinal < floor - EPSILON) {
          issues.push(`prix payé ${claimedFinal}€ < plancher ${floor}€`);
        }
        if (claimedBase > refWeek + EPSILON) {
          issues.push(`base annoncée ${claimedBase}€ > tarif semaine ${refWeek}€`);
        }
        minLegit += floor > 0 ? floor : 0;
        maxLegit += refWeek;
      } else {
        // COURS : aucune remise autorisée → prix == tarif créneau
        if (Math.abs(claimedFinal - refWeek) > EPSILON) {
          issues.push(`cours : prix payé ${claimedFinal}€ ≠ tarif créneau ${refWeek}€`);
        }
        minLegit += refWeek;
        maxLegit += refWeek;
      }

      findings.push({
        index,
        activityTitle: it.activityTitle || "",
        childId: it.childId ?? null,
        activityType,
        creneauId: creneauRef,
        claimedBaseTTC: claimedBase,
        claimedFinalTTC: claimedFinal,
        refWeekTTC: refWeek,
        floor,
        issues,
      });
    }

    minLegit = Math.round(minLegit * 100) / 100;
    maxLegit = Math.round(maxLegit * 100) / 100;

    // 5. Bornes globales + acompte
    const claimedTotal = Math.round(Number(payment.totalTTC || 0) * 100) / 100;
    const nbStageChildren = stageChildren.size;
    const globalIssues: string[] = [];

    if (claimedTotal < minLegit - EPSILON) {
      globalIssues.push(`total annoncé ${claimedTotal}€ < minimum autoritaire ${minLegit}€`);
    }
    if (claimedTotal > maxLegit + EPSILON) {
      globalIssues.push(`total annoncé ${claimedTotal}€ > maximum autoritaire ${maxLegit}€`);
    }

    let expectedDeposit: number | null = null;
    if (isDeposit) {
      expectedDeposit =
        Math.round(Math.min(ACOMPTE_PAR_ENFANT * nbStageChildren, claimedTotal) * 100) / 100;
      if (Math.abs(chargeTTC - expectedDeposit) > EPSILON) {
        globalIssues.push(`acompte facturé ${chargeTTC}€ ≠ acompte attendu ${expectedDeposit}€`);
      }
    } else {
      if (Math.abs(chargeTTC - claimedTotal) > EPSILON) {
        globalIssues.push(`montant facturé ${chargeTTC}€ ≠ total annoncé ${claimedTotal}€`);
      }
    }

    const ok = globalIssues.length === 0 && findings.every((f) => f.issues.length === 0);

    return {
      paymentId,
      ok,
      isDeposit,
      claimedTotalTTC: claimedTotal,
      claimedChargeTTC: Math.round(chargeTTC * 100) / 100,
      minLegitTotalTTC: minLegit,
      maxLegitTotalTTC: maxLegit,
      nbStageChildren,
      expectedDepositTTC: expectedDeposit,
      items: findings,
      globalIssues,
    };
  } catch (e) {
    console.error("[server-pricing] auditPaymentPricing a échoué:", e);
    return null;
  }
}

/**
 * Journalise le résultat d'audit dans la collection `pricing_audit`
 * (shadow mode). N'impose rien. Ne lève jamais.
 */
export async function logPricingAudit(
  result: PricingAuditResult,
  context: { route: string; familyId?: string | null; merchantRef?: string | null }
): Promise<void> {
  try {
    await adminDb.collection("pricing_audit").add({
      ...result,
      route: context.route,
      familyId: context.familyId ?? null,
      merchantRef: context.merchantRef ?? null,
      createdAt: new Date(),
    });
    if (!result.ok) {
      console.warn(
        `[server-pricing] ⚠️ ÉCART DÉTECTÉ payment=${result.paymentId} ` +
          `charge=${result.claimedChargeTTC}€ bornes=[${result.minLegitTotalTTC};${result.maxLegitTotalTTC}] ` +
          `global=${JSON.stringify(result.globalIssues)}`
      );
    } else {
      console.log(
        `[server-pricing] ✓ prix cohérent payment=${result.paymentId} charge=${result.claimedChargeTTC}€`
      );
    }
  } catch (e) {
    console.error("[server-pricing] logPricingAudit a échoué:", e);
  }
}
