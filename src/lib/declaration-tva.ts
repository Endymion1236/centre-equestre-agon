/**
 * src/lib/declaration-tva.ts
 *
 * Préparer la déclaration de TVA (CA3) : les chiffres rangés case par case,
 * à recopier dans l'espace professionnel impots.gouv.fr.
 *
 * Deux bases de calcul pour la TVA collectée :
 *   - « encaissements » : la règle des prestations de services (art. 269-2-c
 *     du CGI). Chaque somme reçue porte la TVA de la facture qu'elle règle,
 *     au prorata des lignes et de leurs taux ; un remboursement la réduit.
 *   - « factures » : la TVA des factures émises dans la période (option pour
 *     les débits, ou ce que Céleris faisait). C'est le calcul de l'encart
 *     « TVA du trimestre ».
 * Tant que le cabinet n'a pas tranché, l'écran montre les deux et l'écart.
 *
 * Mois tenus dans Céleris (juillet-août 2026) : seule la TVA des factures est
 * connue (comptes 445 du journal VTE), le taux de chaque pièce est retrouvé
 * par le rapport TVA / HT. Un encaissement reçu plus tard pour une facture de
 * ces mois n'est pas recompté : Céleris a déjà porté sa TVA.
 *
 * La déductible est celle des achats justifiés par une facture, séparée entre
 * immobilisations (ligne 19) et autres biens et services (ligne 20).
 *
 * Préparation seulement : la déclaration reste signée par le gérant ou la
 * comptable. Module pur, montants calculés en centimes, sans Firestore.
 */

import { tauxTva } from "./tva-taux";

export type BaseTva = "encaissements" | "factures";

export interface LigneFactureTva { priceHT?: number; priceTTC?: number; tva?: number; activityTitle?: string }
export interface PaiementTva {
  id: string;
  status?: string;
  totalTTC?: number;
  familyName?: string;
  invoiceNumber?: string | null;
  date?: { seconds?: number } | null;
  items?: LigneFactureTva[];
}
export interface EncaissementTva {
  id?: string;
  paymentId?: string;
  montant?: number;
  mode?: string;
  familyName?: string;
  date?: { seconds?: number } | null;
  isVersementBanque?: boolean;
  isApportCaisse?: boolean;
}
/** Écriture Céleris importée, montants en centimes. */
export interface EcritureCelerisTva { journal: string; compte: string; piece: string; date: string; debit: number; credit: number }
export interface DeductibleMois { immobilisations: number; autresBiensServices: number; aVerifier?: { nb: number; ttc: number } }

export interface CaseCa3 {
  code: string;
  libelle: string;
  /** Base hors taxe, en euros (centimes conservés). */
  base?: number;
  /** Montant de taxe, en euros (centimes conservés). */
  tva?: number;
}

export interface ResultatDeclarationTva {
  base: BaseTva;
  mois: string[];
  /** Source de la collectée, mois par mois. */
  sources: { mois: string; source: "application" | "celeris" }[];
  /** Collectée par taux (taux en %, 0 = non imposable). */
  parTaux: { taux: number; base: number; tva: number }[];
  /** Pièces Céleris dont le taux ne se retrouve pas (plusieurs taux mêlés). */
  tauxMixte: { base: number; tva: number; pieces: number };
  collectee: number;
  deductible: { immobilisations: number; autresBiensServices: number; creditAnterieur: number; total: number };
  /** TVA nette due (ligne 28), 0 en cas de crédit. */
  netteDue: number;
  /** Crédit de TVA (ligne 25), 0 sinon. */
  credit: number;
  cases: CaseCa3[];
  /** Encaissements écartés du calcul, avec la raison. */
  ecartes: { raison: string; nb: number; montant: number }[];
  anomalies: string[];
  /** Mois dont les achats n'ont pas pu être lus : déductible partielle. */
  moisSansAchats: string[];
}

const JOUR_PARIS = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" });
export function moisParis(seconds: number | undefined | null): string | null {
  if (!seconds) return null;
  return JOUR_PARIS.format(new Date(seconds * 1000)).slice(0, 7);
}

