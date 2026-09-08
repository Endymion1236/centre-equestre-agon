/** Raccordement en lecture seule des dépenses réglées aux états de test.
 * Les opérations ambiguës restent à traiter ; jamais de date/banque inventée,
 * ni de TVA récupérée sur la seule proposition de l'extraction. */
import { createHash } from "node:crypto";
import type { LigneMois } from "./bilan-justificatifs";
import { motifControleTva } from "./bilan-justificatifs";
import { ventilerDepense, compteFournisseur, COMPTES } from "./plan-comptable-achats";
import { banqueDepense, COMPTES_BANQUE_DEPENSE } from "./banque-depense";
import { ErreurDocumentsComptables, verifierPeriode, type Ecriture, type Periode } from "./documents-comptables";

export type CorrectionAchat = { date?: string; compte?: string; banque?: string; tva?: string; exclure?: boolean; motif?: string };
export type CorrectionsAchats = Record<string, CorrectionAchat>;
export type ControleAchat = { id: string; mois: string; fournisseur: string; montant: number; date: string; compte: string; banque: string; tva: number; facture: string; compteFournisseur: string;
  etat: "inclus" | "a-completer" | "exclu" | "hors-periode"; motifs: string[]; notes: string[] };
export function verifierCorrectionsAchats(value: unknown): CorrectionsAchats {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 5000) throw new ErreurDocumentsComptables("Corrections d’achats invalides.");
  for (const [id, c] of Object.entries(value)) {
    if (!/^[\w-]{1,150}$/.test(id) || !c || typeof c !== "object" || Array.isArray(c)) throw new ErreurDocumentsComptables("Identifiant d’achat invalide.");
    for (const [key, v] of Object.entries(c)) {
      if (key === "exclure") { if (typeof v !== "boolean") throw new ErreurDocumentsComptables("Exclusion invalide."); }
      else if (!["date", "compte", "banque", "tva", "motif"].includes(key) || typeof v !== "string" || v.length > (key === "motif" ? 300 : 30)) throw new ErreurDocumentsComptables("Correction d’achat invalide.");
    }
  }
  return value as CorrectionsAchats;
}
const dateValide = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const cents = (n: number) => Math.round(n * 100);
export function preparerJournalAchats(lignes: LigneMois[], periode: Periode, corrections: CorrectionsAchats = {}, importees: Ecriture[] = []) {
  verifierPeriode(periode); verifierCorrectionsAchats(corrections);
  if (lignes.length > 36000) throw new ErreurDocumentsComptables("Trop de dépenses sur la période : aucun export partiel produit.");
  // Le complément est destiné aux exports de ventes. Un journal déjà complet
  // doit être utilisé seul : ne pas tenter une déduplication comptable au jugé.
  if (importees.some(l => /^[26]|^40[1458]/.test(l.compte))) throw new ErreurDocumentsComptables("Le journal importé contient déjà des charges, immobilisations ou fournisseurs. Utilisez cette source seule pour éviter d’ajouter deux fois les achats.");
  const pieces = new Map<string, number>(), identifiants = new Set<string>();
  const creditsBanque = new Set(importees.filter(l => /^5/.test(l.compte) && l.credit > 0).map(l => `${l.date}|${l.credit}`));
  for (const l of lignes) {
    if (!/^[\w-]{1,150}$/.test(l.id) || identifiants.has(l.id)) throw new ErreurDocumentsComptables("Dépense absente ou chargée deux fois.");
    identifiants.add(l.id);
    if (l.piece?.id && !l.rapprochementExclu) pieces.set(l.piece.id, (pieces.get(l.piece.id) || 0) + 1);
  }
  for (const id of Object.keys(corrections)) if (!identifiants.has(id)) throw new ErreurDocumentsComptables("Une correction concerne une dépense absente de la période. Changez de brouillon ou revenez à sa période.");
  const controles: ControleAchat[] = [], ecritures: Ecriture[] = [];
  for (const l of [...lignes].sort((a, b) => a.id.localeCompare(b.id))) {
    const c = corrections[l.id] || {}, proposition = ventilerDepense(l);
    const compte = c.compte ?? proposition.compte, banque = c.banque ?? banqueDepense(l).compte;
    const date = c.date ?? l.dateOperation ?? "", fournisseur = compteFournisseur(l.fournisseur);
    const r: ControleAchat = { id: l.id, mois: l.mois || "", fournisseur: l.fournisseur || "Sans libellé", montant: cents(l.montant), date, compte, banque,
      tva: 0, facture: l.piece?.extraction?.numero || "", compteFournisseur: fournisseur.compte || "40100000", etat: "a-completer", motifs: [], notes: [] };
    controles.push(r);
    if (l.rapprochementExclu || l.depensePersonnelle || l.suivie === false || l.avanceFfe || ["Personnel — hors charges", "Salaires", "Cotisations sociales", "Virements internes", "Emprunts", "Compte FFE (avance licences & engagements)"].includes(l.poste || "") || /^4|^5/.test(proposition.compte)) {
      r.etat = "exclu"; r.motifs.push(l.rapprochementExclu ? "Opération déjà exclue du rapprochement." : "Hors journal d’achats : mouvement personnel, paie, emprunt, avance ou transfert à traiter dans son journal."); continue;
    }
    if (c.exclure) {
      if (!c.motif?.trim()) { r.motifs.push("Précisez le motif de l’exclusion."); continue; }
      r.etat = "exclu"; r.motifs.push(`Exclusion pour ce dossier : ${c.motif.trim()}`); continue;
    }
    if (dateValide(date) && (date < periode.debut || date > periode.fin)) { r.etat = "hors-periode"; r.motifs.push("Date de règlement hors période."); continue; }
    if (!dateValide(date)) r.motifs.push("Date du règlement à renseigner.");
    else if (l.mois && date.slice(0, 7) !== l.mois) r.motifs.push("La date doit appartenir au mois de la dépense ; corrigez la source si le mois est erroné.");
    if (!Number.isSafeInteger(r.montant) || r.montant <= 0 || r.montant > 1_000_000_000) r.motifs.push("Montant positif à vérifier dans Dépenses et justificatifs.");
    if (!/^(2[0-7]|6[0-9])[A-Z0-9]{0,13}$/.test(compte)) r.motifs.push("Compte d’achat ou d’immobilisation à préciser (classes 2 ou 6).");
    if ((l.immobilisation || l.poste === "Immobilisation — à amortir") && !/^2/.test(compte)) r.motifs.push("Une immobilisation doit rester en classe 2.");
    if (!COMPTES_BANQUE_DEPENSE.some(b => b.compte === banque)) r.motifs.push("Compte bancaire du règlement à identifier.");
    if (l.doublonProbable) r.motifs.push("Doublon probable : le résoudre dans Dépenses et justificatifs.");
    if (creditsBanque.has(`${date}|${r.montant}`)) r.motifs.push("Un crédit de trésorerie du même montant existe déjà à cette date dans le journal importé : vérifier le doublon.");
    if (l.source !== "releve-bancaire") r.motifs.push("Cette ligne n’atteste pas un règlement bancaire. Fournir l’écriture de facture dans un journal complet.");
    if (l.piece?.modeRattachement === "echeance" || l.piece?.paiementsAssocies?.length || l.piece?.associationEcart || l.piece?.id && (pieces.get(l.piece.id) || 0) > 1)
      r.motifs.push("Facture fractionnée, partagée ou avec escompte : préparer son écriture complète pour éviter les doubles comptes.");
    const extraction = l.piece?.extraction;
    if (extraction?.typeDocument && extraction.typeDocument !== "achat") r.motifs.push("La pièce associée n’est pas identifiée comme une facture d’achat.");
    if (extraction?.devise === "EUR" && typeof extraction.ttc === "number" && cents(extraction.ttc) !== r.montant) r.motifs.push("Le montant réglé diffère du TTC de la facture : vérifier échéance, escompte ou erreur d’association.");
    const dateFacture = extraction?.date || "";
    if (dateFacture && (!dateValide(dateFacture) || dateFacture < periode.debut || dateFacture > periode.fin)) r.motifs.push("Facture hors exercice ou date invalide : contrôler le rattachement et les à-nouveaux fournisseurs.");
    if (dateFacture && dateFacture > date) r.motifs.push("Règlement antérieur à la facture : contrôler l’acompte fournisseur.");
    if (l.piece?.retire) r.notes.push("Justificatif archivé : pièce à rétablir ou remplacer.");
    const texteTva = (c.tva || "0").replace(/[ \u00a0\u202f]/g, "");
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(texteTva)) r.motifs.push("TVA confirmée invalide.");
    else r.tva = Math.round(Number(texteTva.replace(",", ".")) * 100);
    if (r.tva) {
      const conforme = extraction?.typeDocument === "achat" && extraction.devise === "EUR" && !l.piece?.retire && !motifControleTva(l) &&
        typeof extraction.ht === "number" && typeof extraction.tva === "number" && typeof extraction.ttc === "number" &&
        [extraction.ht, extraction.tva, extraction.ttc].every(Number.isFinite) && cents(extraction.ht) + cents(extraction.tva) === cents(extraction.ttc) &&
        cents(extraction.ttc) === r.montant && r.tva <= cents(extraction.tva) && r.tva < r.montant && !["sans-tva", "non-recuperee"].includes(l.statutTVA || "");
      if (!conforme) r.motifs.push("TVA non justifiable : facture d’achat EUR unique et cohérente, sans écart ni fractionnement, requise.");
    } else r.notes.push("Montant TTC comptabilisé provisoirement ; aucune TVA déduite. À revoir avec la pièce et les règles de déductibilité.");
    if (!dateFacture) r.notes.push("Date comptable provisoire = date du débit ; rattachement à la date de facture à contrôler.");
    if (!l.piece) r.notes.push(l.piecePerdue ? `Pièce déclarée perdue, relevé conservé : ${l.piecePerdue.motif}` : "Justificatif manquant.");
    if (!fournisseur.compte && !/^627/.test(compte)) r.notes.push("Compte fournisseur collectif 40100000 ; détail conservé dans le libellé.");
    if (r.motifs.length) continue;
    r.etat = "inclus";
    const ref = `DEP-${createHash("sha256").update(l.id).digest("hex").slice(0, 24).toUpperCase()}`;
    const libelle = `${r.fournisseur}${r.facture ? ` / ${r.facture}` : ""} / ${ref}`.slice(0, 500);
    const ligne = (journal: string, piece: string, date: string, compte: string, debit: number, credit: number, libelleCompte: string): Ecriture => ({ journal, piece, date, compte, debit, credit, libelle, libelleCompte });
    const fraisBancaires = /^627/.test(compte);
    const dateAchat = dateFacture || date, contrepartie = fraisBancaires ? banque : r.compteFournisseur;
    ecritures.push(ligne("ACHAPP", ref, dateAchat, compte, r.montant - r.tva, 0, COMPTES[compte] || "Achat — compte confirmé"));
    if (r.tva) ecritures.push(ligne("ACHAPP", ref, dateAchat, /^2/.test(compte) ? "44562000" : "44566000", r.tva, 0, "TVA déductible confirmée — préparation"));
    ecritures.push(ligne("ACHAPP", ref, dateAchat, contrepartie, 0, r.montant, fraisBancaires ? COMPTES[banque] : fournisseur.libelle || r.fournisseur));
    if (!fraisBancaires) {
      ecritures.push(ligne("BQAPP", ref, date, r.compteFournisseur, r.montant, 0, fournisseur.libelle || r.fournisseur));
      ecritures.push(ligne("BQAPP", ref, date, banque, 0, r.montant, COMPTES[banque]));
    }
  }
  const inclus = controles.filter(c => c.etat === "inclus");
  return { ecritures, controles, inclus: inclus.length, bloques: controles.filter(c => c.etat === "a-completer").length,
    exclus: controles.filter(c => c.etat === "exclu").length, montant: inclus.reduce((s, c) => s + c.montant, 0), tva: inclus.reduce((s, c) => s + c.tva, 0),
    avertissements: ["Achats de l’application : seules les dépenses réglées, retenues et suffisamment renseignées sont ajoutées. Les factures non payées, la paie, les emprunts, les avances et les écritures de clôture ne sont pas reconstitués.",
      "Les comptes sont des propositions à contrôler. Sans confirmation explicite de TVA justifiée, le TTC est repris provisoirement sans déduction de TVA."] };
}
export type JournalAchatsPreparatoire = ReturnType<typeof preparerJournalAchats>;
