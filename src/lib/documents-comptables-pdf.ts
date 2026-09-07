import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { DOCUMENTS_COMPTABLES, type DossierComptable, type TypeDocumentComptable } from "./documents-comptables";

const h = React.createElement;
const s = StyleSheet.create({
  page: { paddingTop: 118, paddingBottom: 42, paddingHorizontal: 30, fontFamily: "Helvetica", fontSize: 8, color: "#172a43" },
  header: { position: "absolute", top: 24, left: 30, right: 30 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 17, marginBottom: 5 },
  small: { fontSize: 8, marginBottom: 4 },
  badge: { fontSize: 8, color: "#8b4500", marginTop: 4 },
  tableHeader: { position: "absolute", top: 96, left: 30, right: 30, flexDirection: "row", backgroundColor: "#172a43", color: "#ffffff", paddingVertical: 6 },
  row: { flexDirection: "row", paddingVertical: 5, borderBottom: "0.4 solid #d7dfe8" },
  cell: { paddingHorizontal: 4, fontSize: 8, lineHeight: 1.2 },
  total: { backgroundColor: "#edf2f8", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 20, left: 30, right: 30, fontSize: 7, color: "#536176" },
  warning: { marginBottom: 10, fontSize: 10, lineHeight: 1.5 },
});
export type IdentiteComptable = { nom: string; siret?: string };
export const eurosComptables = (cents: number) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");
const dateFr = (date: string) => date.split("-").reverse().join("/");
type Row = { cells: string[]; total?: boolean };
function lignesDocument(d: DossierComptable, type: TypeDocumentComptable): { headers: string[]; widths: number[]; rows: Row[] } {
  const money = eurosComptables;
  if (type === "journal") return {
    headers: ["Date", "Jnl", "Pièce", "Compte", "Libellé", "Débit", "Crédit"], widths: [11, 7, 13, 13, 28, 14, 14],
    rows: [...d.lignes.map(l => ({ cells: [dateFr(l.date), l.journal, l.piece, l.compte, l.libelle, money(l.debit), money(l.credit)] })),
      { cells: ["TOTAL", "", "", "", "", money(d.totalDebit), money(d.totalCredit)], total: true }],
  };
  if (type === "balance") return {
    headers: ["Compte", "Libellé", "Débit", "Crédit", "Solde débiteur", "Solde créditeur"], widths: [15, 29, 14, 14, 14, 14],
    rows: [...d.balance.map(c => ({ cells: [c.compte, c.libelle, money(c.debit), money(c.credit), money(Math.max(0, c.solde)), money(Math.max(0, -c.solde))] })),
      { cells: ["TOTAL", "", money(d.totalDebit), money(d.totalCredit), money(d.balance.reduce((s, c) => s + Math.max(0, c.solde), 0)), money(d.balance.reduce((s, c) => s + Math.max(0, -c.solde), 0))], total: true }],
  };
  if (type === "centralisateur") return {
    headers: ["Mois", "Journal", "Lignes", "Débit", "Crédit"], widths: [20, 20, 16, 22, 22],
    rows: [...d.centralisateur.map(m => ({ cells: [m.mois, m.journal, String(m.lignes), money(m.debit), money(m.credit)] })),
      { cells: ["TOTAL", "", String(d.lignes.length), money(d.totalDebit), money(d.totalCredit)], total: true }],
  };
  if (type === "grand-livre") {
    const rows: Row[] = [];
    for (const c of d.balance) {
      rows.push({ cells: [c.compte, "", "", c.libelle, "", "", ""], total: true });
      let solde = 0;
      for (const l of d.lignes.filter(l => l.compte === c.compte)) {
        solde += l.debit - l.credit;
        rows.push({ cells: [`${dateFr(l.date)}\n${l.compte}`, l.journal, l.piece, l.libelle, money(l.debit), money(l.credit), `${money(Math.abs(solde))} ${solde < 0 ? "C" : "D"}`] });
      }
      rows.push({ cells: ["TOTAL", "", "", c.compte, money(c.debit), money(c.credit), `${money(Math.abs(c.solde))} ${c.solde < 0 ? "C" : "D"}`], total: true });
    }
    return { headers: ["Date / compte", "Jnl", "Pièce", "Libellé", "Débit", "Crédit", "Solde D / C"], widths: [14, 6, 12, 27, 13, 13, 15], rows };
  }
  return {
    headers: ["Rubrique", "Compte", "Libellé", "Montant net"], widths: [15, 16, 49, 20],
    rows: [
      ...d.actif.map(c => ({ cells: ["ACTIF", c.compte, c.libelle, money(c.montant)] })),
      { cells: ["TOTAL ACTIF", "", "", money(d.totalActif)], total: true },
      ...d.passif.map(c => ({ cells: ["PASSIF", c.compte, c.libelle, money(c.montant)] })),
      { cells: ["TOTAL PASSIF", "", "", money(d.totalPassif)], total: true },
      { cells: ["RÉSULTAT", "", "Produits nets des comptes 7", money(d.produits)] },
      { cells: ["", "", "Charges nettes des comptes 6", money(d.charges)] },
      { cells: ["", "", "Bénéfice (+) / perte (-) de la période", money(d.resultat)], total: true },
    ],
  };
}

