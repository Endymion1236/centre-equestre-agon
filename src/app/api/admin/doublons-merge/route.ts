/**
 * Fusion de deux comptes famille — admin.
 * POST /api/admin/doublons-merge  body: { keepId, mergeId, dryRun?, confirm? }
 *
 * Déplace tout ce que porte le compte absorbé (mergeId) vers le conservé
 * (keepId) : enfants, commandes, réservations, places au planning, cartes,
 * mandats… La mécanique vit dans lib/fusion-familles, partagée avec le
 * rattachement de compte à la première connexion et la réparation depuis
 * Cohérence. Le compte absorbé peut ne plus exister : on repointe alors ce
 * qui le référence encore.
 *
 * dryRun=true : ne modifie rien, renvoie le décompte de ce qui serait déplacé.
 */
import { NextRequest, NextResponse } from "next/server";
import { messageErreur } from "@/lib/message-erreur";
import { verifyAuth } from "@/lib/api-auth";
import { fusionnerFamilles } from "@/lib/fusion-familles";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const keepId = String(body?.keepId || "");
    const mergeId = String(body?.mergeId || "");
    const dryRun = !!body?.dryRun;
    if (!keepId || !mergeId || keepId === mergeId) {
      return NextResponse.json({ error: "keepId/mergeId invalides" }, { status: 400 });
    }
    if (!dryRun && !body?.confirm) return NextResponse.json({ error: "confirmation requise" }, { status: 400 });

    const { apercu } = await fusionnerFamilles({ keepId, mergeId, dryRun, mergedBy: (auth as any)?.email || "admin" });
    return NextResponse.json(dryRun ? { dryRun: true, apercu } : { ok: true, apercu });
  } catch (e: any) {
    if (/introuvable/.test(e?.message || "")) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error("doublons-merge:", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
