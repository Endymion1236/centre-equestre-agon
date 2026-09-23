/**
 * POST /api/admin/attribuer-numero-facture  { paymentId, dueDate? }
 *
 * Donne son numéro de facture à une commande qui n'en a pas.
 *
 * Deux usages :
 *   - régularisation d'une commande soldée (écran Cohérence) ;
 *   - émission d'une facture à échéance pour un client PROFESSIONNEL
 *     (asso, collectivité, entreprise) avant tout règlement — onglet
 *     Impayés, bouton « Émettre la facture ». `dueDate` (AAAA-MM-JJ) est
 *     alors obligatoire : c'est l'échéance portée sur le Factur-X (BT-9).
 *
 * Le cas se produisait au dépôt d'une remise SEPA, qui soldait la commande
 * sans passer par la fonction commune — corrigé, mais les commandes soldées
 * avant le correctif restent sans numéro. Cette route les régularise, une par
 * une, depuis l'écran Cohérence.
 *
 * Garde-fous :
 *   - commande réellement soldée, sauf client professionnel (un particulier
 *     n'a son numéro qu'à l'encaissement) ;
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
import { estCompteProfessionnel } from "@/lib/facturx";
import { FieldValue } from "firebase-admin/firestore";
import { messageErreur } from "@/lib/message-erreur";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({} as any));
    const paymentId = body?.paymentId;
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
    const soldee = p.status === "paid" || regle + 0.01 >= total;

    // Client professionnel (asso, collectivité, entreprise) : la facture
    // s'émet AVANT le règlement, avec une échéance — c'est elle qui déclenche
    // le paiement, et c'est elle qui part sur la Plateforme Agréée. Pour un
    // particulier, la règle historique reste : le numéro suit l'encaissement.
    let dueDate: string | null = null;
    if (!soldee) {
      let fam: any = null;
      if (p.familyId) {
        const famSnap = await adminDb.collection("families").doc(String(p.familyId)).get();
        if (famSnap.exists) fam = famSnap.data();
      }
      if (!estCompteProfessionnel(fam)) {
        return NextResponse.json(
          { error: "Cette commande n'est pas soldée : un numéro ne s'attribue qu'à une facture réglée (sauf client professionnel, facturé à échéance)." },
          { status: 409 },
        );
      }
      const brute = String(body?.dueDate || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(brute) || isNaN(new Date(brute).getTime())) {
        return NextResponse.json({ error: "Échéance de règlement requise (AAAA-MM-JJ) pour une facture émise avant paiement." }, { status: 400 });
      }
      dueDate = brute;
    }

    const { invoiceNumber } = await attribuerNumeroFacture({
      paymentId: String(paymentId),
      attributedBy: (auth as any)?.email || (auth as any)?.uid || "admin",
    });
    await ref.update({
      invoiceNumber,
      // Date d'émission = aujourd'hui, sauf si un autre chemin l'avait déjà posée.
      ...(p.invoiceDate ? {} : { invoiceDate: FieldValue.serverTimestamp() }),
      ...(dueDate ? { dueDate } : {}),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, invoiceNumber, dueDate });
  } catch (e) {
    console.error("[attribuer-numero-facture]", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
