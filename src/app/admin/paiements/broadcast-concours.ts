/**
 * src/app/admin/paiements/broadcast-concours.ts
 *
 * Diffusion d'une commande type vers plusieurs familles d'un coup : le cas
 * du concours ou du coaching, où le club engage vingt cavaliers sur le même
 * événement avec les mêmes lignes (engagement + coaching) et des montants
 * qui varient d'une famille à l'autre.
 *
 * Deux effets par famille, et ils ne sont pas symétriques :
 *  - une commande `pending` est créée (elle apparaîtra dans Impayés) ;
 *  - le cavalier est inscrit sur le créneau compétition de la commande
 *    source, car une compétition est un événement unique : tout le monde
 *    va sur le MÊME créneau, contrairement à un cours.
 *
 * Les erreurs sont comptées, jamais propagées : sur vingt familles, une
 * inscription qui échoue (créneau supprimé entre-temps) ne doit pas annuler
 * les dix-neuf autres commandes déjà créées. Le décompte renvoyé sert à
 * afficher un récapitulatif honnête plutôt qu'un « c'est fait » optimiste.
 */

import { collection, getDocs, addDoc, updateDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, round2, generateOrderId } from "@/lib/utils";
import type { BroadcastRow } from "./types-etat";

export const creerCommandesBroadcast = async (
  broadcastRows: BroadcastRow[],
  broadcastSource: any | null,
): Promise<{ ok: number; err: number; totalInscriptionsCompet: number; inscriptionsCompetErr: number }> => {
  let ok = 0; let err = 0;
  let totalInscriptionsCompet = 0; // Nombre d'inscriptions compétition réussies
  let inscriptionsCompetErr = 0;   // Erreurs d'inscription (créneau introuvable, déjà plein, etc.)
  for (const row of broadcastRows) {
    try {
      // Recalculer les items avec les overrides de prix
      const items = row.items.map((item: any, idx: number) => {
        const overrideTTC = row.overrides[idx];
        if (overrideTTC !== undefined) {
          const tva = safeNumber(item.tva || item.tvaTaux || 5.5);
          return { ...item, priceTTC: overrideTTC, priceHT: round2(overrideTTC / (1 + tva / 100)) };
        }
        return item;
      });
      const totalTTC = round2(items.reduce((s: number, i: any) => s + safeNumber(i.priceTTC), 0));
      await addDoc(collection(db, "payments"), {
        orderId: generateOrderId(),
        familyId: row.familyId,
        familyName: row.familyName,
        items,
        totalTTC,
        status: "pending",
        paidAmount: 0,
        paymentMode: "",
        paymentRef: "",
        source: "broadcast",
        sourcePaymentId: broadcastSource?.id || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      ok++;

      // ── Inscription au créneau compétition ──────────────────────────────
      // Pour les items de type "competition", on réinscrit l'enfant au même
      // créneau que celui de la commande source (1 compet = 1 événement unique
      // donc tous les enfants du broadcast vont sur le même créneau).
      // On déduplique par creneauId pour éviter d'inscrire 2 fois si l'item
      // engagement et l'item coaching pointent sur le même créneau.
      const creneauxAInscrire = new Set<string>();
      const sourceItems = broadcastSource?.items || [];
      sourceItems.forEach((srcItem: any) => {
        if (srcItem.activityType === "competition" && srcItem.creneauId) {
          creneauxAInscrire.add(srcItem.creneauId);
        }
      });

      for (const creneauId of creneauxAInscrire) {
        try {
          const slotRef = doc(db, "creneaux", creneauId);
          const slotSnap = await getDoc(slotRef);
          if (!slotSnap.exists()) {
            console.warn(`[broadcast] créneau ${creneauId} introuvable pour ${row.familyName}`);
            inscriptionsCompetErr++;
            continue;
          }
          const slot = slotSnap.data() as any;
          const enrolled: any[] = slot.enrolled || [];
          // Déduplication : ne réinscrit pas si l'enfant est déjà sur le créneau
          if (enrolled.some((e: any) => e.childId === row.childId)) continue;
          await updateDoc(slotRef, {
            enrolled: [...enrolled, {
              childId: row.childId,
              childName: row.childName,
              familyId: row.familyId,
              familyName: row.familyName,
              enrolledAt: new Date().toISOString(),
            }],
            enrolledCount: enrolled.length + 1,
          });
          totalInscriptionsCompet++;
        } catch (e) {
          console.error(`[broadcast] erreur inscription créneau ${creneauId} pour ${row.familyName}`, e);
          inscriptionsCompetErr++;
        }
      }
    } catch (e) { console.error("Erreur broadcast famille", row.familyName, e); err++; }
  }
  return { ok, err, totalInscriptionsCompet, inscriptionsCompetErr };
};
