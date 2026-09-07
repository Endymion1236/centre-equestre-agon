import PDFDocument from "pdfkit";
import { DOCUMENTS_COMPTABLES, type DossierComptable, type Ecriture, type TypeDocumentComptable } from "./documents-comptables";

export type IdentiteComptable = { nom: string; siret?: string };
export const eurosComptables = (cents: number) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");
const dateFr = (date: string) => date.split("-").reverse().join("/");
type Row = { cells: string[]; total?: boolean };
type Table = { headers: string[]; widths: number[]; numeriques: number; rows: Iterable<Row> };

/** Les lignes sont parcourues une fois, sans construire un arbre React géant.
 * Le grand livre indexe les comptes une fois, puis conserve le solde progressif
 * sur toute la période, y compris lors des changements de page. */
function tableDocument(d: DossierComptable, type: TypeDocumentComptable): Table {
  const money = eurosComptables;
  if (type === "journal") return {
    headers: ["Date", "Jnl", "Pièce", "Compte", "Libellé", "Débit", "Crédit"], widths: [11, 7, 13, 13, 28, 14, 14], numeriques: 2,
    rows: (function* () {
      for (const l of d.lignes) yield { cells: [dateFr(l.date), l.journal, l.piece, l.compte, l.libelle, money(l.debit), money(l.credit)] };
      yield { cells: ["TOTAL", "", "", "", "", money(d.totalDebit), money(d.totalCredit)], total: true };
    })(),
  };
  if (type === "balance") return {
    headers: ["Compte", "Libellé", "Débit", "Crédit", "Solde débiteur", "Solde créditeur"], widths: [15, 29, 14, 14, 14, 14], numeriques: 4,
    rows: (function* () {
      let debiteurs = 0, crediteurs = 0;
      for (const c of d.balance) {
        debiteurs += Math.max(0, c.solde); crediteurs += Math.max(0, -c.solde);
        yield { cells: [c.compte, c.libelle, money(c.debit), money(c.credit), money(Math.max(0, c.solde)), money(Math.max(0, -c.solde))] };
      }
      yield { cells: ["TOTAL", "", money(d.totalDebit), money(d.totalCredit), money(debiteurs), money(crediteurs)], total: true };
    })(),
  };
  if (type === "centralisateur") return {
    headers: ["Mois", "Journal", "Lignes", "Débit", "Crédit"], widths: [20, 20, 16, 22, 22], numeriques: 3,
    rows: (function* () {
      for (const m of d.centralisateur) yield { cells: [m.mois, m.journal, String(m.lignes), money(m.debit), money(m.credit)] };
      yield { cells: ["TOTAL", "", String(d.lignes.length), money(d.totalDebit), money(d.totalCredit)], total: true };
    })(),
  };
  if (type === "grand-livre") return {
    headers: ["Date / compte", "Jnl", "Pièce", "Libellé", "Débit", "Crédit", "Solde D / C"], widths: [14, 6, 12, 27, 13, 13, 15], numeriques: 3,
    rows: (function* () {
      const comptes = new Map<string, Ecriture[]>();
      for (const l of d.lignes) {
        const groupe = comptes.get(l.compte); if (groupe) groupe.push(l); else comptes.set(l.compte, [l]);
      }
      for (const c of d.balance) {
        yield { cells: [c.compte, "", "", c.libelle, "", "", ""], total: true };
        let solde = 0;
        for (const l of comptes.get(c.compte) || []) {
          solde += l.debit - l.credit;
          yield { cells: [`${dateFr(l.date)}\n${l.compte}`, l.journal, l.piece, l.libelle, money(l.debit), money(l.credit), `${money(Math.abs(solde))} ${solde < 0 ? "C" : "D"}`] };
        }
        yield { cells: ["TOTAL", "", "", c.compte, money(c.debit), money(c.credit), `${money(Math.abs(c.solde))} ${c.solde < 0 ? "C" : "D"}`], total: true };
      }
    })(),
  };
  return {
    headers: ["Rubrique", "Compte", "Libellé", "Montant net"], widths: [15, 16, 49, 20], numeriques: 1,
    rows: (function* () {
      for (const c of d.actif) yield { cells: ["ACTIF", c.compte, c.libelle, money(c.montant)] };
      yield { cells: ["TOTAL ACTIF", "", "", money(d.totalActif)], total: true };
      for (const c of d.passif) yield { cells: ["PASSIF", c.compte, c.libelle, money(c.montant)] };
      yield { cells: ["TOTAL PASSIF", "", "", money(d.totalPassif)], total: true };
      yield { cells: ["RÉSULTAT", "", "Produits nets des comptes 7", money(d.produits)] };
      yield { cells: ["", "", "Charges nettes des comptes 6", money(d.charges)] };
      yield { cells: ["", "", "Bénéfice (+) / perte (-) de la période", money(d.resultat)], total: true };
    })(),
  };
}

