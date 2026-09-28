/**
 * POST /api/admin/recaler-commande  { paymentId }
 *
 * Remet le montant réglé et le statut d'une commande d'accord avec le journal
 * des encaissements (cf. lib/recalage-commande). Réparation proposée par
 * l'onglet Cohérence pour « Le journal et la commande divergent ».
 *
 * Ne touche QUE `paidAmount`, `status` et `sepaRestant` de la commande. Le
 * journal, les échéances et la facture ne sont pas modifiés ; une commande
 * soldée sans numéro de facture est signalée à part par Cohérence.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { messageErreur } from "@/lib/message-erreur";
import { recalerCommandeSurJournal } from "@/lib/recalage-commande";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { paymentId } = await req.json().catch(() => ({} as any));
    if (!paymentId) return NextResponse.json({ error: "paymentId requis" }, { status: 400 });

    const ref = adminDb.collection("payments").doc(String(paymentId));
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });
    const p = snap.data() as any;
    if (p.status === "cancelled") {
      return NextResponse.json(
        { error: "Commande annulée : l'écart se traite par avoir ou remboursement, pas par recalage." },
        { status: 409 },
      );
    }

    const [encSnap, parPaiement, parCommande] = await Promise.all([
      adminDb.collection("encaissements").where("paymentId", "==", String(paymentId)).get(),
      adminDb.collection("echeances-sepa").where("paymentId", "==", String(paymentId)).get(),
      p.orderId
        ? adminDb.collection("echeances-sepa").where("orderId", "==", String(p.orderId)).get()
        : Promise.resolve(null),
    ]);
    const echeances = new Map<string, any>();
    for (const d of [...parPaiement.docs, ...(parCommande?.docs || [])]) echeances.set(d.id, d.data());

    const apres = recalerCommandeSurJournal(p, encSnap.docs.map(d => d.data() as any), [...echeances.values()]);
    const avant = { paidAmount: Number(p.paidAmount) || 0, status: p.status || "" };

    if (Math.abs(avant.paidAmount - apres.paidAmount) < 0.01 && avant.status === apres.status) {
      return NextResponse.json({ deja: true, avant, apres });
    }

    await ref.update({
      ...apres,
      recaleSurJournalLe: FieldValue.serverTimestamp(),
      recaleSurJournalAvant: avant,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, avant, apres });
  } catch (e) {
    console.error("[recaler-commande]", e);
    return NextResponse.json({ error: messageErreur(e) }, { status: 500 });
  }
}
