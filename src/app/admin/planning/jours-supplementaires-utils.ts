/**
 * src/app/admin/planning/jours-supplementaires-utils.ts — « Inscrire aussi
 * dans d'autres jours ? », juste après une inscription « ce jour uniquement ».
 *
 * Octobre 2026 : Marin, inscrit un jour au « Premiers Sabots » et réglé
 * 27 €, s'est retrouvé inscrit à tous les jours. Chaque clic inscrivait
 * l'enfant puis cherchait la commande du stage PARMI LES SEULES COMMANDES
 * EN ATTENTE : la sienne était payée, introuvable, et les jours ajoutés
 * n'étaient facturés nulle part, sans un mot. Faute de commande, une autre
 * commande de stage de la famille pouvait même être réécrite.
 *
 * Désormais : la commande est cherchée quel que soit son statut, et
 * seulement celle de CE stage et de CES cavaliers. Si elle est verrouillée
 * (payée ou facturée, cf. commande-verrou) ou introuvable, le jour ajouté
 * part dans une nouvelle commande en attente, pour le complément.
 *
 * Module pur, testé seul (tests/unit/jours-supplementaires.test.ts).
 */

export interface LigneStage { activityType?: string; childId?: string; stageKey?: string; activityTitle?: string; creneauIds?: string[]; creneauId?: string; priceTTC?: number }
export interface CommandeStage { id: string; status?: string; items?: LigneStage[]; invoiceNumber?: string | null; paidAmount?: number | null }

const estStage = (i: LigneStage) => i.activityType === "stage" || i.activityType === "stage_journee";

/** Ligne de CE stage (titre ou créneau d'origine) pour l'un de ces cavaliers. */
export function ligneDuStage(i: LigneStage, stageTitle: string, creneauOrigine: string | undefined, enfants: Set<string>): boolean {
  if (!estStage(i) || !i.childId || !enfants.has(i.childId)) return false;
  const creneaux = Array.isArray(i.creneauIds) ? i.creneauIds : i.creneauId ? [i.creneauId] : [];
  return (!!creneauOrigine && creneaux.includes(creneauOrigine))
    || String(i.stageKey || "").includes(stageTitle) || String(i.activityTitle || "").includes(stageTitle);
}

/** La commande qui porte ce stage pour ces cavaliers — jamais une autre. La plus récente si plusieurs. */
export function commandeDuStage<T extends CommandeStage>(commandes: T[], stageTitle: string, creneauOrigine: string | undefined, enfants: string[]): T | null {
  const set = new Set(enfants);
  const candidates = commandes.filter((c) => c.status !== "cancelled" && (c.items || []).some((i) => ligneDuStage(i, stageTitle, creneauOrigine, set)));
  return candidates[candidates.length - 1] || null;
}

/** Prix du stage pour `jours` jours : prix jour × jours, prix semaine si tous les jours sont pris. */
export function prixPourJours(jours: number, totalJours: number, prixJour: number, prixSemaine: number): number {
  return jours >= totalJours ? prixSemaine : Math.round(prixJour * jours * 100) / 100;
}

/** Ce qu'il reste à facturer pour un cavalier, déjà facturé `dejaFacture` dans une commande verrouillée. */
export function complementJour(dejaFacture: number, joursMaintenant: number, totalJours: number, prixJour: number, prixSemaine: number): number {
  return Math.max(0, Math.round((prixPourJours(joursMaintenant, totalJours, prixJour, prixSemaine) - dejaFacture) * 100) / 100);
}
