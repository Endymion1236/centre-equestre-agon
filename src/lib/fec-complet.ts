/**
 * src/lib/fec-complet.ts — le FEC mensuel transmis au cabinet.
 *
 * Le cabinet (septembre 2026) : « exporter un fichier FEC de votre logiciel,
 * à transmettre mensuellement ; la trame est au bon format ». Le FEC de
 * l'application ne contenait que les ventes, toutes rangées dans un seul
 * compte de stages. Il réunit désormais, dans un seul fichier aux 18
 * colonnes réglementaires (art. A.47 A-1 du LPF) :
 *
 *   VE — Ventes : une écriture par facture, équilibrée ; chaque ligne sur
 *        son compte de produit (compteDeLigne, plan du cabinet), la TVA
 *        collectée par taux, la créance au 41100000 ;
 *   RG — Règlements clients : une écriture par encaissement du journal de
 *        caisse, du compte de trésorerie du mode vers le 41100000 ; plus
 *        les versements d'espèces en banque et les apports de caisse.
 *
 * Les achats n'y sont pas : le cabinet les saisit sur pièces, qui partent
 * avec le même envoi (archive des justificatifs du mois).
 *
 * Aucune ligne n'est rangée au hasard : une ligne de vente sans compte
 * identifiable part au 47100000 « à ventiler », un mode de règlement
 * inconnu aussi, et chacune remonte dans les anomalies.
 */

import { analyserFecVentes, ENTETE_FEC, type PaiementFec } from "@/app/admin/comptabilite/fec-utils";
import { compteDeLigne, libelleCompte, NON_VENTILE } from "@/lib/ventilation-comptable";

export interface CompteFec { compte: string; libelle: string }

export const COMPTE_CLIENTS: CompteFec = { compte: "41100000", libelle: "Clients" };
export const COMPTE_ATTENTE: CompteFec = { compte: "47100000", libelle: "Compte d'attente — à ventiler" };

/**
 * Compte de trésorerie débité par mode de règlement.
 *
 * Plan du cabinet pour la banque (51200000 Crédit Agricole). Pour les
 * valeurs remises plus tard (chèques, cartes, chèques vacances), un compte
 * de « valeurs à l'encaissement » : la remise sur le relevé les solde. Les
 * comptes marqués `aConfirmer` suivent le plan comptable général faute de
 * numéro fourni par le cabinet ; ils sont listés dans le mail d'envoi.
 */
export const COMPTES_REGLEMENT: Record<string, CompteFec & { aConfirmer?: boolean }> = {
  especes: { compte: "53000000", libelle: "Caisse", aConfirmer: true },
  cheque: { compte: "51120000", libelle: "Chèques à encaisser", aConfirmer: true },
  cheque_differe: { compte: "51120000", libelle: "Chèques à encaisser", aConfirmer: true },
  cb_terminal: { compte: "51150000", libelle: "Cartes bancaires à encaisser", aConfirmer: true },
  cb: { compte: "51150000", libelle: "Cartes bancaires à encaisser", aConfirmer: true },
  cb_online: { compte: "51150000", libelle: "Cartes bancaires à encaisser", aConfirmer: true },
  cb_cawl: { compte: "51150000", libelle: "Cartes bancaires à encaisser", aConfirmer: true },
  cheque_vacances: { compte: "51180000", libelle: "Chèques vacances à encaisser", aConfirmer: true },
  ancv: { compte: "51180000", libelle: "Chèques vacances à encaisser", aConfirmer: true },
  pass_sport: { compte: "44180000", libelle: "État — Pass'Sport à recevoir", aConfirmer: true },
  virement: { compte: "51200000", libelle: "Crédit Agricole" },
  prelevement_sepa: { compte: "51200000", libelle: "Crédit Agricole" },
  sepa: { compte: "51200000", libelle: "Crédit Agricole" },
  avoir: { compte: "41910000", libelle: "Clients — avoirs à imputer", aConfirmer: true },
};
export const COMPTE_BANQUE: CompteFec = { compte: "51200000", libelle: "Crédit Agricole" };
export const COMPTE_VIREMENTS_INTERNES: CompteFec = { compte: "58000000", libelle: "Virements internes" };

const JOURNAL_REGLEMENTS = { code: "RG", libelle: "Règlements clients" };

