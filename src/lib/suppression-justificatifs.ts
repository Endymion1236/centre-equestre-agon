/**
 * src/lib/suppression-justificatifs.ts
 *
 * Suppression DÉFINITIVE des justificatifs : les règles, sans Firebase.
 *
 * ── Pourquoi une suppression, alors qu'un archivage existe ────────────────
 *
 * « Repartir avec une liste de pièces vide » archive : la pièce sort de la
 * liste mais reste en base, avec sa lecture et son fichier. C'est le bon
 * réflexe dans presque tous les cas — sauf quand on veut réellement repartir
 * de zéro, parce que la base a accumulé des essais, des doublons et des
 * lectures dont on ne veut plus. Réimporter par-dessus ne les efface pas :
 * une pièce est identifiée par l'empreinte de son contenu, donc le même
 * fichier retombe sur le même document, archives comprises.
 *
 * Cette suppression-là est irréversible : documents, historiques, fichiers
 * stockés et associations partent ensemble. Elle ne touche ni les opérations
 * bancaires, ni leurs catégories, ni les comptes proposés.
 *
 * ── Ce qui ne peut pas être laissé au hasard ──────────────────────────────
 *
 * Une action irréversible se distingue d'un clic malheureux par trois
 * choses : un mot à écrire soi-même, un aperçu vu avant d'agir, et un refus
 * net sur la base de production (cf. lib/reset-guard). Ce module tient les
 * deux premières ; la route ajoute la troisième.
 *
 * Module pur : aucune dépendance Firebase, testable seul.
 */

/** Ce que le gérant doit écrire pour confirmer, à la lettre près. */
export const MOT_DE_CONFIRMATION = "SUPPRIMER";

export type DemandeSuppression = {
  /** Le mot tapé à la main dans l'écran. */
  confirme?: unknown;
  /** Nombre de pièces annoncé par l'aperçu, pour détecter une base qui a bougé. */
  attendu?: unknown;
};

export type VerdictSuppression =
  | { ok: true; attendu: number | null }
  | { ok: false; erreur: string };

/**
 * La demande est-elle recevable ?
 *
 * `attendu` est facultatif mais recommandé : il vient de l'aperçu et permet
 * à la route de refuser si la base a changé entre-temps — un import lancé
 * depuis un autre onglet, par exemple.
 */
export function verifierDemandeSuppression(d: DemandeSuppression): VerdictSuppression {
  if (typeof d.confirme !== "string" || d.confirme.trim().toUpperCase() !== MOT_DE_CONFIRMATION) {
    return { ok: false, erreur: `Écrivez « ${MOT_DE_CONFIRMATION} » pour confirmer la suppression définitive.` };
  }
  if (d.attendu === undefined || d.attendu === null) return { ok: true, attendu: null };
  if (typeof d.attendu !== "number" || !Number.isInteger(d.attendu) || d.attendu < 0 || d.attendu > 100_000) {
    return { ok: false, erreur: "Aperçu invalide : relancez la prévisualisation." };
  }
  return { ok: true, attendu: d.attendu };
}

/**
 * Le compte de l'aperçu correspond-il encore à ce qu'on trouve ?
 *
 * On tolère que des pièces aient DISPARU depuis l'aperçu (une suppression
 * précédente interrompue, par exemple) : ce qui doit alerter, c'est d'en
 * trouver PLUS que prévu — signe qu'un import tourne en parallèle et que
 * l'on s'apprête à effacer des pièces que personne n'a vues dans l'aperçu.
 */
export function apercuTouJours(attendu: number | null, trouve: number): string | null {
  if (attendu === null) return null;
  if (trouve > attendu) {
    return `La base contient ${trouve} pièces alors que l'aperçu en annonçait ${attendu} : un import est peut-être en cours. Relancez la prévisualisation.`;
  }
  return null;
}
