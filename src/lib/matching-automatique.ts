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

/**
 * Mots qui ne désignent personne : jargon du relevé, formes juridiques,
 * mots de liaison. « Paiement par carte » et « Paiement Orange » ne se
 * ressemblent pas parce qu'ils partagent « paiement ».
 */
const MOTS_NON_DISCRIMINANTS = new Set([
  "paiement", "paiements", "carte", "cartes", "achat", "achats", "virement", "virements",
  "prelevement", "prelevements", "prlv", "vir", "inst", "sepa", "facture", "factures",
  "commission", "commissions", "remise", "avoir", "client", "clients",
  "sarl", "sasu", "eurl", "earl", "scea", "gaec", "societe", "france", "cedex",
  "les", "des", "the", "sur", "par", "pour", "avec", "chez", "dans",
]);

/**
 * Les mots d'un libellé qui désignent réellement un commerçant.
 *
 * On écarte les mots courts, les nombres, les références de carte (« x4673 »)
 * et le jargon bancaire. Ce qui reste, ce sont des noms : « express »,
 * « agon », « carrefour », « agrial ».
 */
function motsSignificatifs(s: unknown): string[] {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter(m => m.length >= 4 && !MOTS_NON_DISCRIMINANTS.has(m) && !/^[a-z]?\d+$/.test(m));
}

export type Concordance = "identique" | "proche" | "indetermine" | "contradictoire";

/**
 * Ce que le nom du fournisseur permet de dire, sans jamais l'inventer :
 *   identique     — l'un contient l'autre (« UEXPRESS » dans « CB U EXPRESS AGON ») ;
 *   proche        — mots significatifs communs (« CLINIQUE VET DES POMMIERS ») ;
 *   indetermine   — au moins un des deux noms est illisible ou trop court ;
 *   contradictoire — deux noms lisibles qui ne se ressemblent pas.
 */
/**
 * Clé d'une correspondance apprise entre un nom de pièce et un libellé
 * bancaire. Les deux sens sont normalisés puis joints : la table est ainsi
 * indépendante de la casse, des accents et de la ponctuation.
 */
export const cleAlias = (nomPiece: unknown, nomDebit: unknown) => `${normaliser(nomPiece)}~${normaliser(nomDebit)}`;

export function concordanceFournisseur(nomPiece: unknown, nomDebit: unknown, alias?: ReadonlySet<string>): Concordance {
  const a = normaliser(nomPiece), b = normaliser(nomDebit);
  // Une correspondance déjà validée à la main fait autorité : aucune règle
  // textuelle ne peut deviner que « SAS CONSTELLACOM » édite les imprimés
  // facturés « Printoclock Toulouse », ni que « Wl google Google One »
  // correspond à « Google Commerce Limited ». Le gérant, lui, l'a établi en
  // associant les deux une première fois.
  if (alias?.has(cleAlias(nomPiece, nomDebit))) return "identique";
  // On compte les lettres, pas les chiffres : « CB 4673 28/07 » ne nomme
  // personne, c'est un numéro de carte et une date. Le veto ne peut pas
  // s'appuyer sur un libellé qui ne porte aucun nom.
  const lettres = (s: string) => s.replace(/[0-9]/g, "").length;
  if (lettres(a) < 4 || lettres(b) < 4) return "indetermine";
  if (a === b || a.includes(b) || b.includes(a)) return "identique";
  if (fournisseurProche(String(nomPiece ?? ""), String(nomDebit ?? ""))) return "proche";
  // Un veto doit se fonder sur une CONTRADICTION, pas sur une simple absence
  // de ressemblance. « STATION U AGON COUTAINVILLE » et « UEP*U EXPRESS AGON »
  // sont deux noms du même magasin ; ils ne se recouvrent pas, mais ils
  // partagent « agon » — trop court pour la règle de proximité, assez pour
  // dire qu'ils ne désignent pas deux commerçants opposés. Refuser là, sur un
  // montant identique au centime et une date à un jour, revenait à écarter la
  // bonne pièce. Le veto ne tombe donc que sur ZÉRO mot en commun :
  // « CARREFOUR MARKET » contre « PRLV ORANGE SA », par exemple.
  const communs = motsSignificatifs(nomDebit);
  if (motsSignificatifs(nomPiece).some(m => communs.includes(m))) return "indetermine";
  return "contradictoire";
}

export interface CandidatAutomatique extends DepenseCandidate {
  concordance: Concordance;
  /** Le débit n'a pas de date : c'est son mois qui a servi de fenêtre. */
  viaMois?: boolean;
}

