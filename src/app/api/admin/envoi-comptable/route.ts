/**
 * GET  /api/admin/envoi-comptable?mois=AAAA-MM
 *   → l'adresse configurée, l'état de l'envoi automatique, et le dernier
 *     envoi du mois s'il y en a eu un.
 * POST /api/admin/envoi-comptable { mois, message? }
 *   → envoie les écritures du mois à la comptable (lib/envoi-comptable).
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { messageErreur } from "@/lib/message-erreur";
import { MOIS_RE, envoyerEcrituresComptable, etatEnvoiComptable, reglagesEnvoiComptable } from "@/lib/envoi-comptable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const mois = String(req.nextUrl.searchParams.get("mois") || "");
  if (!MOIS_RE.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  try {
    const [reglages, etat] = await Promise.all([reglagesEnvoiComptable(), etatEnvoiComptable(mois)]);
    return NextResponse.json({ ...reglages, ...etat });
  } catch (e) {
    console.error("[envoi-comptable] lecture", e);
    return NextResponse.json({ error: `Erreur de lecture — ${messageErreur(e)}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const mois = String(body.mois || "");
    if (!MOIS_RE.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
    const message = body.message ? String(body.message).slice(0, 2000) : undefined;
    const r = await envoyerEcrituresComptable({ mois, declenche: "manuel", message });
    if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.code === "vide" ? 409 : 400 });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[envoi-comptable] envoi", e);
    return NextResponse.json({ error: `Erreur d'envoi — ${messageErreur(e)}` }, { status: 500 });
  }
}
