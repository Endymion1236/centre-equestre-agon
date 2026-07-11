import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { SITE_CONFIG } from "@/lib/config";

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
    const to = process.env.RESEND_CONTACT_TO || process.env.RESEND_OWNER_EMAIL || SITE_CONFIG.contact.email;

    const fullName = `${firstName} ${lastName}`;
    const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `[Site CE Agon] ${subject} · ${fullName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1e293b">
          <div style="background:#12346b;padding:24px 28px;border-radius:16px 16px 0 0;color:white">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;opacity:.65">Nouveau message du site</div>
            <h1 style="font-size:24px;margin:8px 0 0">${escapeHtml(subject)}</h1>
          </div>
          <div style="padding:28px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;background:#fff">
            <p style="margin:0 0 8px"><strong>De :</strong> ${escapeHtml(fullName)}</p>
            <p style="margin:0 0 8px"><strong>Email :</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
            ${phone ? `<p style="margin:0 0 22px"><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>` : ""}
            <div style="background:#f8fafc;border-radius:12px;padding:20px;line-height:1.65">${safeMessage}</div>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Erreur Resend contact :", error);
      return NextResponse.json({ error: "Le message n’a pas pu être envoyé. Merci de réessayer ou de nous appeler." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur formulaire contact :", error);
    return NextResponse.json({ error: "Une erreur est survenue. Merci de réessayer." }, { status: 500 });
  }
}
