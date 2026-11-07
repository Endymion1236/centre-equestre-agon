/**
 * src/lib/superpdp-depenses.ts — une facture fournisseur reçue par la
 * plateforme agréée, vue comme elle arriverait dans Dépenses.
 *
 * Novembre 2026, essai Super PDP : avant de brancher la réception en réel,
 * vérifier que les données de la plateforme se raccordent aux règles des
 * dépenses — sans rien enregistrer (une facture fictive deviendrait une
 * pièce comptable). Mêmes règles que les pièces lues par l'IA : contrôles
 * (`alertesPiece`), compte du fournisseur (`compteFournisseur`), compte de
 * charge (`ventilerDepense`), débit du relevé (`proposerAssociations`).
 *
 * Pur, testé (tests/unit/superpdp-depenses.test.ts).
 */

import { alertesPiece, proposerAssociations, type DepenseCandidate, type PieceExtraite } from "./justificatifs";
import { compteFournisseur, ventilerDepense } from "./plan-comptable-achats";

const montant = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** La facture électronique (en_invoice de l'API) traduite en pièce, sans lecture de PDF. */
export function pieceDepuisPlateforme(en: any): PieceExtraite {
  const t = en?.totals || {};
  return {
    devise: String(en?.currency_code || "").toUpperCase(),
    typeDocument: "achat",
    fournisseur: String(en?.seller?.name || ""),
    numero: String(en?.number || ""),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(en?.issue_date || "")) ? String(en.issue_date) : "",
    debutPeriode: "", finPeriode: "",
    ht: montant(t.total_without_vat),
    tva: montant(t.total_vat_amount),
    ttc: montant(t.total_with_vat ?? t.amount_due_for_payment),
    ttcEscompte: null,
  };
}

export interface ApercuDepense {
  piece: PieceExtraite;
  alertes: string[];
  compteFournisseur: { compte: string; libelle: string; collectif: boolean };
  compteCharge: { compte: string; libelle: string; note?: string };
  debits: { id: string; fournisseur: string; montant: number; dateOperation?: string; raisons: string[] }[];
  dejaLa: boolean;
}

/** Ce que deviendrait cette facture dans Dépenses. `depenses` : débits du relevé des mois voisins. */
export function apercuDepense(en: any, depenses: DepenseCandidate[]): ApercuDepense {
  const piece = pieceDepuisPlateforme(en);
  const f = compteFournisseur(piece.fournisseur);
  const v = ventilerDepense({ fournisseur: piece.fournisseur });
  // Déjà rattachée : un débit porte déjà une pièce de même numéro.
  const dejaLa = !!piece.numero && depenses.some((d) => String(d.piece?.extraction?.numero || "") === piece.numero);
  return {
    piece,
    alertes: alertesPiece(piece),
    compteFournisseur: { compte: f.compte, libelle: f.libelle, collectif: !!f.collectif },
    compteCharge: { compte: v.compte, libelle: v.libelle || "", ...(v.note ? { note: v.note } : {}) },
    debits: proposerAssociations(piece, depenses).slice(0, 3)
      .map((p) => ({ id: p.id, fournisseur: p.fournisseur, montant: p.montant, dateOperation: p.dateOperation, raisons: p.raisons })),
    dejaLa,
  };
}
