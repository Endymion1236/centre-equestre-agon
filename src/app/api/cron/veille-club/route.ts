import { URL_APP } from "@/lib/url-app";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { messageErreur } from "@/lib/message-erreur";
import { adminDb } from "@/lib/firebase-admin";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { REPLY_TO } from "@/lib/email-reply-to";
import { calculerVeille } from "@/lib/veille-club-serveur";
import { htmlVeille } from "@/lib/veille-club";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Destinataire : Nicolas seul (choix du 29/09/2026). */
const DESTINATAIRES = ["ceagon50@gmail.com"];

/**
 * CRON veille-club — chaque jour à 7 h 30, heure de Paris.
 *
 * Passe sur tout le logiciel (lib/veille-club) et envoie UN email si
 * quelque chose est à regarder ; rien n'est envoyé un matin sans rien.
 *
 * Les crons Vercel tournent en UTC : on planifie 5 h 30 et 6 h 30 UTC (7 h 30
 * en été, en hiver) et on ne travaille que si l'heure de Paris est 7 h (ou
 * 8 h, Vercel pouvant partir avec retard). Le jour du dernier envoi est
 * noté dans `settings/veille-club` : le second déclenchement ne renvoie pas.
 *
 * À la main : GET + Bearer CRON_SECRET, `?forcer=1` pour ignorer l'heure et
 * l'envoi déjà fait.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forcer = req.nextUrl.searchParams.get("forcer") === "1";
  const appUrl = URL_APP;

  try {
    const maintenant = new Date();
    const heureParis = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(maintenant));
    if (!forcer && heureParis !== 7 && heureParis !== 8) {
      return NextResponse.json({ ok: true, ignore: `hors créneau (${heureParis} h à Paris)` });
    }

    const { aujourdhui, points } = await calculerVeille(maintenant);
    const reglageRef = adminDb.collection("settings").doc("veille-club");
    if (!forcer) {
      const reglage = await reglageRef.get();
      if ((reglage.data() as any)?.dernierEnvoi === aujourdhui) {
        return NextResponse.json({ ok: true, ignore: "déjà envoyée aujourd'hui", points: points.length });
      }
    }
    if (points.length === 0) {
      await reglageRef.set({ dernierEnvoi: aujourdhui, dernierPassage: maintenant.toISOString(), points: 0 }, { merge: true });
      return NextResponse.json({ ok: true, points: 0, emailSent: false });
    }

    const dateLisible = new Date(`${aujourdhui}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const rouges = points.filter(p => p.niveau === "rouge").length;
    let emailSent = false;
    const resendKey = process.env.RESEND_API_KEY;
    await refreshEmailMode();
    const to = DESTINATAIRES.filter((e) => isRecipientAllowed(e));
    if (resendKey && to.length > 0) {
      await new Resend(resendKey).emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        replyTo: REPLY_TO,
        to,
        subject: `Veille du club : ${points.length} point(s) à regarder${rouges ? ` dont ${rouges} sur l'argent` : ""}`,
        html: htmlVeille(points, appUrl, dateLisible),
      });
      emailSent = true;
    }
    await reglageRef.set({ dernierEnvoi: aujourdhui, dernierPassage: maintenant.toISOString(), points: points.length }, { merge: true });
    return NextResponse.json({ ok: true, points: points.length, emailSent });
  } catch (e) {
    console.error("[veille-club]", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
