/**
 * POST /api/admin/attribuer-numero-facture  { paymentId }
 *
 * Donne son numéro de facture à une commande soldée qui n'en a pas.
 *
 * Le cas se produisait au dépôt d'une remise SEPA, qui soldait la commande
 * sans passer par la fonction commune — corrigé, mais les commandes soldées
 * avant le correctif restent sans numéro. Cette route les régularise, une par
 * une, depuis l'écran Cohérence.
 *
 * Garde-fous :
 *   - commande réellement soldée (un numéro ne s'attribue pas à une commande
 *     qui n'est pas payée) ;
 *   - jamais deux fois : une commande qui a déjà un numéro le conserve, la
 *     séquence n'est pas entamée pour rien.
 *
 * Le numéro vient de la séquence continue habituelle (settings/invoiceCounter,
 * transaction atomique) : la régularisation d'aujourd'hui prend donc le numéro
 * du jour, ce qui est le comportement attendu d'une facture émise en retard.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { attribuerNumeroFacture } from "@/lib/invoice-number";
import { messageErreur } from "@/lib/message-erreur";

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

    if (p.invoiceNumber) {
      return NextResponse.json({ deja: true, invoiceNumber: p.invoiceNumber });
    }
    const regle = Number(p.paidAmount) || 0;
    const total = Number(p.totalTTC) || 0;
    if (p.status !== "paid" && regle + 0.01 < total) {
      return NextResponse.json(
        { error: "Cette commande n'est pas soldée : un numéro ne s'attribue qu'à une facture réglée." },
        { status: 409 },
      );
    }

    const { invoiceNumber } = await attribuerNumeroFacture({
      paymentId: String(paymentId),
      attributedBy: (auth as any)?.email || (auth as any)?.uid || "admin",
    });
    await ref.update({ invoiceNumber, updatedAt: new Date().toISOString() });

    return NextResponse.json({ ok: true, invoiceNumber });
  } catch (e) {
    console.error("[attribuer-numero-facture]", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
