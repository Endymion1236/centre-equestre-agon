/**
 * src/lib/matching-automatique.ts
 *
 * Rapprochement automatique des justificatifs avec les débits du relevé.
 *
 * ── Pourquoi la règle porte d'abord sur le montant et la date ─────────────
 *
 * La première version exigeait un nom de fournisseur strictement identique
 * entre la pièce et le libellé bancaire. Sur une facture PDF, ça marche ; sur
 * la photo d'un ticket de caisse, l'OCR rend « Uexpress », « U express » ou
 * « e. press », et plus rien ne se rapproche. Or le montant et la date sont
 * les deux informations qui se lisent presque toujours.
 *
 * La règle est donc : montant identique au centime, débit dans les sept jours
 * suivant la pièce, un seul candidat possible — et le nom du fournisseur ne
 * sert plus qu'à opposer un veto. S'il est lisible des deux côtés et qu'il
 * désigne clairement deux commerçants différents, on refuse et on laisse la
 * main. S'il est illisible, l'unicité du montant et de la date suffit.
 *
 * ── Ce qui n'est jamais automatique ──────────────────────────────────────
 *
 *   - un escompte ou tout écart de montant (confirmation humaine) ;
 *   - une pièce en devise étrangère, un bulletin de paie, un avoir ;
 *   - une pièce dont la lecture ne permet pas d'identifier le paiement
 *     (fournisseur, date, TTC ou devise manquants) ;
 *   - deux pièces qui se ressemblent (même fournisseur et même numéro) ;
 *   - un débit que plusieurs pièces pourraient justifier, ou l'inverse ;
 *   - une pièce qu'un humain a mise de côté pour la traiter lui-même.
 *
 * En revanche un écart de ventilation TVA (HT + TVA ≠ TTC, fréquent sur un
 * ticket de caisse à plusieurs taux) n'empêche plus le rapprochement : le TTC
 * payé reste juste, seule la ventilation reste à reprendre.
 *
 * Chaque association posée reste défaisable d'un clic (Dissocier), et le
 * rapport dit sur quoi elle s'appuie.
 */

import { alertesIdentification, dateValide, fournisseurProche, proposerAssociations, type PieceExtraite, type DepenseCandidate } from "./justificatifs";

export type PieceMatching = {
  id: string;
  nom?: string;
  extraction?: PieceExtraite | null;
  retire?: boolean;
  depenseId?: string | null;
  /**
   * Un humain a tranché l'ASSOCIATION de cette pièce (contrôle manuel mis de
   * côté, bulletin classé) : on n'y touche plus.
   *
   * À ne pas confondre avec une correction de lecture. Corriger un
   * fournisseur, une date ou le classement « vente » d'une facture d'achat,
   * c'est préparer le rapprochement, pas y renoncer — c'est même le geste
   * qu'on demande à l'écran quand la lecture automatique s'est trompée.
   * L'ancienne version bloquait les deux sans distinction : quinze tickets
   * corrigés à la main devenaient quinze tickets définitivement hors du
   * rapprochement automatique.
   */
  decisionAssociation?: boolean;
  paiementsAssocies?: { id: string; montant: number }[];
};

/** Délai maximal entre la date de la pièce et le débit bancaire. */
export const DELAI_DEBIT_JOURS = 7;

const normaliser = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type Concordance = "identique" | "proche" | "indetermine" | "contradictoire";

/**
 * Ce que le nom du fournisseur permet de dire, sans jamais l'inventer :
 *   identique     — l'un contient l'autre (« UEXPRESS » dans « CB U EXPRESS AGON ») ;
 *   proche        — mots significatifs communs (« CLINIQUE VET DES POMMIERS ») ;
 *   indetermine   — au moins un des deux noms est illisible ou trop court ;
 *   contradictoire — deux noms lisibles qui ne se ressemblent pas.
 */
export function concordanceFournisseur(nomPiece: unknown, nomDebit: unknown): Concordance {
  const a = normaliser(nomPiece), b = normaliser(nomDebit);
  // On compte les lettres, pas les chiffres : « CB 4673 28/07 » ne nomme
  // personne, c'est un numéro de carte et une date. Le veto ne peut pas
  // s'appuyer sur un libellé qui ne porte aucun nom.
  const lettres = (s: string) => s.replace(/[0-9]/g, "").length;
  if (lettres(a) < 4 || lettres(b) < 4) return "indetermine";
  if (a === b || a.includes(b) || b.includes(a)) return "identique";
  if (fournisseurProche(String(nomPiece ?? ""), String(nomDebit ?? ""))) return "proche";
  return "contradictoire";
}

