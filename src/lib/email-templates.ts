/**
 * Templates emails — Centre Équestre d'Agon-Coutainville
 * 
 * Chaque template est une fonction qui prend des variables
 * et retourne { subject, html }.
 * 
 * Utilisation : 
 * const { subject, html } = emailTemplates.confirmationStage({ ... });
 * await fetch("/api/send-email", { body: JSON.stringify({ to, subject, html }) });
 */

const CLUB_NAME = "Centre Équestre d'Agon-Coutainville";
const CLUB_TEL = "02 44 84 99 96";
const CLUB_EMAIL = "ceagon@orange.fr";
const SITE_URL = "https://centre-equestre-agon.vercel.app";

function wrap(content: string) {
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

function button(text: string, url: string, color = "#27ae60") {
  return `<p style="text-align:center;margin:25px 0;">
    <a href="${url}" style="background:${color};color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">${text}</a>
  </p>`;
}

export const emailTemplates = {

  // ═══ INSCRIPTIONS ═══

  confirmationStage: (vars: {
    parentName: string;
    enfants: { name: string; prix: number; remise: number }[];
    stageTitle: string;
    dates: string;
    totalTTC: number;
  }) => ({
    subject: `Inscription confirmée — ${vars.stageTitle}`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">L'inscription au stage <strong style="color:#1e3a5f;">${vars.stageTitle}</strong> est confirmée.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;color:#166534;font-weight:600;font-size:13px;">📅 ${vars.dates}</p>
        <table style="width:100%;border-collapse:collapse;">
          ${vars.enfants.map(e => `<tr>
            <td style="padding:4px 0;color:#333;font-size:14px;">${e.name}</td>
            <td style="padding:4px 0;text-align:right;color:#166534;font-size:14px;font-weight:600;">${e.prix.toFixed(2)}€${e.remise > 0 ? ` <span style="color:#999;font-size:11px;">(-${e.remise}€)</span>` : ""}</td>
          </tr>`).join("")}
          <tr style="border-top:2px solid #166534;">
            <td style="padding:8px 0;font-weight:bold;color:#1e3a5f;">Total</td>
            <td style="padding:8px 0;text-align:right;font-weight:bold;color:#1e3a5f;font-size:16px;">${vars.totalTTC.toFixed(2)}€</td>
          </tr>
        </table>
      </div>
      <p style="color:#555;font-size:13px;">À bientôt au centre équestre !</p>
    `),
  }),

  confirmationCours: (vars: {
    parentName: string;
    childName: string;
    coursTitle: string;
    date: string;
    horaire: string;
    prix: number;
  }) => ({
    subject: `Réservation confirmée — ${vars.coursTitle}`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">La réservation de <strong>${vars.childName}</strong> est confirmée :</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#1e40af;font-weight:600;">📚 ${vars.coursTitle}</p>
        <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 ${vars.date} · 🕐 ${vars.horaire}</p>
        <p style="margin:6px 0 0;color:#1e3a5f;font-weight:bold;font-size:15px;">${vars.prix.toFixed(2)}€</p>
      </div>
      ${button("Voir mes réservations", `${SITE_URL}/espace-cavalier/reservations`, "#2050A0")}
    `),
  }),

  confirmationForfait: (vars: {
    parentName: string;
    childName: string;
    forfaitLabel: string;
    nbSeances: number;
    totalTTC: number;
    planPaiement: string;
  }) => ({
    subject: `Forfait annuel confirmé — ${vars.childName}`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">Le forfait annuel de <strong>${vars.childName}</strong> est enregistré :</p>
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#854d0e;font-weight:600;">📋 ${vars.forfaitLabel}</p>
        <p style="margin:6px 0 0;color:#555;font-size:13px;">${vars.nbSeances} séances · Paiement ${vars.planPaiement}</p>
        <p style="margin:6px 0 0;color:#1e3a5f;font-weight:bold;font-size:16px;">${vars.totalTTC.toFixed(2)}€</p>
      </div>
    `),
  }),

  // ═══ PAIEMENTS ═══

  lienPaiement: (vars: {
    parentName: string;
    label: string;
    montant: number;
    lienPaiement: string;
  }) => ({
    subject: `Lien de paiement — ${vars.label}`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">Voici votre lien de paiement pour <strong>${vars.label}</strong> :</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
        <p style="margin:0;color:#1e3a5f;font-size:24px;font-weight:bold;">${vars.montant.toFixed(2)}€</p>
      </div>
      ${button("Payer en ligne", vars.lienPaiement)}
      <p style="color:#999;font-size:11px;text-align:center;">Paiement sécurisé par CAWL.</p>
    `),
  }),

  confirmationPaiement: (vars: {
    parentName: string;
    montant: number;
    mode: string;
    prestations: string;
  }) => ({
    subject: `Paiement reçu — ${vars.montant.toFixed(2)}€`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">Nous avons bien reçu votre paiement :</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#166534;font-weight:600;font-size:18px;">✅ ${vars.montant.toFixed(2)}€ reçus</p>
        <p style="margin:6px 0 0;color:#555;font-size:13px;">Mode : ${vars.mode}</p>
        <p style="margin:4px 0 0;color:#555;font-size:13px;">Prestations : ${vars.prestations}</p>
      </div>
    `),
  }),

  // ═══ RAPPELS ═══

  rappelCours: (vars: {
    parentName: string;
    childName: string;
    coursTitle: string;
    date: string;
    horaire: string;
    moniteur: string;
  }) => ({
    subject: `Rappel — ${vars.coursTitle} demain`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">Petit rappel : <strong>${vars.childName}</strong> a cours demain !</p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#1e40af;font-weight:600;font-size:15px;">📚 ${vars.coursTitle}</p>
        <p style="margin:6px 0 0;color:#555;font-size:13px;">📅 ${vars.date}</p>
        <p style="margin:4px 0 0;color:#555;font-size:13px;">🕐 ${vars.horaire}</p>
        <p style="margin:4px 0 0;color:#555;font-size:13px;">👤 ${vars.moniteur}</p>
      </div>
      <p style="color:#555;font-size:13px;">N'oubliez pas les bottes et la bombe ! 🐴</p>
    `),
  }),

  rappelStage: (vars: {
    parentName: string;
    enfants: string[];
    stageTitle: string;
    dateDebut: string;
    horaire: string;
  }) => ({
    subject: `Rappel — ${vars.stageTitle} commence bientôt`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">Le stage <strong style="color:#1e3a5f;">${vars.stageTitle}</strong> commence bientôt !</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#166534;font-weight:600;">📅 À partir du ${vars.dateDebut}</p>
        <p style="margin:6px 0 0;color:#555;font-size:13px;">🕐 ${vars.horaire}</p>
        <p style="margin:6px 0 0;color:#555;font-size:13px;">👧 ${vars.enfants.join(", ")}</p>
      </div>
      <p style="color:#555;font-size:13px;"><strong>À prévoir :</strong> bottes, bombe, pantalon long. Prévoir un goûter et de l'eau.</p>
    `),
  }),

  rappelImpaye: (vars: {
    parentName: string;
    montant: number;
    prestations: string;
  }) => ({
    subject: `Rappel de paiement — ${vars.montant.toFixed(2)}€`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">Nous nous permettons de vous rappeler qu'un solde reste dû :</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#991b1b;font-weight:600;font-size:18px;">${vars.montant.toFixed(2)}€</p>
        <p style="margin:6px 0 0;color:#555;font-size:13px;">${vars.prestations}</p>
      </div>
      ${button("Régler en ligne", `${SITE_URL}/espace-cavalier/factures`, "#dc2626")}
      <p style="color:#555;font-size:13px;">Merci de régulariser votre situation à votre convenance.</p>
    `),
  }),

  // ═══ ADMINISTRATIF ═══

  bienvenueNouvelleFamille: (vars: {
    parentName: string;
  }) => ({
    subject: `Bienvenue au ${CLUB_NAME} !`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">Bienvenue au ${CLUB_NAME} ! 🐴</p>
      <p style="color:#555;">Votre espace personnel est prêt. Vous pouvez dès maintenant :</p>
      <ul style="color:#555;font-size:14px;line-height:1.8;">
        <li>Compléter le profil de votre famille</li>
        <li>Inscrire vos enfants aux activités</li>
        <li>Réserver des stages et des balades</li>
        <li>Suivre vos paiements et factures</li>
      </ul>
      ${button("Accéder à mon espace", `${SITE_URL}/espace-cavalier`, "#2050A0")}
      <p style="color:#555;font-size:13px;">N'hésitez pas à nous contacter au ${CLUB_TEL} pour toute question.</p>
    `),
  }),

  desinscriptionAvoir: (vars: {
    parentName: string;
    childName: string;
    activite: string;
    montantAvoir: number;
    refAvoir: string;
  }) => ({
    subject: `Désinscription — Avoir de ${vars.montantAvoir.toFixed(2)}€`,
    html: wrap(`
      <p style="color:#333;font-size:15px;">Bonjour <strong>${vars.parentName}</strong>,</p>
      <p style="color:#555;">La désinscription de <strong>${vars.childName}</strong> de <strong>${vars.activite}</strong> a été enregistrée.</p>
      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#6b21a8;font-weight:600;">Un avoir a été créé sur votre compte :</p>
        <p style="margin:8px 0 0;color:#6b21a8;font-size:20px;font-weight:bold;">${vars.montantAvoir.toFixed(2)}€</p>
        <p style="margin:4px 0 0;color:#999;font-size:12px;">Référence : ${vars.refAvoir}</p>
      </div>
      <p style="color:#555;font-size:13px;">Cet avoir sera automatiquement proposé lors de votre prochain encaissement.</p>
    `),
  }),
};

export type EmailTemplateName = keyof typeof emailTemplates;
