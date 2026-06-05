import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { CAWL_PSPID } from "@/lib/cawl";
import { buildDelayedChargeBody, chargeWithToken, logMitAttempt } from "@/lib/cawl-mit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Outil de TEST du prélèvement automatique du solde (MIT / SubsequentPayment).
 *
 * POST { paymentId, dryRun }
 *   - dryRun = true (défaut) : ne débite RIEN, renvoie le solde calculé,
 *     l'éligibilité et la requête exacte qui serait envoyée à CAWL.
 *   - dryRun = false : lance le vrai débit (respecte CAWL_MIT_ENABLED ;
 *     en preprod, nécessite des identifiants CAWL preprod + Card On File).
 *
 * Cible UN seul paiement choisi explicitement — pas tout le cron.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { paymentId, dryRun = true } = await request.json();
    if (!paymentId) return NextResponse.json({ error: "paymentId requis" }, { status: 400 });

    const snap = await adminDb.collection("payments").doc(String(paymentId)).get();
    if (!snap.exists) return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
    const p: any = snap.data();

    const total = Number(p.totalTTC || 0);
    const paid = Number(p.paidAmount || 0);
    const solde = Math.max(0, +(total - paid).toFixed(2));
    const cofToken = p.cofToken || p.cardOnFileToken || "";
    const initialPaymentId = p.cofInitialPaymentId || p.cawlHostedCheckoutId || "";

    const eligibilite = {
      soldeRestant: solde,
      aUnToken: !!cofToken,
      aIdentifiantAcompte: !!initialPaymentId,
      mitActive: process.env.CAWL_MIT_ENABLED === "true",
      pspidConfigure: !!CAWL_PSPID,
      stageDate: p.stageDate || null,
      statut: p.status || null,
    };

    // Requête exacte qui serait envoyée à CAWL (endpoint SubsequentPayment)
    const requete = {
      endpoint: `POST /v2/{merchantId}/payments/${initialPaymentId || "{idAcompte}"}/subsequent`,
      body: buildDelayedChargeBody(solde),
    };

    // ── DRY-RUN : aperçu seulement, aucun débit ───────────────────────────
    if (dryRun) {
      const bloquants: string[] = [];
      if (solde <= 0) bloquants.push("Aucun solde restant à prélever.");
      if (!cofToken) bloquants.push("Pas de token Card On File (l'acompte n'a pas été tokenisé).");
      if (!initialPaymentId) bloquants.push("Pas d'identifiant de la transaction d'acompte.");
      if (!eligibilite.mitActive) bloquants.push("CAWL_MIT_ENABLED n'est pas à \"true\" : un débit réel resterait en simulation.");
      if (!eligibilite.pspidConfigure) bloquants.push("PSPID CAWL non configuré sur cet environnement.");
      return NextResponse.json({
        dryRun: true,
        familyName: p.familyName || "",
        eligibilite,
        requete,
        bloquantsAvantDebitReel: bloquants,
      });
    }

    // ── DÉBIT RÉEL ────────────────────────────────────────────────────────
    if (solde <= 0) return NextResponse.json({ error: "Aucun solde à prélever" }, { status: 400 });
    if (!cofToken || !initialPaymentId) {
      return NextResponse.json({ error: "Token ou identifiant d'acompte manquant — impossible de prélever" }, { status: 400 });
    }

    const result = await chargeWithToken({
      paymentId: String(paymentId),
      familyId: p.familyId || "",
      amount: solde,
      token: cofToken,
      initialPaymentId,
      label: p.label || `Solde ${p.familyName || ""}`,
      familyEmail: p.familyEmail,
    });
    await logMitAttempt(String(paymentId), result, solde);

    return NextResponse.json({ dryRun: false, eligibilite, requete, result });
  } catch (e: any) {
    console.error("test-mit-charge:", e);
    return NextResponse.json({ error: (e?.message || String(e)).slice(0, 300) }, { status: 500 });
  }
}
