/**
 * src/lib/solde-stage-rappel.ts — quand demander le solde d'un stage.
 *
 * Octobre 2026 : une famille inscrite en septembre (acompte payé en ligne)
 * n'a jamais reçu la demande de solde de J-7. Le passage quotidien ne
 * regardait que les stages commençant EXACTEMENT dans 7 jours : un passage
 * manqué (panne, envoi bloqué par le mode restreint, refus de Resend), et ce
 * stage n'était plus jamais revu. Même chose pour une inscription faite à
 * moins de 7 jours du stage.
 *
 * Désormais : tout stage qui commence d'ici 7 jours, solde dû, sans demande
 * déjà partie, est traité — le jour J-7 comme au passage suivant. La relance
 * (J-5) attend deux jours après la première demande, pour ne pas envoyer
 * deux emails coup sur coup à une famille rattrapée tardivement.
 *
 * Module pur, testé seul (tests/unit/solde-stage-rappel.test.ts).
 */

export interface PaiementStage {
  stageDate?: string;
  totalTTC?: number;
  paidAmount?: number;
  status?: string;
  /** Millisecondes, ou absent. */
  soldeReminderSentAt?: number | null;
  soldeRelanceJ5SentAt?: unknown;
}

const JOUR = 86_400_000;
const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function soldeRestant(p: PaiementStage): number {
  return Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100;
}

const soldeDu = (p: PaiementStage) => soldeRestant(p) > 0 && p.status !== "paid" && p.status !== "cancelled";
const dansFenetre = (d: string | undefined, de: string, a: string) => !!d && /^\d{4}-\d{2}-\d{2}/.test(d) && d.slice(0, 10) >= de && d.slice(0, 10) <= a;

/** Demande de solde à envoyer : stage entre aujourd'hui et J-7, rien encore envoyé. */
export function doitDemanderSolde(p: PaiementStage, aujourdhui: string, j7: string): boolean {
  return dansFenetre(p.stageDate, aujourdhui, j7) && soldeDu(p) && !p.soldeReminderSentAt;
}

/** Relance à envoyer : stage d'ici J-5, demande partie depuis 2 jours au moins. */
export function doitRelancerSolde(p: PaiementStage, aujourdhui: string, j5: string, maintenant: number): boolean {
  if (!dansFenetre(p.stageDate, aujourdhui, j5) || !soldeDu(p) || p.soldeRelanceJ5SentAt) return false;
  return !!p.soldeReminderSentAt && maintenant - p.soldeReminderSentAt >= 2 * JOUR;
}

/** Jours entre aujourd'hui et le début du stage (AAAA-MM-JJ). */
export function joursAvantStage(stageDate: string, aujourdhui: string): number {
  return Math.round((ms(stageDate) - ms(aujourdhui)) / JOUR);
}

/** « dans 7 jours », « dans 3 jours », « demain », « aujourd'hui ». */
export function libelleDelai(jours: number): string {
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  return `dans ${jours} jours`;
}
