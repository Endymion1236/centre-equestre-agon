/**
 * GET /api/admin/fix-pending-reservations?secret=xxx
 *
 * One-shot de nettoyage : parcourt toutes les réservations en
 * status: "pending_payment" et les passe en "confirmed" SI un paiement
 * status: "paid" existe pour cette famille, dont les items contiennent
 * le couple (childId, creneauId) de la réservation.
 *
 * Mode dry-run par défaut — n'écrit rien, retourne juste la liste.
 * Ajouter ?apply=true pour appliquer les changements.
 *
 * Authentification : CRON_SECRET obligatoire.
 *
 * Ce endpoint doit être supprimé après usage (c'est un outil de migration).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Route non configurée" }, { status: 500 });
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";

  try {
    // 1. Charger toutes les résas pending_payment
    const resaSnap = await adminDb
      .collection("reservations")
      .where("status", "==", "pending_payment")
      .get();

    if (resaSnap.empty) {
      return NextResponse.json({
        mode: apply ? "apply" : "dry-run",
        pendingFound: 0,
        toConfirm: [],
        stillPending: [],
        updated: 0,
        message: "Aucune réservation en pending_payment trouvée.",
      });
    }

    // 2. Charger tous les paiements paid (en une fois, pour éviter N requêtes)
    const paySnap = await adminDb
      .collection("payments")
      .where("status", "==", "paid")
      .get();

    // Index par familyId pour lookup rapide
    type PayEntry = { id: string; items: any[] };
    const paymentsByFamily = new Map<string, PayEntry[]>();
    for (const doc of paySnap.docs) {
      const data = doc.data();
      const fid = data.familyId;
      if (!fid) continue;
      const entry: PayEntry = { id: doc.id, items: data.items || [] };
      const existing = paymentsByFamily.get(fid) || [];
      existing.push(entry);
      paymentsByFamily.set(fid, existing);
    }

    // 3. Pour chaque résa pending, chercher un paiement matchant
    const toConfirm: {
      reservationId: string;
      familyId: string;
      familyName: string;
      childName: string;
      activityTitle: string;
      date: string;
      matchedPaymentId: string;
    }[] = [];

    const stillPending: {
      reservationId: string;
      familyId: string;
      childName: string;
      activityTitle: string;
      date: string;
      reason: string;
    }[] = [];

    for (const doc of resaSnap.docs) {
      const r = doc.data();
      const familyId = r.familyId;
      const childId = r.childId;
      const creneauId = r.creneauId;

      if (!familyId || !childId || !creneauId) {
        stillPending.push({
          reservationId: doc.id,
          familyId: familyId || "(manquant)",
          childName: r.childName || "",
          activityTitle: r.activityTitle || "",
          date: r.date || "",
          reason: "Champs familyId/childId/creneauId manquants",
        });
        continue;
      }

      const familyPayments = paymentsByFamily.get(familyId) || [];
      let matchedPaymentId: string | null = null;

      for (const pay of familyPayments) {
        for (const item of pay.items) {
          if (item?.childId !== childId) continue;
          // Cours : creneauId unique
          if (item.creneauId === creneauId) {
            matchedPaymentId = pay.id;
            break;
          }
          // Stage : creneauIds array
          if (Array.isArray(item.creneauIds) && item.creneauIds.includes(creneauId)) {
            matchedPaymentId = pay.id;
            break;
          }
        }
        if (matchedPaymentId) break;
      }

      if (matchedPaymentId) {
        toConfirm.push({
          reservationId: doc.id,
          familyId,
          familyName: r.familyName || "",
          childName: r.childName || "",
          activityTitle: r.activityTitle || "",
          date: r.date || "",
          matchedPaymentId,
        });
      } else {
        stillPending.push({
          reservationId: doc.id,
          familyId,
          childName: r.childName || "",
          activityTitle: r.activityTitle || "",
          date: r.date || "",
          reason: "Aucun paiement 'paid' matchant trouvé",
        });
      }
    }

    // 4. Si apply=true, faire les updates
    let updated = 0;
    if (apply && toConfirm.length > 0) {
      // Batch par 500 (limite Firestore)
      const BATCH_SIZE = 400;
      for (let i = 0; i < toConfirm.length; i += BATCH_SIZE) {
        const chunk = toConfirm.slice(i, i + BATCH_SIZE);
        const batch = adminDb.batch();
        for (const item of chunk) {
          const ref = adminDb.collection("reservations").doc(item.reservationId);
          batch.update(ref, {
            status: "confirmed",
            confirmedAt: FieldValue.serverTimestamp(),
            confirmationSource: "fix-pending-reservations-oneshot",
          });
        }
        await batch.commit();
        updated += chunk.length;
      }
    }

    return NextResponse.json({
      mode: apply ? "apply" : "dry-run",
      pendingFound: resaSnap.size,
      toConfirmCount: toConfirm.length,
      stillPendingCount: stillPending.length,
      updated,
      toConfirm,
      stillPending,
      hint: apply
        ? "Modifications appliquées."
        : "Aucune modification — ajouter ?apply=true à l'URL pour exécuter.",
    });
  } catch (e: any) {
    console.error("fix-pending-reservations error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
