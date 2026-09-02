/**
 * Prépare les lignes de règlement affichées sur une facture.
 *
 * Le cumul `paidAmount` indique combien a été encaissé. Il ne décrit pas
 * comment : cette information vient exclusivement du journal des
 * encaissements. La fonction reste pure pour verrouiller ce comportement par
 * un test sans dépendre du rendu PDF.
 */

export interface DetailReglementFacture {
  mode?: string;
  modeLabel?: string;
  montant: number;
  date?: string;
  ref?: string;
}

export interface AffichageReglementsFacture {
  titre?: string;
  lignes: string[];
}

export function construireAffichageReglementsFacture(params: {
  paidAmount: number;
  paymentMode?: string;
  paymentDate?: string;
  paymentDetails?: DetailReglementFacture[];
}): AffichageReglementsFacture {
  const paidAmount = Number(params.paidAmount || 0);
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) return { lignes: [] };

  const details = Array.isArray(params.paymentDetails)
    ? params.paymentDetails.filter((detail) => {
        const montant = Number(detail?.montant);
        return Number.isFinite(montant) && montant > 0;
      })
    : [];

  if (details.length > 0) {
    return {
      titre: "Détail des règlements encaissés :",
      lignes: details.map((detail) => {
        const mode = String(detail.modeLabel || detail.mode || "Mode non renseigné");
        const montant = Number(detail.montant).toFixed(2);
        const complements = [
          detail.date ? `le ${detail.date}` : "",
          detail.ref ? `réf. ${detail.ref}` : "",
        ].filter(Boolean);
        return `• ${mode} : ${montant} €${complements.length ? ` · ${complements.join(" · ")}` : ""}`;
      }),
    };
  }

  // Compatibilité avec les anciens paiements qui n'ont pas encore d'écriture
  // détaillée dans le journal.
  if (params.paymentMode) {
    return {
      lignes: [
        `Mode de règlement : ${params.paymentMode}${params.paymentDate ? ` · le ${params.paymentDate}` : ""}`,
      ],
    };
  }

  return { lignes: [] };
}
