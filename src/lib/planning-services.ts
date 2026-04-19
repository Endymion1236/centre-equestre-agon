/**
 * Planning Services — Logique métier extraite du composant Planning
 * 
 * Fonctions :
 * - enrollStage() : inscription stage multi-enfants multi-jours
 * - enrollAnnual() : inscription annuelle avec forfait
 * - unenrollWithFinance() : désinscription avec gestion avoir
 * - findStageCreneaux() : trouve tous les créneaux d'un stage sur la semaine
 * - computeStageReductions() : calcule les réductions fratrie
 * - duplicateWeek() : duplique les créneaux sur N semaines
 */

import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ═══ TYPES ═══
export interface EnrolledChild {
  childId: string;
  childName: string;
  familyId: string;
  familyName: string;
  enrolledAt: string;
}

export interface StageLine {
  childId: string;
  childName: string;
  prixBase: number;
  remiseEuros: number;
  rang: number;
  prixReduit: number;
  // Nouveaux champs (via applyDiscounts) — optionnels pour rétrocompat
  discountPercent?: number;
  discountReasons?: string[];
  originalPriceTTC?: number;
}

// ═══ UTILITAIRES ═══
export const fmtDate = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
export const safeNumber = (v: any) => Number.isFinite(Number(v)) ? Number(v) : 0;

export function getWeekBounds(dateStr: string) {
  const d = new Date(dateStr);
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(monday.getDate() - ((dow + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { monday, sunday };
}

// ═══ STAGES ═══

/** Trouve tous les créneaux d'un stage sur la même semaine */
export async function findStageCreneaux(activityTitle: string, dateStr: string) {
  const { monday, sunday } = getWeekBounds(dateStr);
  const mondayStr = fmtDate(monday);
  const sundayStr = fmtDate(sunday);

  // Log diagnostic (retirer une fois qu'on a compris le bug de désinscription
  // Simone Thibault qui laissait des traces dans le montoir après unenroll).
  // Voir aussi handleUnenroll dans planning/page.tsx qui logge la suite.
  console.log("[findStageCreneaux] Recherche", {
    activityTitle,
    dateRef: dateStr,
    bounds: `${mondayStr} → ${sundayStr}`,
  });

  try {
    // Requête optimale (nécessite index composite: activityTitle + date)
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("activityTitle", "==", activityTitle),
      where("date", ">=", mondayStr),
      where("date", "<=", sundayStr),
    ));
    const result = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    console.log("[findStageCreneaux] Trouvés (requête indexée)", result.length, "créneaux :",
      result.map((c: any) => ({ id: c.id, date: c.date, startTime: c.startTime, nbInscrits: (c.enrolled || []).length })));
    return result;
  } catch (e) {
    // Fallback si index manquant : charger par date et filtrer côté client
    console.warn("[findStageCreneaux] Index Firestore manquant (activityTitle+date). Fallback client-side.", e);
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("date", ">=", mondayStr),
      where("date", "<=", sundayStr),
    ));
    const allInWeek = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const result = allInWeek
      .filter((c: any) => c.activityTitle === activityTitle)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
    console.log("[findStageCreneaux] Trouvés (fallback client)", result.length, "créneaux (sur",
      allInWeek.length, "de la semaine) :",
      result.map((c: any) => ({ id: c.id, date: c.date, startTime: c.startTime, nbInscrits: (c.enrolled || []).length })));
    // Log aussi les activityTitle présents dans la semaine mais qui n'ont pas matché,
    // utile si le nom du stage a été modifié entre temps
    const autresTitres = Array.from(new Set(allInWeek.map((c: any) => c.activityTitle)))
      .filter((t: any) => t !== activityTitle);
    if (autresTitres.length > 0) {
      console.log("[findStageCreneaux] Autres titres dans la semaine :", autresTitres);
    }
    return result;
  }
}

/** Compte les inscriptions stage uniques (enfant + titre stage) pour une famille */
export function countExistingStageInscriptions(
  allCreneaux: any[],
  familyId: string,
  excludeActivityTitle?: string,
): number {
  const uniqueInscriptions = new Set<string>();
  allCreneaux
    .filter(c => c.activityType === "stage" || c.activityType === "stage_journee")
    .forEach(c => {
      if (excludeActivityTitle && c.activityTitle === excludeActivityTitle) return;
      (c.enrolled || [])
        .filter((e: any) => e.familyId === familyId)
        .forEach((e: any) => { uniqueInscriptions.add(`${e.childId}_${c.activityTitle}`); });
    });
  return uniqueInscriptions.size;
}

