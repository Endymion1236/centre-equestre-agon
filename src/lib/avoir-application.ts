/**
 * src/lib/avoir-application.ts — appliquer un avoir à une commande.
 *
 * Octobre 2026, COSTEGROSSE : le bouton « Utiliser » de l'écran Avoirs
 * marquait l'avoir comme consommé avec une simple « référence facture »
 * tapée à la main — sans toucher à la commande ni au journal. L'avoir
 * disparaissait, la facture ne bougeait pas, et la famille restait redevable
 * de ce qu'on venait de lui déduire.
 *
 * Règle, une fois : un avoir se déduit d'UNE commande, pour un montant qui
 * ne dépasse ni ce qui reste sur l'avoir ni ce que la commande doit encore.
 * L'application crée une écriture « avoir » au journal (lib/encaissement,
 * qui recalcule le payé, le statut et numérote la facture si elle est
 * soldée) et trace la commande sur l'avoir.
 *
 * Les utilisations déjà faites « dans le vide » (sans commande) se
 * reconnaissent à l'absence de `paymentId` dans l'historique : elles se
 * réparent en appliquant le même montant à une commande, sans redécompter
 * l'avoir.
 */

export interface UtilisationAvoir {
  date: string;
  amount?: number;
  montant?: number;
  invoiceRef?: string;
  paymentId?: string;
}

export interface AvoirLike {
  id: string;
  reference?: string;
  amount?: number;
  usedAmount?: number;
  remainingAmount?: number;
  status?: string;
  usageHistory?: UtilisationAvoir[] | null;
}

export interface CommandeLike {
  id: string;
  totalTTC?: number;
  paidAmount?: number;
  status?: string;
  invoiceNumber?: string | null;
  familyId?: string;
}

const centimes = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
export const montantUtilisation = (u: UtilisationAvoir) => centimes(u?.montant ?? u?.amount ?? 0);

/** Ce que la commande doit encore. */
export const resteDu = (c: CommandeLike) => Math.max(0, centimes((c.totalTTC || 0) - (c.paidAmount || 0)));

/** Les commandes sur lesquelles un avoir peut s'appliquer : vivantes, pas soldées. */
export function commandesApplicables<T extends CommandeLike>(commandes: T[]): T[] {
  return commandes.filter((c) => c.status !== "cancelled" && resteDu(c) > 0.005);
}

/** Les utilisations faites sans commande (ancien bouton), avec leur rang. */
export function utilisationsSansCommande(avoir: AvoirLike): { index: number; utilisation: UtilisationAvoir }[] {
  return (avoir.usageHistory || [])
    .map((utilisation, index) => ({ index, utilisation }))
    .filter(({ utilisation }) => !utilisation?.paymentId && montantUtilisation(utilisation) > 0);
}

export interface PlanApplicationAvoir {
  ok: boolean;
  erreur?: string;
  /** Montant réellement déduit de la commande. */
  montant: number;
  /** Les champs à écrire sur l'avoir. */
  avoirMaj: { usedAmount: number; remainingAmount: number; status: string; usageHistory: UtilisationAvoir[] };
  /** Libellé de l'écriture au journal. */
  libelle: string;
}

/**
 * Le plan d'une application : montant déduit, nouvel état de l'avoir.
 *
 * `reparation` : l'utilisation de rang `index` a déjà décompté l'avoir sans
 * commande ; on l'applique maintenant. Si la commande doit moins que ce qui
 * avait été décompté, la différence revient sur l'avoir.
 */