export interface CandidatAutomatique extends DepenseCandidate {
  concordance: Concordance;
}

/**
 * Débits que cette pièce pourrait justifier sans intervention : montant exact,
 * débit le jour de la pièce ou dans les sept jours, fournisseur non
 * contradictoire.
 */
export function candidatsAutomatiques(p: PieceExtraite, depenses: DepenseCandidate[]): CandidatAutomatique[] {
  if (p.devise !== "EUR" || p.typeDocument !== "achat" || p.ttc === null || p.ttc <= 0 || !p.date || alertesIdentification(p).length) return [];
  return proposerAssociations(p, depenses)
    .filter(d => !d.ecart) // un escompte se confirme à la main, jamais tout seul
    .map(d => {
      const date = dateValide(d.dateOperation);
      const jours = date ? (Date.parse(date) - Date.parse(p.date!)) / 86400000 : -1;
      return { d, jours, concordance: concordanceFournisseur(p.fournisseur, d.fournisseur) };
    })
    .filter(({ jours, concordance }) => jours >= 0 && jours <= DELAI_DEBIT_JOURS && concordance !== "contradictoire")
    .map(({ d, concordance }) => ({ ...d, concordance }));
}

/**
 * Pourquoi cette pièce n'a trouvé aucun débit — en montrant le plus proche.
 *
 * « Aucun débit de 47,32 € dans les sept jours » ne dit pas quoi faire : le
 * débit est-il absent du relevé, décalé de deux jours, ou lu 47,23 € par
 * l'OCR ? En nommant le candidat le plus proche et l'écart exact, le rapport
 * devient une consigne : corriger un chiffre, élargir la date, ou aller
 * chercher le débit ailleurs.
 */
export function indiceProximite(p: PieceExtraite, depenses: DepenseCandidate[]): string {
  if (p.ttc === null || !p.date) return "";
  const ttc = Math.round(p.ttc * 100);
  const candidats = depenses
    .filter(d => d.source === "releve-bancaire" && Number.isFinite(d.montant))
    .map(d => {
      const date = dateValide(d.dateOperation);
      return { d, ecart: Math.abs(Math.round(d.montant * 100) - ttc), jours: date ? Math.round((Date.parse(date) - Date.parse(p.date!)) / 86400000) : null };
    })
    // Un débit dix fois plus gros n'apprend rien : on reste dans le voisinage.
    .filter(c => c.ecart <= Math.max(200, ttc * 0.05))
    .sort((a, b) => a.ecart - b.ecart || Math.abs(a.jours ?? 999) - Math.abs(b.jours ?? 999));

  const meilleur = candidats[0];
  if (!meilleur) return "";
  const d = meilleur.d;
  const quand = d.dateOperation || "date inconnue";
  if (meilleur.ecart === 0) {
    if (meilleur.jours === null) return ` Un débit du même montant existe (« ${d.fournisseur} »), mais sans date : associez-le à la main.`;
    if (meilleur.jours < 0) return ` Un débit du même montant existe le ${quand} (« ${d.fournisseur} »), soit AVANT la date lue sur la pièce : la date de la pièce est peut-être mal lue.`;
    if (meilleur.jours > DELAI_DEBIT_JOURS) return ` Un débit du même montant existe le ${quand} (« ${d.fournisseur} »), mais ${meilleur.jours} jours après : hors du délai de ${DELAI_DEBIT_JOURS} jours.`;
    // Montant et date concordent : c'est donc le nom qui a opposé son veto.
    return ` Le débit de ${quand} (« ${d.fournisseur} ») a le bon montant et la bonne date, mais son libellé ne ressemble pas à « ${p.fournisseur} » : associez-le à la main, ou corrigez le fournisseur lu sur la pièce.`;
  }
  return ` Le débit le plus proche est ${(d.montant).toFixed(2)} € le ${quand} (« ${d.fournisseur} »), soit ${(meilleur.ecart / 100).toFixed(2)} € d'écart : vérifiez le montant lu sur la pièce.`;
}

