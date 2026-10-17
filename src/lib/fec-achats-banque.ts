/**
 * src/lib/fec-achats-banque.ts — journaux HA (achats) et BQ (banque) du FEC.
 *
 * Octobre 2026, la comptable : « Pouvez-vous nous renvoyer un FEC
 * comprenant les achats, ventes, banque, règlements. Votre FEC doit
 * contenir tous les journaux. » Le FEC de l'application ne portait que les
 * ventes (VE) et les règlements clients (RG). Les deux journaux manquants
 * sont construits ici, à partir de ce que l'application tient déjà :
 *
 *   - les DÉBITS du relevé : « Dépenses et justificatifs » (lignes suivies)
 *     et les autres opérations du tableau (salaires, emprunts, virements
 *     internes…), avec le compte proposé (plan-comptable-achats), le compte
 *     fournisseur et la TVA justifiée par la pièce ;
 *   - les CRÉDITS du relevé : le rapprochement bancaire du mois
 *     (rapprochements/{mois}), qui dit ce que chaque crédit encaisse.
 *
 * HA — une écriture par achat (classes 2, 60, 61, 62 hors frais bancaires) :
 *      charge HT + TVA déductible justifiée au débit, fournisseur au crédit.
 *      Sans TVA justifiée par une facture d'achat unique et cohérente
 *      (tvaJustifiee), le TTC part en charge : aucune TVA inventée.
 *      Réponses du cabinet (16/10/2026) : écriture à la DATE DE LA FACTURE
 *      (celle du débit à défaut) ; un compte par fournisseur (401AGRIAL…,
 *      40100000 pour l'occasionnel) ; facture et règlement LETTRÉS (même
 *      code, colonnes EcritureLet/DateLet) ; le cabinet a saisi les achats
 *      jusqu'en juillet 2026 inclus : une facture antérieure à
 *      DEBUT_ACHATS_APPLICATION n'est pas reprise, seul son règlement l'est.
 * BQ — une écriture par mouvement du relevé :
 *      - débit d'achat : fournisseur au débit, banque au crédit ;
 *      - autre débit (frais bancaires, salaires, cotisations, emprunt,
 *        impôt, virement interne, avance FFE…) : compte proposé au débit ;
 *      - crédit : banque au débit, contre les « valeurs à l'encaisser » du
 *        mode (chèques 51120000, cartes 51150000, chèques-vacances 51180000)
 *        soldées par la remise, la commission retenue (carte, ANCV) en
 *        charge. Un crédit déjà passé en banque par le journal RG (virement,
 *        prélèvement SEPA, versement d'espèces) n'est pas repassé.
 *
 * Rien n'est rangé au jugé : ce que l'application ne sait pas classer part
 * au 47100000 « à ventiler » et remonte dans les anomalies. Les doublons
 * probables du relevé sont écartés tant qu'ils ne sont pas tranchés.
 *
 * Module pur, testé seul (tests/unit/fec-achats-banque.test.ts).
 */
import { ventilerDepense, compteFournisseur, COMPTES } from "./plan-comptable-achats";
import { banqueDepense } from "./banque-depense";
import { tvaJustifiee, type LigneMois } from "./bilan-justificatifs";
import { COMPTES_REGLEMENT, COMPTE_ATTENTE, euros, ligneFec, propre, type CompteFec } from "./fec-complet";

export const JOURNAL_ACHATS = { code: "HA", libelle: "Achats" };
export const JOURNAL_BANQUE = { code: "BQ", libelle: "Banque" };
export const COMPTE_FOURNISSEURS: CompteFec = { compte: "40100000", libelle: "Fournisseurs" };
const COMPTE_COMMISSIONS_CB: CompteFec = { compte: "62710000", libelle: COMPTES["62710000"] };
const COMPTE_FRAIS_ANCV: CompteFec = { compte: "62840000", libelle: COMPTES["62840000"] };
const BANQUE_PAR_DEFAUT: CompteFec = { compte: "51200000", libelle: COMPTES["51200000"] };

/** Premier jour des achats tenus par l'application : le cabinet a saisi jusqu'à juillet 2026. */
export const DEBUT_ACHATS_APPLICATION = "2026-08-01";

/**
 * Code de lettrage d'un achat, stable d'un export à l'autre : quatre lettres
 * tirées de l'identifiant du débit (la facture et son règlement le portent).
 */
