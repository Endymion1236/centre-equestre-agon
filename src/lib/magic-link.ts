/**
 * Helper : envoi d'un lien magique d'authentification Firebase.
 *
 * Utilise par :
 *   - /api/admin/send-activation (envoi pilote orchestre par admin)
 *   - /api/request-magic-link    (auto-service famille perdue)
 *
 * Centralise :
 *   - Construction du champ "from" Resend selon le format de la variable env
 *   - Creation auto du compte Firebase Auth si absent
 *   - Generation du magic link avec actionCodeSettings adequats
 *   - Template HTML d'email
 *   - Envoi Resend + journalisation
 */

import { Resend } from "resend";
import { adminAuth, adminDb } from "./firebase-admin";
import { logEmail } from "./email-log";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
const FROM_EMAIL_RAW = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const BCC = process.env.RESEND_BCC || "ceagon50@gmail.com";

// Variable env "Name <email>" -> on utilise telle quelle. Sinon on prefixe.
const FROM = FROM_EMAIL_RAW.includes("<")
  ? FROM_EMAIL_RAW
  : `Centre Équestre Agon <${FROM_EMAIL_RAW}>`;

export type MagicLinkContext = "activation_pilote" | "self_service_reconnect";

export interface SendMagicLinkOptions {
  email: string;
  parentName?: string;     // pour personnaliser l'email
  context: MagicLinkContext;
  familyId?: string;       // pour la trace
  sentBy?: string;         // uid admin ou "self_service"
  redirectTo?: string;     // par defaut /espace-cavalier (gere par la page connexion-magique)
  resend?: Resend;         // injection optionnelle pour mutualiser l'instance
}

export interface SendMagicLinkResult {
  status: "sent" | "failed";
  error?: string;
  emailUsed: string;
}

/**
 * Envoie un lien magique a une adresse email.
 * Cree le user Firebase Auth si absent (sans mot de passe).
 */
