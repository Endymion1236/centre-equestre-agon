import { nettoyerPiece, proposerAssociations, validerLienDevise, deviseEtrangere, type DepenseCandidate } from "./justificatifs";
import { doublonPossible } from "./doublons-depenses";
import { POSTES_JUSTIFIES_PAR_LE_DEBIT } from "./postes-depenses";

export const CATEGORIE_PERSONNELLE = "Personnel — hors charges";
/**
 * Bien durable (cheval, tracteur, obstacles, clôture…) : ce n'est pas une
 * charge de l'exercice, la comptable l'amortit sur plusieurs années. La ligne
 * reste une dépense (exportée, justifiable) mais sort de la synthèse des
 * charges et du compte de résultat.
 */
export const CATEGORIE_IMMOBILISATION = "Immobilisation — à amortir";
/** Au-dessus de ce TTC (≈ 500 € HT), l'écran suggère de vérifier s'il s'agit d'une immobilisation. */
export const SEUIL_ALERTE_IMMOBILISATION_TTC = 600;
/**
 * Lignes pour lesquelles la banque n'émet pas de facture : le relevé (et,
 * pour un prêt, le tableau d'amortissement conservé) est le justificatif.
 * L'échéance d'un prêt mêle capital (pas une charge) et intérêts (charge
 * financière) : c'est la comptable qui ventile, d'après le tableau.
 */
export const CATEGORIE_EMPRUNTS = "Emprunts";
/**
 * Versement sur le compte FFE du club : une AVANCE, pas une charge. Les
 * licences et engagements sont ensuite débités de ce compte, et le détail
 * n'existe que sur ffe.com. La pièce est donc le relevé du compte FFE, et la
 * charge réelle (engagements) se saisit d'après ce relevé.
 */
export const CATEGORIE_COMPTE_FFE = "Compte FFE (avance licences & engagements)";
export const justifiableParReleve = (poste: unknown, fournisseur: unknown, estCommission: (l: unknown) => string | null) =>
  !!estCommission(fournisseur) || poste === CATEGORIE_EMPRUNTS || (typeof poste === "string" && POSTES_JUSTIFIES_PAR_LE_DEBIT.includes(poste));
export const estPosteCharge = (poste: unknown, postesCharges: string[]) => typeof poste === "string" && postesCharges.includes(poste);

/**
 * Que fait un changement de catégorie sur une ligne du tableau ?
 *
 * Règle du gérant : une charge s'enregistre sur la base du débit, le
 * justificatif ne conditionne que la TVA et la défense en cas de contrôle.
 * Un débit bancaire conservé « hors dépenses » qui reçoit une catégorie de
 * charge devient donc une dépense, pièce ou pas ; la pièce manquante reste
 * signalée à part. L'inverse (sortir une dépense des charges) reste bloqué,
 * sauf vers « Personnel », comme avant.
 */
export function decisionCategorie(params: {
  estDepense: boolean;
  poste: unknown;
  categories: string[];
  postesCharges: string[];
  ligne: DepenseCandidate;
  /** Dépenses déjà suivies le même mois, pour ne pas compter deux fois le même débit. */
  depensesDuMois: DepenseCandidate[];
}): { decision: "mettre-a-jour" | "promouvoir"; } | { decision: "refuser"; motif: string } {
  const { estDepense, poste, categories, postesCharges, ligne, depensesDuMois } = params;
  if (typeof poste !== "string" || !categories.includes(poste)) return { decision: "refuser", motif: "Catégorie invalide" };
  const charge = postesCharges.includes(poste);
  const immobilisation = poste === CATEGORIE_IMMOBILISATION;
  if (estDepense) {
    // Sortir des charges vers Personnel, Immobilisation ou Compte FFE est une
    // requalification légitime ; vers salaires ou virements internes, non.
    if (poste !== CATEGORIE_PERSONNELLE && poste !== CATEGORIE_COMPTE_FFE && !charge && !immobilisation) return { decision: "refuser", motif: "Cette ligne participe déjà aux charges. Son changement de périmètre nécessite un contrôle comptable." };
    return { decision: "mettre-a-jour" };
  }
  // Une immobilisation est une vraie dépense à exporter, même hors charges.
  if (!charge && !immobilisation) return { decision: "mettre-a-jour" };
  const doublon = depensesDuMois.find(d => doublonPossible(ligne, d));
  if (doublon) {
    return { decision: "refuser", motif: `Une dépense identique existe déjà ce mois-ci (${doublon.fournisseur || "sans libellé"}, ${doublon.montant.toFixed(2)} €${doublon.dateOperation ? `, ${doublon.dateOperation}` : ""}). Catégorisez cette dépense-là, ou traitez le doublon avant de continuer.` };
  }
  return { decision: "promouvoir" };
}