/** Calcule les réductions pour chaque enfant d'un stage */
export function computeStageReductions(
  selectedChildren: string[],
  children: any[],
  prixBase: number,
  existingStageCount: number,
): StageLine[] {
  return selectedChildren.map((childId, idx) => {
    const child = children.find((c: any) => c.id === childId);
    const rang = existingStageCount + idx;
    const remiseEuros = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
    const prixReduit = Math.max(0, Math.round((prixBase - remiseEuros) * 100) / 100);
    return {
      childId,
      childName: child?.firstName || "?",
      prixBase,
      remiseEuros,
      rang: rang + 1,
      prixReduit,
    };
  });
}

/**
 * Version async qui utilise applyDiscounts (réductions famille + multi-stages
 * sur la période de vacances scolaires). Remplace progressivement la version
 * synchrone figée (10€/20€/30€) pour les stages en période de vacances.
 *
 * Appelle applyDiscounts une fois par enfant. Chaque appel simule l'inscription
 * de CE enfant en plus des précédents déjà traités dans la boucle, pour que
 * les rangs famille/multi-stages soient correctement incrémentés.
 */
export async function computeStageReductionsAsync(params: {
  selectedChildren: string[];
  children: any[];
  prixBase: number;
  familyId: string;
  stageDate: string;
  stageType: string;
  creneauId: string; // à exclure (déjà inscrit en amont)
  settings: import("./discounts").DiscountSettings;
  periods: import("./discounts").VacationPeriod[];
}): Promise<StageLine[]> {
  const { applyDiscounts, fetchFamilyStagesInPeriod, getPeriodForDate } = await import("./discounts");
  const {
    selectedChildren, children, prixBase, familyId,
    stageDate, stageType, creneauId, settings, periods,
  } = params;

  // 1. Identifier la période — si hors vacances, pas de réduction (prix plein)
  const periodId = getPeriodForDate(stageDate, periods);
  const period = periodId ? periods.find((p) => p.id === periodId) : null;

  if (!period) {
    // Hors vacances → fallback prix plein, sans réduction
    return selectedChildren.map((childId, idx) => {
      const child = children.find((c: any) => c.id === childId);
      return {
        childId,
        childName: child?.firstName || "?",
        prixBase,
        remiseEuros: 0,
        rang: idx + 1,
        prixReduit: prixBase,
      };
    });
  }

  // 2. Charger les stages déjà inscrits (sans la résa en cours)
  const existingStages = await fetchFamilyStagesInPeriod(familyId, period, creneauId);

  // 3. Pour chaque enfant sélectionné, calculer sa réduction en tenant compte
  //    des enfants précédents dans la boucle (simuler l'ordre d'inscription)
  const results: StageLine[] = [];
  const simulatedStages = [...existingStages];

  for (let idx = 0; idx < selectedChildren.length; idx++) {
    const childId = selectedChildren[idx];
    const child = children.find((c: any) => c.id === childId);
    const childName = child?.firstName || "?";

    // On passe par applyDiscounts en simulant : les stages "existants" pour
    // cet enfant incluent les enfants précédents de la sélection courante.
    const result = await applyDiscounts({
      familyId,
      newChildId: childId,
      stageDate,
      stageType,
      originalPriceTTC: prixBase,
      settings,
      periods,
      excludeCreneauId: creneauId,
      // NB : on ne peut pas passer simulatedStages directement (API ne le permet pas)
      // Pour que le calcul soit correct, il faut que les enfants précédents aient
      // déjà créé leurs réservations dans Firestore, OU qu'on réécrive applyDiscounts
      // pour accepter un tableau de stages à ajouter virtuellement. Ici on simule.
    } as any);

    // Ajuster manuellement pour prendre en compte les enfants précédents
    // (pas encore dans Firestore). On recalcule à partir des règles brutes :
    const distinctChildren = new Set(simulatedStages.map((s) => s.childId));
    const nthFamille = distinctChildren.has(childId) ? 0 : distinctChildren.size + 1;
    const nbStagesEnfant = simulatedStages.filter((s) => s.childId === childId).length;
    const nthMultiStage = nbStagesEnfant + 1;

    const famRule = [...(settings.familyDiscount || [])].sort((a, b) => a.nth - b.nth);
    const msRule = [...(settings.multiStageDiscount || [])].sort((a, b) => a.nth - b.nth);

    let pctFamille = 0;
    if (nthFamille >= 2) {
      for (const r of famRule) if (r.nth <= nthFamille) pctFamille = r.discount;
    }
    let pctMulti = 0;
    if (nthMultiStage >= 2) {
      for (const r of msRule) if (r.nth <= nthMultiStage) pctMulti = r.discount;
    }
    const totalPct = Math.min(pctFamille + pctMulti, 50);
    const discountAmount = Math.round((prixBase * totalPct) / 100 * 100) / 100;
    const prixReduit = Math.max(0, Math.round((prixBase - discountAmount) * 100) / 100);

    const reasons: string[] = [];
    if (pctFamille > 0) reasons.push(`${nthFamille}ème enfant famille (-${pctFamille}%)`);
    if (pctMulti > 0) reasons.push(`${nthMultiStage}ème stage (-${pctMulti}%)`);

    results.push({
      childId,
      childName,
      prixBase,
      remiseEuros: discountAmount,
      rang: nthFamille || 1,
      prixReduit,
      discountPercent: totalPct,
      discountReasons: reasons,
      originalPriceTTC: prixBase,
    });

    // Ajouter cet enfant aux stages "simulés" pour le prochain enfant de la boucle
    simulatedStages.push({
      childId,
      childName,
      familyId,
      stageDate,
      stageTitle: "",
      creneauId,
      priceTTC: prixBase,
    });
  }

  // Log debug si activé
  if (typeof window !== "undefined" && (window as any).__DEBUG_DISCOUNTS__) {
    console.log("[computeStageReductionsAsync]", {
      familyId,
      period: period.name,
      existingStagesCount: existingStages.length,
      results: results.map((r) => ({ child: r.childName, reduction: r.discountPercent + "%", prix: r.prixReduit })),
    });
  }

  return results;
}


