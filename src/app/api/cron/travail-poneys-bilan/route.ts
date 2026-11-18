import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { URL_APP } from "@/lib/url-app";
import { toParisDateString } from "@/lib/date-local";
import { getClubInfo } from "@/lib/club-info";
import { htmlBilanTravail, moisPrecedent, nomMois } from "@/lib/travail-bilan";
import { genererBilanTravail } from "@/lib/travail-bilan-serveur";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Destinataire : Nicolas (comme la veille du club). */
const DESTINATAIRES = ["ceagon50@gmail.com"];

/**
 * CRON travail-poneys-bilan — le 1er de chaque mois : bilan du travail des
 * poneys du mois écoulé (chiffres + analyse IA), rangé et envoyé par email.
 * Rien n'est envoyé si aucune séance n'a été notée. GET + Bearer CRON_SECRET ;
 * `?mois=AAAA-MM` pour un autre mois.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const demande = String(req.nextUrl.searchParams.get("mois") || "");
    const mois = /^\d{4}-(0[1-9]|1[0-2])$/.test(demande) ? demande : moisPrecedent(toParisDateString(new Date()).slice(0, 7));
    const bilan = await genererBilanTravail(mois, "cron");
    if (bilan.stats.nbSeances === 0) return NextResponse.json({ ok: true, mois, seances: 0, emailSent: false });
    let emailSent = false;
    await refreshEmailMode();
    const to = DESTINATAIRES.filter((e) => isRecipientAllowed(e));
    if (process.env.RESEND_API_KEY && to.length) {
      const club = await getClubInfo();
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        replyTo: REPLY_TO, to,
        subject: `Travail des poneys — bilan de ${nomMois(mois)}`,
        html: htmlBilanTravail(bilan.stats, bilan.analyse, club.nom)
          + (bilan.erreurIa ? `<p style="font-family:Arial;font-size:12px;color:#b45309">${bilan.erreurIa}</p>` : "")
          + `<p style="font-family:Arial;font-size:12px"><a href="${URL_APP}/admin/cavalerie?tab=travail">Ouvrir la feuille de travail</a></p>`,
      });
      emailSent = true;
    }
    return NextResponse.json({ ok: true, mois, seances: bilan.stats.nbSeances, emailSent });
  } catch (e: any) {
    console.error("[travail-poneys-bilan]", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