export function verifierAssociationTableau(extraction: Record<string, unknown>, depense: DepenseCandidate) {
  if (depense.source !== "releve-bancaire" || !Number.isFinite(depense.montant) || depense.montant <= 0) throw new Error("Un débit bancaire positif est requis.");
  const p = nettoyerPiece(extraction);
  if (p.typeDocument === "paie") {
    if (p.devise !== "EUR" || !p.salarie || !p.moisPaie || p.netAPayer == null || p.netAPayer <= 0 || Math.round(p.netAPayer * 100) !== Math.round(depense.montant * 100)) throw new Error("Le net à payer du bulletin doit correspondre au virement en euros. Vérifiez le salarié et le mois.");
    return { nature: "paie", montantPiece: p.netAPayer, devisePiece: "EUR", montantEUR: depense.montant };
  }
  if (deviseEtrangere(p)) {
    validerLienDevise(p, depense, true);
    return { nature: "devise", montantPiece: p.ttc!, devisePiece: p.devise!, montantEUR: depense.montant };
  }
  if (!p.devise) throw new Error("Devise de la facture non renseignée : ouvrez Corriger la lecture ici et choisissez la devise indiquée sur la facture.");
  if (["vente", "autre"].includes(p.typeDocument || "")) throw new Error(`La lecture a classé ce document en « ${p.typeDocument === "vente" ? "vente" : "autre"} » : il n’est donc pas traité comme une facture reçue d’un fournisseur. Une facture d’achat est souvent lue « vente » parce qu’elle en est une pour son émetteur. Si le club en est bien le destinataire, ouvrez « Corriger la lecture ici », mettez Nature sur « achat », enregistrez, puis confirmez l’association. Pour une attestation PER, choisissez plutôt le rattachement correspondant.`);
  if (p.ttc === null || p.ttc <= 0) throw new Error("Montant TTC absent ou invalide : corrigez la lecture de la facture.");
  const [proposition] = proposerAssociations(p, [depense]);
  if (!proposition) throw new Error(`Facture : ${p.ttc.toFixed(2)} ${p.devise}${p.ttcEscompte !== null ? ` (${p.ttcEscompte.toFixed(2)} escompte déduit)` : ""} ; paiement : ${depense.montant.toFixed(2)} EUR. Si ce paiement est une échéance, choisissez Échéance d’une facture. Si la facture accorde un escompte, renseignez « TTC escompte déduit » via Corriger la lecture ici. Sinon, vérifiez les montants et la pièce sélectionnée.`);
  if (proposition.ecart) return { nature: "escompte", montantPiece: p.ttc!, devisePiece: "EUR", montantEUR: depense.montant, ecart: proposition.ecart };
  return { nature: "facture", montantPiece: p.ttc!, devisePiece: "EUR", montantEUR: depense.montant };
}

export function verifierEcheance(extraction: Record<string, unknown>, montant: number, dejaAssocie: number) {
  const p = nettoyerPiece(extraction);
  if (p.typeDocument !== "achat" || p.devise !== "EUR" || !p.date || !p.fournisseur || !p.ttc || p.ttc <= 0 || !Number.isFinite(montant) || montant <= 0 || !Number.isFinite(dejaAssocie) || dejaAssocie < 0)
    throw new Error("Une facture d’achat en euros et une échéance positive sont requises.");
  if (Math.round(dejaAssocie * 100) + Math.round(montant * 100) > Math.round(p.ttc * 100)) throw new Error("Les paiements associés dépasseraient le total de la facture.");
}
