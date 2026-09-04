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
}): ColisComptable {
  const { mois, maintenant = new Date() } = params;
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

  const csv = "text/csv; charset=utf-8";
  const bom = "\uFEFF";
  const pieces: PieceJointe[] = [
    { filename: `factures_${mois}.csv`, contenu: bom + construireExportFactures(factures), contentType: csv },
    { filename: `ventes_${mois}.csv`, contenu: bom + construireExportComptable("ventes", factures, params.payments), contentType: csv },
    { filename: `encaissements_${mois}.csv`, contenu: bom + construireExportEncaissements(encaissements), contentType: csv },
    { filename: `depenses_${mois}.csv`, contenu: bom + construireExportDepenses(depenses), contentType: csv },
    { filename: `FEC_${mois.replace("-", "")}.txt`, contenu: construireFecVentes(factures, maintenant), contentType: "text/tab-separated-values; charset=utf-8" },
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
}) {
  const { mois, resume, pieces, nomCentre, message } = params;
  const eur = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const nom = nomMoisLong(mois);
  return `<div style="font-family:sans-serif;max-width:600px;color:#1f2937;">
    <h2 style="color:#1e3a5f;">Écritures comptables — ${nom}</h2>
    <p>Bonjour,</p>
    <p>Voici les écritures du ${nomCentre} pour ${nom}, en pièces jointes.</p>
    ${message ? `<p style="white-space:pre-wrap;border-left:3px solid #cbd5e1;padding-left:10px;color:#374151;">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : ""}
    <table style="border-collapse:collapse;font-size:14px;margin:12px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Factures émises</td><td style="padding:4px 0;"><b>${resume.nbFactures}</b> — ${eur(resume.totalTTC)} TTC (${eur(resume.totalHT)} HT)</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Encaissements au journal</td><td style="padding:4px 0;"><b>${resume.nbEncaissements}</b> — ${eur(resume.totalEncaisse)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Dépenses saisies</td><td style="padding:4px 0;"><b>${resume.nbDepenses}</b> — ${eur(resume.totalDepenses)}</td></tr>
    </table>
    <p style="font-size:13px;color:#374151;"><b>Pièces jointes :</b><br/>${pieces.map((p) => `• ${p}`).join("<br/>")}</p>
    <p style="font-size:12px;color:#6b7280;">Le journal des encaissements est celui du logiciel de caisse (écritures inaltérables, chaînées). Les CSV sont en point-virgule, encodés UTF-8. Le FEC couvre les ventes du mois.</p>
    <p>Bien cordialement,<br/>${nomCentre}</p>
  </div>`;
}