const JOUR_PARIS = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
function dateFec(secondes: number | undefined, repli: Date): string {
  const d = secondes ? new Date(secondes * 1000) : repli;
  const p = Object.fromEntries(JOUR_PARIS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}
const euros = (centimes: number) => (centimes / 100).toFixed(2);
/** Tabulation et retours à la ligne cassent le format : on les remplace. */
const propre = (t: unknown) => String(t ?? "").replace(/[\t\r\n]+/g, " ").trim();

function ligneFec(c: {
  journal: { code: string; libelle: string }; numero: number; date: string; compte: CompteFec;
  piece: string; libelle: string; debit?: number; credit?: number; auxNum?: string; auxLib?: string;
}): string {
  return [
    c.journal.code, c.journal.libelle, String(c.numero), c.date, c.compte.compte, propre(c.compte.libelle),
    propre(c.auxNum), propre(c.auxLib), propre(c.piece), c.date, propre(c.libelle),
    c.debit !== undefined ? euros(c.debit) : "", c.credit !== undefined ? euros(c.credit) : "",
    "", "", c.date, "", "",
  ].join("\t");
}

export interface EncaissementFec {
  id?: string;
  paymentId?: string;
  familyName?: string;
  montant?: number;
  mode?: string;
  modeLabel?: string;
  ref?: string;
  date?: { seconds?: number } | null;
  isVersementBanque?: boolean;
  isApportCaisse?: boolean;
  correctionDe?: string;
}

export interface ResultatFecComplet {
  contenu: string;
  anomalies: string[];
  resume: {
    ventes: { ecritures: number; totalTTC: number };
    reglements: { ecritures: number; total: number };
    /** Comptes de trésorerie employés et encore à confirmer par le cabinet. */
    comptesAConfirmer: CompteFec[];
  };
}

export function construireFecComplet(params: {
  factures: PaiementFec[];
  encaissements: EncaissementFec[];
  /** Numéro de facture par identifiant de commande, pour la référence de pièce des règlements. */
  numeroFactureDe?: (paymentId: string) => string | undefined;
  maintenant?: Date;
}): ResultatFecComplet {
  const maintenant = params.maintenant || new Date();
  const anomalies: string[] = [];

  // ── VE : ventes ─────────────────────────────────────────────────────
  const aVentiler = new Set<string>();
  const ventes = analyserFecVentes(params.factures, maintenant, {
    compteProduit: (item) => {
      const { code } = compteDeLigne(item);
      if (code === NON_VENTILE) { aVentiler.add(item.activityTitle || "(sans libellé)"); return COMPTE_ATTENTE; }
      return { compte: code, libelle: libelleCompte(code) };
    },
  });
  for (const a of ventes.anomalies) anomalies.push(`${a.piece} — ${a.familyName} : ${a.message}`);
  if (aVentiler.size) {
    anomalies.push(`Ventes au compte d'attente 47100000 (prestation non reconnue) : ${[...aVentiler].slice(0, 10).join(" ; ")}${aVentiler.size > 10 ? "…" : ""}`);
  }

  // ── RG : règlements ─────────────────────────────────────────────────
  const lignesRg: string[] = [];
  let numero = ventes.nbEcritures + 1;
  const debut = numero;
  let totalRg = 0;
  const comptesUtilises = new Map<string, CompteFec>();
  const tries = [...params.encaissements].sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));
  for (const e of tries) {
    const centimes = Math.round((Number(e.montant) || 0) * 100);
    if (centimes === 0) continue;
    const date = dateFec(e.date?.seconds, maintenant);
    const piece = (e.paymentId && params.numeroFactureDe?.(e.paymentId)) || propre(e.ref).slice(0, 40) || `ENC-${String(e.id || "").slice(0, 8)}`;
    let debit: CompteFec, credit: CompteFec, libelle: string, aux: { auxNum?: string; auxLib?: string } = {};

    if (e.isVersementBanque) {
      debit = COMPTE_BANQUE; credit = COMPTES_REGLEMENT.especes;
      libelle = "Versement d'espèces en banque";
    } else if (e.isApportCaisse) {
      debit = COMPTES_REGLEMENT.especes; credit = COMPTE_VIREMENTS_INTERNES;
      libelle = "Apport en caisse";
      anomalies.push(`Apport en caisse du ${date.slice(6)}/${date.slice(4, 6)} passé en 58000000 : origine des fonds à confirmer.`);
    } else {
      const tresorerie = COMPTES_REGLEMENT[e.mode || ""];
      debit = tresorerie || COMPTE_ATTENTE;
      if (!tresorerie) anomalies.push(`Règlement de ${propre(e.familyName) || "?"} (${euros(Math.abs(centimes))} €) : mode « ${e.mode || "?"} » inconnu, passé au 47100000.`);
      credit = COMPTE_CLIENTS;
      aux = { auxNum: e.familyName, auxLib: e.familyName };
      libelle = `${e.correctionDe ? "Contre-passation — " : ""}Règlement ${propre(e.modeLabel || e.mode)} ${propre(e.familyName)}`;
    }
    for (const c of [debit, credit]) {
      const def = Object.values(COMPTES_REGLEMENT).find((x) => x.compte === c.compte);
      if (def?.aConfirmer) comptesUtilises.set(c.compte, { compte: c.compte, libelle: c.libelle });
    }

    // Montant négatif (remboursement, contre-passation) : sens inversés. Un
    // versement en banque est toujours stocké en négatif (sortie de caisse) et
    // un apport en positif : leur sens est fixé ci-dessus, pas par le signe.
    const m = Math.abs(centimes);
    const sensFixe = e.isVersementBanque || e.isApportCaisse;
    const [compteDebit, compteCredit] = sensFixe || centimes > 0 ? [debit, credit] : [credit, debit];
    const auxDebit = compteDebit === COMPTE_CLIENTS ? aux : {};
    const auxCredit = compteCredit === COMPTE_CLIENTS ? aux : {};
    lignesRg.push(ligneFec({ journal: JOURNAL_REGLEMENTS, numero, date, compte: compteDebit, piece, libelle, debit: m, ...auxDebit }));
    lignesRg.push(ligneFec({ journal: JOURNAL_REGLEMENTS, numero, date, compte: compteCredit, piece, libelle, credit: m, ...auxCredit }));
    if (!e.isVersementBanque && !e.isApportCaisse) totalRg += centimes;
    numero++;
  }

  const totalTTC = params.factures.reduce((s, f) => s + Math.round((Number(f.totalTTC) || 0) * 100), 0);
  return {
    contenu: [ENTETE_FEC, ...ventes.lignes, ...lignesRg].join("\n") + "\n",
    anomalies,
    resume: {
      ventes: { ecritures: ventes.nbEcritures, totalTTC: totalTTC / 100 },
      reglements: { ecritures: numero - debut, total: totalRg / 100 },
      comptesAConfirmer: [...comptesUtilises.values()],
    },
  };
}

