/**
 * Serveur-side email template loader
 * 
 * Charge les templates depuis Firestore (settings/emailTemplates)
 * avec fallback sur les templates par défaut définis dans email-templates.ts.
 * 
 * Les variables {parentName}, {montant}, etc. sont remplacées à l'exécution.
 */

import { adminDb } from "@/lib/firebase-admin";

// ── Email wrapper (identique à email-templates.ts et email-templates admin page) ──
const CLUB_NAME = "Centre Équestre d'Agon-Coutainville";
const CLUB_TEL = "02 44 84 99 96";
const CLUB_EMAIL = "ceagon@orange.fr";
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

function wrapHtml(content: string): string {
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;">
    <div style="background:#1e3a5f;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="color:white;margin:0;font-size:18px;font-weight:700;">${CLUB_NAME}</h1>
    </div>
    <div style="background:white;padding:24px;border:1px solid #e8e0d0;border-top:none;">
      ${content}
    </div>
    <div style="background:#f8f5f0;padding:16px 24px;border-radius:0 0 12px 12px;border:1px solid #e8e0d0;border-top:none;">
      <p style="margin:0;color:#999;font-size:11px;text-align:center;">
        ${CLUB_NAME} · ${CLUB_TEL} · <a href="mailto:${CLUB_EMAIL}" style="color:#999;">${CLUB_EMAIL}</a><br/>
        <a href="${SITE_URL}" style="color:#2050A0;text-decoration:none;">Accéder à mon espace</a>
      </p>
    </div>
  </div>`;
}

// ── Templates par défaut (fallback si rien dans Firestore) ──
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  confirmationStage: {
    subject: "Inscription confirmée — {stageTitle}",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>L'inscription au stage <strong style="color:#1e3a5f;">{stageTitle}</strong> est confirmée !</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0 0 8px;color:#166534;font-weight:600;">📅 {dates}</p>
  <p style="margin:0;color:#166534;font-weight:600;">🕐 {horaires}</p>
  <p style="margin:8px 0 0;color:#555;font-size:13px;">👧 {enfants}</p>
  <p style="margin:8px 0 0;color:#1e3a5f;font-weight:bold;font-size:16px;">{montant}€</p>
</div>
<p style="color:#555;font-size:13px;"><strong>À prévoir :</strong> bottes, bombe, pantalon long. Prévoir un goûter et de l'eau.</p>
<p style="color:#555;">À bientôt au centre équestre ! 🐴</p>`,
  },
  confirmationCours: {
    subject: "Réservation confirmée — {coursTitle}",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>La réservation de <strong>{childName}</strong> est confirmée :</p>
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#1e40af;font-weight:600;">📚 {coursTitle}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 {date} · 🕐 {horaire}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">👤 {moniteur}</p>
  <p style="margin:6px 0 0;color:#1e3a5f;font-weight:bold;font-size:15px;">{prix}€</p>
</div>
<p style="color:#555;font-size:13px;">N'oubliez pas les bottes et la bombe ! 🐴</p>`,
  },
  confirmationForfait: {
    subject: "Forfait annuel confirmé — {childName}",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Le forfait annuel de <strong>{childName}</strong> est enregistré :</p>
<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#854d0e;font-weight:600;">📋 {forfaitLabel}</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">{nbSeances} séances · Paiement {planPaiement}</p>
  <p style="margin:6px 0 0;color:#1e3a5f;font-weight:bold;font-size:16px;">{totalTTC}€</p>
</div>
<p style="color:#555;">À bientôt au centre équestre !</p>`,
  },
  rappelJ1: {
    subject: "Rappel — {coursTitle} demain",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Petit rappel pour demain{childrenStr} :</p>
{lignes}
<div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:16px 0;">
  <p style="margin:0;color:#854d0e;font-size:13px;">💡 N'oubliez pas : casque obligatoire, tenue adaptée recommandée.</p>
</div>
<p style="color:#555;font-size:13px;">À demain au centre équestre !</p>`,
  },
  rappelImpaye: {
    subject: "Rappel de paiement — {montant}€",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Nous nous permettons de vous rappeler qu'un solde reste dû :</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#991b1b;font-weight:600;font-size:18px;">{montant}€</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">{prestations}</p>
</div>
<p style="color:#555;font-size:13px;">Merci de régulariser votre situation à votre convenance.</p>`,
  },
  bienvenue: {
    subject: "Bienvenue au Centre Équestre d'Agon-Coutainville !",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Bienvenue au Centre Équestre d'Agon-Coutainville ! 🐴</p>
<p>Votre espace personnel est prêt.</p>
<p>N'hésitez pas à nous contacter au 02 44 84 99 96 pour toute question.</p>`,
  },
  // Confirmation Stripe générique (paiement reçu)
  confirmationPaiement: {
    subject: "Paiement reçu — {montant}€",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Nous avons bien reçu votre paiement :</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#166534;font-weight:600;font-size:18px;">✅ {montant}€ reçus</p>
  <p style="margin:6px 0 0;color:#555;font-size:13px;">{prestations}</p>
</div>
<p style="color:#555;">À bientôt au centre équestre !</p>`,
  },
  // Confirmation abonnement Stripe (paiement en N fois)
  confirmationAbonnement: {
    subject: "Inscription confirmée — Paiement mensuel en {nbEcheances} fois",
    body: `<p>Bonjour <strong>{parentName}</strong>,</p>
<p>Votre inscription est confirmée avec un paiement en <strong>{nbEcheances} mensualités</strong>.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
  <p style="margin:0;color:#166534;font-weight:600;">✅ 1ère échéance : {montant}€ reçue</p>
  <p style="margin:8px 0 0;color:#555;font-size:13px;">Les {nbRestantes} prochaines mensualités de {montant}€ seront prélevées automatiquement.</p>
</div>
<p style="color:#555;">À bientôt au centre équestre !</p>`,
  },
};

// ── Cache pour éviter de relire Firestore à chaque appel ──
let cachedTemplates: Record<string, { subject: string; body: string }> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTemplates(): Promise<Record<string, { subject: string; body: string }>> {
  const now = Date.now();
  if (cachedTemplates && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedTemplates;
  }

  try {
    const snap = await adminDb.collection("settings").doc("emailTemplates").get();
    if (snap.exists) {
      const saved = snap.data() as Record<string, any>;
      const merged = { ...DEFAULT_TEMPLATES };
      for (const key of Object.keys(merged)) {
        if (saved[key]?.subject) merged[key].subject = saved[key].subject;
        if (saved[key]?.body) merged[key].body = saved[key].body;
      }
      // Templates custom ajoutés dans l'admin mais pas dans les défauts
      for (const key of Object.keys(saved)) {
        if (!merged[key] && saved[key]?.subject && saved[key]?.body) {
          merged[key] = { subject: saved[key].subject, body: saved[key].body };
        }
      }
      cachedTemplates = merged;
    } else {
      cachedTemplates = { ...DEFAULT_TEMPLATES };
    }
  } catch (e) {
    console.warn("⚠️ Impossible de charger les templates email depuis Firestore, fallback sur défauts:", e);
    cachedTemplates = { ...DEFAULT_TEMPLATES };
  }

  cacheTimestamp = now;
  return cachedTemplates!;
}

/**
 * Charge un template email depuis Firestore (avec fallback sur les défauts)
 * et remplace les variables {xxx} par les valeurs fournies.
 * 
 * @returns { subject, html } — le HTML est wrappé dans le design du club
 */
export async function loadTemplate(
  key: string,
  variables: Record<string, string | number> = {}
): Promise<{ subject: string; html: string }> {
  const templates = await getTemplates();
  const template = templates[key] || DEFAULT_TEMPLATES[key];

  if (!template) {
    console.warn(`⚠️ Template "${key}" introuvable, email générique`);
    return {
      subject: "Centre Équestre d'Agon-Coutainville",
      html: wrapHtml(`<p>Bonjour,</p><p>Merci pour votre confiance.</p>`),
    };
  }

  // Remplacer les {variables} dans le sujet et le body
  let subject = template.subject;
  let body = template.body;

  for (const [varKey, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${varKey}\\}`, "g");
    const strValue = String(value);
    subject = subject.replace(regex, strValue);
    body = body.replace(regex, strValue);
  }

  return {
    subject,
    html: wrapHtml(body),
  };
}

/**
 * Invalide le cache des templates (utile après sauvegarde dans l'admin)
 */
export function invalidateTemplateCache() {
  cachedTemplates = null;
  cacheTimestamp = 0;
}
