/**
 * Attribution d'un numéro de facture séquentiel et continu (CGI art. 242
 * nonies A) — transaction Firestore atomique sur settings/invoiceCounter,
 * compteur par année, format F-YYYY-NNNN, audit dans invoice_audit.
 *
 * Factorisé pour être appelé PAR TOUS les chemins qui soldent une vente :
 * encaissement UI (route next-number), retour checkout CAWL, prélèvement
 * MIT du cron, webhook — une vente réglée doit TOUJOURS avoir sa facture.
 */

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function attribuerNumeroFacture(opts: {
  paymentId?: string | null;
  attributedBy?: string | null; // uid/email humain, ou "system:cawl-status", "system:cron-mit"…
}): Promise<{ invoiceNumber: string; sequence: number; year: number }> {
  const year = new Date().getFullYear();
  const counterRef = adminDb.collection("settings").doc("invoiceCounter");
  const yearKey = `year_${year}`;

  const nextNum = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? snap.data()?.[yearKey] || 0 : 0;
    const next = current + 1;
    if (snap.exists) {
      tx.update(counterRef, { [yearKey]: next, updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(counterRef, { [yearKey]: next, updatedAt: FieldValue.serverTimestamp() });
    }
    return next;
  });

  const invoiceNumber = `F-${year}-${String(nextNum).padStart(4, "0")}`;

  try {
    await adminDb.collection("invoice_audit").add({
      invoiceNumber,
      sequence: nextNum,
      year,
      paymentId: opts.paymentId || null,
      attributedBy: opts.attributedBy || "system",
      attributedByEmail: null,
      attributedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // Non-bloquant : l'audit ne doit pas empêcher la facturation
    console.error("invoice_audit write failed (non-blocking):", e);
  }

  console.log(`✅ Invoice number attribué: ${invoiceNumber} (paymentId=${opts.paymentId || "—"}, by=${opts.attributedBy || "system"})`);
  return { invoiceNumber, sequence: nextNum, year };
}
