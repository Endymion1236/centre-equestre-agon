/**
 * Réunir deux fiches du même cavalier dans une famille — admin.
 * POST /api/admin/reunir-cavaliers  body: { familyId, gardeId, doublonId, dryRun?, confirm? }
 *
 * Cas Cléa (11/2026) : après un rattachement de fiche, la même enfant figure
 * deux fois. La mécanique (lib/fusion-familles : reunirCavaliers) repointe
 * commandes, cartes, forfaits, réservations et places au planning sur le
 * cavalier gardé, puis retire le doublon de la fiche. dryRun : aperçu seul.
 */
import { NextRequest, NextResponse } from "next/server";
import { messageErreur } from "@/lib/message-erreur";
import { verifyAuth } from "@/lib/api-auth";
import { reunirCavaliers } from "@/lib/fusion-familles";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const familyId = String(body?.familyId || "");
    const gardeId = String(body?.gardeId || "");
    const doublonId = String(body?.doublonId || "");
    const dryRun = !!body?.dryRun;
    if (!familyId || !gardeId || !doublonId || gardeId === doublonId) {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }
    if (!dryRun && !body?.confirm) return NextResponse.json({ error: "confirmation requise" }, { status: 400 });
    const { apercu } = await reunirCavaliers({ familyId, gardeId, doublonId, dryRun, par: (auth as any)?.email || "admin" });
    return NextResponse.json(dryRun ? { dryRun: true, apercu } : { ok: true, apercu });
  } catch (e: any) {
    const m = e?.message || "";
    if (/introuvable/.test(m)) return NextResponse.json({ error: m }, { status: 404 });
    if (/pas le même prénom|invalides/.test(m)) return NextResponse.json({ error: m }, { status: 400 });
    console.error("reunir-cavaliers:", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
