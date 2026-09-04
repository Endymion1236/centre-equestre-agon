export type TypeExportComptable = "ventes" | "reglements" | "clients";

export interface PaiementExportComptable {
  familyName: string;
  totalTTC?: number;
  paidAmount?: number;
  paymentMode: string;
  paymentRef?: string;
  date?: { seconds?: number } | null;
  items?: Array<{
    activityTitle: string;
    priceHT?: number;
    priceTTC?: number;
    tva?: number;
  }>;
}

const SEPARATEUR = ";";

function dateFrancaise(paiement: PaiementExportComptable) {
  return paiement.date?.seconds
    ? new Date(paiement.date.seconds * 1000).toLocaleDateString("fr-FR")
    : "";
}

function exportVentes(paiements: PaiementExportComptable[]) {
  const lignes = ["Date;Client;Article;HT;TVA%;TVA;TTC;Mode"];
  paiements.forEach((paiement) => {
    const date = dateFrancaise(paiement);
    (paiement.items || []).forEach((article) => {
      lignes.push([
        date,
        paiement.familyName,
        article.activityTitle,
        (article.priceHT || 0).toFixed(2),
        article.tva || 5.5,
        ((article.priceTTC || 0) - (article.priceHT || 0)).toFixed(2),
        (article.priceTTC || 0).toFixed(2),
        paiement.paymentMode,
      ].join(SEPARATEUR));
    });
  });
  return lignes.join("\n") + "\n";
}

function exportReglements(paiements: PaiementExportComptable[]) {
  const lignes = ["Date;Client;Montant;Mode;Référence"];
  paiements.forEach((paiement) => {
    lignes.push([
      dateFrancaise(paiement),
      paiement.familyName,
      (paiement.totalTTC || 0).toFixed(2),
      paiement.paymentMode,
      paiement.paymentRef || "",
    ].join(SEPARATEUR));
  });
  return lignes.join("\n") + "\n";
}

function exportClients(paiements: PaiementExportComptable[]) {
  const clients: Record<string, { facture: number; paye: number }> = {};
  paiements.forEach((paiement) => {
    if (!clients[paiement.familyName]) clients[paiement.familyName] = { facture: 0, paye: 0 };
    clients[paiement.familyName].facture += paiement.totalTTC || 0;
    clients[paiement.familyName].paye += paiement.paidAmount || paiement.totalTTC || 0;
  });

  const lignes = ["Client;Total facturé;Total payé;Solde dû"];
  Object.entries(clients).forEach(([nom, compte]) => {
    lignes.push([
      nom,
      compte.facture.toFixed(2),
      compte.paye.toFixed(2),
      (compte.facture - compte.paye).toFixed(2),
    ].join(SEPARATEUR));
  });
  return lignes.join("\n") + "\n";
}

export function construireExportComptable(
  type: TypeExportComptable,
  facturesPeriode: PaiementExportComptable[],
  tousPaiements: PaiementExportComptable[],
) {
  if (type === "ventes") return exportVentes(facturesPeriode);
  if (type === "reglements") return exportReglements(facturesPeriode);
  return exportClients(tousPaiements);
}

// ─── Exports pour l'envoi mensuel à la comptable ────────────────────────────
//
// Les trois exports historiques (ventes, règlements, balance) raisonnent en
// « paiements ». La comptable a besoin des ÉCRITURES : la liste des factures
// numérotées, le journal des encaissements tel qu'il est scellé (NF525), et
// les dépenses du mois. Tout est en point-virgule, décimales avec un point,
// comme les exports existants.

function csvChamp(valeur: unknown) {
  const texte = valeur == null ? "" : String(valeur);
  return /[;"\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

function dateFrDe(date: { seconds?: number } | null | undefined) {
  return date?.seconds ? new Date(date.seconds * 1000).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "";
}

export interface FactureExport {
  id?: string;
  invoiceNumber?: string;
  familyName?: string;
  date?: { seconds?: number } | null;
  totalTTC?: number;
  paidAmount?: number;
  status?: string;
  paymentMode?: string;
  items?: Array<{ activityTitle?: string; priceHT?: number; priceTTC?: number }>;
}

/** Une ligne par facture : numéro, client, HT, TVA, TTC, réglé, statut. */
export function construireExportFactures(factures: FactureExport[]) {
  const lignes = ["N° facture;Date;Client;Prestations;HT;TVA;TTC;Réglé;Reste dû;Statut;Mode"];
  for (const f of factures) {
    const ht = (f.items || []).reduce((s, i) => s + (i.priceHT || 0), 0);
    const ttc = f.totalTTC || 0;
    const regle = f.paidAmount || 0;
    lignes.push([
      f.invoiceNumber || "(proforma)",
      dateFrDe(f.date),
      f.familyName || "",
      (f.items || []).map((i) => i.activityTitle || "").filter(Boolean).join(", "),
      ht.toFixed(2),
      (ttc - ht).toFixed(2),
      ttc.toFixed(2),
      regle.toFixed(2),
      Math.max(0, ttc - regle).toFixed(2),
      f.status || "",
      f.paymentMode || "",
    ].map(csvChamp).join(SEPARATEUR));
  }
  return lignes.join("\n") + "\n";
}

export interface EncaissementExport {
  id?: string;
  date?: { seconds?: number } | null;
  familyName?: string;
  montant?: number;
  mode?: string;
  modeLabel?: string;
  ref?: string;
  activityTitle?: string;
  paymentId?: string;
  raison?: string;
  correctionDe?: string;
  hash?: string;
}

/** Le journal des encaissements, une ligne par écriture, dans l'ordre du journal. */
export function construireExportEncaissements(encaissements: EncaissementExport[]) {
  const lignes = ["Date;Client;Prestation;Montant;Mode;Référence;Facture (id);Motif;Corrige l'écriture;Empreinte"];
  const tries = [...encaissements].sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));
  for (const e of tries) {
    lignes.push([
      dateFrDe(e.date),
      e.familyName || "",
      e.activityTitle || "",
      (e.montant || 0).toFixed(2),
      e.modeLabel || e.mode || "",
      e.ref || "",
      e.paymentId || "",
      e.raison || "",
      e.correctionDe || "",
      e.hash ? String(e.hash).slice(0, 12) : "",
    ].map(csvChamp).join(SEPARATEUR));
  }
  return lignes.join("\n") + "\n";
}

export interface DepenseExport {
  date?: string;
  mois?: string;
  poste?: string;
  fournisseur?: string;
  montant?: number;
  note?: string;
}

/** Les dépenses du mois, une ligne par dépense, groupées par poste. */
export function construireExportDepenses(depenses: DepenseExport[]) {
  const lignes = ["Mois;Date;Poste;Fournisseur;Montant;Note"];
  const triees = [...depenses].sort((a, b) =>
    (a.poste || "").localeCompare(b.poste || "") || (a.date || "").localeCompare(b.date || ""));
  for (const d of triees) {
    lignes.push([
      d.mois || "",
      d.date ? d.date.split("-").reverse().join("/") : "",
      d.poste || "",
      d.fournisseur || "",
      (d.montant || 0).toFixed(2),
      d.note || "",
    ].map(csvChamp).join(SEPARATEUR));
  }
  return lignes.join("\n") + "\n";
}