export function planifierApplicationAvoir(params: {
  avoir: AvoirLike;
  commande: CommandeLike;
  montant: number;
  maintenant?: Date;
  reparation?: { index: number };
}): PlanApplicationAvoir {
  const { avoir, commande, maintenant = new Date(), reparation } = params;
  const historique = [...(avoir.usageHistory || [])];
  const du = resteDu(commande);
  const refus = (erreur: string): PlanApplicationAvoir => ({
    ok: false, erreur, montant: 0, libelle: "",
    avoirMaj: { usedAmount: centimes(avoir.usedAmount || 0), remainingAmount: centimes(avoir.remainingAmount || 0), status: avoir.status || "actif", usageHistory: historique },
  });
  if (commande.status === "cancelled") return refus("Cette commande est annulée.");
  if (du <= 0.005) return refus("Cette commande est déjà soldée.");

  if (reparation) {
    const u = historique[reparation.index];
    if (!u || u.paymentId) return refus("Cette utilisation n'est pas à réparer.");
    const decompte = montantUtilisation(u);
    const montant = centimes(Math.min(decompte, du));
    const rendu = centimes(decompte - montant);
    historique[reparation.index] = { ...u, montant, amount: montant, paymentId: commande.id, invoiceRef: commande.invoiceNumber || u.invoiceRef || commande.id, repareLe: maintenant.toISOString() } as UtilisationAvoir;
    const usedAmount = centimes((avoir.usedAmount || 0) - rendu);
    const remainingAmount = centimes((avoir.remainingAmount || 0) + rendu);
    return {
      ok: true, montant,
      avoirMaj: { usedAmount, remainingAmount, status: remainingAmount > 0.005 ? "actif" : "utilise", usageHistory: historique },
      libelle: `Avoir ${avoir.reference || avoir.id} (régularisation)`,
    };
  }

  const montant = centimes(params.montant);
  const dispo = centimes(avoir.remainingAmount || 0);
  if (!(montant > 0)) return refus("Indiquez un montant.");
  if (avoir.status && avoir.status !== "actif") return refus("Cet avoir n'est plus utilisable.");
  if (montant > dispo + 0.005) return refus(`L'avoir n'a plus que ${dispo.toFixed(2)} €.`);
  if (montant > du + 0.005) return refus(`La commande ne doit plus que ${du.toFixed(2)} €.`);
  historique.push({ date: maintenant.toISOString(), montant, amount: montant, paymentId: commande.id, invoiceRef: commande.invoiceNumber || commande.id });
  const usedAmount = centimes((avoir.usedAmount || 0) + montant);
  const remainingAmount = centimes(dispo - montant);
  return {
    ok: true, montant,
    avoirMaj: { usedAmount, remainingAmount, status: remainingAmount > 0.005 ? "actif" : "utilise", usageHistory: historique },
    libelle: `Avoir ${avoir.reference || avoir.id}`,
  };
}

/**
 * Fiches sur lesquelles chercher la commande à créditer.
 *
 * D'abord la fiche de l'avoir et toutes celles qui lui sont rattachées
 * (compte de connexion, fiche du bureau absorbée : lib/fusion-familles).
 * Puis, par sécurité, toute fiche qui porte le même nom de famille que
 * l'avoir : un avoir créé sur une fiche que le rattachement n'a pas suivie
 * (19/10/2026, COSTEGROSSE : « Aucune commande à régler ») retrouve quand
 * même la commande, et l'écran dit sur quelle fiche elle vit.
 */
export function fichesOuChercherLaCommande(
  avoir: { familyId: string; familyName?: string | null },
  fiches: { id: string; status?: string | null; mergedInto?: string | null; parentName?: string | null; lastName?: string | null }[],
  rattachees: (familyId: string, fiches: { id: string; status?: string | null; mergedInto?: string | null }[]) => string[],
): string[] {
  const ids = new Set(rattachees(avoir.familyId, fiches));
  const nom = nomDeFamille(avoir.familyName);
  if (nom) {
    for (const f of fiches) {
      if (nomDeFamille(f.lastName) === nom || nomDeFamille(f.parentName) === nom) ids.add(f.id);
    }
  }
  return [...ids];
}

/** « COSTEGROSSE Olivier » → « costegrosse » (premier mot, sans accents ni casse). */
export const nomDeFamille = (s: unknown): string =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().split(/\s+/)[0] || "";
