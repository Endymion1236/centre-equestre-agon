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
export function indiceProximite(p: PieceExtraite, depenses: DepenseCandidate[]): { texte: string; famille: FamilleRefus } {
  const rien = { texte: "", famille: "aucun-debit" as FamilleRefus };
  if (p.ttc === null || !p.date) return rien;
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
  if (!meilleur) return rien;
  const d = meilleur.d;
  const quand = d.dateOperation || "date inconnue";
  if (meilleur.ecart === 0) {
    // Le débit existe et porte le bon montant, mais le relevé importé n'a pas
    // conservé sa date : c'est le relevé qu'il faut compléter, pas la pièce.
    if (meilleur.jours === null) return { famille: "sans-date", texte: ` Un débit du même montant existe (« ${d.fournisseur} »), mais sans date d'opération. Complétez les dates du relevé (Import bancaire → « Compléter les dates existantes »), puis relancez ; en attendant, associez-le à la main.` };
    if (meilleur.jours < 0) return { famille: "hors-delai", texte: ` Un débit du même montant existe le ${quand} (« ${d.fournisseur} »), soit AVANT la date lue sur la pièce : la date de la pièce est peut-être mal lue.` };
    if (meilleur.jours > DELAI_DEBIT_JOURS) return { famille: "hors-delai", texte: ` Un débit du même montant existe le ${quand} (« ${d.fournisseur} »), mais ${meilleur.jours} jours après : hors du délai de ${DELAI_DEBIT_JOURS} jours.` };
    // Montant et date concordent : c'est donc le nom qui a opposé son veto.
    return { famille: "veto-nom", texte: ` Le débit de ${quand} (« ${d.fournisseur} ») a le bon montant et la bonne date, mais son libellé ne ressemble pas à « ${p.fournisseur} » : associez-le à la main, ou corrigez le fournisseur lu sur la pièce.` };
  }
  return { famille: "montant-proche", texte: ` Le débit le plus proche est ${(d.montant).toFixed(2)} € le ${quand} (« ${d.fournisseur} »), soit ${(meilleur.ecart / 100).toFixed(2)} € d'écart : vérifiez le montant lu sur la pièce.` };
}

/** Résumé du rapport : combien de pièces par famille, dans l'ordre d'affichage. */
export const LIBELLE_FAMILLE: Record<FamilleRefus, string> = {
  "veto-nom": "débit trouvé, libellé différent (à associer d'un clic)",
  "montant-proche": "montant proche : un chiffre à vérifier sur la pièce",
  "sans-date": "débit sans date au relevé : dates à compléter",
  "hors-delai": "débit trouvé hors du délai de sept jours",
  "ambigu": "plusieurs candidats : à choisir à la main",
  "doublon": "doublon : archivez l'exemplaire en trop",
  "non-lue": "lecture pas encore lancée",
  "a-completer": "lecture à compléter (fournisseur, date, TTC, devise)",
  "aucun-debit": "aucun débit comparable au relevé",
  "pas-un-achat": "pas une facture d'achat (paie, vente, divers)",
  "hors-periode": "pièces d'un autre mois",
};

export function resumerRefus(ignorees: PieceIgnoree[]): { famille: FamilleRefus; libelle: string; nb: number }[] {
  const ordre = Object.keys(LIBELLE_FAMILLE) as FamilleRefus[];
  return ordre
    .map(famille => ({ famille, libelle: LIBELLE_FAMILLE[famille], nb: ignorees.filter(i => i.famille === famille).length }))
    .filter(f => f.nb > 0);
}

export type AssociationAuto = { pieceId: string; depenseId: string; concordance: Concordance; nom?: string; fournisseur?: string; montant: number; dateOperation?: string };
/**
 * Famille d'un refus, pour que le rapport se lise d'un coup d'œil.
 *
 * Sur cent trois pièces écartées, une liste plate ne dit rien : les bulletins
 * de paie et les factures de vente n'ont rien à y faire, les pièces d'un
 * autre mois non plus, et les trois qui méritent vraiment un geste se perdent
 * au milieu. Le regroupement sépare ce qui est normal de ce qui appelle une
 * action.
 */
export type FamilleRefus =
  | "hors-periode"    // pièce d'un autre mois : ce n'est pas un problème
  | "pas-un-achat"    // bulletin de paie, facture de vente, document divers
  | "non-lue"         // lecture pas encore lancée
  | "doublon"         // deux exemplaires de la même facture
  | "sans-date"       // le débit correspondant n'a pas de date d'opération
  | "montant-proche"  // un chiffre à vérifier sur la pièce
  | "hors-delai"      // le débit existe, mais trop loin dans le temps
  | "veto-nom"        // montant et date bons, libellé bancaire différent
  | "ambigu"          // plusieurs candidats des deux côtés
  | "a-completer"     // fournisseur, date, TTC ou devise manquants
  | "aucun-debit";    // rien de comparable au relevé