/** Mois suivant, au format AAAA-MM. */
const moisSuivant = (m: string) => {
  const a = Number(m.slice(0, 4)), b = Number(m.slice(5, 7));
  return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, "0")}`;
};

/**
 * Débits que cette pièce pourrait justifier sans intervention : montant exact,
 * débit le jour de la pièce ou dans les sept jours, fournisseur non
 * contradictoire.
 */
export function candidatsAutomatiques(p: PieceExtraite, depenses: DepenseCandidate[], alias?: ReadonlySet<string>, ignorerVeto = false): CandidatAutomatique[] {
  if (p.devise !== "EUR" || p.typeDocument !== "achat" || p.ttc === null || p.ttc <= 0 || !p.date || alertesIdentification(p).length) return [];
  const moisPiece = p.date.slice(0, 7);
  return proposerAssociations(p, depenses)
    // Un escompte se confirme à la main, jamais tout seul — sauf quand la
    // facture annonce elle-même le montant escompte déduit et que c'est
    // exactement lui qui a été débité : rien n'est deviné.
    .filter(d => !d.ecart || d.ecart.annonce)
    .map(d => {
      const date = dateValide(d.dateOperation);
      const jours = date ? (Date.parse(date) - Date.parse(p.date!)) / 86400000 : -1;
      // Un relevé importé sans dates d'opération bloquait tout : vingt-trois
      // pièces d'un même mois attendaient un débit qui existait, au centime
      // près, mais qu'aucun délai ne pouvait valider. Le mois du débit tient
      // alors lieu de fenêtre — celui de la pièce, ou le suivant pour un
      // achat de fin de mois. Les garanties d'unicité, elles, ne bougent pas :
      // un seul débit candidat, une seule pièce prétendante, et le veto du
      // nom s'applique comme avant.
      const viaMois = !date && !!d.mois && (d.mois === moisPiece || d.mois === moisSuivant(moisPiece));
      return { d, jours, viaMois, concordance: concordanceFournisseur(p.fournisseur, d.fournisseur, alias) };
    })
    .filter(({ jours, viaMois, concordance }) => (viaMois || (jours >= 0 && jours <= DELAI_DEBIT_JOURS)) && (ignorerVeto || concordance !== "contradictoire"))
    .map(({ d, concordance, viaMois }) => ({ ...d, concordance, ...(viaMois ? { viaMois: true } : {}) }));
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
    if (meilleur.jours === null) {
      // Le mois suivant est une fenêtre valable — un achat de fin de mois est
      // débité le mois d'après. Annoncer « un autre mois » pour une quittance
      // du 29 juin débitée en juillet était faux, et envoyait chercher le
      // problème du mauvais côté : ce qui bloque alors, c'est le nom.
      const moisPiece = p.date!.slice(0, 7);
      if (d.mois === moisPiece || d.mois === moisSuivant(moisPiece)) {
        return { famille: "veto-nom", texte: ` Un débit du même montant existe (« ${d.fournisseur} », mois ${d.mois}), mais son libellé ne ressemble pas à « ${p.fournisseur} » : associez à la main, ou corrigez le fournisseur lu sur la pièce.` };
      }
      return { famille: "sans-date", texte: ` Un débit du même montant existe (« ${d.fournisseur} »), sans date d'opération et sur un autre mois (${d.mois || "mois inconnu"}) que la pièce. Vérifiez, puis associez à la main.` };
    }
    if (meilleur.jours < 0) return { famille: "hors-delai", texte: ` Un débit du même montant existe le ${quand} (« ${d.fournisseur} »), soit AVANT la date lue sur la pièce : la date de la pièce est peut-être mal lue.` };
    if (meilleur.jours > DELAI_DEBIT_JOURS) return { famille: "hors-delai", texte: ` Un débit du même montant existe le ${quand} (« ${d.fournisseur} »), mais ${meilleur.jours} jours après : hors du délai de ${DELAI_DEBIT_JOURS} jours.` };
    // Montant et date concordent : c'est donc le nom qui a opposé son veto.
    return { famille: "veto-nom", texte: ` Le débit de ${quand} (« ${d.fournisseur} ») a le bon montant et la bonne date, mais son libellé ne ressemble pas à « ${p.fournisseur} » : associez-le à la main, ou corrigez le fournisseur lu sur la pièce.` };
  }
  return { famille: "montant-proche", texte: ` Le débit le plus proche est ${(d.montant).toFixed(2)} € le ${quand} (« ${d.fournisseur} »), soit ${(meilleur.ecart / 100).toFixed(2)} € d'écart : vérifiez le montant lu sur la pièce.` };
}

