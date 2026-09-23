/**
 * src/lib/cartes-seances.ts — une carte de séances couvre-t-elle un créneau ?
 *
 * Écrit une fois, lu par la réservation en ligne (navigateur), par le serveur
 * d'inscription (/api/enroll, qui a le dernier mot) et par les écrans admin.
 *
 * Une carte est vendue depuis Admin → Cartes : N séances de cours ou de
 * balade, pour un cavalier ou pour toute la famille. La séance n'est
 * décomptée qu'au montoir, à la présence constatée ; à la réservation on ne
 * fait que « réserver » une séance de la carte, sans l'entamer.
 */

export const TYPES_COURS = ["cours", "cours_collectif", "cours_particulier"] as const;
export const TYPES_BALADE = ["balade", "promenade", "ponyride"] as const;

export interface CarteLike {
  id: string;
  familyId?: string | null;
  childId?: string | null;
  familiale?: boolean;
  /** "cours" (défaut) ou "balade". */
  activityType?: string | null;
  remainingSessions?: number | null;
  status?: string | null;
  /** AAAA-MM-JJ, dernier jour de validité (facultatif). */
  dateFin?: string | null;
  totalSessions?: number | null;
}

export interface CreneauCible {
  childId: string;
  activityType?: string | null;
  /** AAAA-MM-JJ du créneau. */
  date?: string | null;
}

/** Famille de carte correspondant à un type de créneau, ou null (stage, anniversaire…). */
export function typeCarteDuCreneau(activityType?: string | null): "cours" | "balade" | null {
  const t = String(activityType || "");
  if ((TYPES_COURS as readonly string[]).includes(t)) return "cours";
  if ((TYPES_BALADE as readonly string[]).includes(t)) return "balade";
  return null;
}

/** La carte est-elle utilisable pour CE cavalier sur CE créneau ? (sans tenir compte des séances déjà réservées) */
export function carteCouvreCreneau(carte: CarteLike, cible: CreneauCible): boolean {
  if (!carte || carte.status !== "active") return false;
  if ((Number(carte.remainingSessions) || 0) <= 0) return false;
  const typeCible = typeCarteDuCreneau(cible.activityType);
  if (!typeCible) return false;
  if ((carte.activityType || "cours") !== typeCible) return false;
  if (!carte.familiale && carte.childId !== cible.childId) return false;
  if (carte.dateFin && cible.date && carte.dateFin < cible.date) return false;
  return true;
}

/**
 * Séances déjà RÉSERVÉES sur chaque carte et pas encore décomptées : les
 * inscrits à venir dont l'entrée porte `cardId`. Une carte de 5 séances
 * réservée 5 fois n'en couvre pas une sixième, même si rien n'a encore été
 * décompté au montoir.
 */
export function compterReservationsParCarte(
  creneaux: { date?: string | null; enrolled?: any[] | null }[],
  aujourdhui: string,
): Record<string, number> {
  const compte: Record<string, number> = {};
  for (const c of creneaux) {
    if (!c?.date || c.date < aujourdhui) continue;
    for (const e of c.enrolled || []) {
      if (!e?.cardId || e.cardDeducted) continue;
      compte[e.cardId] = (compte[e.cardId] || 0) + 1;
    }
  }
  return compte;
}

/** Séances encore disponibles à la réservation sur une carte. */
export function seancesDisponibles(carte: CarteLike, reservees: Record<string, number>): number {
  return (Number(carte.remainingSessions) || 0) - (reservees[carte.id] || 0);
}

/**
 * Choisit la carte à utiliser pour un créneau, ou null si aucune ne convient.
 * Une carte nominative passe avant une carte familiale ; à égalité, celle qui
 * expire le plus tôt, pour ne pas laisser périmer des séances.
 */
export function choisirCarte(
  cartes: CarteLike[],
  cible: CreneauCible,
  reservees: Record<string, number> = {},
): CarteLike | null {
  const candidates = cartes
    .filter((c) => carteCouvreCreneau(c, cible) && seancesDisponibles(c, reservees) > 0)
    .sort((a, b) => {
      if (!!a.familiale !== !!b.familiale) return a.familiale ? 1 : -1;
      return String(a.dateFin || "9999-12-31").localeCompare(String(b.dateFin || "9999-12-31"));
    });
  return candidates[0] || null;
}

/** Libellé court d'une carte, pour le panier et les emails. */
export function libelleCarte(carte: CarteLike): string {
  const total = Number(carte.totalSessions) || 0;
  const base = total > 0 ? `Carte ${total} séances` : "Carte de séances";
  return carte.familiale ? `${base} (famille)` : base;
}
