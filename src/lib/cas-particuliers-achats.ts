/**
 * src/lib/cas-particuliers-achats.ts — les achats du mois qui sortent de
 * l'ordinaire, expliqués pour la comptable dans le colis mensuel.
 *
 * Novembre 2026, demande de Nicolas (comptabilité supervisée) : paiement en
 * plusieurs fois, escompte, devise étrangère… restaient « à vérifier » dans
 * le CSV TVA sans explication. Chaque cas reçoit ici une ligne : ce qui
 * s'est passé, la TVA proposée, ce que le cabinet doit trancher. Aucune
 * écriture n'est modifiée : c'est de l'information jointe au FEC.
 *
 * Pur, testé (tests/unit/cas-particuliers-achats.test.ts).
 */
import { dansPerimetre, tvaExclueParNature, type LigneMois } from "./bilan-justificatifs";

export type TypeCas = "fractionne" | "partiel" | "escompte" | "devise" | "superieur" | "groupe" | "meme-facture";

export const LIBELLE_CAS: Record<TypeCas, string> = {
  fractionne: "Paiement en plusieurs fois",
  partiel: "Paiement partiel ou acompte",
  escompte: "Escompte ou écart de règlement",
  devise: "Facture en devise étrangère",
  superieur: "Paiement supérieur à la facture",
  groupe: "Plusieurs factures, un seul débit",
  "meme-facture": "Même facture sur plusieurs débits",
};

export interface CasParticulier {
  type: TypeCas;
  date: string;
  fournisseur: string;
  facture: string;
  dateFacture: string;
  ttcFacture: number | null;
  tvaFacture: number | null;
  montantDebite: number;
  detail: string;
  /** TVA que l'on propose de déduire pour ce débit (null = au cabinet de dire). */
  tvaProposee: number | null;
  aTrancher: string;
}