/**
 * Pourquoi CE débit n'a pas trouvé sa pièce.
 *
 * Le rapport global part des pièces ; il ne répond pas à la question qu'on se
 * pose devant une ligne du tableau : « le justificatif est là, pourquoi ne
 * s'est-il pas rattaché ? » Ce diagnostic prend le problème par l'autre bout
 * — un débit, toutes les pièces — et dit pour chacune ce qui l'a écartée.
 */
export type DiagnosticPiece = {
  pieceId: string;
  nom?: string;
  /** Écart en euros entre le TTC de la pièce et le débit ; null si illisible. */
  ecartMontant: number | null;
  /** Jours entre la pièce et le débit ; null si l'une des deux dates manque. */
  jours: number | null;
  concordance: Concordance;
  verdict: string;
};

export function diagnostiquerDebit(
  d: DepenseCandidate & { rapprochementExclu?: boolean },
  pieces: PieceMatching[],
  dejaLie: boolean,
): { verdictGeneral: string; candidats: DiagnosticPiece[] } {
  if (dejaLie) return { verdictGeneral: "Ce débit porte déjà un justificatif.", candidats: [] };
  if (d.rapprochementExclu) return { verdictGeneral: "Ce débit est exclu du rapprochement.", candidats: [] };
  if (d.source !== "releve-bancaire") return { verdictGeneral: "Saisie manuelle : le rapprochement automatique ne traite que les débits issus d'un relevé.", candidats: [] };

  const debitCts = Math.round((d.montant || 0) * 100);
  const dateDebit = dateValide(d.dateOperation);

  const candidats = pieces
    .filter(p => !p.retire)
    .map((p): DiagnosticPiece => {
      const e = p.extraction;
      const base = { pieceId: p.id, nom: p.nom, ecartMontant: null as number | null, jours: null as number | null, concordance: "indetermine" as Concordance };
      if (!e) return { ...base, verdict: "Pièce pas encore lue : lancez « Relire » avant le rapprochement." };
      const ecartCts = e.ttc === null ? null : Math.round(e.ttc * 100) - debitCts;
      const jours = e.date && dateDebit ? Math.round((Date.parse(dateDebit) - Date.parse(e.date)) / 86400000) : null;
      const concordance = concordanceFournisseur(e.fournisseur, d.fournisseur);
      const infos = { ...base, ecartMontant: ecartCts === null ? null : Math.abs(ecartCts) / 100, jours, concordance };

      if (p.depenseId || p.paiementsAssocies?.length) return { ...infos, verdict: "Déjà rattachée à un autre paiement." };
      if (e.typeDocument !== "achat") return { ...infos, verdict: `Lue comme « ${e.typeDocument || "inconnu"} » : corrigez la lecture en « achat » si le club en est le client.` };
      if (p.decisionAssociation) return { ...infos, verdict: "Mise de côté pour un traitement manuel." };
      const alertes = alertesIdentification(e);
      if (alertes.length) return { ...infos, verdict: `Lecture à compléter : ${alertes[0]}` };
      if (ecartCts === null) return { ...infos, verdict: "Montant TTC illisible sur la pièce." };
      if (ecartCts !== 0) return { ...infos, verdict: `Montant différent : ${e.ttc!.toFixed(2)} € sur la pièce contre ${(d.montant || 0).toFixed(2)} € au relevé.` };
      if (jours === null) {
        if (!e.date) return { ...infos, verdict: "Date absente sur la pièce : corrigez la lecture." };
        // Le débit n'a pas de date : c'est son mois qui sert de fenêtre.
        const moisPiece = e.date.slice(0, 7);
        if (d.mois === moisPiece || d.mois === moisSuivant(moisPiece)) {
          return { ...infos, verdict: `Ce débit n'a pas de date, mais son mois (${d.mois}) correspond : cette pièce aurait dû être rattachée. Relancez le rapprochement sur ${d.mois}.` };
        }
        return { ...infos, verdict: `Ce débit n'a pas de date d'opération et son mois (${d.mois || "inconnu"}) ne correspond pas à la pièce (${moisPiece}) : associez à la main.` };
      }
      if (jours < 0) return { ...infos, verdict: `Pièce datée ${Math.abs(jours)} jour(s) APRÈS le débit : vérifiez la date lue.` };
      if (jours > DELAI_DEBIT_JOURS) return { ...infos, verdict: `Débit ${jours} jours après la pièce : au-delà du délai de ${DELAI_DEBIT_JOURS} jours.` };
      if (concordance === "contradictoire") return { ...infos, verdict: `Montant et date concordent, mais « ${e.fournisseur} » ne ressemble pas à « ${d.fournisseur} » : associez à la main.` };
      return { ...infos, verdict: "Tout concorde : cette pièce aurait dû être rattachée. Relancez le rapprochement sur le mois de ce débit." };
    })
    // Le plus ressemblant d'abord : montant, puis date, puis nom.
    .sort((a, b) => (a.ecartMontant ?? 1e9) - (b.ecartMontant ?? 1e9)
      || Math.abs(a.jours ?? 999) - Math.abs(b.jours ?? 999))
    .slice(0, 5);

  const verdictGeneral = candidats.some(c => /aurait dû être rattachée/.test(c.verdict))
    ? `Une pièce correspond exactement. Lancez le rapprochement automatique sur ${d.mois || dateDebit.slice(0, 7) || "ce mois"}.`
    : candidats.length
      ? "Aucune pièce ne correspond au centime et à la date près. Voici les plus proches :"
      : "Aucune pièce disponible à comparer.";
  return { verdictGeneral, candidats };
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
  "pas-un-achat": "lues « vente » ou « autre » : lecture à corriger si le club est le client",
  "paie": "bulletins de salaire (à classer depuis Masse salariale)",
  "hors-periode": "pièces d'un autre mois",
};