/** Pages ajoutées au fil de l'eau, sans garder les pages terminées en mémoire.
 * Aucun accès réseau/base. Chaque PDF du ZIP reçoit le même dossier validé. */
export async function genererDocumentComptable(d: DossierComptable, type: TypeDocumentComptable, club: IdentiteComptable, empreinte: string): Promise<Buffer> {
  const table = tableDocument(d, type), titre = DOCUMENTS_COMPTABLES[type];
  const paysage = type === "journal" || type === "grand-livre";
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
  let page = 0, y = 0, largeur = 0;
  const nettoyer = (s: string) => s.normalize("NFC").replace(/[\u00a0\u202f]/g, " ").replace(/[\u2010-\u2014\u2212]/g, "-").replace(/\t/g, " ");
  const pied = () => {
    // Rester au-dessus de la marge basse : PDFKit créerait sinon une page vide.
    doc.font("Helvetica").fontSize(7).fillColor("#536176").text(`Préparatoire | Jeu d’écritures ${empreinte.slice(0, 16)} | Page ${page}`, 30, doc.page.height - 40, { width: largeur, lineBreak: false });
  };
  const nouvellePage = (colonnes: boolean) => {
    if (page) pied();
    doc.addPage({ size: "A4", layout: colonnes && paysage ? "landscape" : "portrait", margin: 30 }); page++;
    largeur = doc.page.width - 60;
    doc.font("Helvetica-Bold").fontSize(17).fillColor("#172a43").text(titre, 30, 24, { width: largeur });
    doc.font("Helvetica").fontSize(8).text(nettoyer(`${club.nom}${club.siret ? ` | SIRET ${club.siret}` : ""}`), 30, 48, { width: largeur });
    doc.text(`Du ${dateFr(d.periode.debut)} au ${dateFr(d.periode.fin)} | Montants en EUR | ${d.lignes.length} lignes`, 30, 63, { width: largeur });
    doc.fillColor("#8b4500").text("PRÉPARATOIRE - Périmètre et contrôles en fin de document", 30, 78, { width: largeur });
    y = 100;
    if (colonnes) {
      doc.rect(30, y, largeur, 24).fill("#172a43");
      let x = 30;
      for (let i = 0; i < table.headers.length; i++) {
        const w = largeur * table.widths[i] / 100;
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff").text(table.headers[i], x + 4, y + 5, { width: w - 8, align: i >= table.headers.length - table.numeriques ? "right" : "left", lineGap: 1 });
        x += w;
      }
      y += 24;
    }
  };
  try {
    nouvellePage(true);
    let rang = 0;
    for (const row of table.rows) {
      const cells = row.cells.map(nettoyer), font = row.total ? "Helvetica-Bold" : "Helvetica";
      doc.font(font).fontSize(8);
      const hauteurs = cells.map((texte, i) => doc.heightOfString(texte || " ", { width: largeur * table.widths[i] / 100 - 8, lineGap: 1 }));
      const hauteur = Math.ceil(Math.max(...hauteurs)) + 8;
      if (y + hauteur > doc.page.height - 42) nouvellePage(true);
      if (row.total) doc.rect(30, y, largeur, hauteur).fill("#edf2f8");
      let x = 30;
      for (let i = 0; i < cells.length; i++) {
        const w = largeur * table.widths[i] / 100;
        doc.font(font).fontSize(8).fillColor("#172a43").text(cells[i], x + 4, y + 4, { width: w - 8, lineGap: 1, align: i >= cells.length - table.numeriques ? "right" : "left" });
        x += w;
      }
      y += hauteur;
      doc.strokeColor("#d7dfe8").lineWidth(0.4).moveTo(30, y).lineTo(doc.page.width - 30, y).stroke();
      // Libère régulièrement la boucle pour que le flux soit consommé.
      if (++rang % 1000 === 0) await new Promise<void>(resolve => setImmediate(resolve));
    }
    nouvellePage(false);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#172a43").text("Périmètre et contrôles", 30, y, { width: largeur }); y += 26;
    const paragraphes = [
      `Source(s) : ${d.sources.join(" ; ")}`,
      `Total débit = total crédit : ${eurosComptables(d.totalDebit)} EUR. Ce total représente des mouvements comptables, pas le chiffre d’affaires.`,
      ...d.avertissements.map((a, i) => `${i + 1}. ${a}`),
      ...(type === "bilan" ? ["Situation nette des comptes 1 à 5 et résultat des comptes 6 et 7 sur la période sélectionnée. Présentation détaillée par compte, sans comparatif N-1, annexe, liasse fiscale ni signature. Pour une situation de fin d’exercice, sélectionner la date d’ouverture et intégrer les à-nouveaux et la clôture."] : []),
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