export function codeLettrage(id: string): string {
  let h = 2166136261;
  for (const ch of id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let code = "";
  for (let i = 0; i < 4; i++) { code += String.fromCharCode(65 + (h % 26)); h = Math.floor(h / 26); }
  return code;
}

const dateIsoValide = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

import { CONTREPARTIES_CREDIT } from "./contreparties-credit";
export { CONTREPARTIES_CREDIT };

/** Un crédit du relevé, tel que le rapprochement l'enregistre. */
export interface CreditBancaireFec {
  date: string;
  label: string;
  amount: number;
  matched?: boolean;
  matchType?: string;
  matchDetail?: string;
  matchedEncs?: { familyName?: string; montant: number; date?: string; mode?: string }[];
  manualPaymentId?: string;
  remiseSepaId?: string;
  commissionAncv?: number;
  /** Crédit hors application, classé au rapprochement (CONTREPARTIES_CREDIT). */
  compteContrepartie?: { id?: string; compte: string; libelle: string } | null;
}

/**
 * Code du mode d'une écriture rapprochée. Le rapprochement enregistre le
 * LIBELLÉ quand il existe (« CB Terminal », « Virement », « Chèque »…,
 * encaissementEnDetail) : sans cette lecture, aucun mode n'était reconnu et
 * 21 159,70 € de crédits pointés partaient au 47100000 (septembre 2026).
 */
export function codeModeRapproche(mode: unknown): string {
  const brut = String(mode ?? "").trim();
  if (!brut) return "";
  if (COMPTES_REGLEMENT[brut]) return brut;
  const t = brut.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/virement/.test(t)) return "virement";
  if (/prelevement|sepa/.test(t)) return "prelevement_sepa";
  if (/espece/.test(t)) return "especes";
  if (/vacances.*connect|connect/.test(t)) return "cheque_vacances_connect";
  if (/vacances|ancv/.test(t)) return "cheque_vacances";
  if (/differe/.test(t)) return "cheque_differe";
  if (/cheque|chq/.test(t)) return "cheque";
  if (/pass/.test(t)) return "pass_sport";
  if (/avoir/.test(t)) return "avoir";
  if (/en ligne|cawl|online/.test(t)) return "cb_online";
  if (/\bcb\b|carte/.test(t)) return "cb_terminal";
  return brut;
}

/** Modes dont le règlement est déjà en banque dans le journal RG. */
const MODES_DEJA_EN_BANQUE = new Set(["virement", "prelevement_sepa", "sepa"]);

