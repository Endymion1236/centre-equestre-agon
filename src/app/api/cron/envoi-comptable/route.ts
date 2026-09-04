/**
 * CRON envoi-comptable — le 5 de chaque mois.
 *
 * Si l'envoi automatique est activé dans les paramètres du centre, envoie à
 * la comptable les écritures du mois qui vient de se terminer — sauf si
 * elles sont déjà parties (envoi à la main depuis « Boucler le mois »).
 * Le 5 laisse quelques jours pour déposer les relevés et boucler ; le
 * rappel du 2 y invite.
 *
 * Déclenchable aussi à la main (GET + Bearer CRON_SECRET).
 */

import { NextRequest, NextResponse } from "next/server";
import { messageErreur } from "@/lib/message-erreur";
import { envoyerEcrituresComptable, etatEnvoiComptable, reglagesEnvoiComptable } from "@/lib/envoi-comptable";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const ymParis = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date());
    const [a, m] = ymParis.split("-").map(Number);
    const prec = new Date(a, m - 2, 1);
    const mois = `${prec.getFullYear()}-${String(prec.getMonth() + 1).padStart(2, "0")}`;

    const reglages = await reglagesEnvoiComptable();
    if (!reglages.envoiComptableAuto) return NextResponse.json({ ok: true, mois, envoye: false, raison: "envoi automatique désactivé" });
    const etat = await etatEnvoiComptable(mois);
    if (etat.envoye) return NextResponse.json({ ok: true, mois, envoye: false, raison: "déjà envoyé", dernierEnvoi: etat.dernierEnvoi });

    const r = await envoyerEcrituresComptable({ mois, declenche: "auto" });
    if (!r.ok) {
      console.warn(`[cron envoi-comptable] ${mois} non envoyé : ${r.error}`);
      return NextResponse.json({ ok: false, mois, envoye: false, raison: r.error });
    }
    return NextResponse.json({ ok: true, mois, envoye: true, to: r.to, pieces: r.pieces });
  } catch (e) {
    console.error("[cron envoi-comptable]", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