const c = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `${c(n).toFixed(2).replace(".", ",")} €`;
const dateFr = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Les cas particuliers du mois, dans l'ordre des débits. */
export function casParticuliersAchats(lignes: LigneMois[]): CasParticulier[] {
  const parPiece = new Map<string, LigneMois[]>();
  for (const l of lignes) if (l.piece?.id && dansPerimetre(l)) parPiece.set(l.piece.id, [...(parPiece.get(l.piece.id) || []), l]);

  const out: CasParticulier[] = [];
  const tries = [...lignes].filter(dansPerimetre).sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || ""));
  for (const l of tries) {
    const p = l.piece;
    if (!p || p.retire || l.avanceFfe) continue;
    const e = p.extraction || {};
    const ttc = num(e.ttc), tva = num(e.tva);
    const base = {
      date: dateFr(l.dateOperation), fournisseur: l.fournisseur || "", facture: String(e.numero || ""), dateFacture: dateFr(e.date),
      ttcFacture: ttc, tvaFacture: tva, montantDebite: c(l.montant || 0),
    };
    const exclue = l.statutTVA === "sans-tva" || l.statutTVA === "non-recuperee" || tvaExclueParNature(l);
    const prorata = (part: number) => (!exclue && tva && ttc && ttc > 0 ? c((tva * part) / ttc) : null);
    const enEuros = !e.devise || e.devise === "EUR";

    // Devise étrangère : montant facturé, débité en euros, taux appliqué.
    if (p.associationDevise || !enEuros) {
      const d = p.associationDevise;
      const devise = d?.deviseFacture || e.devise || "?";
      const facture = d?.montantFacture ?? ttc;
      const debite = d?.montantDebiteEUR ?? l.montant;
      const taux = facture && facture > 0 ? debite / facture : null;
      out.push({ ...base, type: "devise",
        detail: `Facturé ${facture != null ? `${c(facture).toFixed(2).replace(".", ",")} ${devise}` : `en ${devise}`}, débité ${eur(debite)}${taux ? ` (1 ${devise} = ${taux.toFixed(4).replace(".", ",")} €, frais bancaires compris)` : ""}. Achat passé pour le montant débité en euros.`,
        tvaProposee: null, aTrancher: "Fournisseur étranger : pas de TVA française déduite. Autoliquidation éventuelle (services d'un prestataire hors de France) à apprécier." });
      continue;
    }
    // Plusieurs factures réglées par un seul débit.
    if ((l.piecesGroupe?.length || 0) > 1) {
      const ttcs = l.piecesGroupe!.map((g) => num(g.extraction?.ttc) || 0);
      const tvas = l.piecesGroupe!.map((g) => num(g.extraction?.tva) || 0);
      out.push({ ...base, type: "groupe", ttcFacture: c(ttcs.reduce((s, x) => s + x, 0)), tvaFacture: c(tvas.reduce((s, x) => s + x, 0)),
        facture: l.piecesGroupe!.map((g) => g.extraction?.numero || "?").join(" + "),
        detail: `${l.piecesGroupe!.length} factures soldées par ce débit (${ttcs.map(eur).join(" + ")}).`,
        tvaProposee: exclue ? null : c(tvas.reduce((s, x) => s + x, 0)), aTrancher: "Une écriture d'achat par facture, toutes lettrées sur ce règlement." });
      continue;
    }
    // Paiement en plusieurs fois (échéances rattachées à la même facture).
    const memes = parPiece.get(p.id || "") || [l];
    const associes = p.paiementsAssocies || [];
    if (p.modeRattachement === "echeance" || associes.length > 0) {
      const paye = associes.length ? c(associes.reduce((s, a) => s + (a.montant || 0), 0)) : c(memes.reduce((s, x) => s + (x.montant || 0), 0));
      const reste = ttc != null ? c(ttc - paye) : null;
      out.push({ ...base, type: "fractionne",
        detail: `Facture de ${ttc != null ? eur(ttc) : "?"} réglée en ${Math.max(associes.length, memes.length)} fois : ${eur(l.montant)} ce jour, ${eur(paye)} réglés au total${reste != null ? `, reste dû ${eur(Math.max(0, reste))}` : ""}.`,
        tvaProposee: prorata(l.montant || 0),
        aTrancher: "Facture à passer une seule fois en achat, règlements lettrés. Prestation de services : TVA déductible au fur et à mesure des paiements (montant proposé = au prorata de ce paiement)." });
      continue;
    }
    // Même facture rattachée à plusieurs débits sans échéancier : doublon probable.
    if (memes.length > 1) {
      out.push({ ...base, type: "meme-facture",
        detail: `Cette facture est rattachée à ${memes.length} débits du mois (${memes.map((x) => `${dateFr(x.dateOperation) || "?"} : ${eur(x.montant)}`).join(", ")}).`,
        tvaProposee: null, aTrancher: "Débit importé deux fois, ou une facture différente à joindre à l'un des débits : TVA comptée une seule fois." });
      continue;
    }
    // Escompte ou écart de règlement connu.
    if (p.associationEcart) {
      const a = p.associationEcart;
      out.push({ ...base, type: "escompte",
        detail: `${a.type || "Écart"} de ${String(c(a.taux)).replace(".", ",")} % (${eur(a.montant)}) : facture ${ttc != null ? eur(ttc) : "?"}, payé ${eur(l.montant)}.`,
        tvaProposee: prorata(l.montant || 0),
        aTrancher: "TVA ramenée à la part réellement payée (montant proposé), sauf si la facture indique déjà la TVA après escompte." });
      continue;
    }
    if (ttc != null && ttc > 0) {
      const ecart = Math.round(l.montant * 100) - Math.round(ttc * 100);
      if (ecart < 0) {
        out.push({ ...base, type: "partiel",
          detail: `Payé ${eur(l.montant)} sur une facture de ${eur(ttc)} (${eur(-ecart / 100)} non réglés ce mois).`,
          tvaProposee: prorata(l.montant || 0), aTrancher: "Acompte, paiement partiel ou escompte non indiqué : TVA proposée au prorata du paiement." });
      } else if (ecart > 0) {
        out.push({ ...base, type: "superieur",
          detail: `Payé ${eur(l.montant)} pour une facture de ${eur(ttc)} : ${eur(ecart / 100)} de plus.`,
          tvaProposee: exclue || !tva ? null : c(tva), aTrancher: "Le surplus règle une facture antérieure, à réclamer au fournisseur (laissé au débit de son compte dans le FEC)." });
      }
    }
  }
  return out;
}

/** CSV joint au colis : une ligne par cas. */
export function construireExportCasParticuliers(cas: CasParticulier[]): string {
  const champ = (v: unknown) => { const t = v == null ? "" : String(v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const n = (v: number | null) => (v == null ? "" : v.toFixed(2));
  const tete = ["Date du débit", "Fournisseur", "Cas", "N° facture", "Date facture", "TTC facture", "TVA facture", "Montant débité", "Ce qui s'est passé", "TVA proposée", "À trancher par le cabinet"];
  return [tete.join(";"), ...cas.map((x) => [x.date, x.fournisseur, LIBELLE_CAS[x.type], x.facture, x.dateFacture, n(x.ttcFacture), n(x.tvaFacture), n(x.montantDebite), x.detail, n(x.tvaProposee), x.aTrancher].map(champ).join(";"))].join("\n") + "\n";
}

/** Une ligne courte par cas, pour le corps de l'email. */
export const phraseCas = (x: CasParticulier) =>
  `${x.date ? `${x.date} — ` : ""}${x.fournisseur}${x.facture ? ` (facture ${x.facture})` : ""} : ${LIBELLE_CAS[x.type].toLowerCase()}. ${x.detail}${x.tvaProposee != null ? ` TVA proposée : ${eur(x.tvaProposee)}.` : ""}`;
