/**
 * src/lib/balade-petit-groupe.ts — Balades collectives sous le seuil de rentabilité.
 *
 * PRINCIPE MÉTIER (décidé avec Nicolas, août 2026) :
 *   Une balade collective n'est rentable qu'à partir d'un nombre minimum de
 *   participants (champ `minParticipants` de l'activité). Si ce minimum n'est
 *   pas atteint 2 jours avant le départ, chaque famille inscrite reçoit un
 *   email lui proposant TROIS choix :
 *     1. « supplement » — maintenir la balade en petit comité moyennant un
 *        supplément par cavalier (champ `supplementPetitGroupe` de l'activité),
 *        payé en ligne via CAWL ;
 *     2. « report »     — reporter à une autre date (le club recontacte) ;
 *     3. « avoir »      — annuler : désinscription + avoir du montant payé.
 *
 * ARCHITECTURE :
 *   - Cron /api/cron/balades-petit-groupe (appelé par daily-emails) : détecte
 *     les balades à J+2 sous le seuil, crée un doc de choix PAR FAMILLE dans
 *     la collection `balade-petit-groupe` (id du doc = token non devinable,
 *     même mécanisme que satisfaction-invitations), envoie les emails.
 *   - Page publique /balade/[token] + API /api/public/balade-choix : la
 *     famille consulte et enregistre son choix sans connexion — le token
 *     fait office d'authentification, le serveur ne fait confiance qu'au doc.
 *
 * La collection `balade-petit-groupe` n'est accédée QUE via le SDK admin
 * (serveur) : aucune règle Firestore client à ouvrir.
 */

import { emailLayout, emailButton } from "@/lib/email-templates";

/** Nom de la collection Firestore des propositions de choix. */
export const BALADE_CHOIX_COLLECTION = "balade-petit-groupe";

export type BaladeChoixStatus =
  | "attente" // email envoyé, pas encore de réponse
  | "supplement_choisi" // supplément choisi, paiement CAWL initié (pas forcément abouti)
  | "report" // la famille veut reporter — le club recontacte
  | "avoir"; // annulé, avoir créé

export interface BaladeChoixChild {
  childId: string;
  childName: string;
}

/** Doc `balade-petit-groupe/{token}` — une proposition par famille et par balade. */
export interface BaladeChoixDoc {
  creneauId: string;
  activityId: string;
  activityTitle: string;
  date: string; // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
  familyId: string;
  familyName: string;
  familyEmail: string;
  children: BaladeChoixChild[];
  /** Prix TTC par cavalier de la balade (pour le calcul de l'avoir). */
  priceTTCParCavalier: number;
  minParticipants: number;
  /** Inscrits confirmés au moment de l'envoi (toutes familles confondues). */
  inscritsAuMomentEnvoi: number;
  /** € TTC par cavalier. 0 = option supplément non proposée. */
  supplementParCavalier: number;
  supplementTotal: number;
  status: BaladeChoixStatus;
  paymentId?: string | null;
  avoirId?: string | null;
  avoirAmount?: number | null;
  createdAt: string; // ISO
  choiceAt?: string | null;
}

/**
 * Adresse du club pour les notifications internes — jamais fournie par le
 * client (même règle que /api/notify-club).
 */
export function adresseClub(): string {
  return (
    process.env.CLUB_NOTIFY_EMAIL ||
    process.env.RESEND_BCC_EMAIL ||
    "ceagon50@gmail.com"
  );
}

/**
 * Inscrits CONFIRMÉS d'un créneau : on exclut les places simplement tenues
 * (`pending`) — un paiement non abouti ne compte pas comme un participant
 * acquis pour décider du maintien de la balade.
 */
export function compterInscritsConfirmes(creneau: { enrolled?: any[] }): number {
  return (creneau.enrolled || []).filter((e: any) => e && !e.pending).length;
}

/** "2026-08-23" → "dimanche 23 août" (fuseau indifférent : parse à midi). */
export function formatDateBalade(dateStr: string): string {
  const [y, m, d] = (dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return dateStr || "";
  return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const eur = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2).replace(".", ",")} €`;

/**
 * Email envoyé à une famille quand sa balade est sous le seuil.
 * Le lien pointe vers la page publique de choix (token = id du doc).
 */
export function emailFamillePetitGroupe(params: {
  parentName: string;
  activityTitle: string;
  date: string; // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
  childrenNames: string[];
  minParticipants: number;
  inscrits: number;
  supplementParCavalier: number;
  supplementTotal: number;
  lien: string;
}): { subject: string; html: string } {
  const {
    parentName, activityTitle, date, startTime, endTime, childrenNames,
    minParticipants, inscrits, supplementParCavalier, supplementTotal, lien,
  } = params;
  const dateLabel = formatDateBalade(date);
  const cavaliers = childrenNames.filter(Boolean).join(", ");
  const avecSupplement = supplementParCavalier > 0;

  const subject = `Votre balade du ${dateLabel} — une décision à prendre`;
  const html = emailLayout(`
    <p style="color:#1e3a5f;font-size:15px;">Bonjour <strong>${parentName || "cher cavalier"}</strong>,</p>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      Vous êtes inscrit${cavaliers ? ` (${cavaliers})` : ""} à la balade
      <strong>${activityTitle}</strong> du <strong>${dateLabel}</strong> (${startTime}–${endTime}).
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6;">
      À ce jour, la balade compte <strong>${inscrits} inscrit${inscrits > 1 ? "s" : ""}</strong> pour un
      minimum de <strong>${minParticipants} participants</strong>. Comme prévu dans nos conditions,
      nous vous proposons de choisir :
    </p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:12px 0;">
      ${avecSupplement ? `
      <p style="margin:0 0 8px;color:#1e40af;font-size:13px;line-height:1.5;">
        🐴 <strong>Maintenir la balade en petit comité</strong> — supplément de
        ${eur(supplementParCavalier)} par cavalier${childrenNames.length > 1 ? ` (soit ${eur(supplementTotal)})` : ""},
        à régler en ligne.
      </p>` : ""}
      <p style="margin:0 0 8px;color:#1e40af;font-size:13px;line-height:1.5;">
        📅 <strong>Reporter</strong> à une autre date — nous vous recontactons pour convenir ensemble.
      </p>
      <p style="margin:0;color:#1e40af;font-size:13px;line-height:1.5;">
        💶 <strong>Annuler avec un avoir</strong> du montant payé, valable sur toutes nos prestations.
      </p>
    </div>
    ${emailButton("Faire mon choix", lien, "#1e3a5f")}
    <p style="font-size:12px;color:#64748b;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${lien}</p>
    <p style="color:#555;font-size:13px;line-height:1.6;">
      Sans réponse de votre part avant la veille de la balade, nous vous appellerons pour décider ensemble.
      Bien sûr, si d'autres cavaliers s'inscrivent d'ici là et que le minimum est atteint,
      la balade est maintenue sans supplément.
    </p>
    <p style="color:#555;font-size:13px;">À très bientôt !<br/>L'équipe du Centre Équestre d'Agon-Coutainville</p>
  `);
  return { subject, html };
}
