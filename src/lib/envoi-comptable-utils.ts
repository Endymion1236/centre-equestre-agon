/**
 * src/lib/envoi-comptable-utils.ts — le colis mensuel pour la comptable,
 * sans réseau ni base : on lui donne les documents du mois, il rend les
 * pièces jointes (hors PDF, rendu à part) et le résumé du message.
 *
 * Nicolas veut, au début de chaque mois, envoyer à sa comptable toutes les
 * écritures du mois qui vient de se boucler. Le colis réunit ce qu'elle
 * saisissait à la main depuis les exports téléchargés un par un :
 *   - factures_AAAA-MM.csv      : une ligne par facture numérotée ;
 *   - ventes_AAAA-MM.csv        : le détail par article avec HT / TVA / TTC ;
 *   - encaissements_AAAA-MM.csv : le journal NF525 du mois ;
 *   - depenses_AAAA-MM.csv      : les dépenses saisies par poste ;
 *   - FEC_AAAAMM.txt            : le fichier des écritures de ventes ;
 *   - synthese-compta-AAAA-MM.pdf (ajouté par le serveur).
 */

import {
  construireExportComptable,
  construireExportDepenses,
  construireExportEncaissements,
  construireExportFactures,
} from "@/app/admin/comptabilite/exports-csv-utils";
import { construireFecVentes } from "@/app/admin/comptabilite/fec-utils";
import { bilanTvaMois, completudeJustificatifs, construireExportJustificatifs, construireExportTva, type LigneMois } from "@/lib/bilan-justificatifs";

import { bilanVentilationAchats, construireExportVentilationAchats } from "@/lib/ventilation-achats";

export interface PieceJointe {
  filename: string;
  contenu: string;
  contentType: string;
}

export interface ResumeColis {
  nbFactures: number;
  totalTTC: number;
  totalHT: number;
  nbEncaissements: number;
  totalEncaisse: number;
  nbDepenses: number;
  totalDepenses: number;
  /** Présents quand les lignes du tableau des opérations ont été fournies. */
  completude?: { total: number; justifies: number; sansPiece: number; montantSansPiece: number; perdues?: number; montantPerdues?: number; pourcent: number };
  tvaDeductibleJustifiee?: number;
  tvaAVerifier?: { nb: number; ttc: number };
  ventilationAchats?: { total: number; aVentiler: number; montantAVentiler: number };
  /**
   * Mois tenu dans Céleris (juillet–août 2026) : les ventes ne sont pas dans
   * l'application, elles sont dans les écritures importées. Montants en euros.
   */
  celeris?: { nombre: number; ht: number; tva: number; ttc: number };
}

/** Une écriture importée de Céleris, montants en centimes (lib/import-comptable-celeris). */
export interface EcritureCelerisColis {
  journal: string; compte: string; piece: string; date: string;
  debit: number; credit: number; libelle: string; libelleCompte: string;
}

/** CSV des écritures Céleris du mois, montants en euros, même séparateur que les autres pièces. */
export function construireExportCeleris(lignes: EcritureCelerisColis[]): string {
  const champ = (v: unknown) => { const t = v == null ? "" : String(v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const eur = (c: number) => (c / 100).toFixed(2);
  const lignesCsv = lignes.map((l) => [l.journal, l.compte, l.piece, l.date, eur(l.debit), eur(l.credit), l.libelle, l.libelleCompte].map(champ).join(";"));
  return ["Journal;Compte;Pièce;Date;Débit;Crédit;Libellé écriture;Libellé compte", ...lignesCsv].join("\n");
}

export interface ColisComptable {
  mois: string;
  factures: any[];
  encaissements: any[];
  depenses: any[];
  pieces: PieceJointe[];
  resume: ResumeColis;
}

/** Secondes Firestore → "AAAA-MM" en heure de Paris. */
export function moisParisDeSecondes(seconds: number | undefined | null): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 7);
}

/** Les factures du mois : datées dans le mois, ni annulées ni en attente. */
export function facturesDuMois<T extends { date?: { seconds?: number } | null; status?: string }>(payments: T[], mois: string) {
  const exclus = new Set(["cancelled", "pending", "draft"]);
  return payments.filter((p) => !(p.status && exclus.has(p.status)) && moisParisDeSecondes(p.date?.seconds) === mois);
}

