/**
 * POST /api/admin/send-activation
 *
 * Genere un lien magique Firebase Auth et l'envoie par email a une (ou
 * plusieurs) famille pilote(s). Phase 1 de la bascule prod septembre 2026.
 *
 * Pattern :
 *   1. Pour chaque familyId fourni, on recupere le doc famille -> email
 *   2. On verifie/cree le user Firebase Auth (sans mot de passe, juste email)
 *   3. adminAuth.generateSignInWithEmailLink() -> URL avec token unique
 *   4. Email Resend personnalise avec le lien
 *   5. Log de chaque envoi dans Firestore (collection 'activation-emails')
 *
 * Securite :
 *   - Auth admin obligatoire (verifyAuth)
 *   - dryRun: true par defaut -> n'envoie rien, retourne juste le plan
 *
 * Body :
 *   { familyIds: string[], dryRun?: boolean }
 *
 * Reponse :
 *   { results: [{ familyId, email, status: 'sent'|'skipped'|'failed', reason? }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { logEmail } from "@/lib/email-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const BCC = process.env.RESEND_BCC || "ceagon50@gmail.com";

interface SendResult {
  familyId: string;
  parentName?: string;
  email?: string;
  status: "sent" | "skipped" | "failed" | "dryrun";
  reason?: string;
}

export async function POST(req: NextRequest) {
  // 🔒 Auth admin obligatoire
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { familyIds, dryRun = true } = await req.json();

    if (!Array.isArray(familyIds) || familyIds.length === 0) {
      return NextResponse.json(
        { error: "familyIds doit etre un tableau non vide" },
        { status: 400 },
      );
    }

    // Garde-fou : pas plus de 10 familles a la fois pour la phase pilote
    if (familyIds.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 familles par envoi en phase pilote (envoi en masse viendra plus tard)" },
        { status: 400 },
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey && !dryRun) {
      return NextResponse.json(
        { error: "RESEND_API_KEY non configuree" },
        { status: 500 },
      );
    }
    const resend = apiKey ? new Resend(apiKey) : null;

    const results: SendResult[] = [];

    for (const familyId of familyIds) {
      try {
        // ── 1. Recuperer la famille
        const famSnap = await adminDb.collection("families").doc(familyId).get();
        if (!famSnap.exists) {
          results.push({ familyId, status: "failed", reason: "Famille introuvable" });
          continue;
        }
        const fam = famSnap.data() as any;
        const email = (fam.parentEmail || "").trim().toLowerCase();
        const parentName = fam.parentName || "—";

        if (!email || !email.includes("@")) {
          results.push({ familyId, parentName, status: "skipped", reason: "Pas d'email valide" });
          continue;
        }

        // ── 2. Dry-run : on simule, on n'envoie rien
        if (dryRun) {
          results.push({
            familyId,
            parentName,
            email,
            status: "dryrun",
            reason: "Dry-run actif (aucun email envoye)",
          });
          continue;
        }

        // ── 3. Verifier/creer le user Firebase Auth
        // Si le compte existe deja (la famille s'est deja connectee par
        // Google, Facebook ou email/mdp), on ne fait rien : on lui envoie
        // juste le lien magique qui marche aussi pour les comptes existants.
        try {
          await adminAuth.getUserByEmail(email);
        } catch (e: any) {
          if (e.code === "auth/user-not-found") {
            // Pas de compte -> on le cree sans mot de passe. La famille
            // pourra se connecter via le lien magique uniquement.
            // displayName recupere parentName pour personnaliser un peu.
            await adminAuth.createUser({
              email,
              displayName: parentName,
              emailVerified: false, // sera passe a true au 1er signInWithEmailLink
            });
          } else {
            throw e;
          }
        }

        // ── 4. Generer le lien magique
        const actionCodeSettings = {
          // URL OU la famille atterrit apres clic. Doit etre dans la liste
          // blanche Firebase Console -> Authentication -> Settings -> Authorized
          // domains. centre-equestre-agon.vercel.app + centreequestreagon.com
          // (a partir de septembre) doivent y figurer.
          url: `${APP_URL}/connexion-magique?email=${encodeURIComponent(email)}`,

          // true = le lien doit etre ouvert dans l'app/navigateur
          // (et non un SMS / un lien profond). On veut le web.
          handleCodeInApp: true,
        };

        const magicLink = await adminAuth.generateSignInWithEmailLink(email, actionCodeSettings);

        // ── 5. Composer et envoyer l'email
        const subject = "🐴 Active ton espace famille au Centre Équestre Agon";
        const html = renderEmailHTML({ parentName, magicLink });

        const send = await resend!.emails.send({
          from: `Centre Équestre Agon <${FROM_EMAIL}>`,
          to: email,
          bcc: BCC ? [BCC] : undefined,
          subject,
          html,
        });

        if (send.error) {
          results.push({ familyId, parentName, email, status: "failed", reason: send.error.message });
          await logEmail({
            to: email, subject, context: "activation_pilote",
            template: "activation-magic-link",
            status: "failed", error: send.error.message,
            sentBy: (auth as any)?.uid || "admin",
            familyId,
          });
          continue;
        }

        results.push({ familyId, parentName, email, status: "sent" });
        await logEmail({
          to: email, subject, context: "activation_pilote",
          template: "activation-magic-link",
          status: "sent",
          sentBy: (auth as any)?.uid || "admin",
          familyId,
        });

        // Trace dans une collection dediee pour reporting bascule prod
        await adminDb.collection("activation-emails").add({
          familyId,
          parentName,
          email,
          sentAt: new Date().toISOString(),
          sentBy: (auth as any)?.uid || "admin",
          phase: "pilote",
        });
      } catch (e: any) {
        console.error(`send-activation [${familyId}]:`, e);
        results.push({
          familyId,
          status: "failed",
          reason: e?.message || "Erreur inconnue",
        });
      }
    }

    const sent = results.filter(r => r.status === "sent").length;
    const failed = results.filter(r => r.status === "failed").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const dryruns = results.filter(r => r.status === "dryrun").length;

    return NextResponse.json({
      dryRun,
      summary: { total: familyIds.length, sent, failed, skipped, dryruns },
      results,
    });
  } catch (e: any) {
    console.error("send-activation fatal:", e);
    return NextResponse.json(
      { error: e?.message || "Erreur interne" },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Template HTML de l'email d'activation
// ─────────────────────────────────────────────────────────────────────────
// Reste sobre, mobile-friendly (largeur 600px max, fonts safe), grosse CTA
// au milieu. On evite les images externes qui se font bloquer par Gmail.

function renderEmailHTML({ parentName, magicLink }: { parentName: string; magicLink: string }) {
  // Petite securite XSS sur parentName (probablement deja propre mais
  // c'est gratuit)
  const safeName = parentName.replace(/[<>&"']/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  }[c] || c));

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Active ton espace famille</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#0ea5e9);padding:32px 24px;text-align:center;">
              <div style="font-size:48px;margin-bottom:8px;">🐴</div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Centre Équestre Agon</h1>
              <p style="margin:8px 0 0;color:#dbeafe;font-size:14px;">Ton espace famille est prêt !</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;color:#1e293b;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                Bonjour <strong>${safeName}</strong>,
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                On passe à un nouveau site pour la gestion des inscriptions et
                des paiements du Centre Équestre Agon-Coutainville. Pour la
                rentrée de septembre, on a déjà préparé ton compte avec toutes
                tes infos familiales et la progression pédagogique de tes
                enfants.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">
                Pour activer ton espace, clique simplement sur le bouton
                ci-dessous. Pas de mot de passe à retenir : un clic suffit !
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:12px;background:#2563eb;">
                    <a href="${magicLink}"
                       style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;border-radius:12px;">
                      Activer mon espace famille
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 16px;font-size:14px;color:#64748b;line-height:1.6;">
                Si le bouton ne fonctionne pas, copie-colle ce lien dans ton
                navigateur :
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#94a3b8;word-break:break-all;background:#f1f5f9;padding:12px;border-radius:8px;">
                ${magicLink}
              </p>

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

              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;margin-top:24px;">
                <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
                  ⚠️ <strong>Ce lien expire dans 6 jours.</strong> Si tu n'arrives
                  pas à activer ton espace, contacte-nous et on t'enverra un
                  nouveau lien.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
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