/** Rendu sans accès réseau ni lecture de base : le ZIP partage exactement le même dossier. */
export async function genererDocumentComptable(d: DossierComptable, type: TypeDocumentComptable, club: IdentiteComptable, empreinte: string) {
  const { headers, widths, rows } = lignesDocument(d, type);
  const paysage = type === "journal" || type === "grand-livre";
  const titre = DOCUMENTS_COMPTABLES[type];
  const header = h(View, { style: s.header, fixed: true },
    h(Text, { style: s.title }, titre),
    h(Text, { style: s.small }, `${club.nom}${club.siret ? ` | SIRET ${club.siret}` : ""}`),
    h(Text, { style: s.small }, `Du ${dateFr(d.periode.debut)} au ${dateFr(d.periode.fin)} | Montants en EUR | ${d.lignes.length} lignes`),
    h(Text, { style: s.badge }, "PRÉPARATOIRE - Périmètre et contrôles détaillés en dernière page"));
  const footer = h(Text, { style: s.footer, fixed: true, render: ({ pageNumber, totalPages }) =>
    `Préparatoire | Jeu d’écritures ${empreinte.slice(0, 16)} | ${pageNumber} / ${totalPages}` });
  const doc = h(Document, { title: `${titre} - préparatoire`, author: club.nom },
    h(Page, { size: "A4", orientation: paysage ? "landscape" : "portrait", style: s.page }, header,
      h(View, { style: s.tableHeader, fixed: true }, ...headers.map((c, i) => h(Text, { key: i, style: [s.cell, { width: `${widths[i]}%` }] }, c))),
      ...rows.map((r, index) => h(View, { key: index, wrap: false, style: r.total ? [s.row, s.total] : s.row },
        ...r.cells.map((c, i) => h(Text, { key: i, style: [s.cell, { width: `${widths[i]}%`, textAlign: i >= widths.length - (type === "bilan" ? 1 : type === "grand-livre" ? 3 : type === "balance" ? 4 : 2) ? "right" : "left" }] }, c)))), footer),
    h(Page, { size: "A4", style: { ...s.page, paddingTop: 104 } }, header,
      h(Text, { style: { ...s.title, fontSize: 13, marginBottom: 12 } }, "Périmètre et contrôles"),
      h(Text, { style: s.warning }, `Source(s) : ${d.sources.join(" ; ")}`),
      h(Text, { style: s.warning }, `Total débit = total crédit : ${eurosComptables(d.totalDebit)} EUR. Ce total représente des mouvements comptables, pas le chiffre d’affaires.`),
      ...d.avertissements.map((a, i) => h(Text, { key: i, style: s.warning }, `${i + 1}. ${a}`)),
      type === "bilan" ? h(Text, { style: s.warning }, "Situation nette des comptes 1 à 5 et résultat des comptes 6 et 7 sur la période sélectionnée. Présentation détaillée par compte, sans comparatif N-1, annexe, liasse fiscale ni signature. Pour une situation de fin d’exercice, sélectionner la date d’ouverture et intégrer les à-nouveaux et la clôture.") : null,
      h(Text, { style: s.small }, `Empreinte du jeu d’écritures : ${empreinte}`), footer));
  return renderToBuffer(doc);
}