/** Les écritures du journal datées dans le mois. */
export function encaissementsDuMois<T extends { date?: { seconds?: number } | null }>(encaissements: T[], mois: string) {
  return encaissements.filter((e) => moisParisDeSecondes(e.date?.seconds) === mois);
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function construireColisComptable(params: {
  mois: string;
  payments: any[];
  encaissements: any[];
  depenses: any[];
  maintenant?: Date;
  /** Lignes du tableau des opérations du mois (avec pièces) : ajoute le CSV des justificatifs et celui de la TVA. */
  lignesJustificatifs?: LigneMois[];
  /** Écritures importées de Céleris pour ce mois, s'il a été tenu dans l'ancien logiciel. */
  celeris?: { lignes: EcritureCelerisColis[]; totaux: { ht: number; tva: number; ttc: number } } | null;
}): ColisComptable {
  const { mois, maintenant = new Date() } = params;
  const lignesJustificatifs = params.lignesJustificatifs?.filter(l => (l.mois || l.dateOperation?.slice(0, 7)) === mois);
  const factures = facturesDuMois(params.payments, mois)
    .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));
  const encaissements = encaissementsDuMois(params.encaissements, mois)
    .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));
  const depenses = params.depenses.filter((d) => d.mois === mois);

  const resume: ResumeColis = {
    nbFactures: factures.length,
    totalTTC: arrondi(factures.reduce((s, f) => s + (f.totalTTC || 0), 0)),
    totalHT: arrondi(factures.reduce((s, f) => s + (f.items || []).reduce((ss: number, i: any) => ss + (i.priceHT || 0), 0), 0)),
    nbEncaissements: encaissements.length,
    totalEncaisse: arrondi(encaissements.reduce((s, e) => s + (e.montant || 0), 0)),
    nbDepenses: depenses.length,
    totalDepenses: arrondi(depenses.reduce((s, d) => s + (d.montant || 0), 0)),
  };
  if (lignesJustificatifs) {
    const tva = bilanTvaMois(lignesJustificatifs);
    resume.completude = completudeJustificatifs(lignesJustificatifs);
    resume.tvaDeductibleJustifiee = tva.deductibleJustifiee;
    resume.tvaAVerifier = tva.aVerifier;
    resume.ventilationAchats = bilanVentilationAchats(lignesJustificatifs);
  }
  const celeris = params.celeris && params.celeris.lignes.length ? params.celeris : null;
  if (celeris) {
    resume.celeris = { nombre: celeris.lignes.length, ht: arrondi(celeris.totaux.ht / 100), tva: arrondi(celeris.totaux.tva / 100), ttc: arrondi(celeris.totaux.ttc / 100) };
  }

  const csv = "text/csv; charset=utf-8";
  const bom = "\uFEFF";
  const pieces: PieceJointe[] = [
    { filename: `factures_${mois}.csv`, contenu: bom + construireExportFactures(factures), contentType: csv },
    { filename: `ventes_${mois}.csv`, contenu: bom + construireExportComptable("ventes", factures, params.payments), contentType: csv },
    { filename: `encaissements_${mois}.csv`, contenu: bom + construireExportEncaissements(encaissements), contentType: csv },
    { filename: `depenses_${mois}.csv`, contenu: bom + construireExportDepenses(depenses), contentType: csv },
    { filename: `FEC_${mois.replace("-", "")}.txt`, contenu: construireFecVentes(factures, maintenant), contentType: "text/tab-separated-values; charset=utf-8" },
    ...(lignesJustificatifs ? [
      { filename: `justificatifs_${mois}.csv`, contenu: bom + construireExportJustificatifs(lignesJustificatifs), contentType: csv },
      { filename: `tva_${mois}.csv`, contenu: bom + construireExportTva(lignesJustificatifs), contentType: csv },
      { filename: `ventilation_achats_${mois}.csv`, contenu: bom + construireExportVentilationAchats(lignesJustificatifs), contentType: csv },
    ] : []),
    ...(celeris ? [{ filename: `ecritures-celeris_${mois}.csv`, contenu: bom + construireExportCeleris(celeris.lignes), contentType: csv }] : []),
  ];

  return { mois, factures, encaissements, depenses, pieces, resume };
}