/**
 * Nom réglementaire : SIREN + « FEC » + date de fin de période (AAAAMMJJ).
 * Sans SIREN connu, un nom lisible par mois.
 */
export function nomFichierFec(siret: string | undefined, mois: string): string {
  const siren = String(siret || "").replace(/\D/g, "").slice(0, 9);
  const [a, m] = mois.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0));
  const aaaammjj = `${fin.getUTCFullYear()}${String(fin.getUTCMonth() + 1).padStart(2, "0")}${String(fin.getUTCDate()).padStart(2, "0")}`;
  return siren.length === 9 ? `${siren}FEC${aaaammjj}.txt` : `FEC_${mois.replace("-", "")}.txt`;
}

// ─── Mois tenus dans Céleris (juillet-août 2026) ───────────────────────────
//
// Avant la bascule, les ventes et règlements étaient dans Céleris. Leurs
// écritures, importées mois par mois (lib/import-comptable-celeris), sont
// déjà en partie double et équilibrées par journal / pièce / date : on les
// réécrit telles quelles aux 18 colonnes du FEC, sans rien recalculer.

export interface EcritureCelerisFec {
  journal: string; compte: string; piece: string; date: string;
  /** Centimes. Un montant négatif passe du côté opposé, en positif. */
  debit: number; credit: number; libelle: string; libelleCompte: string;
}

const LIBELLES_JOURNAUX: [RegExp, string][] = [
  [/^VT|^VE/, "Ventes"], [/^BQ|^BA/, "Banque"], [/^CA/, "Caisse"],
  [/^HA|^AC/, "Achats"], [/^OD/, "Opérations diverses"], [/^AN|^RAN/, "À-nouveaux"],
];
export function libelleJournal(code: string): string {
  return LIBELLES_JOURNAUX.find(([re]) => re.test(code))?.[1] || code;
}

export function construireFecCeleris(lignes: EcritureCelerisFec[]): { contenu: string; ecritures: number; anomalies: string[] } {
  // Regrouper par écriture (journal, pièce, date), dans l'ordre chronologique.
  const groupes = new Map<string, EcritureCelerisFec[]>();
  for (const l of lignes) {
    const cle = JSON.stringify([l.date, l.journal, l.piece]);
    groupes.set(cle, [...(groupes.get(cle) || []), l]);
  }
  const cles = [...groupes.keys()].sort();
  const sortie: string[] = [];
  const anomalies: string[] = [];
  let numero = 0;
  for (const cle of cles) {
    const groupe = groupes.get(cle)!;
    numero++;
    let solde = 0;
    for (const l of groupe) {
      const net = (Number(l.debit) || 0) - (Number(l.credit) || 0);
      if (net === 0) continue;
      solde += net;
      const date = l.date.replace(/-/g, "");
      sortie.push(ligneFec({
        journal: { code: l.journal, libelle: libelleJournal(l.journal) }, numero, date,
        compte: { compte: l.compte, libelle: l.libelleCompte }, piece: l.piece, libelle: l.libelle,
        ...(net > 0 ? { debit: net } : { credit: -net }),
      }));
    }
    if (solde !== 0) anomalies.push(`Écriture Céleris ${groupe[0].journal} ${groupe[0].piece} du ${groupe[0].date} déséquilibrée de ${euros(solde)} €.`);
  }
  return { contenu: [ENTETE_FEC, ...sortie].join("\n") + "\n", ecritures: numero, anomalies };
}
