import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { appliquerBonCadeau, verifierBonCadeau } from "@/lib/bon-cadeau-application";

export const dynamic = "force-dynamic";

/**
 * Bon cadeau côté admin.
 *   GET  /api/admin/bon-cadeau?code=BON-XXXX        → solde, validité, bénéficiaire.
 *   POST /api/admin/bon-cadeau { code, paymentId, montant? }
 *        → applique le bon sur la commande (plafonné à `montant` si fourni,
 *          ex. l'acompte d'un stage). Même mécanique que la caisse.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const v = await verifierBonCadeau(req.nextUrl.searchParams.get("code"));
  if (!v.ok) return NextResponse.json({ ok: false, error: v.raison, bon: v.bon || null }, { status: 400 });
  return NextResponse.json({ ok: true, bon: v.bon });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.paymentId) return NextResponse.json({ error: "paymentId requis." }, { status: 400 });
    const montant = Number(body?.montant);
    const r = await appliquerBonCadeau({
      code: body?.code,
      paymentId: String(body.paymentId),
      montantMax: Number.isFinite(montant) && montant > 0 ? montant : null,
      appliquePar: auth.email || "admin",
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    const msg = e?.message || "Erreur lors de l'application du bon.";
    const attendu = /introuvable|épuisé|expiré|utilisé|annulé|réglée|annulée|Rien à régler|Saisissez|nul/i.test(msg);
    if (!attendu) console.error("admin bon-cadeau:", e);
    return NextResponse.json({ error: msg }, { status: attendu ? 400 : 500 });
  }
}