export function nomMoisLong(mois: string) {
  const [a, m] = mois.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Le corps de l'email, en HTML simple. */
export function corpsEmailComptable(params: {
  mois: string;
  resume: ResumeColis;
  pieces: string[];
  nomCentre: string;
  message?: string;
  /** Archive des pièces : combien jointes, combien laissées de côté (taille). */
  archive?: { nb: number; nonJointes: number };
}) {
  const { mois, resume, pieces, nomCentre, message, archive } = params;
  const eur = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const nom = nomMoisLong(mois);
  return `<div style="font-family:sans-serif;max-width:600px;color:#1f2937;">
    <h2 style="color:#1e3a5f;">Écritures comptables — ${nom}</h2>
    <p>Bonjour,</p>
    <p>Voici les écritures du ${nomCentre} pour ${nom}, en pièces jointes.</p>
    ${resume.celeris ? `<p style="font-size:13px;color:#374151;">Ce mois a été tenu dans Céleris pour les ventes : les factures et encaissements ci-dessous sont donc à zéro dans le nouvel outil, et les ventes figurent dans <b>ecritures-celeris_${mois}.csv</b>, reprises telles quelles de l'export Céleris.</p>` : ""}
    ${message ? `<p style="white-space:pre-wrap;border-left:3px solid #cbd5e1;padding-left:10px;color:#374151;">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : ""}
    <table style="border-collapse:collapse;font-size:14px;margin:12px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Factures émises</td><td style="padding:4px 0;"><b>${resume.nbFactures}</b> — ${eur(resume.totalTTC)} TTC (${eur(resume.totalHT)} HT)</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Encaissements au journal</td><td style="padding:4px 0;"><b>${resume.nbEncaissements}</b> — ${eur(resume.totalEncaisse)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Dépenses saisies</td><td style="padding:4px 0;"><b>${resume.nbDepenses}</b> — ${eur(resume.totalDepenses)}</td></tr>
      ${resume.celeris ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Ventes tenues dans Céleris</td><td style="padding:4px 0;"><b>${resume.celeris.nombre}</b> écritures importées — ${eur(resume.celeris.ttc)} TTC, dont ${eur(resume.celeris.tva)} de TVA collectée</td></tr>` : ""}
      ${resume.completude ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Justificatifs</td><td style="padding:4px 0;"><b>${resume.completude.justifies}/${resume.completude.total}</b> dépenses justifiées${resume.completude.sansPiece ? ` — <span style="color:#b45309;">${eur(resume.completude.montantSansPiece)} sans pièce sur ${resume.completude.sansPiece} ligne(s)</span>` : ""}${resume.completude.perdues ? ` — ${resume.completude.perdues} pièce(s) déclarée(s) perdue(s), relevé conservé (${eur(resume.completude.montantPerdues || 0)}, motif dans le CSV justificatifs, sans TVA déduite)` : ""}</td></tr>` : ""}
      ${resume.tvaDeductibleJustifiee != null ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">TVA documentée — paiements uniques</td><td style="padding:4px 0;"><b>${eur(resume.tvaDeductibleJustifiee)}</b>${resume.tvaAVerifier?.nb ? ` — ${resume.tvaAVerifier.nb} ligne(s) à vérifier (${eur(resume.tvaAVerifier.ttc)} TTC)` : ""}</td></tr>` : ""}
      ${resume.ventilationAchats ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Ventilation des achats</td><td>${resume.ventilationAchats.total} opérations, <b>${resume.ventilationAchats.aVentiler} à ventiler</b> (${eur(resume.ventilationAchats.montantAVentiler)}). Comptes proposés à valider.</td></tr>` : ""}
    </table>
    ${resume.tvaDeductibleJustifiee != null ? "<p>Les paiements fractionnés et les factures partagées restent à vérifier, hors total TVA automatique. La TVA totale de la facture ne doit pas être cumulée entre paiements.</p>" : ""}
    ${archive ? `<p style="font-size:13px;color:#374151;">L'archive des pièces contient <b>${archive.nb}</b> justificatif(s), nommés « date - fournisseur - montant ».${archive.nonJointes ? ` <span style="color:#b45309;">${archive.nonJointes} pièce(s) n'ont pas pu être jointes (taille) : elles restent consultables dans l'application.</span>` : ""}</p>` : ""}
    <p style="font-size:13px;color:#374151;"><b>Pièces jointes :</b><br/>${pieces.map((p) => `• ${p}`).join("<br/>")}</p>
    <p style="font-size:12px;color:#6b7280;">Le journal des encaissements est celui du logiciel de caisse (écritures inaltérables, chaînées). Les CSV sont en point-virgule, encodés UTF-8. Le FEC couvre les ventes du mois.</p>
    <p>Bien cordialement,<br/>${nomCentre}</p>
  </div>`;
}
