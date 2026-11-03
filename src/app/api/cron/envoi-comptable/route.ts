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
import { Resend } from "resend";
import { ADMIN_EMAILS } from "@/lib/admin-emails";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { URL_APP } from "@/lib/url-app";

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
      // Refus sur le fond (FEC incomplet ou mal formé, données illisibles) :
      // Nicolas est prévenu, sans quoi le cabinet attendait un envoi qui ne
      // partait pas, sans que personne le sache (audit du 03/11/2026).
      if (r.code === "bloquant" || r.code === "donnees") {
        try {
          await refreshEmailMode();
          const to = [ADMIN_EMAILS[0]].filter((e) => isRecipientAllowed(e));
          const cle = process.env.RESEND_API_KEY;
          if (cle && to.length) {
            const echap = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
            await new Resend(cle).emails.send({
              from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
              to,
              subject: `Envoi comptable de ${mois} non parti : à vérifier`,
              html: `<p>L'envoi automatique des écritures de <strong>${mois}</strong> au cabinet n'est pas parti.</p><p>${echap(r.error)}</p><p><a href="${URL_APP}/admin/comptabilite">Ouvrir la comptabilité</a> pour corriger, puis relancer l'envoi.</p>`,
            });
          }
        } catch (e) { console.error("[cron envoi-comptable] alerte non envoyée:", e); }
      }
      return NextResponse.json({ ok: false, mois, envoye: false, raison: r.error });
    }
    return NextResponse.json({ ok: true, mois, envoye: true, to: r.to, pieces: r.pieces });
  } catch (e) {
    console.error("[cron envoi-comptable]", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
