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
  { id: "certificat", label: "Certificat de travail", emoji: "📜" },
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

// ── Dossier interne employeur ───────────────────────────────────────────────
// Pièces disciplinaires et preuves de procédure, STRICTEMENT admin-only :
// collection `dossier-interne-salaries` et chemin Storage dédiés, jamais
// d'email d'accès — le salarié ne peut pas les voir, par construction.

export const TYPES_DOC_INTERNE = [
  { id: "remise_signee", label: "Remise en main propre signée (décharge)", emoji: "🖊️" },
  { id: "preuve_depot", label: "Preuve de dépôt / accusé de réception", emoji: "📮" },
  { id: "convocation", label: "Convocation à entretien préalable", emoji: "📅" },
  { id: "sanction", label: "Sanction disciplinaire (avertissement, mise à pied…)", emoji: "⚖️" },
  { id: "compte_rendu", label: "Compte rendu d'entretien", emoji: "📝" },
  { id: "autre_interne", label: "Autre pièce interne", emoji: "🗂️" },
] as const;

export type TypeDocInterne = (typeof TYPES_DOC_INTERNE)[number]["id"];

export interface DocInterne {
  id: string;
  salarieId: string;
  salarieNom: string;
  type: TypeDocInterne;
  titre: string;
  /** Date du document lui-même ("2026-08-26") — les délais de procédure et la
   *  prescription se comptent sur elle, pas sur la date de dépôt. */
  dateDocument?: string;
  note?: string;
  fileName: string;
  url: string;
  storagePath: string;
  size: number;
  createdAt?: any;
  uploadedBy?: string;
}

export const labelTypeInterne = (type: string) =>
  TYPES_DOC_INTERNE.find((t) => t.id === type)?.label || "Pièce interne";

export const emojiTypeInterne = (type: string) =>
  TYPES_DOC_INTERNE.find((t) => t.id === type)?.emoji || "🗂️";

/**
 * Sanction prescrite : plus de 3 ans (art. L.1332-5 du Code du travail), elle
 * ne peut plus être invoquée à l'appui d'une nouvelle sanction — signal
 * qu'elle est bonne à purger du dossier.
 */
export function sanctionPrescrite(d: Pick<DocInterne, "type" | "dateDocument">): boolean {
  if (d.type !== "sanction" || !d.dateDocument) return false;
  const date = new Date(`${d.dateDocument}T12:00:00`);
  if (isNaN(date.getTime())) return false;
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - 3);
  return date < limite;
}

export const emojiTypeDoc = (type: string) =>
  TYPES_DOC_SALARIE.find((t) => t.id === type)?.emoji || "📎";

/** "2026-08" → "août 2026" pour l'affichage. */
export function labelPeriode(periode?: string): string {
  if (!periode) return "";
  const d = new Date(`${periode}-01T12:00:00`);
  if (isNaN(d.getTime())) return periode;
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