export async function sendMagicLink(opts: SendMagicLinkOptions): Promise<SendMagicLinkResult> {
  const emailNormalized = (opts.email || "").trim().toLowerCase();

  if (!emailNormalized || !emailNormalized.includes("@")) {
    return { status: "failed", error: "Email invalide", emailUsed: emailNormalized };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { status: "failed", error: "RESEND_API_KEY manquante", emailUsed: emailNormalized };
  }
  const resend = opts.resend || new Resend(apiKey);

  // ── 1. Verifier/creer le user Firebase Auth ──
  try {
    await adminAuth.getUserByEmail(emailNormalized);
  } catch (e: any) {
    if (e.code === "auth/user-not-found") {
      await adminAuth.createUser({
        email: emailNormalized,
        displayName: opts.parentName,
        emailVerified: false,
      });
    } else {
      return { status: "failed", error: e.message || "Erreur Firebase Auth", emailUsed: emailNormalized };
    }
  }

  // ── 2. Generer le magic link ──
  const actionCodeSettings = {
    url: `${APP_URL}/connexion-magique?email=${encodeURIComponent(emailNormalized)}`,
    handleCodeInApp: true,
  };

  let magicLink: string;
  try {
    magicLink = await adminAuth.generateSignInWithEmailLink(emailNormalized, actionCodeSettings);
  } catch (e: any) {
    return { status: "failed", error: e.message || "Erreur generation lien", emailUsed: emailNormalized };
  }

  // ── 3. Composer l'email selon le contexte ──
  const isReconnect = opts.context === "self_service_reconnect";
  const subject = isReconnect
    ? "🔑 Ton lien de connexion au Centre Équestre Agon"
    : "🐴 Active ton espace famille au Centre Équestre Agon";
  const html = renderMagicLinkEmail({
    parentName: opts.parentName || "",
    magicLink,
    isReconnect,
  });

  // ── 4. Envoyer ──
  try {
    const send = await resend.emails.send({
      from: FROM,
      to: emailNormalized,
      bcc: BCC ? [BCC] : undefined,
      subject,
      html,
    });
    if (send.error) {
      await logEmail({
        to: emailNormalized, subject, context: opts.context,
        template: "magic-link",
        status: "failed", error: send.error.message,
        sentBy: opts.sentBy || "system",
        familyId: opts.familyId,
      });
      return { status: "failed", error: send.error.message, emailUsed: emailNormalized };
    }

    await logEmail({
      to: emailNormalized, subject, context: opts.context,
      template: "magic-link",
      status: "sent",
      sentBy: opts.sentBy || "system",
      familyId: opts.familyId,
    });

    // Trace dediee pour reporting/audit
    await adminDb.collection("magic-link-events").add({
      email: emailNormalized,
      familyId: opts.familyId || null,
      context: opts.context,
      sentBy: opts.sentBy || "system",
      sentAt: new Date().toISOString(),
    });

    return { status: "sent", emailUsed: emailNormalized };
  } catch (e: any) {
    return { status: "failed", error: e.message || "Erreur envoi", emailUsed: emailNormalized };
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Template HTML
// ─────────────────────────────────────────────────────────────────────────
// Garde le meme look que le mail d'activation initial (charte, bouton bleu)
// mais adapte le wording si c'est une reconnexion (la famille connait deja).

function renderMagicLinkEmail({
  parentName,
  magicLink,
  isReconnect,
}: {
  parentName: string;
  magicLink: string;
  isReconnect: boolean;
}) {
  const safeName = (parentName || "").replace(/[<>&"']/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  }[c] || c));

  const greeting = isReconnect
    ? "Tu as demande un lien de connexion a ton espace famille au Centre Equestre d'Agon-Coutainville."
    : "On passe a un nouveau site pour la gestion des inscriptions et des paiements du Centre Equestre Agon-Coutainville. Pour la rentree de septembre, on a deja prepare ton compte avec toutes tes infos familiales et la progression pedagogique de tes enfants.";

  const callToAction = isReconnect
    ? "Clique sur le bouton ci-dessous pour te connecter. Pas de mot de passe a retenir !"
    : "Pour activer ton espace, clique simplement sur le bouton ci-dessous. Pas de mot de passe a retenir : un clic suffit !";

  const buttonLabel = isReconnect ? "Me connecter" : "Activer mon espace famille";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${isReconnect ? "Lien de connexion" : "Activation de ton espace"}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);max-width:600px;">

          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:32px 24px;text-align:center;">
              <div style="font-size:48px;margin-bottom:8px;">🐴</div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Centre Équestre Agon</h1>
              <p style="margin:8px 0 0;color:#dbeafe;font-size:14px;">
                ${isReconnect ? "Ton lien de connexion" : "Ton espace famille est prêt !"}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 24px;color:#1e293b;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                ${safeName ? `Bonjour <strong>${safeName}</strong>,` : "Bonjour,"}
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">${callToAction}</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:12px;background:#2563eb;">
                    <a href="${magicLink}"
                       style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;border-radius:12px;">
                      ${buttonLabel}
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 16px;font-size:14px;color:#64748b;line-height:1.6;">
                Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#94a3b8;word-break:break-all;background:#f1f5f9;padding:12px;border-radius:8px;">
                ${magicLink}
              </p>

              ${!isReconnect ? `
              <div style="border-top:1px solid #e2e8f0;padding-top:24px;margin-top:24px;">
                <p style="margin:0 0 8px;font-size:14px;color:#475569;line-height:1.6;">
                  <strong>Ce que tu vas retrouver dans ton espace :</strong>
                </p>
                <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;color:#475569;line-height:1.8;">
                  <li>Les progressions de tes enfants (galops, objectifs)</li>
                  <li>Le calendrier des reprises et stages</li>
                  <li>Tes inscriptions en cours et à venir</li>
                  <li>Tes factures et paiements</li>
                </ul>
              </div>
              ` : ""}

              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin-top:24px;">
                <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
                  ⚠️ <strong>Ce lien expire dans 6 jours.</strong>
                  ${isReconnect
                    ? "Si tu n'as pas demande ce lien, ignore simplement cet email."
                    : "Si tu n'arrives pas a activer ton espace, contacte-nous et on t'enverra un nouveau lien."}
                </p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="background:#f8fafc;padding:24px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                EARL Centre Équestre Poney Club d'Agon-Coutainville<br>
                Une question ? <a href="mailto:ceagon@orange.fr" style="color:#2563eb;text-decoration:none;">ceagon@orange.fr</a>
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
          Tu reçois ce mail car tu es client·e du Centre Équestre Agon-Coutainville.<br>
          Si tu n'attendais pas ce message, ignore-le.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
