/**
 * Détection et lecture des messages du répondeur StandardFacile.
 *
 * StandardFacile (monstandardfacile.com) envoie chaque message vocal par mail :
 *   De     : notification@monstandardfacile.com
 *   Objet  : "Message du 0635254429 (19s)"
 *   Corps  : "Le correspondant 0635254429 a essayé de joindre votre numéro
 *             StandardFacile 0244849996 le 20 juillet 2026 à 13h21…"
 *   PJ     : 0635254429xxxxxxxx.mp3
 *
 * Tout ce dont on a besoin (numéro appelant + durée) est déjà dans l'OBJET :
 * pas besoin de parser le corps HTML, qui est le plus fragile.
 */

/** Expéditeurs reconnus comme étant le répondeur. */
const SENDERS = ["monstandardfacile.com", "standardfacile.com"];

/** L'objet du mail : "Message du 0635254429 (19s)" */
const SUBJECT_RE = /^\s*Message\s+du\s+(\S+)\s*\((\d+)\s*s\)/i;

/** Durée en dessous de laquelle on considère le message comme vide. */
export const DUREE_MIN_SECONDES = 3;

export interface VoicemailInfo {
  /** Numéro brut de l'appelant, "" si masqué/inconnu. */
  numero: string;
  /** Durée du message en secondes. */
  dureeSec: number;
  /** true si le numéro est masqué ou illisible. */
  anonyme: boolean;
  /** true si le message est trop court pour contenir quoi que ce soit. */
  troopCourt: boolean;
}

/** Le mail vient-il du répondeur StandardFacile ? */
export function estMessageRepondeur(from: string, subject: string): boolean {
  const f = (from || "").toLowerCase();
  if (!SENDERS.some((s) => f.includes(s))) return false;
  return SUBJECT_RE.test(subject || "");
}

/**
 * Extrait numéro et durée depuis l'objet du mail.
 * Renvoie null si l'objet ne correspond pas au format attendu.
 */
export function parseObjetRepondeur(subject: string): VoicemailInfo | null {
  const m = SUBJECT_RE.exec(subject || "");
  if (!m) return null;

  const brut = (m[1] || "").trim();
  const dureeSec = parseInt(m[2], 10) || 0;

  // Un numéro exploitable = au moins 9 chiffres. Sinon c'est "Anonyme",
  // "Inconnu", "Masque"… selon ce que remonte l'opérateur.
  const digits = brut.replace(/\D/g, "");
  const anonyme = digits.length < 9;

  return {
    numero: anonyme ? "" : digits,
    dureeSec,
    anonyme,
    troopCourt: dureeSec < DUREE_MIN_SECONDES,
  };
}

/**
 * Objet lisible pour l'assistant, une fois le message transcrit.
 * Ex : "Message vocal du 06 35 25 44 29 (19s)"
 */
export function objetTranscription(info: VoicemailInfo, numeroLisible: string): string {
  const qui = info.anonyme ? "numéro masqué" : numeroLisible;
  return `Message vocal du ${qui} (${info.dureeSec}s)`;
}
