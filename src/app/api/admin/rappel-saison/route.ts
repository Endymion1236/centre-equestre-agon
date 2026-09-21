/**
 * Mail de reprise des cours, à la main.
 *
 *   GET  /api/admin/rappel-saison?saisonDebut=2026-09-21
 *        → aperçu : familles, créneaux, marqueur d'envoi. N'envoie rien.
 *        Sans paramètre, la date vient de SAISON_DEBUT_DATE (réglage Vercel).
 *
 *   POST /api/admin/rappel-saison  { saisonDebut, force? }
 *        → envoi. Refusé si déjà envoyé pour cette rentrée, sauf `force`.
 *
 * Le robot du soir fait la même chose la veille de SAISON_DEBUT_DATE ; cette
 * route sert quand le réglage manquait ou que la veille est passée.
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { refreshEmailMode } from "@/lib/email-guard";
import { messageErreur } from "@/lib/message-erreur";
import { dateRentreeValide, envoyerRappelSaison, preparerRappelSaison } from "@/lib/rappel-saison-envoi";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const parDefaut = process.env.SAISON_DEBUT_DATE || "";
  const saisonDebut = req.nextUrl.searchParams.get("saisonDebut") || parDefaut;
  if (!dateRentreeValide(saisonDebut)) {
    return NextResponse.json({
      error: saisonDebut ? "Date de rentrée invalide (attendu AAAA-MM-JJ)" : "Aucune date : SAISON_DEBUT_DATE n'est pas réglée sur Vercel",
      saisonDebutParDefaut: parDefaut,
    }, { status: 400 });
  }
  try {
    const preparation = await preparerRappelSaison(saisonDebut);
    return NextResponse.json({ ...preparation, saisonDebutParDefaut: parDefaut });
  } catch (e) {
    return NextResponse.json({ error: messageErreur(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const saisonDebut = body?.saisonDebut;
  if (!dateRentreeValide(saisonDebut)) {
    return NextResponse.json({ error: "Date de rentrée invalide (attendu AAAA-MM-JJ)" }, { status: 400 });
  }
  try {
    await refreshEmailMode();
    const resultat = await envoyerRappelSaison({
      saisonDebut,
      force: body?.force === true,
      sentBy: auth.email || "admin",
      context: "admin_saison_rappel",
    });
    if (resultat.skipped) {
      return NextResponse.json({
        ...resultat,
        error: `Déjà envoyé le ${new Date(resultat.dejaEnvoye!.sentAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} — cochez « renvoyer quand même » pour recommencer.`,
      }, { status: 409 });
    }
    return NextResponse.json(resultat);
  } catch (e) {
    return NextResponse.json({ error: messageErreur(e) }, { status: 500 });
  }
}