const cts = (euros: unknown) => Math.round((Number(euros) || 0) * 100);
const eur = (centimes: number) => Math.round(centimes) / 100;
const STATUTS_NON_FACTURES = new Set(["cancelled", "pending", "draft"]);

/** Case de la CA3 pour un taux de TVA (en %). */
export const CASE_PAR_TAUX: Record<string, { code: string; libelle: string }> = {
  "20": { code: "08", libelle: "Taux normal 20 %" },
  "10": { code: "9B", libelle: "Taux réduit 10 %" },
  "5.5": { code: "09", libelle: "Taux réduit 5,5 %" },
};

/** Taux d'une pièce Céleris retrouvé par TVA / HT, ou null si aucun taux usuel ne colle. */
export function tauxDePiece(htCentimes: number, tvaCentimes: number): number | null {
  if (htCentimes === 0) return tvaCentimes === 0 ? 0 : null;
  for (const t of [0, 5.5, 10, 20, 2.1]) {
    const attendu = (htCentimes * t) / 100;
    // L'arrondi de chaque ligne décale la TVA de quelques centimes.
    if (Math.abs(tvaCentimes - attendu) <= 2 + Math.abs(htCentimes) * 0.001) return t;
  }
  return null;
}

type Cumul = Map<number, { base: number; tva: number }>;
function ajouter(cumul: Cumul, taux: number, base: number, tva: number) {
  const k = Math.round(taux * 100) / 100;
  const c = cumul.get(k) || { base: 0, tva: 0 };
  c.base += base; c.tva += tva;
  cumul.set(k, c);
}

/**
 * Répartit un montant TTC (centimes) sur les lignes d'une facture, au prorata
 * de leur TTC : une remise globale se répartit donc comme le reste.
 */
function repartir(p: PaiementTva, montantTtc: number, cumul: Cumul): boolean {
  const lignes = (p.items || []).filter((l) => Number(l.priceTTC) || Number(l.priceHT));
  const totalLignes = lignes.reduce((s, l) => s + cts(l.priceTTC), 0);
  if (!lignes.length || totalLignes === 0) return false;
  for (const l of lignes) {
    const t = tauxTva(l.tva);
    const partTtc = (montantTtc * cts(l.priceTTC)) / totalLignes;
    const base = partTtc / (1 + t / 100);
    ajouter(cumul, t, base, partTtc - base);
  }
  return true;
}

