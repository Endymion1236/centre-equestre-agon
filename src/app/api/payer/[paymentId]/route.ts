/**
 * GET /api/payer/<paymentId>?t=<jeton>
 *
 * Le lien de paiement envoyé par email. Il ne mène pas à CAWL directement :
 * il fabrique une session neuve au moment du clic, puis redirige.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────
 *
 * L'email portait auparavant l'URL CAWL elle-même. Une session CAWL vit deux
 * heures, son URL de redirection trois : un lien envoyé le soir était mort le
 * lendemain matin. Une famille l'a découvert le 31/08/2026 en essayant de
 * régler son acompte.
 *
 * ── Ce qui est revérifié à chaque clic ──────────────────────────────────
 *
 * Le montant n'est pas repris du lien mais recalculé depuis le paiement : si
 * la famille a réglé entre-temps, au comptoir ou par un autre canal, elle est
 * envoyée vers une page qui le lui dit plutôt que vers un second paiement. Un
 * lien qui traîne dans une boîte mail ne doit jamais pouvoir faire payer deux
 * fois.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { CAWL_PSPID } from "@/lib/cawl";
import { creerSessionCawl } from "@/lib/cawl-session";
import { verifierJetonPaiement } from "@/lib/jeton-paiement";
import { auditPaymentPricing, logPricingAudit, evaluatePaymentEnforcement } from "@/lib/server-pricing";

export const dynamic = "force-dynamic";

/** Renvoie la famille vers la page d'explication, avec le motif. */
function versExplication(req: NextRequest, motif: string) {
  return NextResponse.redirect(new URL(`/payer/impossible?motif=${motif}`, req.nextUrl.origin), 302);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params;
  const jeton = req.nextUrl.searchParams.get("t") || "";

  const verdict = verifierJetonPaiement(paymentId, jeton);
  if (verdict !== "ok") return versExplication(req, verdict);

  try {
    if (!CAWL_PSPID) return versExplication(req, "indisponible");

    const snap = await adminDb.collection("payments").doc(paymentId).get();
    if (!snap.exists) return versExplication(req, "introuvable");
    const p = snap.data() as Record<string, any>;

    // Montant recalculé, jamais repris du lien. `acompteAmount` prime tant
    // qu'il n'est pas couvert : c'est lui que le lien réclamait.
    const total = Number(p.totalTTC) || 0;
    const regle = Number(p.paidAmount) || 0;
    const acompte = Number(p.acompteAmount) || 0;
    const attendu = acompte > 0 && regle < acompte ? acompte - regle : total - regle;
    const montant = Math.round(Math.max(0, attendu) * 100) / 100;

    if (montant < 0.01) return versExplication(req, "deja-regle");

    const estAcompte = acompte > 0 && regle < acompte && acompte < total;
    const depositPercent = estAcompte && total > 0
      ? Math.min(99, Math.max(1, Math.round((montant / total) * 100)))
      : 0;

    const totalCents = Math.round(montant * 100);
    const merchantRef = `CE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Même contrôle serveur des prix que sur le panier : le lien est un
    // chemin de paiement comme un autre, il n'a aucune raison d'y échapper.
    const audit = await auditPaymentPricing({ paymentId, chargeTTC: montant, isDeposit: estAcompte });
    if (audit) {
      const decision = evaluatePaymentEnforcement(audit);
      const bloque = process.env.CAWL_PRICING_ENFORCE === "true" && decision.block;
      await logPricingAudit(audit, {
        route: "payer/lien",
        familyId: p.familyId || null,
        merchantRef,
        enforceMode: process.env.CAWL_PRICING_ENFORCE === "true",
        blocked: bloque,
        blockReason: bloque ? decision.reason : null,
        wouldBlock: decision.block,
        wouldBlockReason: decision.block ? decision.reason : null,
      });
      if (bloque) return versExplication(req, "montant");
    }

    const description = (p.items || [])
      .map((i: any) => i.activityTitle || i.description || "Prestation")
      .join(", ") || "Prestation";

    const session = await creerSessionCawl({
      origin: req.nextUrl.origin,
      totalCents,
      description: estAcompte ? `Acompte — ${description}` : description,
      merchantRef,
      familyId: p.familyId || null,
      familyEmail: p.familyEmail || null,
      familyName: p.familyName || null,
      paymentId,
      isDeposit: estAcompte,
      depositPercent,
    });

    return NextResponse.redirect(session.url, 302);
  } catch (e) {
    console.error("[payer]", e);
    return versExplication(req, "indisponible");
  }
}