export type AssociationAuto = { pieceId: string; depenseId: string; concordance: Concordance; nom?: string; fournisseur?: string; montant: number; dateOperation?: string };
export type PieceIgnoree = { pieceId: string; nom?: string; motif: string };

/**
 * Plan complet : ce qui peut être associé seul, et pourquoi le reste ne le
 * peut pas. Aucune écriture ici — la route décide d'appliquer ou non.
 *
 * `depensesLiees` : identifiants des débits qui portent déjà un justificatif.
 */
export function planifierRapprochementAuto(
  pieces: PieceMatching[],
  depenses: DepenseCandidate[],
  depensesLiees: Set<string>,
): { associations: AssociationAuto[]; ignorees: PieceIgnoree[] } {
  const actives = pieces.filter(p => !p.retire && !p.depenseId && !p.paiementsAssocies?.length);
  const associations: AssociationAuto[] = [];
  const ignorees: PieceIgnoree[] = [];
  // Un même débit ne peut être promis à deux pièces dans le même passage.
  const debitsPris = new Set<string>();

  for (const p of actives) {
    const ignorer = (motif: string) => ignorees.push({ pieceId: p.id, nom: p.nom, motif });
    if (p.decisionAssociation) { ignorer("Pièce mise de côté pour un traitement manuel : laissée telle quelle."); continue; }
    const e = p.extraction;
    if (!e) { ignorer("Pièce pas encore lue : lancez la lecture avant le rapprochement."); continue; }
    if (e.typeDocument !== "achat") { ignorer(`Document classé « ${e.typeDocument || "inconnu"} » : seules les factures d'achat sont rapprochées seules.`); continue; }
    if (e.devise !== "EUR") { ignorer("Facture en devise étrangère : association manuelle."); continue; }
    const alertes = alertesIdentification(e);
    if (alertes.length) { ignorer(`Lecture à compléter : ${alertes[0]}`); continue; }

    // Deux exemplaires de la même facture : rien d'automatique tant que le
    // doublon n'est pas tranché.
    const doublon = actives.some(q => q.id !== p.id && q.extraction && !!e.numero
      && normaliser(q.extraction.fournisseur) === normaliser(e.fournisseur)
      && normaliser(q.extraction.numero) === normaliser(e.numero));
    if (doublon) { ignorer("Une autre pièce porte le même fournisseur et le même numéro : doublon à trancher."); continue; }

    const candidats = candidatsAutomatiques(e, depenses);
    if (!candidats.length) {
      const indice = indiceProximite(e, depenses);
      ignorer(`Aucun débit de ${e.ttc?.toFixed(2)} € entre le ${e.date} et les ${DELAI_DEBIT_JOURS} jours suivants.${indice || " Un achat de fin de mois est souvent débité le mois d'après : relancez sur le mois suivant."}`);
      continue;
    }
    if (candidats.length > 1) {
      ignorer(`${candidats.length} débits possibles pour ${e.ttc?.toFixed(2)} € : ${candidats.slice(0, 3).map(c => `${c.dateOperation || "?"} « ${c.fournisseur} »`).join(", ")}. À choisir à la main.`);
      continue;
    }

    const d = candidats[0];
    if (depensesLiees.has(d.id) || debitsPris.has(d.id)) { ignorer("Le débit correspondant porte déjà un justificatif."); continue; }

    // Un ancien import sans date pourrait être le même paiement : ne pas le masquer.
    if (depenses.some(autre => autre.id !== d.id && !dateValide(autre.dateOperation)
      && (!autre.mois || autre.mois === d.mois || autre.mois === d.dateOperation?.slice(0, 7))
      && proposerAssociations(e, [autre]).length)) {
      ignorer("Un débit de même montant sans date pourrait être le même paiement : à vérifier."); continue;
    }

    // Une autre pièce non associée conviendrait aussi à ce débit : ambiguïté.
    const concurrente = actives.some(q => q.id !== p.id && !q.depenseId && q.extraction && !q.retire
      && candidatsAutomatiques(q.extraction, [d]).length > 0);
    if (concurrente) { ignorer("Une autre pièce pourrait justifier ce même débit : à choisir à la main."); continue; }

    debitsPris.add(d.id);
    associations.push({ pieceId: p.id, depenseId: d.id, concordance: d.concordance, nom: p.nom, fournisseur: d.fournisseur, montant: d.montant, dateOperation: d.dateOperation });
  }
  return { associations, ignorees };
}