const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** « 12/10/2026 », « 2026-10-12 » → « 20261012 ». */
export function dateReleveFec(d: string): string | null {
  const fr = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(d || "");
  if (fr) return `${fr[3]}${fr[2].padStart(2, "0")}${fr[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return iso ? `${iso[1]}${iso[2]}${iso[3]}` : null;
}

/** Achat (facture fournisseur) ou mouvement passé directement en banque ? */
export function estAchat(compte: string): boolean {
  return /^(2|60|61|62)/.test(compte) && !/^627/.test(compte);
}

/** Compte de valeurs à l'encaissement soldé par un crédit, d'après ses écritures ou son type. */
export function transitDuCredit(c: CreditBancaireFec): { compte: CompteFec | null; dejaEnBanque: boolean } {
  const modes = [...new Set((c.matchedEncs || []).map((e) => codeModeRapproche(e.mode)))].filter(Boolean);
  if (modes.length) {
    if (modes.every((m) => MODES_DEJA_EN_BANQUE.has(m) || m === "especes")) return { compte: null, dejaEnBanque: true };
    const comptes = [...new Set(modes.filter((m) => !MODES_DEJA_EN_BANQUE.has(m)).map((m) => COMPTES_REGLEMENT[m]?.compte).filter(Boolean))];
    if (comptes.length === 1) {
      const def = Object.values(COMPTES_REGLEMENT).find((x) => x.compte === comptes[0])!;
      return { compte: { compte: def.compte, libelle: def.libelle }, dejaEnBanque: false };
    }
    return { compte: null, dejaEnBanque: false };
  }
  const t = `${c.matchType || ""}`;
  if (c.manualPaymentId || c.remiseSepaId || /virement|pr[ée]l[èe]vement sepa/i.test(t)) return { compte: null, dejaEnBanque: true };
  if (/esp[èe]ces/i.test(t)) return { compte: null, dejaEnBanque: true }; // versement : journal RG
  if (/ch[èe]que/i.test(t)) return { compte: { compte: COMPTES_REGLEMENT.cheque.compte, libelle: COMPTES_REGLEMENT.cheque.libelle }, dejaEnBanque: false };
  if (/\bcb\b|carte/i.test(t)) return { compte: { compte: COMPTES_REGLEMENT.cb_terminal.compte, libelle: COMPTES_REGLEMENT.cb_terminal.libelle }, dejaEnBanque: false };
  return { compte: null, dejaEnBanque: false };
}

export interface ResultatAchatsBanque {
  lignes: string[];
  ecrituresAchats: number;
  ecrituresBanque: number;
  anomalies: string[];
  /** Euros passés au 47100000 (débits + crédits). */
  compteAttente: number;
  /** Dont débits du relevé non classés (catégorie inconnue, emprunt, PER…). */
  compteAttenteDebits: number;
  /** Dont crédits du relevé non rapprochés ou écarts de remise. */
  compteAttenteCredits: number;
}

export function construireAchatsBanque(params: {
  mois: string;
  /** Débits du relevé du mois (chargerLignesMois). */
  debits: LigneMois[];
  /** Crédits du relevé du mois (rapprochements/{mois}.bankLines). */
  credits: CreditBancaireFec[];
  /** Premier numéro d'écriture libre dans le fichier. */
  numeroDepart: number;
  /** Ne pas produire HA (achats déjà dans les écritures importées). */
  sansAchats?: boolean;
  /** Ne pas produire les crédits (banque déjà tenue dans les écritures importées). */
  sansCredits?: boolean;
  /** Factures antérieures : déjà saisies par le cabinet (défaut DEBUT_ACHATS_APPLICATION). */
  debutAchats?: string;
}): ResultatAchatsBanque {
  const debutAchats = params.debutAchats || DEBUT_ACHATS_APPLICATION;
  const { mois } = params;
  const lignesHa: string[] = [], lignesBq: string[] = [], anomalies: string[] = [];
  let numero = params.numeroDepart, nbHa = 0, nbBq = 0, attente = 0, attenteDebits = 0;
  const finDeMois = (() => { const [a, m] = mois.split("-").map(Number); return `${mois.replace("-", "")}${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; })();
  const enAttente = (c: CompteFec, montant: number) => { if (c.compte === COMPTE_ATTENTE.compte) { attente += montant; attenteDebits += montant; } };

  // ── Débits : HA + BQ ─────────────────────────────────────────────────
  const debits = [...params.debits]
    .filter((l) => (l.mois || l.dateOperation?.slice(0, 7)) === mois && Number.isFinite(l.montant) && l.montant > 0)
    .sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || "") || a.id.localeCompare(b.id));
  for (const l of debits) {
    const fournisseurTexte = propre(l.fournisseur) || "Sans libellé";
    const montant = cents(l.montant);
    if (l.doublonProbable) {
      anomalies.push(`Débit ${fournisseurTexte} (${euros(montant)} €, ${l.dateOperation || "?"}) : doublon probable du relevé, laissé hors FEC tant qu'il n'est pas tranché dans Dépenses.`);
      continue;
    }
    if (l.source && l.source !== "releve-bancaire") continue; // dépense saisie à la main : pas un mouvement du relevé
    const date = dateReleveFec(l.dateOperation || "") || finDeMois;
    if (!l.dateOperation) anomalies.push(`Débit ${fournisseurTexte} (${euros(montant)} €) sans date : daté du dernier jour du mois.`);
    const banqueProposee = banqueDepense(l);
    const banque: CompteFec = banqueProposee.compte ? { compte: banqueProposee.compte, libelle: banqueProposee.libelle } : BANQUE_PAR_DEFAUT;
    if (!banqueProposee.compte) anomalies.push(`Débit ${fournisseurTexte} (${euros(montant)} €) : compte bancaire non identifié, passé au 51200000.`);
    const v = ventilerDepense(l);
    const imputation: CompteFec = v.compte ? { compte: v.compte, libelle: v.libelle || COMPTES[v.compte] || v.compte } : COMPTE_ATTENTE;
    if (!v.compte) anomalies.push(`Débit ${fournisseurTexte} (${euros(montant)} €, ${l.poste || "sans catégorie"}) passé au 47100000 : ${v.note || "compte à préciser"}.`);
    const facture = propre(l.piece?.extraction?.numero);
    const piece = (facture || `DEP-${l.id.slice(0, 12)}`).slice(0, 40);

    if (estAchat(imputation.compte) && !params.sansAchats) {
      // Un compte par fournisseur (401AGRIAL…), le collectif pour l'occasionnel.
      const f = compteFournisseur(l.fournisseur);
      const fournisseur: CompteFec = f.collectif ? COMPTE_FOURNISSEURS : { compte: f.compte, libelle: f.libelle };
      const dateFactureIso = l.piece?.extraction?.date;
      const libelle = `${fournisseurTexte}${facture ? ` — facture ${facture}` : ""}${dateIsoValide(dateFactureIso) ? ` du ${dateFactureIso.split("-").reverse().join("/")}` : ""}`;
      // Facture d'avant la reprise par l'application : saisie par le cabinet.
      if (dateIsoValide(dateFactureIso) && dateFactureIso < debutAchats) {
        anomalies.push(`${fournisseurTexte} (${euros(montant)} €) : facture du ${dateFactureIso.split("-").reverse().join("/")}, déjà saisie par le cabinet ; seul le règlement est repris (BQ, compte ${fournisseur.compte}, à lettrer avec votre écriture).`);
        lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: fournisseur, piece, libelle: `Règlement ${libelle}`, debit: montant }));
        lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: banque, piece, libelle: `Règlement ${libelle}`, credit: montant }));
        numero++; nbBq++;
        continue;
      }
      // Date de la facture (préférence du cabinet), celle du débit à défaut
      // ou si la facture est postérieure au paiement (acompte).
      const dateAchat = dateIsoValide(dateFactureIso) && dateFactureIso.replace(/-/g, "") <= date ? dateFactureIso.replace(/-/g, "") : date;
      const lettrage = { lettrage: codeLettrage(l.id), dateLettrage: date };
      const tva = Math.min(cents(tvaJustifiee(l) ?? 0), montant - 1);
      lignesHa.push(ligneFec({ journal: JOURNAL_ACHATS, numero, date: dateAchat, compte: imputation, piece, libelle, debit: montant - Math.max(tva, 0) }));
      if (tva > 0) lignesHa.push(ligneFec({ journal: JOURNAL_ACHATS, numero, date: dateAchat, compte: { compte: /^2/.test(imputation.compte) ? "44562000" : "44566000", libelle: COMPTES[/^2/.test(imputation.compte) ? "44562000" : "44566000"] }, piece, libelle, debit: tva }));
      lignesHa.push(ligneFec({ journal: JOURNAL_ACHATS, numero, date: dateAchat, compte: fournisseur, piece, libelle, credit: montant, ...lettrage }));
      enAttente(imputation, montant);
      numero++; nbHa++;
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: fournisseur, piece, libelle: `Règlement ${libelle}`, debit: montant, ...lettrage }));
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: banque, piece, libelle: `Règlement ${libelle}`, credit: montant }));
      numero++; nbBq++;
    } else {
      const libelle = `${fournisseurTexte}${l.poste ? ` (${propre(l.poste)})` : ""}`;
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: imputation, piece, libelle, debit: montant }));
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: banque, piece, libelle, credit: montant }));
      enAttente(imputation, montant);
      numero++; nbBq++;
    }
  }

  // ── Crédits : BQ ─────────────────────────────────────────────────────
  const credits = params.sansCredits ? [] : [...params.credits]
    .filter((c) => cents(c.amount) > 0 && (dateReleveFec(c.date) || "").startsWith(mois.replace("-", "")))
    .sort((a, b) => (dateReleveFec(a.date) || "").localeCompare(dateReleveFec(b.date) || ""));
  let dejaEnBanque = 0;
  for (const c of credits) {
    const net = cents(c.amount);
    const date = dateReleveFec(c.date)!;
    const libelle = propre(c.label).slice(0, 120) || "Crédit bancaire";
    const piece = `REL-${date}-${String(numero)}`;
    const ignore = !c.matched || c.matchType === "Ignoré";
    const jj = `${date.slice(6)}/${date.slice(4, 6)}`;
    const versAttente = (montant: number, motif: string) => {
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: COMPTE_ATTENTE, piece, libelle, credit: montant }));
      attente += montant;
      anomalies.push(`Crédit du ${jj} « ${libelle.slice(0, 60)} » (${euros(montant)} €) ${motif} : passé au 47100000.`);
    };
    // Crédit classé par le club au rapprochement (hors application).
    const cp = c.matched ? c.compteContrepartie : null;
    if (cp?.compte) {
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: BANQUE_PAR_DEFAUT, piece, libelle, debit: net }));
      if (cp.compte === COMPTE_ATTENTE.compte) versAttente(net, "classé « autre recette » au rapprochement");
      else lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: { compte: cp.compte, libelle: CONTREPARTIES_CREDIT.find((x) => x.compte === cp.compte)?.compteLib || cp.libelle }, piece, libelle, credit: net }));
      numero++; nbBq++;
      continue;
    }
    if (ignore) {
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: BANQUE_PAR_DEFAUT, piece, libelle, debit: net }));
      versAttente(net, c.matchType === "Ignoré" ? "marqué « Ignoré » au rapprochement (virement interne, apport, subvention, remboursement ?)" : "non rapproché");
      numero++; nbBq++;
      continue;
    }
    // Ce que la ligne solde, mode par mode : une remise peut mêler chèques et
    // chèques-vacances, un pointage manuel plusieurs écritures. La part déjà
    // passée en banque par RG (virement, SEPA, espèces) n'est pas reprise.
    const encs = (c.matchedEncs || []).filter((e) => cents(e.montant) !== 0);
    const parts = new Map<string, number>();
    let dejaRg = 0, inconnu = 0;
    if (encs.length) {
      for (const e of encs) {
        const code = codeModeRapproche(e.mode);
        if (MODES_DEJA_EN_BANQUE.has(code) || code === "especes") dejaRg += cents(e.montant);
        else if (COMPTES_REGLEMENT[code]) parts.set(COMPTES_REGLEMENT[code].compte, (parts.get(COMPTES_REGLEMENT[code].compte) || 0) + cents(e.montant));
        else inconnu += cents(e.montant);
      }
    } else {
      const t = transitDuCredit(c);
      if (t.dejaEnBanque) dejaRg = net;
      else if (t.compte) parts.set(t.compte.compte, net);
      else inconnu = net;
    }
    if (parts.size === 0 && inconnu === 0) { dejaEnBanque++; continue; }
    const enBanque = net - dejaRg;
    if (enBanque <= 0) { anomalies.push(`Crédit du ${jj} « ${libelle.slice(0, 60)} » (${euros(net)} €) : écritures rapprochées supérieures au crédit, à revoir dans le rapprochement.`); continue; }
    lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: BANQUE_PAR_DEFAUT, piece, libelle, debit: enBanque }));
    let solde = 0;
    for (const [compte, montant] of parts) {
      const def = Object.values(COMPTES_REGLEMENT).find((x) => x.compte === compte)!;
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: { compte, libelle: def.libelle }, piece, libelle, credit: montant }));
      solde += montant;
    }
    if (inconnu) { versAttente(inconnu, encs.length ? "rapproché à des écritures de mode inconnu" : "d'origine indéterminée"); solde += inconnu; }
    // Brut des écritures soldées ; la différence avec le net reçu est la commission.
    const ecart = solde - enBanque;
    if (ecart > 0) {
      const seul = parts.size === 1 && !inconnu ? [...parts.keys()][0] : "";
      const commission = seul === COMPTES_REGLEMENT.cheque_vacances.compte ? COMPTE_FRAIS_ANCV : seul === COMPTES_REGLEMENT.cb_terminal.compte ? COMPTE_COMMISSIONS_CB : COMPTE_ATTENTE;
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: commission, piece, libelle: `Commission retenue — ${libelle}`, debit: ecart }));
      if (commission === COMPTE_ATTENTE) { attente += ecart; anomalies.push(`Crédit du ${jj} (${euros(net)} €) inférieur de ${euros(ecart)} € aux écritures rapprochées : écart au 47100000.`); }
    } else if (ecart < 0) {
      lignesBq.push(ligneFec({ journal: JOURNAL_BANQUE, numero, date, compte: COMPTE_ATTENTE, piece, libelle: `Écart de remise — ${libelle}`, credit: -ecart }));
      attente += -ecart;
      anomalies.push(`Crédit du ${jj} (${euros(net)} €) supérieur de ${euros(-ecart)} € aux écritures rapprochées : écart au 47100000.`);
    }
    numero++; nbBq++;
  }
  if (!params.sansCredits && credits.length === 0) anomalies.push(`Aucun crédit du relevé de ${mois} dans le rapprochement bancaire : importez le relevé du mois (Rapprochement) pour que le journal Banque soit complet.`);
  if (dejaEnBanque) anomalies.push(`${dejaEnBanque} crédit(s) du relevé (virements, prélèvements SEPA, versements d'espèces) déjà passés en banque par le journal des règlements : non repris en BQ.`);

  return { lignes: [...lignesHa, ...lignesBq], ecrituresAchats: nbHa, ecrituresBanque: nbBq, anomalies, compteAttente: attente / 100, compteAttenteDebits: attenteDebits / 100, compteAttenteCredits: (attente - attenteDebits) / 100 };
}
