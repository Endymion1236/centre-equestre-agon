import PDFDocument from "pdfkit";
import { GROUPES_RESULTAT, type EtatAnnuel } from "./etats-annuels";
import type { PreparationFiscale } from "./preparation-fiscale";
import type { ControleAchat } from "./journal-achats-preparatoire";
import type { IdentiteComptable } from "./documents-comptables-pdf";

export type DossierAnnuel = { n: EtatAnnuel; precedent: EtatAnnuel | null; sourcePrecedente: string | null; fiscal: PreparationFiscale; avertissements: string[]; achats?: ControleAchat[] };
const money = (n: number | null) => n === null ? "Non fourni" : (n / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
const fr = (s: string) => s.split("-").reverse().join("/");
const clean = (s: string) => s.normalize("NFC").replace(/[\u00a0\u202f]/g, " ").replace(/[\u2010-\u2014\u2212]/g, "-").replace(/[\u2190-\u21ff]/g, "");
type Ligne = { cells: string[]; total?: boolean };

/** PDF de travail autonome : comparatif, actif brut/amort/net, détail des achats,
 * tableaux fiscaux renseignés ou explicitement incomplets. Aucune attestation. */
export async function genererEtatsAnnuelsPdf(d: DossierAnnuel, club: IdentiteComptable, empreinte: string, sources: string[], fiscalSeulement = false): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: false, compress: true, margin: 32,
    info: { Title: fiscalSeulement ? "Tableaux fiscaux préparatoires" : "Comptes annuels préparatoires", Author: club.nom, Subject: empreinte } });
  const sansCharges = !d.n.balance.some(c => c.compte.startsWith("6"));
  const partiel = Boolean(d.achats) || sansCharges;
  const chunks: Buffer[] = [];
  const termine = new Promise<Buffer>((resolve, reject) => { doc.on("data", (c: Buffer) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  void termine.catch(() => {});
  let page = 0, y = 0;
  const largeur = 531.28;
  const footer = () => doc.font("Helvetica").fontSize(7).fillColor("#536176").text(`PREPARATOIRE | ${empreinte.slice(0, 16)} | Page ${page}`, 32, doc.page.height - 46, { width: largeur, lineBreak: false });
  function nouvellePage(titre: string, suite = false) {
    if (page) footer(); doc.addPage({ size: "A4", margin: 32 }); page++;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#172a43").text(clean(club.nom), 32, 27, { width: largeur });
    doc.font("Helvetica").fontSize(8).text(`${club.siret ? `SIRET ${club.siret} | ` : ""}N : ${fr(d.n.periode.debut)} au ${fr(d.n.periode.fin)}`, 32, 46, { width: largeur });
    doc.text(d.precedent ? `N-1 : ${fr(d.precedent.periode.debut)} au ${fr(d.precedent.periode.fin)}` : "N-1 : source non fournie", 32, 59, { width: largeur });
    doc.font("Times-Bold").fontSize(16).text(clean(`${titre}${suite ? " (suite)" : ""}`), 32, 82, { width: largeur });
    y = doc.y + 9;
    doc.font("Helvetica").fontSize(7).fillColor("#8b4500").text(sansCharges ? "SOURCE PARTIELLE - AUCUNE CHARGE - LE SOLDE N’EST PAS LE BENEFICE" : partiel ? "SOURCE PARTIELLE - ACHATS REGLES AJOUTES - SOLDE PROVISOIRE" : "MODE TEST - DOCUMENT PREPARATOIRE - MONTANTS EN EUR", 32, y, { width: largeur }); y += 19;
  }
  function paragraphe(texte: string, taille = 9) {
    doc.font("Helvetica").fontSize(taille);
    const t = clean(texte), h = doc.heightOfString(t, { width: largeur, lineGap: 3 });
    if (y + h > doc.page.height - 55) nouvellePage("Périmètre et contrôles", true);
    doc.fillColor("#172a43").text(t, 32, y, { width: largeur, lineGap: 3 }); y += h + 10;
  }
  async function table(titre: string, entetes: string[], widths: number[], rows: Iterable<Ligne>, aide?: string, alignements?: ("left" | "right")[]) {
    nouvellePage(titre); if (aide) paragraphe(aide, 8);
    const draw = (cells: string[], total: boolean, head = false) => {
      const texts = cells.map(clean); doc.font(total || head ? "Helvetica-Bold" : "Helvetica").fontSize(head ? 7 : 8);
      const h = Math.max(22, ...texts.map((t, i) => Math.ceil(doc.heightOfString(t || " ", { width: largeur * widths[i] / 100 - 10, lineGap: 2 })) + 10));
      if (!head && y + h > doc.page.height - 49) { nouvellePage(titre, true); draw(entetes, true, true); }
      if (head || total) doc.rect(32, y, largeur, h).fill(head ? "#e5f0fc" : "#dbeafa");
      let x = 32;
      texts.forEach((t, i) => { const w = largeur * widths[i] / 100; doc.font(total || head ? "Helvetica-Bold" : "Helvetica").fontSize(head ? 7 : 8).fillColor("#172a43").text(t, x + 5, y + 5, { width: w - 10, lineGap: 2, align: alignements?.[i] || (i ? "right" : "left") }); x += w; });
      y += h; doc.strokeColor("#d7dfe8").lineWidth(0.4).moveTo(32, y).lineTo(32 + largeur, y).stroke();
    };
    draw(entetes, true, true);
    let i = 0; for (const r of rows) { draw(r.cells, Boolean(r.total)); if (++i % 200 === 0) await new Promise<void>(resolve => setImmediate(resolve)); }
  }
  try {
    nouvellePage(fiscalSeulement ? "Tableaux fiscaux agricoles" : "Comptes annuels — dossier de test");
    paragraphe(`Source N : ${sources.join(" ; ")}.`);
    paragraphe(`Source N-1 : ${d.sourcePrecedente || "Non fournie : aucune valeur de comparaison n’est inventée."}`);
    paragraphe(`Bilan : brut ${money(d.n.brut)} ; amortissements et dépréciations ${money(d.n.amortissements)} ; net ${money(d.n.totalActif)}. ${partiel ? "Solde partiel des écritures" : "Résultat comptable"} : ${money(d.n.resultat)}.`);
    paragraphe(`Achats et variations de stocks (comptes 60) : ${money(d.n.achats)} ; ${d.n.comptesAchats} compte(s) avec mouvements. Détail dans le compte de résultat, puis dans le grand livre. Les services extérieurs figurent dans les comptes 61 et 62.`);
    paragraphe(`Liasse BA réel normal, millésime ${d.fiscal.millesime} : 15 tableaux de préparation. ${d.fiscal.manquants} case(s) à compléter. Ces tableaux ne constituent pas des formulaires CERFA ni une télédéclaration. Les renvois et régimes particuliers doivent être revus par la comptable.`);
    paragraphe("Le présent document ne comporte aucune attestation, signature de cabinet ou validation fiscale. Les dates, écritures d’ouverture et de clôture, affectations et ajustements doivent être contrôlés pour cet exercice.");
    if (!fiscalSeulement) {
      const precedentActif = (code: string) => d.precedent ? d.precedent.actif.find(r => r.code === code)!.net : null;
      await table("Bilan actif — brut, amortissements et net", ["Rubrique", "Brut N", "Amort. / dépréc. N", "Net N", "Net N-1"], [40, 15, 15, 15, 15], [
        ...d.n.actif.map(r => ({ cells: [`${r.code} - ${r.libelle}`, money(r.brut), money(r.amortissements), money(r.net), money(precedentActif(r.code))] })),
        { cells: ["TOTAL ACTIF", money(d.n.brut), money(d.n.amortissements), money(d.n.totalActif), money(d.precedent?.totalActif ?? null)], total: true },
      ], "Brut moins amortissements et dépréciations = net. Les comptes correcteurs 28, 29, 39, 49 et 59 sont rattachés à leur poste d’actif.");
      await table("Bilan passif — comparatif", ["Rubrique", "N", "N-1", "Écart N - N-1"], [49, 17, 17, 17], [
        ...d.n.passif.map(r => { const p = d.precedent?.passif.find(p => p.code === r.code)?.net ?? null; return { cells: [`${r.code} - ${r.libelle}`, money(r.net), money(p), money(p === null ? null : r.net - p)] }; }),
        { cells: ["TOTAL PASSIF", money(d.n.totalPassif), money(d.precedent?.totalPassif ?? null), money(d.precedent ? d.n.totalPassif - d.precedent.totalPassif : null)], total: true },
      ]);
      const resultRows: Ligne[] = [];
      for (const [prefix, label] of GROUPES_RESULTAT) {
        const sign = prefix.startsWith("7") ? -1 : 1;
        const montant = (etat: EtatAnnuel | null) => etat ? etat.balance.filter(c => c.compte.startsWith(prefix)).reduce((s, c) => s + sign * c.solde, 0) : null;
        const n = montant(d.n)!, p = montant(d.precedent);
        resultRows.push({ cells: [`${prefix} - ${label}`, money(n), money(p), money(p === null ? null : n - p)], total: prefix === "60" });
      }
      for (const [label, n, p] of [["TOTAL PRODUITS", d.n.produits, d.precedent?.produits ?? null], ["TOTAL CHARGES", d.n.charges, d.precedent?.charges ?? null], [partiel ? "SOLDE PARTIEL DES ÉCRITURES" : "RÉSULTAT COMPTABLE", d.n.resultat, d.precedent?.resultat ?? null]] as const) resultRows.push({ cells: [label, money(n), money(p), money(p === null ? null : n - p)], total: true });
      await table("Compte de résultat — achats, charges et produits", ["Poste", "N", "N-1", "Écart N - N-1"], [49, 17, 17, 17], resultRows);
      // Union N et N-1 : les comptes disparus restent visibles dans le comparatif.
      for (const [prefix, titre] of [["60", "Achats — détail des comptes 60"], ["6", "Autres charges — détail"], ["7", "Produits — détail"]]) {
        const accept = (c: string) => c.startsWith(prefix) && !(prefix === "6" && c.startsWith("60"));
        const comptes = [...new Set([...d.n.balance, ...(d.precedent?.balance || [])].filter(c => accept(c.compte)).map(c => c.compte))].sort();
        const sign = prefix === "7" ? -1 : 1;
        await table(titre, ["Compte et libellé", "N", "N-1", "Écart N - N-1"], [49, 17, 17, 17], comptes.map(compte => {
          const n = d.n.balance.find(c => c.compte === compte), p = d.precedent?.balance.find(c => c.compte === compte);
          const nv = sign * (n?.solde || 0), pv = d.precedent ? sign * (p?.solde || 0) : null;
          return { cells: [`${compte} - ${n?.libelle || p?.libelle || ""}`, money(nv), money(pv), money(pv === null ? null : nv - pv)] };
        }), prefix === "60" && !d.n.comptesAchats ? "Aucun achat dans la source N. Une source de ventes seule ne reprend pas les dépenses saisies dans l’application." : undefined);
      }
      await table("Rattachement des comptes au bilan", ["Compte et libellé", "Rubrique", "Nature", "Solde D - C"], [55, 12, 16, 17], d.n.ventilation.map(v => ({ cells: [`${v.compte} - ${v.libelle}`, v.code, v.amortissement ? "Correcteur actif" : "Solde", money(v.solde)] })), "Ventilation proposée ou corrigée manuellement, à vérifier pour le plan de comptes de l’exploitation.");
    }
    if (d.achats) await table("Raccordement des achats — détail et exclusions", ["Opération", "TTC / TVA", "État et contrôles"], [40, 17, 43], d.achats.map(a => ({ cells: [
      `${a.date || a.mois} - ${a.fournisseur}\nCompte ${a.compte || "à préciser"} / banque ${a.banque || "à préciser"}\nRéférence : ${a.id}`,
      `${money(a.montant)} / ${money(a.tva)}`,
      `${a.etat}\n${[...a.motifs, ...a.notes].join(" ")}`,
    ] })), "Chaque dépense reste traçable. Les exclusions et opérations hors période ne participent pas aux totaux.", ["left", "right", "left"]);
    for (const t of d.fiscal.tableaux) {
      const forme = (l: typeof t.lignes[number]) => l.cellules.map(c => c.libelle).join("|");
      const uniforme = t.lignes.length > 1 && t.lignes[0].cellules.length <= 5 && t.lignes.every(l => forme(l) === forme(t.lignes[0]));
      if (uniforme) {
        const nb = t.lignes[0].cellules.length, first = nb === 1 ? 65 : nb === 5 ? 30 : 40;
        const widths = [first, ...Array.from({ length: nb }, () => (100 - first) / nb)];
        await table(`${t.id} — ${t.titre}`, ["Rubrique", ...t.lignes[0].cellules.map(c => c.libelle)], widths,
          t.lignes.map(l => ({ cells: [l.libelle, ...l.cellules.map(c => c.valeur === null ? "À compléter" : typeof c.valeur === "number" ? money(c.valeur) : c.valeur)] })),
          `${t.aide} ${t.manquants} case(s) manquante(s), ${t.controles.length} écart(s). Relecture déclarée : ${t.revu ? "oui" : "non"}.`,
          ["left", ...t.lignes[0].cellules.map(c => c.type === "texte" ? "left" as const : "right" as const)]);
        for (const c of t.controles) paragraphe(`Contrôle : ${c}`, 8);
        continue;
      }
      const rows: Ligne[] = [];
      for (const l of t.lignes) {
        for (const c of l.cellules) rows.push({ cells: [l.cellules.length === 1 ? l.libelle : `${l.libelle} — ${c.libelle}`, c.valeur === null ? "À compléter" : typeof c.valeur === "number" ? money(c.valeur) : c.valeur, c.origine] });
      }
      await table(`${t.id} — ${t.titre}`, ["Rubrique / case", "Valeur", "Origine"], [48, 36, 16], rows,
        `${t.aide} État : ${t.manquants} case(s) manquante(s), ${t.controles.length} écart(s). Relecture déclarée : ${t.revu ? "oui" : "non"}.`);
      for (const c of t.controles) paragraphe(`Contrôle : ${c}`, 8);
    }
    nouvellePage("Périmètre et contrôles");
    for (const a of [...new Set([...d.avertissements, ...d.n.avertissements, ...(d.precedent?.avertissements.map(a => `N-1 : ${a}`) || []), ...d.fiscal.controles])]) paragraphe(a);
    paragraphe("Références : formulaires agricoles 2143-SD (annexes 2144 à 2154) et notice 2142-NOT-SD, impots.gouv.fr. Les tableaux de travail ne remplacent pas l’ensemble des renvois et obligations propres à une déclaration.");
    paragraphe(`Empreinte du dossier, incluant N, N-1, ventilations et saisies fiscales : ${empreinte}`);
    footer(); doc.end(); return await termine;
  } catch (e) { doc.destroy(e instanceof Error ? e : new Error("Génération annuelle interrompue")); throw e; }
}
