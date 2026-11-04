/**
 * GET /api/admin/controle-banque?mois=AAAA-MM — le relevé du mois face au
 * compte de banque du FEC (lib/controle-banque, lib/envoi-comptable).
 * Lecture seule, réservé à l'administration.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { messageErreur } from "@/lib/message-erreur";
import { MOIS_RE, controleBanqueMois } from "@/lib/envoi-comptable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const mois = String(req.nextUrl.searchParams.get("mois") || "");
  if (!MOIS_RE.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  try {
    return NextResponse.json(await controleBanqueMois(mois), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[controle-banque]", e);
    return NextResponse.json({ error: `Contrôle indisponible — ${messageErreur(e)}` }, { status: 500 });
  }
}