export type PieceIgnoree = { pieceId: string; nom?: string; motif: string; famille: FamilleRefus };

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
  mois?: string,
): { associations: AssociationAuto[]; ignorees: PieceIgnoree[] } {
  const actives = pieces.filter(p => !p.retire && !p.depenseId && !p.paiementsAssocies?.length);
  // Seuls les débits du mois demandé sont chargés : une facture d'août ou de
  // février n'a évidemment aucun candidat en juillet. Les compter comme
  // « restant à associer à la main » faisait passer un rapprochement réussi
  // pour un échec. On borne donc au mois traité, élargi en amont du délai de
  // débit pour les achats de fin du mois précédent.
  const debut = mois ? new Date(Date.parse(`${mois}-01T00:00:00Z`) - DELAI_DEBIT_JOURS * 86400000).toISOString().slice(0, 10) : "";
  const fin = mois ? `${mois}-31` : "";
  const associations: AssociationAuto[] = [];
  const ignorees: PieceIgnoree[] = [];
  // Un même débit ne peut être promis à deux pièces dans le même passage.
  const debitsPris = new Set<string>();

  for (const p of actives) {
    const ignorer = (motif: string, famille: FamilleRefus) => ignorees.push({ pieceId: p.id, nom: p.nom, motif, famille });
    if (p.decisionAssociation) { ignorer("Pièce mise de côté pour un traitement manuel : laissée telle quelle.", "pas-un-achat"); continue; }
    const e = p.extraction;
    if (!e) { ignorer("Pièce pas encore lue : lancez la lecture avant le rapprochement.", "non-lue"); continue; }
    // Hors du mois traité : rien à corriger, la pièce attend simplement son
    // tour. On le dit avant tout autre motif, sinon le rapport reproche à une
    // facture d'août de n'avoir pas de débit en juillet.
    if (mois && e.date && (e.date < debut || e.date > fin)) { ignorer(`Pièce du ${e.date} : hors du mois traité, relancez sur ${e.date.slice(0, 7)}.`, "hors-periode"); continue; }
    if (e.typeDocument !== "achat") { ignorer(`Document classé « ${e.typeDocument || "inconnu"} » : seules les factures d'achat sont rapprochées seules.`, "pas-un-achat"); continue; }
    if (e.devise !== "EUR") { ignorer("Facture en devise étrangère : association manuelle.", "a-completer"); continue; }
    const alertes = alertesIdentification(e);
    if (alertes.length) { ignorer(`Lecture à compléter : ${alertes[0]}`, "a-completer"); continue; }

    // Deux exemplaires de la même facture : rien d'automatique tant que le
    // doublon n'est pas tranché.
    const doublon = actives.some(q => q.id !== p.id && q.extraction && !!e.numero
      && normaliser(q.extraction.fournisseur) === normaliser(e.fournisseur)
      && normaliser(q.extraction.numero) === normaliser(e.numero));
    if (doublon) { ignorer("Une autre pièce porte le même fournisseur et le même numéro : archivez l'exemplaire en trop, puis relancez.", "doublon"); continue; }

    const candidats = candidatsAutomatiques(e, depenses);
    if (!candidats.length) {
      const { texte, famille } = indiceProximite(e, depenses);
      ignorer(`Aucun débit de ${e.ttc?.toFixed(2)} € entre le ${e.date} et les ${DELAI_DEBIT_JOURS} jours suivants.${texte || " Un achat de fin de mois est souvent débité le mois d'après : relancez sur le mois suivant."}`, famille);
      continue;
    }
    if (candidats.length > 1) {
      ignorer(`${candidats.length} débits possibles pour ${e.ttc?.toFixed(2)} € : ${candidats.slice(0, 3).map(c => `${c.dateOperation || "?"} « ${c.fournisseur} »`).join(", ")}. À choisir à la main.`, "ambigu");
      continue;
    }

    const d = candidats[0];
    if (depensesLiees.has(d.id) || debitsPris.has(d.id)) { ignorer("Le débit correspondant porte déjà un justificatif.", "ambigu"); continue; }

    // Un ancien import sans date pourrait être le même paiement : ne pas le masquer.
    if (depenses.some(autre => autre.id !== d.id && !dateValide(autre.dateOperation)
      && (!autre.mois || autre.mois === d.mois || autre.mois === d.dateOperation?.slice(0, 7))
      && proposerAssociations(e, [autre]).length)) {
      ignorer("Un débit de même montant, sans date d'opération, pourrait être le même paiement. Complétez les dates du relevé (Import bancaire → « Compléter les dates existantes »), puis relancez.", "sans-date"); continue;
    }

    // Une autre pièce non associée conviendrait aussi à ce débit : ambiguïté.
    const concurrente = actives.some(q => q.id !== p.id && !q.depenseId && q.extraction && !q.retire
      && candidatsAutomatiques(q.extraction, [d]).length > 0);
    if (concurrente) { ignorer("Une autre pièce pourrait justifier ce même débit : à choisir à la main.", "ambigu"); continue; }

    debitsPris.add(d.id);
    associations.push({ pieceId: p.id, depenseId: d.id, concordance: d.concordance, nom: p.nom, fournisseur: d.fournisseur, montant: d.montant, dateOperation: d.dateOperation });
  }
  return { associations, ignorees };
}
