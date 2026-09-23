/**
 * Liens de paiement envoyés pour une commande.
 *
 * GET  ?paymentId=…            → liens envoyés, le plus récent d'abord, avec
 *                                 leur état (valide / expiré / annulé / payé).
 * POST { action: "annuler", linkId } → annule un lien encore valable.
 *
 * Pourquoi annuler côté application : CAWL ne sait pas rappeler une page de
 * paiement hébergée, le lien meurt seul au bout de 2 heures. L'annulation
 * évite surtout qu'on l'oublie : si la famille l'utilise malgré tout,
 * l'encaissement est signalé au club au lieu de passer inaperçu.
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { listerLiensCommande, annulerLienPaiement } from "@/lib/lien-paiement";
import { etatLien } from "@/lib/lien-paiement-regles";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const paymentId = req.nextUrl.searchParams.get("paymentId") || "";
  if (!paymentId) return NextResponse.json({ error: "paymentId requis" }, { status: 400 });

  try {
    const liens = await listerLiensCommande(paymentId);
    const maintenant = Date.now();
    return NextResponse.json({
      liens: liens.map((l) => ({ ...l, etat: etatLien(l, maintenant) })),
    });
  } catch (e) {
    console.error("[payment-links GET]", e);
    return NextResponse.json({ error: "Lecture impossible" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({} as any));
  if (body.action !== "annuler") {
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }
  if (!body.linkId) return NextResponse.json({ error: "linkId requis" }, { status: 400 });

  try {
    const r = await annulerLienPaiement(String(body.linkId), (auth as any)?.email || (auth as any)?.uid || "admin");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, lien: { ...r.lien, etat: etatLien(r.lien) } });
  } catch (e) {
    console.error("[payment-links POST]", e);
    return NextResponse.json({ error: "Annulation impossible" }, { status: 500 });
  }
}