export function preparerDeclarationTva(params: {
  mois: string[];
  base: BaseTva;
  /** Toutes les commandes : celles de la période (base factures) et celles que règlent les encaissements. */
  payments: PaiementTva[];
  /** Tous les encaissements : filtrés ici sur la période (heure de Paris). */
  encaissements: EncaissementTva[];
  /** Écritures Céleris des mois de la période qui en ont. */
  celeris: Record<string, EcritureCelerisTva[]>;
  /** Tous les mois tenus dans Céleris, pour ne pas recompter leurs factures réglées plus tard. */
  moisCeleris: string[];
  /** Déductible justifiée par mois ; null = achats du mois illisibles. */
  deductible: Record<string, DeductibleMois | null>;
  /** Crédit reporté de la déclaration précédente (ligne 22), en euros. */
  creditAnterieur?: number;
}): ResultatDeclarationTva {
  const tenusCeleris = new Set([...params.moisCeleris, ...params.mois.filter((m) => params.celeris[m]?.length)]);
  const cumul: Cumul = new Map();
  const tauxMixte = { base: 0, tva: 0, pieces: 0 };
  const anomalies: string[] = [];
  const ecartes = new Map<string, { nb: number; montant: number }>();
  const ecarter = (raison: string, montant: number) => {
    const e = ecartes.get(raison) || { nb: 0, montant: 0 };
    e.nb++; e.montant += montant;
    ecartes.set(raison, e);
  };
  const sources = params.mois.map((m) => ({ mois: m, source: (params.celeris[m]?.length ? "celeris" : "application") as "application" | "celeris" }));
  const moisApplication = new Set(sources.filter((s) => s.source === "application").map((s) => s.mois));

  // ── Mois Céleris : la TVA des factures, pièce par pièce ─────────────
  for (const { mois, source } of sources) {
    if (source !== "celeris") continue;
    const pieces = new Map<string, { ht: number; tva: number }>();
    for (const l of params.celeris[mois]) {
      if (l.journal !== "VTE") continue;
      const cle = `${l.piece}|${l.date}`;
      const p = pieces.get(cle) || { ht: 0, tva: 0 };
      if (l.compte.startsWith("7")) p.ht += l.credit - l.debit;
      else if (l.compte.startsWith("445")) p.tva += l.credit - l.debit;
      pieces.set(cle, p);
    }
    for (const p of pieces.values()) {
      if (p.ht === 0 && p.tva === 0) continue;
      const t = tauxDePiece(p.ht, p.tva);
      if (t === null) { tauxMixte.base += p.ht; tauxMixte.tva += p.tva; tauxMixte.pieces++; }
      else ajouter(cumul, t, p.ht, p.tva);
    }
  }

  // ── Mois de l'application ───────────────────────────────────────────
  const parId = new Map(params.payments.map((p) => [p.id, p]));
  if (params.base === "factures") {
    for (const p of params.payments) {
      if (p.status && STATUTS_NON_FACTURES.has(p.status)) continue;
      const m = moisParis(p.date?.seconds);
      if (!m || !moisApplication.has(m)) continue;
      // Base factures : le HT et la TVA des lignes, comme l'encart du trimestre.
      for (const l of p.items || []) {
        const ht = cts(l.priceHT), ttc = cts(l.priceTTC);
        if (!ht && !ttc) continue;
        ajouter(cumul, tauxTva(l.tva), ht, ttc - ht);
      }
    }
  } else {
    for (const e of params.encaissements) {
      const m = moisParis(e.date?.seconds);
      if (!m || !moisApplication.has(m)) continue;
      const montant = cts(e.montant);
      if (montant === 0) continue;
      // Mouvements internes : de l'argent déplacé, pas une recette.
      if (e.isVersementBanque || e.isApportCaisse) continue;
      // Règlement par avoir : la somme a déjà été encaissée, sa TVA comptée à ce moment-là.
      if (e.mode === "avoir") { ecarter("Réglés avec un avoir (TVA déjà comptée à l'encaissement d'origine)", montant); continue; }
      const p = e.paymentId ? parId.get(e.paymentId) : undefined;
      if (!p) { ecarter("Sans facture rattachée : taux inconnu, à ventiler à la main", montant); continue; }
      const moisFacture = moisParis(p.date?.seconds);
      if (moisFacture && tenusCeleris.has(moisFacture)) {
        ecarter("Factures de Céleris réglées ensuite (TVA déjà déclarée sur la facture)", montant);
        continue;
      }
      if (!repartir(p, montant, cumul)) ecarter("Facture sans lignes lisibles : taux inconnu, à ventiler à la main", montant);
    }
  }

  // ── Totaux et cases ─────────────────────────────────────────────────
  const parTaux = [...cumul.entries()]
    .map(([taux, v]) => ({ taux, base: eur(v.base), tva: eur(v.tva) }))
    .filter((v) => v.base !== 0 || v.tva !== 0)
    .sort((a, b) => b.taux - a.taux);
  const tauxMixteEur = { base: eur(tauxMixte.base), tva: eur(tauxMixte.tva), pieces: tauxMixte.pieces };
  const collectee = eur(parTaux.reduce((s, v) => s + cts(v.tva), 0) + cts(tauxMixteEur.tva));

  const moisSansAchats = params.mois.filter((m) => !params.deductible[m]);
  const somme = (k: "immobilisations" | "autresBiensServices") =>
    eur(params.mois.reduce((s, m) => s + cts(params.deductible[m]?.[k]), 0));
  const immobilisations = somme("immobilisations");
  const autresBiensServices = somme("autresBiensServices");
  const creditAnterieur = eur(cts(Math.max(0, params.creditAnterieur || 0)));
  const totalDeductible = eur(cts(immobilisations) + cts(autresBiensServices) + cts(creditAnterieur));
  const solde = cts(collectee) - cts(totalDeductible);

  const imposables = parTaux.filter((v) => v.taux > 0);
  const nonImposables = parTaux.filter((v) => v.taux === 0);
  const cases: CaseCa3[] = [
    { code: "A1", libelle: "Ventes, prestations de services (total HT imposable)", base: eur(imposables.reduce((s, v) => s + cts(v.base), 0) + cts(tauxMixteEur.base)) },
  ];
  const baseExoneree = eur(nonImposables.reduce((s, v) => s + cts(v.base), 0));
  if (baseExoneree !== 0) cases.push({ code: "E2", libelle: "Autres opérations non imposables (0 %) — à confirmer", base: baseExoneree });
  for (const v of imposables) {
    const c = CASE_PAR_TAUX[String(v.taux)];
    if (c) cases.push({ code: c.code, libelle: c.libelle, base: v.base, tva: v.tva });
    else {
      cases.push({ code: "?", libelle: `Taux ${String(v.taux).replace(".", ",")} % — case à confirmer`, base: v.base, tva: v.tva });
      anomalies.push(`Des ventes portent un taux de ${String(v.taux).replace(".", ",")} % : la case de la CA3 est à confirmer avec la comptable.`);
    }
  }
  if (tauxMixteEur.pieces) {
    cases.push({ code: "?", libelle: `Céleris, taux mêlés sur ${tauxMixteEur.pieces} pièce(s) — à répartir`, base: tauxMixteEur.base, tva: tauxMixteEur.tva });
    anomalies.push(`${tauxMixteEur.pieces} facture(s) Céleris mêlent plusieurs taux : leur TVA (${tauxMixteEur.tva.toFixed(2)} €) est comptée dans le total, mais sa répartition entre les cases 08, 9B et 09 est à faire.`);
  }
  cases.push(
    { code: "16", libelle: "Total de la TVA brute due", tva: collectee },
    { code: "19", libelle: "TVA déductible sur immobilisations", tva: immobilisations },
    { code: "20", libelle: "TVA déductible sur autres biens et services", tva: autresBiensServices },
  );
  if (creditAnterieur) cases.push({ code: "22", libelle: "Report du crédit de la déclaration précédente", tva: creditAnterieur });
  cases.push({ code: "23", libelle: "Total TVA déductible", tva: totalDeductible });
  if (solde < 0) cases.push({ code: "25", libelle: "Crédit de TVA (à reporter ligne 22 la prochaine fois)", tva: eur(-solde) });
  else cases.push({ code: "28", libelle: "TVA nette due", tva: eur(solde) });

  if (moisSansAchats.length) anomalies.push(`Achats illisibles pour ${moisSansAchats.join(", ")} : la TVA déductible est partielle.`);
  const aVerifier = params.mois.reduce((s, m) => ({ nb: s.nb + (params.deductible[m]?.aVerifier?.nb || 0), ttc: s.ttc + (params.deductible[m]?.aVerifier?.ttc || 0) }), { nb: 0, ttc: 0 });
  if (aVerifier.nb) anomalies.push(`${aVerifier.nb} dépense(s) (${aVerifier.ttc.toFixed(2)} € TTC) sans facture lisible : leur TVA n'est pas déduite tant que la pièce manque.`);
  if (sources.some((s) => s.source === "celeris") && params.base === "encaissements") {
    anomalies.push("Pour les mois tenus dans Céleris, seule la TVA des factures est connue : elle est reprise telle quelle.");
  }

  return {
    base: params.base,
    mois: params.mois,
    sources,
    parTaux,
    tauxMixte: tauxMixteEur,
    collectee,
    deductible: { immobilisations, autresBiensServices, creditAnterieur, total: totalDeductible },
    netteDue: solde > 0 ? eur(solde) : 0,
    credit: solde < 0 ? eur(-solde) : 0,
    cases,
    ecartes: [...ecartes.entries()].map(([raison, v]) => ({ raison, nb: v.nb, montant: eur(v.montant) })),
    anomalies,
    moisSansAchats,
  };
}

/** Montant à recopier sur la CA3 : euros entiers, sans centimes. */
export function euroDeclaration(n: number | undefined): number {
  return Math.round(n || 0);
}
