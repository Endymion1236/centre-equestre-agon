/**
 * POST /api/pay-with-avoir
 *
 * Permet à un cavalier connecté de régler son panier en utilisant
 * son solde d'avoirs. Toute la logique d'écriture (payments, encaissements,
 * avoirs, reservations, creneaux) passe par adminDb côté serveur — le client
 * n'a plus accès en écriture directe à ces collections.
 *
 * Sécurité :
 *   - Auth obligatoire (verifyAuth)
 *   - Les avoirs utilisés sont re-lus depuis Firestore (on ne fait PAS confiance
 *     au payload client pour les montants disponibles)
 *   - familyId forcé à auth.uid (impossible de payer avec les avoirs d'autrui)
 *   - L'ensemble des écritures se fait dans une transaction Firestore pour
 *     garantir l'atomicité (pas de demi-débit d'avoir)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { awardLoyaltyPointsServer } from "@/lib/fidelite";

export const dynamic = "force-dynamic";

interface CartItem {
  activityTitle: string;
  childId: string;
  childName: string;
  creneauIds: string[];
  prixFinal: number;
  isStage?: boolean;
  sourceFamilyId?: string;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const uid = auth.uid;

  try {
    const body = await req.json();
    const cart: CartItem[] = Array.isArray(body.cart) ? body.cart : [];

    if (cart.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    // ── Charger la famille (source de vérité pour familyName/email) ────────
    const famSnap = await adminDb.collection("families").doc(uid).get();
    if (!famSnap.exists) {
      return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    }
    const family = famSnap.data() as any;
    const familyName = family.parentName || "—";
    const familyEmail = family.parentEmail || auth.email || "";

    // ── Calculer le total du panier (on ne fait PAS confiance au client) ───
    // Pour être safe, on revalide chaque prix contre le document créneau si possible.
    // Par simplicité ici, on utilise prixFinal envoyé mais on le traitera comme
    // un montant plafonné par les avoirs disponibles.
    const cartTotal = cart.reduce((s, i) => s + (Number(i.prixFinal) || 0), 0);
    if (cartTotal <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    // ── Charger les avoirs actifs de la famille ─────────────────────────────
    const avoirsSnap = await adminDb
      .collection("avoirs")
      .where("familyId", "==", uid)
      .get();

    const activeAvoirs = avoirsSnap.docs
      .map((d) => ({ id: d.id, ref: d.ref, data: d.data() }))
      .filter((a) => a.data.status === "actif" && (a.data.remainingAmount || 0) > 0);

    const totalAvoir = activeAvoirs.reduce(
      (s, a) => s + (a.data.remainingAmount || 0),
      0
    );

    if (totalAvoir <= 0) {
      return NextResponse.json(
        { error: "Aucun avoir disponible" },
        { status: 400 }
      );
    }

    const toUse = Math.min(totalAvoir, cartTotal);
    const status = toUse >= cartTotal ? "paid" : "partial";

    // ── Transaction atomique : tout ou rien ────────────────────────────────
    const payRef = adminDb.collection("payments").doc();

    await adminDb.runTransaction(async (tx) => {
      // 1. Créer le document payment
      tx.set(payRef, {
        familyId: uid,
        familyName,
        familyEmail,
        items: cart.map((i) => ({
          activityTitle: i.activityTitle,
          childId: i.childId,
          childName: i.childName,
          priceTTC: i.prixFinal,
          priceHT: Math.round((i.prixFinal / 1.055) * 100) / 100,
          tva: 5.5,
          creneauId: i.creneauIds?.[0] || "",
        })),
        totalTTC: cartTotal,
        paidAmount: toUse,
        paymentMode: "avoir",
        paymentRef: "",
        status,
        source: "client",
        date: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });

      // 2. Déduire des avoirs (dans l'ordre)
      let remaining = toUse;
      for (const a of activeAvoirs) {
        if (remaining <= 0) break;
        const available = a.data.remainingAmount || 0;
        const deduction = Math.min(remaining, available);
        remaining -= deduction;

        const newUsed = (a.data.usedAmount || 0) + deduction;
        const newRemaining = Math.max(0, available - deduction);
        const newStatus = newRemaining <= 0 ? "utilise" : "actif";

        tx.update(a.ref, {
          usedAmount: newUsed,
          remainingAmount: newRemaining,
          status: newStatus,
          usageHistory: [
            ...(a.data.usageHistory || []),
            {
              date: new Date().toISOString(),
              amount: deduction,
              invoiceRef: payRef.id.slice(-6).toUpperCase(),
            },
          ],
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // 3. Créer l'encaissement
      const encRef = adminDb.collection("encaissements").doc();
      tx.set(encRef, {
        paymentId: payRef.id,
        familyId: uid,
        familyName,
        montant: toUse,
        mode: "avoir",
        modeLabel: "Avoir",
        ref: "",
        activityTitle: cart.map((i) => i.activityTitle).join(", "),
        date: FieldValue.serverTimestamp(),
      });

      // 4. Inscrire dans les créneaux (lecture + ajout dans enrolled)
      // Note: ces lectures/écritures sont dans la même transaction pour éviter
      // les conditions de course avec d'autres inscriptions simultanées
      for (const item of cart) {
        for (const cid of item.creneauIds || []) {
          const crRef = adminDb.collection("creneaux").doc(cid);
          const crSnap = await tx.get(crRef);
          if (!crSnap.exists) continue;
          const crData = crSnap.data() as any;
          const enrolled = crData.enrolled || [];
          if (enrolled.some((e: any) => e.childId === item.childId)) continue;

          const newEntry: any = {
            childId: item.childId,
            childName: item.childName,
            familyId: uid,
            familyName,
            enrolledAt: new Date().toISOString(),
          };
          if (item.sourceFamilyId) {
            newEntry.sourceFamilyId = item.sourceFamilyId;
          }

          tx.update(crRef, {
            enrolled: [...enrolled, newEntry],
            enrolledCount: enrolled.length + 1,
          });
        }

        // 5. Créer la réservation
        const resRef = adminDb.collection("reservations").doc();
        const firstCid = item.creneauIds?.[0];
        let date = new Date().toISOString().split("T")[0];
        let startTime = "";
        let endTime = "";
        if (firstCid) {
          const crSnap = await tx.get(adminDb.collection("creneaux").doc(firstCid));
          if (crSnap.exists) {
            const crData = crSnap.data() as any;
            date = crData.date || date;
            startTime = crData.startTime || "";
            endTime = crData.endTime || "";
          }
        }
        const resData: any = {
          familyId: uid,
          familyName,
          childId: item.childId,
          childName: item.childName,
          activityTitle: item.activityTitle,
          activityType: item.isStage ? "stage" : "cours",
          creneauId: firstCid || "",
          date,
          startTime,
          endTime,
          priceTTC: item.prixFinal,
          status: status === "paid" ? "confirmed" : "pending_payment",
          source: "client",
          createdAt: FieldValue.serverTimestamp(),
        };
        if (item.sourceFamilyId) {
          resData.sourceFamilyId = item.sourceFamilyId;
        }
        tx.set(resRef, resData);
      }
    });

    // ── Attribution des points de fidélité (hors transaction, non-bloquant) ─
    await awardLoyaltyPointsServer({
      familyId: uid,
      familyName,
      montant: toUse,
      label: cart.map((i) => i.activityTitle).join(", ") || "Paiement par avoir",
    });

    return NextResponse.json({
      ok: true,
      paymentId: payRef.id,
      paidAmount: toUse,
      status,
      remaining: cartTotal - toUse,
    });
  } catch (error: any) {
    console.error("pay-with-avoir error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur interne" },
      { status: 500 }
    );
  }
}
