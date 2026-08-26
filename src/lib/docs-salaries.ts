/**
 * Documents personnels des salariés (fiches de paie, attestations France
 * Travail, contrats…).
 *
 * Deux faces d'un même module :
 *  - l'admin dépose les fichiers depuis Équipe & planning → Équipe (fiche de
 *    chaque salarié) ;
 *  - chaque collaborateur retrouve LES SIENS dans Admin → Mes documents.
 *
 * La clé d'accès est l'email du compte collaborateur, stocké en minuscules
 * sur chaque document : les rules Firestore et Storage ne laissent lire un
 * document qu'à l'admin et au compte dont l'email correspond.
 */

export const TYPES_DOC_SALARIE = [
  { id: "fiche_paie", label: "Fiche de paie", emoji: "💶" },
  { id: "attestation", label: "Attestation France Travail", emoji: "📄" },
  { id: "contrat", label: "Contrat de travail", emoji: "✍️" },
  { id: "autre", label: "Autre document", emoji: "📎" },
] as const;

export type TypeDocSalarie = (typeof TYPES_DOC_SALARIE)[number]["id"];

export interface DocSalarie {
  id: string;
  salarieId: string;
  salarieNom: string;
  /** Email du compte collaborateur, en minuscules — c'est la clé d'accès. */
  email: string;
  type: TypeDocSalarie;
  titre: string;
  /** "2026-08" pour une fiche de paie (mois concerné). */
  periode?: string;
  fileName: string;
  url: string;
  storagePath: string;
  size: number;
  createdAt?: any;
  uploadedBy?: string;
}

export const labelTypeDoc = (type: string) =>
  TYPES_DOC_SALARIE.find((t) => t.id === type)?.label || "Document";

export const emojiTypeDoc = (type: string) =>
  TYPES_DOC_SALARIE.find((t) => t.id === type)?.emoji || "📎";

/** "2026-08" → "août 2026" pour l'affichage. */
export function labelPeriode(periode?: string): string {
  if (!periode) return "";
  const d = new Date(`${periode}-01T12:00:00`);
  if (isNaN(d.getTime())) return periode;
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
