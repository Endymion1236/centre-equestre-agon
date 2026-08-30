import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { SITE_CONFIG } from "@/lib/config";
import { vitrineDefaults } from "@/lib/vitrine-defaults";
import { logEmail } from "@/lib/email-log";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  emailLayout, emailPanneau, emailLigne, emailTitre,
  emailParagraphe, emailCouleurs as CE,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const attempts = new Map<string, number[]>();

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Limitation EN MÉMOIRE — première barrière, gratuite, mais peu fiable :
 * sur Vercel chaque instance a sa propre Map et les instances sont
 * éphémères. Un attaquant réparti sur plusieurs instances la contourne.
 * Conservée comme filtre bon marché, doublée d'un compteur DURABLE en base
 * (checkRateLimit) qui, lui, résiste au redémarrage et au scale-out.
 */
function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  attempts.set(ip, recent);
  return false;
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Trop de messages envoyés. Réessayez dans quelques minutes." }, { status: 429 });
  }
  // Compteur durable (Firestore) : le seul qui tienne sur du serverless.
  if (ip !== "unknown") {
    const rl = await checkRateLimit({
      uid: `ip_${ip}`,
      routeKey: "contact",
      limit: MAX_REQUESTS,
      windowMs: WINDOW_MS,
    });
    if (!rl.allowed) return rateLimitResponse(rl);
  }

  try {
    const body = await request.json();
    const firstName = clean(body.firstName, 80);
    const lastName = clean(body.lastName, 80);
    const email = clean(body.email, 160).toLowerCase();
    const phone = clean(body.phone, 40);
    const subject = clean(body.subject, 120) || "Renseignement général";
    const message = clean(body.message, 4000);
    const company = clean(body.company, 120);

    // Champ invisible pour les robots. On répond comme si tout s'était bien passé.
    if (company) return NextResponse.json({ success: true });

    if (!firstName || !lastName || !email || !message) {
      return NextResponse.json({ error: "Merci de compléter le nom, le prénom, l’email et le message." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "L’adresse email semble incorrecte." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Le service de messagerie est momentanément indisponible. Vous pouvez nous appeler." }, { status: 503 });
    }

    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    // Destinataire : la MÊME adresse que celle affichée sur la page contact
    // (Admin → Contenu → Infos pratiques). L'ancienne chaîne passait par
    // RESEND_OWNER_EMAIL — le compte technique Resend : le visiteur écrivait à
    // l'adresse affichée, le message partait ailleurs, et personne ne le voyait.
    // RESEND_CONTACT_TO reste un forçage explicite si on veut dériver les
    // messages du site vers une autre boîte.
    let clubEmail = "";
    try {
      const vitrineSnap = await adminDb.collection("settings").doc("vitrine").get();
      clubEmail = String((vitrineSnap.data() as any)?.infos?.email || "").trim();
    } catch (e) {
      console.warn("[contact] lecture settings/vitrine impossible :", e);
    }
    const to = process.env.RESEND_CONTACT_TO || clubEmail || vitrineDefaults.infos.email || SITE_CONFIG.contact.email;

    // Trace AVANT l'envoi : un message de contact ne doit jamais pouvoir
    // disparaître sans laisser de trace, même si l'email se perd.
    let traceId = "";
    try {
      const traceRef = await adminDb.collection("messages-contact").add({
        firstName, lastName, email, phone, subject, message,
        to, ip, status: "recu",
        createdAt: FieldValue.serverTimestamp(),
      });
      traceId = traceRef.id;
    } catch (e) {
      console.error("[contact] trace Firestore impossible :", e);
    }

    const fullName = `${firstName} ${lastName}`;
    const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `[Site CE Agon] ${subject} · ${fullName}`,
      html: emailLayout([
        emailTitre(escapeHtml(subject)),
        emailPanneau("Expéditeur", [
          emailLigne("Nom", escapeHtml(fullName)),
          emailLigne("Email", `<a href="mailto:${escapeHtml(email)}" style="color:${CE.bleu};text-decoration:none;">${escapeHtml(email)}</a>`),
          phone ? emailLigne("Téléphone", escapeHtml(phone)) : "",
        ].join("")),
        emailParagraphe(safeMessage),
      ].join("\n"), `${escapeHtml(fullName)} — ${escapeHtml(subject)}`),
    });

    if (error) {
      console.error("Erreur Resend contact :", error);
      if (traceId) {
        await adminDb.collection("messages-contact").doc(traceId)
          .update({ status: "echec_envoi", erreur: String((error as any)?.message || error).slice(0, 300) })
          .catch(() => {});
      }
      await logEmail({
        to, subject: `[Site CE Agon] ${subject}`, context: "contact_site",
        status: "failed", error: String((error as any)?.message || error).slice(0, 300), sentBy: "system",
      }).catch(() => {});
      return NextResponse.json({ error: "Le message n’a pas pu être envoyé. Merci de réessayer ou de nous appeler." }, { status: 500 });
    }

    if (traceId) {
      await adminDb.collection("messages-contact").doc(traceId)
        .update({ status: "envoye" }).catch(() => {});
    }
    await logEmail({
      to, subject: `[Site CE Agon] ${subject}`, context: "contact_site",
      status: "sent", sentBy: "system",
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur formulaire contact :", error);
    return NextResponse.json({ error: "Une erreur est survenue. Merci de réessayer." }, { status: 500 });
  }
}
