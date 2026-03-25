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

import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
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
}

// ═══ UTILITAIRES ═══
export const fmtDate = (d: Date) => d.toISOString().split("T")[0];
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
  try {
    // Requête optimale (nécessite index composite: activityTitle + date)
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("activityTitle", "==", activityTitle),
      where("date", ">=", fmtDate(monday)),
      where("date", "<=", fmtDate(sunday)),
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  } catch (e) {
    // Fallback si index manquant : charger par date et filtrer côté client
    console.warn("Index Firestore manquant pour creneaux (activityTitle+date). Fallback client-side.", e);
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("date", ">=", fmtDate(monday)),
      where("date", "<=", fmtDate(sunday)),
    ));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((c: any) => c.activityTitle === activityTitle)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
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

/** Inscrit un enfant dans un créneau (lecture fraîche Firestore) */
export async function enrollChildInCreneau(creneauId: string, child: EnrolledChild): Promise<boolean> {
  const snap = await getDoc(doc(db, "creneaux", creneauId));
  if (!snap.exists()) return false;
  const c = snap.data();
  const enrolled = c.enrolled || [];
  if (enrolled.some((e: any) => e.childId === child.childId)) return false; // déjà inscrit
  await updateDoc(doc(db, "creneaux", creneauId), {
    enrolled: [...enrolled, child],
    enrolledCount: enrolled.length + 1,
  });
  return true;
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
  const snap = await getDoc(doc(db, "creneaux", creneauId));
  if (!snap.exists()) return;
  const enrolled = snap.data().enrolled || [];
  const newEnrolled = enrolled.filter((e: any) => e.childId !== childId);
  await updateDoc(doc(db, "creneaux", creneauId), {
    enrolled: newEnrolled,
    enrolledCount: newEnrolled.length,
  });
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
    
    // Priorité 3 : match par childId + activityTitle (texte)
    const matchById = items.find((i: any) =>
      i.childId === childId && (
        i.stageKey?.includes(activityTitle) ||
        i.activityTitle?.includes(activityTitle)
      )
    );
    if (matchById) return { paymentDoc: pDoc, paymentData: p, matchItem: matchById };
    
    // Priorité 4 : fallback ancien format (sans childId)
    const legacyMatch = items.find((i: any) =>
      !i.childId && typeof i.activityTitle === "string" && i.activityTitle.includes(activityTitle)
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

  await addDoc(collection(db, "avoirs"), {
    familyId,
    familyName,
    type: "avoir",
    amount: Math.round(montant * 100) / 100,
    usedAmount: 0,
    remainingAmount: Math.round(montant * 100) / 100,
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
        createdAt: serverTimestamp(),
      });
      count++;
    }
  }
  return { count, skipped };
}
