import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { appliquerBonCadeau } from "@/lib/bon-cadeau-application";

export const dynamic = "force-dynamic";

// La famille applique un bon cadeau (par code) sur l'une de ses factures.
// Toute la mécanique vit dans lib/bon-cadeau-application, partagée avec la
// caisse : écriture « avoir », numéro de facture si soldée, places confirmées.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const uid = (auth as any).uid;

  try {
    const { code, paymentId } = await req.json();
    if (!String(code || "").trim() || !paymentId) {
      return NextResponse.json({ error: "Code et facture requis." }, { status: 400 });
    }
    const r = await appliquerBonCadeau({ code, paymentId: String(paymentId), familleUid: uid, appliquePar: `famille:${uid}` });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    const msg = e?.message || "Erreur lors de l'application du bon.";
    const attendu = /introuvable|épuisé|expiré|utilisé|annulé|réglée|annulée|pas la vôtre|Rien à régler|Saisissez|nul/i.test(msg);
    if (!attendu) console.error("bon-cadeau appliquer:", e);
    return NextResponse.json({ error: msg }, { status: attendu ? 400 : 500 });
  }
}
