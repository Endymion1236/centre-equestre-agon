import { NextRequest, NextResponse } from "next/server";
import { CAWL_PSPID } from "@/lib/cawl";
import { verifyAuth } from "@/lib/api-auth";
import { auditPaymentPricing, logPricingAudit, evaluatePaymentEnforcement } from "@/lib/server-pricing";
import { bloquerSiReservationsFermees } from "@/lib/reservations-ouvertes";
import { creerSessionCawl } from "@/lib/cawl-session";

export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const {
      items, familyId, familyEmail, familyName,
      depositPercent, paymentId, stageDate, totalTTC, adminInitiated,
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    // Verrou d'avant-ouverture. Exception : régler un solde déjà dû
    // (paymentId présent) reste possible, sans quoi une famille ayant versé
    // un acompte n'aurait plus aucun moyen de payer le reste.
    const verrou = await bloquerSiReservationsFermees(auth, { autoriser: !!paymentId });
    if (verrou) return verrou;

    if (!CAWL_PSPID) {
      return NextResponse.json({ error: "CAWL non configuré (CAWL_PSPID manquant)" }, { status: 500 });
    }

    // Calcul du montant total en centimes
    // Si totalTTC est fourni, c'est le montant exact à facturer (y compris pour les acomptes)
    // depositPercent sert uniquement pour le libellé et le suivi, pas pour recalculer le montant
    const isDeposit = depositPercent && depositPercent > 0 && depositPercent < 100;

    let totalCents: number;
    if (totalTTC && totalTTC > 0) {
      // Montant fourni directement — c'est le montant final (acompte ou total)
      totalCents = Math.round(totalTTC * 100);
    } else {
      // Calculer depuis les items
      const multiplier = isDeposit ? depositPercent / 100 : 1;
      totalCents = items.reduce((sum: number, item: any) => {
        const cents = item.priceInCents
          ? Math.round(item.priceInCents * multiplier)
          : item.priceTTC
            ? Math.round(item.priceTTC * 100 * multiplier)
            : item.priceHT
              ? Math.round(item.priceHT * 100 * 1.2 * multiplier)
              : 0;
        return sum + cents * (item.quantity || 1);
      }, 0);
    }

    if (totalCents <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    // Description pour la page de paiement
    const description = items.map((item: any) => {
      return isDeposit ? `Acompte ${depositPercent}% — ${item.name}` : item.name;
    }).join(", ");

    // Référence unique marchand
    const merchantRef = `CE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // ── 🔍 Vérification serveur des prix ─────────────────────────────────
    // Recharge le tarif source des créneaux et borne le montant. Journalise
    // tout dans `pricing_audit`. Comportement selon CAWL_PRICING_ENFORCE :
    //   - absent/false → SHADOW : observe, ne bloque rien (totalCents inchangé)
    //   - "true"       → ENFORCE : refuse le paiement si sous-paiement sous la
    //                    borne basse autoritaire (uniquement si audit fiable)
    // (functions non-bloquantes : ne lèvent jamais)
    const ENFORCE = process.env.CAWL_PRICING_ENFORCE === "true";
    if (!ENFORCE) {
      // Visible dans les Function Logs Vercel : sans cette trace, le mode
      // silencieux est indétectable depuis l'application, et un sous-paiement
      // n'est découvert qu'en relisant `pricing_audit` à la main.
      console.warn(
        "⚠️ CAWL_PRICING_ENFORCE absent — le contrôle serveur des prix OBSERVE " +
        "sans bloquer. Un montant inférieur au tarif dû sera accepté. " +
        "Poser CAWL_PRICING_ENFORCE=true dans Vercel."
      );
    }
    if (paymentId) {
      const audit = await auditPaymentPricing({
        paymentId,
        chargeTTC: totalCents / 100,
        isDeposit: !!isDeposit,
      });
      if (audit) {
        const decision = evaluatePaymentEnforcement(audit);
        const willBlock = ENFORCE && decision.block;
        await logPricingAudit(audit, {
          route: "cawl/checkout",
          familyId: familyId || null,
          merchantRef,
          enforceMode: ENFORCE,
          blocked: willBlock,
          blockReason: willBlock ? decision.reason : null,
          // Trace du verdict INDEPENDAMMENT du mode : permet de verifier en
          // amont qu'activer CAWL_PRICING_ENFORCE ne bloquera rien de legitime.
          wouldBlock: decision.block,
          wouldBlockReason: decision.block ? decision.reason : null,
        });
        if (willBlock) {
          return NextResponse.json(
            {
              error:
                "Le montant demandé est inférieur au tarif dû. Recharge ta page et recommence ; si le problème persiste, contacte le club.",
              code: "PRICING_MISMATCH",
            },
            { status: 400 }
          );
        }
      }
    }

    // La fabrication de la session vit dans lib/cawl-session : elle est
    // partagée avec le lien de paiement envoyé par email, où la famille n'est
    // pas connectée et où la session doit être créée au clic, pas à l'envoi.
    const session = await creerSessionCawl({
      origin: req.nextUrl.origin,
      totalCents,
      description,
      merchantRef,
      familyId,
      familyEmail,
      familyName,
      paymentId,
      isDeposit: !!isDeposit,
      depositPercent,
    });

    return NextResponse.json(session);
  } catch (error: any) {
    console.error("CAWL checkout error:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
