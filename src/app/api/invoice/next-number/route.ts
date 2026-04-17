/**
 * POST /api/invoice/next-number
 *
 * Attribue un numéro de facture séquentiel et continu, en transaction
 * Firestore atomique — zéro risque de doublon même si plusieurs paiements
 * se soldent simultanément.
 *
 * Conformité fiscale française (CGI art. 242 nonies A) :
 *   - Numérotation chronologique et continue
 *   - Pas de rupture de séquence
 *   - Compteur par année, format F-YYYY-NNNN
 *
 * Authentification : staff only (admin ou moniteur).
 * Le paymentId est passé en body pour traçabilité dans les logs.
 *
 * Payload:
 *   { paymentId?: string }
 * Retour:
 *   { invoiceNumber: "F-2026-0042", sequence: 42, year: 2026 }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const paymentId: string | undefined = body?.paymentId;

    const year = new Date().getFullYear();
    const counterRef = adminDb.collection("settings").doc("invoiceCounter");
    const yearKey = `year_${year}`;

    // Transaction atomique : lire, incrémenter, écrire en un seul acte
    const nextNum = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists ? (snap.data()?.[yearKey] || 0) : 0;
      const next = current + 1;

      // merge=true pour ne pas effacer les autres années
      if (snap.exists) {
        tx.update(counterRef, {
          [yearKey]: next,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(counterRef, {
          [yearKey]: next,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return next;
    });

    const invoiceNumber = `F-${year}-${String(nextNum).padStart(4, "0")}`;

    // Audit : logger l'attribution pour reconstituer la séquence en cas de pépin
    try {
      await adminDb.collection("invoice_audit").add({
        invoiceNumber,
        sequence: nextNum,
        year,
        paymentId: paymentId || null,
        attributedBy: auth.uid,
        attributedByEmail: auth.email || null,
        attributedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // Non-bloquant : l'audit ne doit pas empêcher la facturation
      console.error("invoice_audit write failed (non-blocking):", e);
    }

    console.log(
      `✅ Invoice number attribué: ${invoiceNumber} (paymentId=${paymentId || "—"})`
    );

    return NextResponse.json({
      invoiceNumber,
      sequence: nextNum,
      year,
    });
  } catch (error: any) {
    console.error("invoice/next-number error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur interne" },
      { status: 500 }
    );
  }
}
