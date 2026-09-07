import PDFDocument from "pdfkit";
import { DOCUMENTS_COMPTABLES, type DossierComptable, type Ecriture, type TypeDocumentComptable } from "./documents-comptables";

import { groupesBalance, groupesMensuels } from "./regroupements-comptables";

export type IdentiteComptable = { nom: string; siret?: string };
export const eurosComptables = (cents: number) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");
const dateFr = (date: string) => date.split("-").reverse().join("/");
type Row = { cells: string[]; total?: boolean; section?: string; nouvellePage?: boolean; mouvement?: { debit: number; credit: number } };
type Table = { headers: string[]; widths: number[]; numeriques: number; rows: Iterable<Row> };

/** Les lignes sont parcourues une fois, sans construire un arbre React géant.
 * Le grand livre indexe les comptes une fois, puis conserve le solde progressif
 * sur toute la période, y compris lors des changements de page. */
function tableDocument(d: DossierComptable, type: TypeDocumentComptable): Table {
  const money = eurosComptables;
  const partiel = d.perimetrePartiel;
  const valeur = (n: number) => n ? money(n) : "";
  const enteteSection = (titre: string, nouvellePage = false): Row => ({ cells: [], section: titre, nouvellePage });
  if (type === "journal") return {
    headers: ["Date", "Jnl", "Pièce", "Compte", "Libellé", "Débit", "Crédit"], widths: [11, 6, 12, 14, 29, 14, 14], numeriques: 2,
    rows: (function* () {
      const journaux = new Map<string, Ecriture[]>();
      for (const l of d.lignes) { const groupe = journaux.get(l.journal); if (groupe) groupe.push(l); else journaux.set(l.journal, [l]); }
      let premier = true;
      for (const [journal, lignes] of [...journaux].sort(([a], [b]) => a.localeCompare(b))) {
        yield enteteSection(`Journal ${journal}`, !premier); premier = false;
        let debit = 0, credit = 0;
        for (const l of lignes) {
          debit += l.debit; credit += l.credit;
          yield { cells: [dateFr(l.date), l.journal, l.piece, l.compte, l.libelle, valeur(l.debit), valeur(l.credit)], mouvement: { debit: l.debit, credit: l.credit } };
        }
        yield { cells: ["TOTAL", journal, "", "", "Total du journal", money(debit), money(credit)], total: true };
      }
      yield { cells: ["TOTAL", "", "", "", "Tous journaux confondus", money(d.totalDebit), money(d.totalCredit)], total: true };
    })(),
  };
  if (type === "balance") return {
    headers: ["Compte", "Libellé", "Cumul débit", "Cumul crédit", "Solde débiteur", "Solde créditeur"], widths: [15, 29, 14, 14, 14, 14], numeriques: 4,
    rows: (function* () {
      let debiteurs = 0, crediteurs = 0;
      for (const classe of groupesBalance(d.balance)) {
        for (const groupe of classe.groupes) {
          for (const c of groupe.comptes) {
            debiteurs += Math.max(0, c.solde); crediteurs += Math.max(0, -c.solde);
            yield { cells: [c.compte, c.libelle, valeur(c.debit), valeur(c.credit), valeur(Math.max(0, c.solde)), valeur(Math.max(0, -c.solde))] };
          }
          const t = groupe.total;
          yield { cells: [groupe.prefixe, `Sous-total ${groupe.prefixe}`, valeur(t.debit), valeur(t.credit), valeur(Math.max(0, t.solde)), valeur(Math.max(0, -t.solde))], total: true };
        }
        const t = classe.total;
        yield { cells: [classe.classe, `TOTAL CLASSE ${classe.classe}`, valeur(t.debit), valeur(t.credit), valeur(Math.max(0, t.solde)), valeur(Math.max(0, -t.solde))], total: true };
      }
      yield { cells: ["TOTAL", "Total général", money(d.totalDebit), money(d.totalCredit), money(debiteurs), money(crediteurs)], total: true };
      yield { cells: [partiel ? "SOLDE PARTIEL" : "RÉSULTAT", "Produits - charges", "", "", "", money(d.resultat)], total: true };
    })(),
  };
  if (type === "centralisateur") return {
    headers: ["Mois", "Journal", "Lignes", "Débit", "Crédit"], widths: [20, 20, 16, 22, 22], numeriques: 3,
    rows: (function* () {
      for (const groupe of groupesMensuels(d.centralisateur)) {
        const mois = new Date(`${groupe.mois}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
        yield enteteSection(mois.charAt(0).toUpperCase() + mois.slice(1));
        for (const m of groupe.journaux) yield { cells: [m.mois, m.journal, String(m.lignes), valeur(m.debit), valeur(m.credit)] };
        const t = groupe.total;
        yield { cells: ["CUMUL", "du mois", String(t.lignes), money(t.debit), money(t.credit)], total: true };
      }
      yield { cells: ["TOTAL", "Tous les mois", String(d.lignes.length), money(d.totalDebit), money(d.totalCredit)], total: true };
    })(),
  };
  if (type === "grand-livre") return {
    headers: ["Date", "Jnl", "Pièce", "Libellé", "Débit", "Crédit", "Solde D / C"], widths: [11, 6, 12, 29, 13, 13, 16], numeriques: 3,
    rows: (function* () {
      const comptes = new Map<string, Ecriture[]>();
      for (const l of d.lignes) {
        const groupe = comptes.get(l.compte); if (groupe) groupe.push(l); else comptes.set(l.compte, [l]);
      }
      for (const c of d.balance) {
        yield enteteSection(`${c.compte} - ${c.libelle}`);
        let solde = 0;
        for (const l of comptes.get(c.compte) || []) {
          solde += l.debit - l.credit;
          yield { cells: [dateFr(l.date), l.journal, l.piece, l.libelle, valeur(l.debit), valeur(l.credit), `${money(Math.abs(solde))} ${solde < 0 ? "C" : "D"}`], mouvement: { debit: l.debit, credit: l.credit } };
        }
        yield { cells: ["TOTAL", "", "", c.compte, money(c.debit), money(c.credit), `${money(Math.abs(c.solde))} ${c.solde < 0 ? "C" : "D"}`], total: true };
      }
    })(),
  };
  return {
    headers: ["Rubrique", "Compte", "Libellé", "Montant net"], widths: [16, 17, 47, 20], numeriques: 1,
    rows: (function* () {
      yield enteteSection("ACTIF - détail des valeurs nettes");
      for (const c of d.actif) yield { cells: ["ACTIF", c.compte, c.libelle, money(c.montant)] };
      yield { cells: ["TOTAL ACTIF", "", "", money(d.totalActif)], total: true };
      yield enteteSection("PASSIF - capitaux et dettes", true);
      for (const c of d.passif) yield { cells: ["PASSIF", c.compte, c.libelle, money(c.montant)] };
      yield { cells: ["TOTAL PASSIF", "", "", money(d.totalPassif)], total: true };
      yield enteteSection("COMPTE DE RÉSULTAT - détail par compte", true);
      yield enteteSection("Produits");
      for (const c of d.balance.filter(c => c.compte.startsWith("7"))) yield { cells: ["PRODUITS", c.compte, c.libelle, money(-c.solde)] };
      yield { cells: ["TOTAL", "PRODUITS", "", money(d.produits)], total: true };
      yield enteteSection("Charges");
      for (const c of d.balance.filter(c => c.compte.startsWith("6"))) yield { cells: ["CHARGES", c.compte, c.libelle, money(c.solde)] };
      yield { cells: ["TOTAL", "CHARGES", "", money(d.charges)], total: true };
      yield { cells: ["RÉSULTAT", "", "Bénéfice (+) / perte (-) de la période", money(d.resultat)], total: true };
    })(),
  };
}

/** Pages ajoutées au fil de l'eau, sans garder les pages terminées en mémoire.
 * Aucun accès réseau/base. Chaque PDF du ZIP reçoit le même dossier validé. */
export async function genererDocumentComptable(d: DossierComptable, type: TypeDocumentComptable, club: IdentiteComptable, empreinte: string): Promise<Buffer> {
  const table = tableDocument(d, type), titre = DOCUMENTS_COMPTABLES[type];
  const paysage = false;
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: false, compress: true, margin: 30,
    info: { Title: `${titre} - préparatoire`, Author: club.nom, Subject: `${d.lignes.length} lignes | ${empreinte}` } });
  const chunks: Buffer[] = [];
  const termine = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  // Une erreur synchrone de contenu doit détruire le flux sans rejet non géré.
  void termine.catch(() => {});
  let page = 0, y = 0, largeur = 0, sectionActive = "";
  const taille = type === "journal" || type === "grand-livre" ? 7 : 8;
  let cumulDebit = 0, cumulCredit = 0;
  const nettoyer = (s: string) => s.normalize("NFC").replace(/[\u00a0\u202f]/g, " ").replace(/[\u2010-\u2014\u2212]/g, "-").replace(/\t/g, " ");
  const pied = () => {
    // Rester au-dessus de la marge basse : PDFKit créerait sinon une page vide.
    doc.font("Helvetica").fontSize(7).fillColor("#536176").text(`Préparatoire | Jeu d’écritures ${empreinte.slice(0, 16)} | Page ${page}`, 30, doc.page.height - 40, { width: largeur, lineBreak: false });
  };
  const nouvellePage = (colonnes: boolean) => {
    if (page) pied();
    doc.addPage({ size: "A4", layout: colonnes && paysage ? "landscape" : "portrait", margin: 30 }); page++;
    largeur = doc.page.width - 60;
    doc.strokeColor("#536176").lineWidth(0.7).rect(30, 22, largeur, 46).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#172a43").text(nettoyer(club.nom), 36, 29, { width: largeur * 0.6 - 12 });
    doc.font("Helvetica").fontSize(8).text(`Période : ${dateFr(d.periode.debut)} au ${dateFr(d.periode.fin)}`, 30 + largeur * 0.6, 29, { width: largeur * 0.4 - 6, align: "right" });
    doc.fontSize(7).text(`${club.siret ? `SIRET ${club.siret} | ` : ""}Montants en EUR | ${d.lignes.length} écritures`, 36, 52, { width: largeur - 12 });
    doc.font("Times-Bold").fontSize(16).text(titre.toUpperCase(), 30, 77, { width: largeur, align: "center" });
    doc.font("Helvetica").fontSize(7).fillColor("#8b4500").text(!d.balance.some(c => c.compte.startsWith("6")) ? "SOURCE PARTIELLE - AUCUN COMPTE DE CHARGE - LE SOLDE N’EST PAS LE BÉNÉFICE" : d.perimetrePartiel ? "SOURCE PARTIELLE - ACHATS RÉGLÉS AJOUTÉS - SOLDE PROVISOIRE" : "PRÉPARATOIRE - Périmètre et contrôles en fin de document", 30, 97, { width: largeur, align: "center" });
    y = 114;
    if (colonnes) {
      doc.rect(30, y, largeur, 26).fill("#e5f0fc");
      let x = 30;
      for (let i = 0; i < table.headers.length; i++) {
        const w = largeur * table.widths[i] / 100;
        doc.font("Helvetica-Bold").fontSize(taille).fillColor("#172a43").text(table.headers[i], x + 4, y + 5, { width: w - 8, align: i >= table.headers.length - table.numeriques ? "right" : "left", lineGap: 1 });
        x += w;
      }
      y += 26;
      if (sectionActive) {
        dessinerSection(`${sectionActive} (suite)`);
        if (cumulDebit || cumulCredit) dessinerReport();
      }
    }
  };
  const dessinerSection = (texte: string) => {
    doc.font("Helvetica-Bold").fontSize(taille + 1);
    const hauteur = Math.max(21, Math.ceil(doc.heightOfString(nettoyer(texte), { width: largeur - 10, lineGap: 1 })) + 8);
    doc.rect(30, y, largeur, hauteur).fill("#e2e4e7");
    doc.fillColor("#172a43").text(nettoyer(texte), 35, y + 4, { width: largeur - 10, lineGap: 1 });
    y += hauteur;
  };
  const dessinerReport = () => {
    const solde = cumulDebit - cumulCredit;
    const cells = type === "grand-livre"
      ? ["REPORT", "", "", "Cumul antérieur", eurosComptables(cumulDebit), eurosComptables(cumulCredit), `${eurosComptables(Math.abs(solde))} ${solde < 0 ? "C" : "D"}`]
      : ["REPORT", "", "", "", "Cumul antérieur", eurosComptables(cumulDebit), eurosComptables(cumulCredit)];
    doc.font("Helvetica-Bold").fontSize(taille);
    const hauteur = Math.ceil(Math.max(...cells.map((t, i) => doc.heightOfString(t || " ", { width: largeur * table.widths[i] / 100 - 8, lineGap: 1 })))) + 8;
    doc.rect(30, y, largeur, hauteur).fill("#e5f0fc");
    let x = 30;
    for (let i = 0; i < cells.length; i++) {
      const w = largeur * table.widths[i] / 100;
      doc.fillColor("#172a43").text(cells[i], x + 4, y + 4, { width: w - 8, lineGap: 1, align: i >= cells.length - table.numeriques ? "right" : "left" }); x += w;
    }
    y += hauteur;
  };
  try {
    nouvellePage(true);
    let rang = 0;
    for (const row of table.rows) {
      if (row.section) {
        sectionActive = ""; cumulDebit = 0; cumulCredit = 0;
        if (row.nouvellePage || y > doc.page.height - 130) nouvellePage(true);
        dessinerSection(row.section); sectionActive = row.section;
        continue;
      }
      const cells = row.cells.map(nettoyer), font = row.total ? "Helvetica-Bold" : "Helvetica";
      doc.font(font).fontSize(taille);
      const hauteurs = cells.map((texte, i) => doc.heightOfString(texte || " ", { width: largeur * table.widths[i] / 100 - 8, lineGap: 1 }));
      const hauteur = Math.ceil(Math.max(...hauteurs)) + 8;
      if (y + hauteur > doc.page.height - 42) nouvellePage(true);
      if (row.total) doc.rect(30, y, largeur, hauteur).fill("#cfe5fa");
      let x = 30;
      for (let i = 0; i < cells.length; i++) {
        const w = largeur * table.widths[i] / 100;
        doc.font(font).fontSize(taille).fillColor("#172a43").text(cells[i], x + 4, y + 4, { width: w - 8, lineGap: 1, align: i >= cells.length - table.numeriques ? "right" : "left" });
        x += w;
      }
      y += hauteur;
      if (row.mouvement) { cumulDebit += row.mouvement.debit; cumulCredit += row.mouvement.credit; }
      doc.strokeColor("#d7dfe8").lineWidth(0.4).moveTo(30, y).lineTo(doc.page.width - 30, y).stroke();
      // Libère régulièrement la boucle pour que le flux soit consommé.
      if (++rang % 1000 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    }
    sectionActive = "";
    nouvellePage(false);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#172a43").text("Périmètre et contrôles", 30, y, { width: largeur }); y += 26;
    const paragraphes = [
      `Source(s) : ${d.sources.join(" ; ")}`,
      `Total débit = total crédit : ${eurosComptables(d.totalDebit)} EUR. Ce total représente des mouvements comptables, pas le chiffre d’affaires.`,
      ...d.avertissements.map((a, i) => `${i + 1}. ${a}`),
      ...(type === "bilan" ? ["Situation nette des comptes 1 à 5 et résultat des comptes 6 et 7 sur la période sélectionnée. Actif et passif en valeurs nettes, puis détail des produits et charges. Sans ventilation brute/amortissements, comparatif N-1, annexe, liasse fiscale ni signature. Pour une situation de fin d’exercice, sélectionner la date d’ouverture et intégrer les à-nouveaux et la clôture."] : []),
      `Empreinte du jeu d’écritures : ${empreinte}`,
    ];
    for (const paragraphe of paragraphes) {
      const texte = nettoyer(paragraphe);
      doc.font("Helvetica").fontSize(9);
      const hauteur = doc.heightOfString(texte, { width: largeur, lineGap: 3 });
      if (y + hauteur > doc.page.height - 42) nouvellePage(false);
      doc.font("Helvetica").fontSize(9).fillColor("#172a43").text(texte, 30, y, { width: largeur, lineGap: 3 });
      y += hauteur + 12;
    }
    pied(); doc.end();
    return await termine;
  } catch (e) { doc.destroy(e instanceof Error ? e : new Error("Génération PDF interrompue")); throw e; }
}
