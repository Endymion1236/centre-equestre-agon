import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { refreshEmailMode, isRecipientAllowed, blockedLog } from "@/lib/email-guard";
import { logEmail } from "@/lib/email-log";
import { emailLayout } from "@/lib/email-templates";

/**
 * POST /api/notify-club — notification du club par une FAMILLE.
 *
 * Pourquoi cette route existe
 * ───────────────────────────
 * Trois écrans de l'espace famille (déclaration de paiement, inscription
 * annuelle, réservation) appelaient /api/send-email, qui est adminOnly :
 * chaque appel repartait en 403 et l'email n'arrivait JAMAIS. Le gérant ne
 * recevait donc aucune de ces alertes, sans que rien ne le signale.
 *
 * Cette route est ouverte aux familles, mais volontairement étroite :
 *
 *  • Le DESTINATAIRE n'est jamais fourni par le client. Il est fixé ici,
 *    côté serveur. /api/send-email acceptait un destinataire ET du HTML
 *    arbitraire depuis le navigateur : n'importe qui pouvait envoyer
 *    n'importe quoi via le domaine du club.
 *
 *  • Le contenu est STRUCTURÉ (titre + lignes), jamais du HTML brut. Le
 *    gabarit est appliqué côté serveur.
 *
 *  • Limitation de débit par utilisateur, pour éviter qu'un compte ne
 *    sature la boîte du club.
 */

/** Adresse du club — jamais celle transmise par le client. */
function adresseClub(): string {
  return (
    process.env.CLUB_NOTIFY_EMAIL ||
    process.env.RESEND_BCC_EMAIL ||
    "ceagon50@gmail.com"
  );
}

const CONTEXTES = [
  "declaration_paiement",
  "inscription_annuelle",
  "reservation_paiement",
] as const;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rl = await checkRateLimit({
    uid: auth.uid,
    routeKey: "notify-club",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const { context, titre, lignes, familyId, paymentId } = await req.json();

    if (!CONTEXTES.includes(context)) {
      return NextResponse.json({ error: "Contexte inconnu" }, { status: 400 });
    }
    if (!titre || !Array.isArray(lignes) || lignes.length === 0) {
      return NextResponse.json({ error: "titre et lignes requis" }, { status: 400 });
    }

    const to = adresseClub();
    await refreshEmailMode();
    if (!isRecipientAllowed(to)) {
      console.warn(blockedLog(to, `notify-club/${context}`));
      await logEmail({ to, subject: String(titre), context, status: "failed", error: "Bloqué par le mode restreint (email-guard)", sentBy: auth.uid, familyId, paymentId }).catch(() => {});
      return NextResponse.json({ sent: false, blocked: true });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error("[notify-club] RESEND_API_KEY absente — notification non envoyée");
      return NextResponse.json({ sent: false, error: "Email non configuré" }, { status: 200 });
    }

    // Contenu STRUCTURÉ : les lignes sont échappées, aucun HTML client.
    const echappe = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const corps = emailLayout(
      `<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1e293b;">${echappe(titre)}</p>` +
        lignes
          .slice(0, 20)
          .map((l: unknown) => `<p style="margin:0 0 6px;font-size:14px;color:#334155;">${echappe(String(l))}</p>`)
          .join("")
    );

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        to,
        subject: String(titre).slice(0, 200),
        html: corps,
      }),
    });

    await logEmail({
      to,
      subject: String(titre),
      context,
      status: r.ok ? "sent" : "failed",
      sentBy: auth.uid,
      familyId,
      paymentId,
      ...(r.ok ? {} : { error: `HTTP ${r.status}` }),
    }).catch(() => {});

    return NextResponse.json({ sent: r.ok });
  } catch (e: any) {
    console.error("[notify-club]", e?.message || e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