export function resumerRefus(ignorees: PieceIgnoree[]): { famille: FamilleRefus; libelle: string; nb: number }[] {
  const ordre = Object.keys(LIBELLE_FAMILLE) as FamilleRefus[];
  return ordre
    .map(famille => ({ famille, libelle: LIBELLE_FAMILLE[famille], nb: ignorees.filter(i => i.famille === famille).length }))
    .filter(f => f.nb > 0);
}

export type AssociationAuto = { pieceId: string; depenseId: string; concordance: Concordance; nom?: string; fournisseur?: string; montant: number; dateOperation?: string; viaMois?: boolean };
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
  | "paie"            // bulletin de salaire : circuit dédié, pas un problème
  | "pas-un-achat"    // facture de vente, document divers — souvent une lecture à corriger
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
  /** Correspondances de noms déjà validées à la main (cf. `cleAlias`). */
  alias?: ReadonlySet<string>,
): { associations: AssociationAuto[]; ignorees: PieceIgnoree[]; probables: AssociationAuto[] } {
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
  /**
   * Associations où TOUT concorde sauf le nom.
   *
   * « SUPER U STATION » sur la quittance, « Uep dac Resterdis » au relevé —
   * Resterdis exploite ce Super U. « SAS CONSTELLACOM » pour Printoclock.
   * Ces sociétés d'exploitation sont légion, et aucune règle textuelle ne
   * peut les rapprocher. Les poser seul serait imprudent ; les taire oblige
   * à tout reprendre à la main. On les présente donc pour confirmation en
   * lot : un coup d'œil suffit à valider ou écarter, et chaque confirmation
   * apprend la correspondance pour les mois suivants.
   */
  const probables: AssociationAuto[] = [];
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
    // Un bulletin de salaire ne se rapproche jamais ici : il se classe depuis
    // l'écran Masse salariale. Le compter parmi les refus faisait figurer
    // vingt-trois « problèmes » là où il n'y en avait aucun.
    if (e.typeDocument === "paie") { ignorer("Bulletin de salaire : se classe depuis l'écran Masse salariale.", "paie"); continue; }
    if (e.typeDocument !== "achat") { ignorer(`Document classé « ${e.typeDocument || "inconnu"} » : si le club en est le client (ticket de caisse, appel de cotisations), corrigez la lecture en « achat ».`, "pas-un-achat"); continue; }
    if (e.devise !== "EUR") { ignorer("Facture en devise étrangère : association manuelle.", "a-completer"); continue; }
    const alertes = alertesIdentification(e);
    if (alertes.length) { ignorer(`Lecture à compléter : ${alertes[0]}`, "a-completer"); continue; }

    // Deux exemplaires de la même facture : rien d'automatique tant que le
    // doublon n'est pas tranché.
    const doublon = actives.some(q => q.id !== p.id && q.extraction && !!e.numero
      && normaliser(q.extraction.fournisseur) === normaliser(e.fournisseur)
      && normaliser(q.extraction.numero) === normaliser(e.numero));
    if (doublon) { ignorer("Une autre pièce porte le même fournisseur et le même numéro : archivez l'exemplaire en trop, puis relancez.", "doublon"); continue; }

    const candidats = candidatsAutomatiques(e, depenses, alias);
    if (!candidats.length) {
      // Le nom est-il le SEUL obstacle ? On refait le calcul sans le veto :
      // si un unique débit reste, et qu'aucune autre pièce ne le vise, c'est
      // une association probable — à confirmer d'un coup d'œil, pas à poser
      // seul.
      const sansVeto = candidatsAutomatiques(e, depenses, alias, true);
      if (sansVeto.length === 1 && !depensesLiees.has(sansVeto[0].id) && !debitsPris.has(sansVeto[0].id)) {
        const d = sansVeto[0];
        const concurrente = actives.some(q => q.id !== p.id && !q.depenseId && q.extraction && !q.retire
          && candidatsAutomatiques(q.extraction, [d], alias, true).length > 0);
        if (!concurrente) {
          probables.push({ pieceId: p.id, depenseId: d.id, concordance: d.concordance, nom: p.nom, fournisseur: d.fournisseur, montant: d.montant, dateOperation: d.dateOperation, ...(d.viaMois ? { viaMois: true } : {}) });
          ignorer(`Montant et date concordent, mais « ${e.fournisseur} » ne ressemble pas à « ${d.fournisseur} ». À confirmer : beaucoup d'enseignes se débitent sous le nom de leur société d'exploitation.`, "veto-nom");
          continue;
        }
      }
      const { texte, famille } = indiceProximite(e, depenses);
      ignorer(`Aucun débit de ${e.ttc?.toFixed(2)} € entre le ${e.date} et les ${DELAI_DEBIT_JOURS} jours suivants.${texte || " Un achat de fin de mois est souvent débité le mois d'après : relancez sur le mois suivant."}`, famille);
      continue;
    }
    // Départage des débits SANS DATE par leur mois exact.
    //
    // Un abonnement mensuel — Google One à 4,99 €, Céléris à 108 € — produit
    // chaque mois une facture et un débit identiques. Comme la fenêtre d'un
    // débit sans date couvre le mois de la pièce ET le suivant, la facture de
    // juillet visait aussi le débit d'août : deux candidats, donc refus. Or
    // la facture de juillet appartient au débit de juillet ; le mois suivant
    // n'est là que pour les achats de fin de mois, quand aucun débit du mois
    // même ne convient. On ne départage QUE des candidats tous sans date : dès
    // qu'un débit daté est en lice, l'ambiguïté reste entière (deux lignes en
    // base pour un même paiement, c'est un doublon à trancher à la main).
    let retenus = candidats;
    if (candidats.length > 1 && candidats.every(c => c.viaMois)) {
      const moisExact = candidats.filter(c => c.mois === e.date!.slice(0, 7));
      if (moisExact.length === 1) retenus = moisExact;
    }
    if (retenus.length > 1) {
      ignorer(`${retenus.length} débits possibles pour ${e.ttc?.toFixed(2)} € : ${retenus.slice(0, 3).map(c => `${c.dateOperation || c.mois || "?"} « ${c.fournisseur} »`).join(", ")}. À choisir à la main.`, "ambigu");
      continue;
    }

    const d = retenus[0];
    if (depensesLiees.has(d.id) || debitsPris.has(d.id)) { ignorer("Le débit correspondant porte déjà un justificatif.", "ambigu"); continue; }

    // Un ancien import sans date pourrait être le même paiement : ne pas le masquer.
    if (depenses.some(autre => autre.id !== d.id && !dateValide(autre.dateOperation)
      && (!autre.mois || autre.mois === d.mois || autre.mois === d.dateOperation?.slice(0, 7))
      && proposerAssociations(e, [autre]).length)) {
      ignorer("Un débit de même montant, sans date d'opération, pourrait être le même paiement. Complétez les dates du relevé (Import bancaire → « Compléter les dates existantes »), puis relancez.", "sans-date"); continue;
    }

    // Une autre pièce non associée conviendrait aussi à ce débit : ambiguïté.
    const concurrente = actives.some(q => q.id !== p.id && !q.depenseId && q.extraction && !q.retire
      && candidatsAutomatiques(q.extraction, [d], alias).length > 0);
    if (concurrente) { ignorer("Une autre pièce pourrait justifier ce même débit : à choisir à la main.", "ambigu"); continue; }

    debitsPris.add(d.id);
    associations.push({ pieceId: p.id, depenseId: d.id, concordance: d.concordance, nom: p.nom, fournisseur: d.fournisseur, montant: d.montant, dateOperation: d.dateOperation, ...(d.viaMois ? { viaMois: true } : {}) });
  }
  return { associations, ignorees, probables };
}
