/**
 * Attribution d'un numéro de facture séquentiel et continu (CGI art. 242
 * nonies A) — transaction Firestore atomique sur settings/invoiceCounter,
 * compteur par année, format F-YYYY-NNNN, audit dans invoice_audit.
 *
 * Factorisé pour être appelé PAR TOUS les chemins qui soldent une vente :
 * encaissement UI (route next-number), retour checkout CAWL, prélèvement
 * MIT du cron, webhook — une vente réglée doit TOUJOURS avoir sa facture.
 *
 * Les avoirs suivent le même régime : un avoir EST une facture au sens
 * fiscal, il lui faut donc une séquence propre, continue et sans trou —
 * cf. attribuerNumeroAvoir().
 */

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Le serveur tourne en UTC. Sans fuseau explicite, une facture émise le
// 1er janvier à 00h30 à Agon porterait l'année précédente — et rouvrirait
// une séquence close.
const ANNEE_PARIS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "numeric",
});

/** Année civile à Agon, pas celle du serveur. */
export function anneeComptable(date: Date = new Date()): number {
  return Number(ANNEE_PARIS.format(date));
}

/**
 * Attribue le prochain numéro d'une séquence, en transaction.
 * Une seule mécanique pour les factures et les avoirs : deux compteurs
 * distincts dans le même document, même garantie d'unicité.
 */
async function prochainNumero(champ: string): Promise<number> {
  const counterRef = adminDb.collection("settings").doc("invoiceCounter");
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? snap.data()?.[champ] || 0 : 0;
    const next = current + 1;
    if (snap.exists) {
      tx.update(counterRef, { [champ]: next, updatedAt: FieldValue.serverTimestamp() });
    } else {
      tx.set(counterRef, { [champ]: next, updatedAt: FieldValue.serverTimestamp() });
    }
    return next;
  });
}

export async function attribuerNumeroFacture(opts: {
  paymentId?: string | null;
  attributedBy?: string | null; // uid/email humain, ou "system:cawl-status", "system:cron-mit"…
}): Promise<{ invoiceNumber: string; sequence: number; year: number }> {
  const year = anneeComptable();
  const nextNum = await prochainNumero(`year_${year}`);

  const invoiceNumber = `F-${year}-${String(nextNum).padStart(4, "0")}`;

  try {
    await adminDb.collection("invoice_audit").add({
      invoiceNumber,
      sequence: nextNum,
      year,
      type: "facture",
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

/**
 * Attribue un numéro d'avoir séquentiel et continu : AV-YYYY-NNNN.
 *
 * Auparavant, chacun des huit endroits qui créaient un avoir fabriquait sa
 * propre référence à partir de l'horloge (`AV-${Date.now()...}`). Deux avoirs
 * émis dans la même milliseconde partageaient la même référence, et surtout
 * rien ne permettait de prouver qu'aucun avoir n'avait été supprimé : sans
 * séquence, il n'y a pas de trou visible. Un avoir étant une facture au sens
 * fiscal (art. 242 nonies A de l'annexe II au CGI), il lui faut la même
 * numérotation chronologique et continue.
 */
export async function attribuerNumeroAvoir(opts: {
  paymentId?: string | null;
  familyId?: string | null;
  motif?: string | null;
  attributedBy?: string | null;
}): Promise<{ reference: string; sequence: number; year: number }> {
  const year = anneeComptable();
  const nextNum = await prochainNumero(`avoir_year_${year}`);

  const reference = `AV-${year}-${String(nextNum).padStart(4, "0")}`;

  try {
    await adminDb.collection("invoice_audit").add({
      invoiceNumber: reference,
      sequence: nextNum,
      year,
      type: "avoir",
      paymentId: opts.paymentId || null,
      familyId: opts.familyId || null,
      motif: opts.motif || null,
      attributedBy: opts.attributedBy || "system",
      attributedByEmail: null,
      attributedAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // Non bloquant, comme pour les factures : l'audit ne doit pas empêcher
    // l'émission de l'avoir dû au client.
    console.error("invoice_audit write failed (non-blocking):", e);
  }

  console.log(`✅ Numéro d'avoir attribué: ${reference} (paymentId=${opts.paymentId || "—"}, by=${opts.attributedBy || "system"})`);
  return { reference, sequence: nextNum, year };
}

/**
 * Journalise un numéro réservé qui ne sera finalement pas utilisé.
 *
 * La séquence doit être continue ; un trou inexpliqué est présumé cacher une
 * pièce supprimée. Le numéro ne peut pas être « rendu » (une autre facture a
 * pu être émise entre-temps), mais un trou tracé et daté n'est plus un trou :
 * c'est une ligne du journal d'audit qu'on peut présenter au vérificateur.
 */
export async function journaliserNumeroPerdu(opts: {
  numero: string;
  raison: string;
  paymentId?: string | null;
}): Promise<void> {
  try {
    await adminDb.collection("invoice_audit").add({
      invoiceNumber: opts.numero,
      type: "numero-perdu",
      raison: opts.raison,
      paymentId: opts.paymentId || null,
      attributedBy: "system",
      attributedAt: FieldValue.serverTimestamp(),
    });
    console.warn(`⚠️ Numéro ${opts.numero} réservé mais non utilisé — ${opts.raison}`);
  } catch (e) {
    console.error("invoice_audit (numéro perdu) write failed:", e);
  }
}