/** Inscrit un enfant dans un créneau (lecture fraîche Firestore) */
export async function enrollChildInCreneau(creneauId: string, child: EnrolledChild): Promise<boolean> {
  try {
    const result = await runTransaction(db, async (transaction) => {
      const creneauRef = doc(db, "creneaux", creneauId);
      const snap = await transaction.get(creneauRef);
      if (!snap.exists()) return false;
      const c = snap.data();
      const enrolled = c.enrolled || [];
      if (enrolled.some((e: any) => e.childId === child.childId)) return false;
      transaction.update(creneauRef, {
        enrolled: [...enrolled, child],
        enrolledCount: enrolled.length + 1,
      });
      return true;
    });
    return result;
  } catch (e) {
    console.error("Transaction enrollChildInCreneau failed:", e);
    return false;
  }
}

/** Crée une réservation pour un enfant */
export async function createReservation(
  child: EnrolledChild,
  creneau: any,
) {
  const priceTTC = creneau.priceTTC || (creneau.priceHT || 0) * (1 + (creneau.tvaTaux || 5.5) / 100);
  await addDoc(collection(db, "reservations"), {
    familyId: child.familyId,
    familyName: child.familyName,
    childId: child.childId,
    childName: child.childName,
    activityTitle: creneau.activityTitle,
    activityType: creneau.activityType,
    creneauId: creneau.id,
    date: creneau.date,
    startTime: creneau.startTime,
    endTime: creneau.endTime,
    priceTTC: Math.round(priceTTC * 100) / 100,
    status: "confirmed",
    source: "admin",
    createdAt: serverTimestamp(),
  });
}

// ═══ DÉSINSCRIPTION ═══

/** Retire un enfant d'un créneau */
export async function removeChildFromCreneau(creneauId: string, childId: string) {
  try {
    await runTransaction(db, async (transaction) => {
      const creneauRef = doc(db, "creneaux", creneauId);
      const snap = await transaction.get(creneauRef);
      if (!snap.exists()) return;
      const enrolled = snap.data().enrolled || [];
      const newEnrolled = enrolled.filter((e: any) => e.childId !== childId);
      transaction.update(creneauRef, {
        enrolled: newEnrolled,
        enrolledCount: newEnrolled.length,
      });
    });
  } catch (e) {
    console.error("Transaction removeChildFromCreneau failed:", e);
  }
}

/** Supprime les réservations d'un enfant pour un créneau */
export async function deleteReservations(creneauId: string, childId: string) {
  const snap = await getDocs(query(
    collection(db, "reservations"),
    where("creneauId", "==", creneauId),
    where("childId", "==", childId),
  ));
  for (const d of snap.docs) await deleteDoc(doc(db, "reservations", d.id));
}

