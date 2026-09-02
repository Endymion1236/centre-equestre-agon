/**
 * src/app/admin/paiements/commande-verrou.ts
 *
 * Une commande peut-elle encore être modifiée ? Une seule règle, lue par
 * la modale de modification et par les deux onglets qui l'ouvrent.
 *
 * Deux verrous :
 *  - une facture définitive a été émise : son numéro est chronologique et
 *    inaltérable (CGI art. 242 nonies A, C. com. L123-14) ;
 *  - un règlement a déjà été encaissé, acompte compris : pour une prestation
 *    de services la TVA est exigible à l'encaissement et l'acompte donne lieu
 *    à facture (CGI art. 289). Le montant reçu fait déjà partie d'un document
 *    comptable, la correction passe par un avoir.
 *
 * Jusqu'en septembre 2026 seul le premier verrou existait : une commande de
 * stage dont l'acompte était réglé restait modifiable.
 */

export type MotifVerrou = "facture" | "encaissement";

export interface VerrouCommande {
  verrouillee: boolean;
  motif: MotifVerrou | null;
  /** Une ligne, pour un bandeau ou un toast. */
  titre: string;
  /** Le pourquoi et la marche à suivre. */
  explication: string;
}

const AUCUN: VerrouCommande = { verrouillee: false, motif: null, titre: "", explication: "" };

export function verrouCommande(payment: {
  invoiceNumber?: string | null;
  paidAmount?: number | null;
} | null | undefined): VerrouCommande {
  if (!payment) return AUCUN;
  if (payment.invoiceNumber) {
    return {
      verrouillee: true,
      motif: "facture",
      titre: `Modification impossible — facture ${payment.invoiceNumber} émise`,
      explication:
        "Cette commande a déjà fait l'objet d'une facture définitive numérotée. " +
        "Pour des raisons de conformité comptable (article L123-14 du Code de commerce), " +
        "une facture émise ne peut pas être modifiée. Pour corriger le montant : " +
        "annulez la facture via un avoir, puis créez une nouvelle commande avec le bon montant.",
    };
  }
  const paye = Math.round((Number(payment.paidAmount) || 0) * 100) / 100;
  if (paye > 0) {
    return {
      verrouillee: true,
      motif: "encaissement",
      titre: `Modification impossible — ${paye.toFixed(2)} € déjà encaissés`,
      explication:
        "Un règlement a déjà été reçu sur cette commande (acompte ou paiement partiel). " +
        "La TVA est exigible dès l'encaissement et le montant reçu figure déjà au journal : " +
        "une commande encaissée ne se modifie plus. Pour corriger : émettez un avoir " +
        "sur cette commande, puis créez une nouvelle commande avec le bon montant.",
    };
  }
  return AUCUN;
}