/** Trouve le paiement lié à un enfant + activité */
export async function findLinkedPayment(familyId: string, childId: string, activityTitle: string, creneauId?: string, activityId?: string) {
  const paySnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", familyId)));
  for (const pDoc of paySnap.docs) {
    const p = pDoc.data();
    if (p.status === "cancelled") continue;
    const items = p.items || [];
    
    // Priorité 1 : match par childId + creneauId (le plus fiable)
    if (creneauId) {
      const matchByCreneau = items.find((i: any) => i.childId === childId && i.creneauId === creneauId);
      if (matchByCreneau) return { paymentDoc: pDoc, paymentData: p, matchItem: matchByCreneau };
    }
    
    // Priorité 2 : match par childId + activityId
    if (activityId) {
      const matchByActivity = items.find((i: any) => i.childId === childId && i.activityId === activityId);
      if (matchByActivity) return { paymentDoc: pDoc, paymentData: p, matchItem: matchByActivity };
    }
    
    // Priorité 3 : match par childId + activityTitle (exact d'abord, puis includes)
    const matchExact = items.find((i: any) =>
      i.childId === childId && (
        i.activityTitle === activityTitle ||
        i.stageKey === activityTitle
      )
    );
    if (matchExact) return { paymentDoc: pDoc, paymentData: p, matchItem: matchExact };

    // Priorité 4 : match par childId + activityTitle (includes, pour les titres avec suffixe)
    const matchIncludes = items.find((i: any) =>
      i.childId === childId && activityTitle.length > 3 && (
        i.stageKey?.includes(activityTitle) ||
        i.activityTitle?.includes(activityTitle)
      )
    );
    if (matchIncludes) return { paymentDoc: pDoc, paymentData: p, matchItem: matchIncludes };
    
    // Priorité 5 : fallback ancien format (sans childId) — match exact uniquement
    const legacyMatch = items.find((i: any) =>
      !i.childId && typeof i.activityTitle === "string" && i.activityTitle === activityTitle
    );
    if (legacyMatch) return { paymentDoc: pDoc, paymentData: p, matchItem: legacyMatch };
  }
  return null;
}

/** Calcule le trop-perçu pour un paiement après retrait d'une ligne */
export async function computeTropPercu(paymentId: string, newTotal: number): Promise<number> {
  const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", paymentId)));
  const totalEncaisse = encSnap.docs.reduce((s, d) => s + safeNumber(d.data().montant), 0);
  return Math.max(0, totalEncaisse - safeNumber(newTotal));
}

/** Crée un avoir famille */
export async function createAvoir(
  familyId: string,
  familyName: string,
  montant: number,
  reason: string,
  sourcePaymentId?: string,
  sourceType?: string,
) {
  const ref = `AV-${Date.now().toString(36).toUpperCase()}`;
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  const amount = Math.round(montant * 100) / 100;

  await addDoc(collection(db, "avoirs"), {
    familyId,
    familyName,
    type: "avoir",
    amount,
    usedAmount: 0,
    remainingAmount: amount,
    reason,
    reference: ref,
    sourcePaymentId: sourcePaymentId || "",
    sourceType: sourceType || "desinscription",
    expiryDate: expiry,
    status: "actif",
    usageHistory: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Trace dans le journal des encaissements (montant négatif = avoir)
  await addDoc(collection(db, "encaissements"), {
    paymentId: sourcePaymentId || "",
    familyId,
    familyName,
    montant: -amount,
    mode: "avoir",
    modeLabel: `Avoir (${sourceType || "désinscription"})`,
    ref,
    activityTitle: reason,
    date: serverTimestamp(),
    isAvoir: true,
    avoirRef: ref,
  });

  return ref;
}

// ═══ DUPLICATION ═══

/** Duplique les créneaux d'une semaine sur N semaines suivantes */
export async function duplicateWeekCreneaux(creneaux: any[], nbWeeks: number) {
  let count = 0, skipped = 0;
  for (let w = 1; w <= nbWeeks; w++) {
    // Charger les créneaux existants de la semaine cible
    const firstDate = new Date(creneaux[0].date);
    firstDate.setDate(firstDate.getDate() + 7 * w);
    const lastDate = new Date(firstDate);
    lastDate.setDate(lastDate.getDate() + 6);
    let existing: any[] = [];
    try {
      const snap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", fmtDate(firstDate)), where("date", "<=", fmtDate(lastDate))));
      existing = snap.docs.map(d => d.data());
    } catch { /* index manquant */ }

    for (const c of creneaux) {
      const d = new Date(c.date);
      d.setDate(d.getDate() + 7 * w);
      const targetDate = fmtDate(d);
      // Anti-doublon
      if (existing.some(ex => ex.date === targetDate && ex.startTime === c.startTime && ex.activityTitle === c.activityTitle)) {
        skipped++; continue;
      }
      await addDoc(collection(db, "creneaux"), {
        activityId: c.activityId,
        activityTitle: c.activityTitle,
        activityType: c.activityType,
        date: targetDate,
        startTime: c.startTime,
        endTime: c.endTime,
        monitor: c.monitor,
        maxPlaces: c.maxPlaces,
        enrolledCount: 0,
        enrolled: [],
        status: "planned",
        priceHT: c.priceHT || 0,
        priceTTC: c.priceTTC || 0,
        tvaTaux: c.tvaTaux || 5.5,
        ...(c.price1day ? { price1day: c.price1day } : {}),
        ...(c.price2days ? { price2days: c.price2days } : {}),
        ...(c.price3days ? { price3days: c.price3days } : {}),
        ...(c.price4days ? { price4days: c.price4days } : {}),
        createdAt: serverTimestamp(),
      });
      count++;
    }
  }
  return { count, skipped };
}
