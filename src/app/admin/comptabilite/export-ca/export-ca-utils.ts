import { ecartLignes, lignesAuTotal } from "@/lib/lignes-facture";

export const MOIS_EXPORT_CA = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

export function dateFacture(payment: any): Date | null {
  const date = payment?.date?.seconds
    ? new Date(payment.date.seconds * 1000)
    : payment?.date
      ? new Date(payment.date)
      : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function filtrerFacturesExport(
  payments: any[],
  annee: number,
  mois: number | "all",
  inclureNonReglees: boolean,
) {
  return payments.filter((payment) => {
    if (payment?.status === "cancelled") return false;
    if (!inclureNonReglees && Number(payment?.paidAmount || 0) <= 0) return false;
    const date = dateFacture(payment);
    if (!date || date.getFullYear() !== annee) return false;
    return mois === "all" || date.getMonth() === mois;
  });
}

/**
 * Les lignes de toutes les factures, ramenées au total de leur facture
 * (lib/lignes-facture) : sans cela, la 1re échéance d'un forfait en 3× ou
 * 10× portait le forfait entier et le CA ventilé dépassait les factures.
 */
export function aplatirLignesFactures<T extends Record<string, any>>(factures: T[]) {
  return factures.flatMap((facture) =>
    lignesAuTotal(facture).map((item: any) => ({ ...item, facture })),
  );
}

export interface FactureEnEcart {
  id: string;
  piece: string;
  familyName: string;
  date: Date | null;
  totalTTC: number;
  lignesTTC: number;
  ecart: number;
  cause: string;
}

/**
 * Factures dont les lignes, telles que saisies, ne retombent pas sur le
 * total — la plus grosse différence d'abord. L'export les ramène au total ;
 * la liste dit lesquelles, et pourquoi le plus souvent.
 */
export function facturesEnEcart(factures: any[]): FactureEnEcart[] {
  return factures
    .map((f): FactureEnEcart => {
      const ecart = arrondirExportCa(ecartLignes(f));
      const total = Number(f?.totalTTC) || 0;
      const lignesTTC = arrondirExportCa(total - ecart);
      const enPlusieursFois = Number(f?.echeancesTotal) > 1;
      const cause = enPlusieursFois && Number(f?.echeance) === 1 && ecart < 0
        ? `1re échéance d'un paiement en ${f.echeancesTotal} fois : porte les lignes du forfait entier`
        : lignesTTC === 0 && total !== 0
        ? "Lignes sans prix lisible (ancienne inscription en ligne, ou saisie incomplète)"
        : ecart > 0
        ? "Lignes inférieures au total (ligne sans prix, ou ajout sur la facture)"
        : "Remise posée sur la facture entière, ou ligne modifiée après coup";
      return {
        id: f?.id || "",
        piece: f?.invoiceNumber || `PF-${String(f?.orderId || f?.id || "").slice(-6).toUpperCase()}`,
        familyName: f?.familyName || "",
        date: dateFacture(f),
        totalTTC: arrondirExportCa(total),
        lignesTTC,
        ecart,
        cause,
      };
    })
    .filter((f) => Math.abs(f.ecart) > 0.009)
    .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
}

export function arrondirExportCa(valeur: number): number {
  const arrondi = Math.round(valeur * 100) / 100;
  return Object.is(arrondi, -0) ? 0 : arrondi;
}

export function resumerExportCa(
  factures: any[],
  ventilation: Array<{ compte: string; ttc: number; ht: number }>,
  nonVentileCode: string,
) {
  const totalTTC = arrondirExportCa(ventilation.reduce((total, ligne) => total + Number(ligne.ttc || 0), 0));
  const totalHT = arrondirExportCa(ventilation.reduce((total, ligne) => total + Number(ligne.ht || 0), 0));
  const nonVentile = ventilation.filter((ligne) => ligne.compte === nonVentileCode);
  const totalNonVentile = arrondirExportCa(nonVentile.reduce((total, ligne) => total + Number(ligne.ttc || 0), 0));
  const totalFactures = arrondirExportCa(
    factures.reduce((total, facture) => total + Number(facture?.totalTTC || 0), 0),
  );
  const ecart = arrondirExportCa(totalFactures - totalTTC);
  return { totalTTC, totalHT, nonVentile, totalNonVentile, totalFactures, ecart };
}

export function libellePeriodeExport(annee: number, mois: number | "all") {
  return mois === "all" ? `${annee}` : `${MOIS_EXPORT_CA[mois]} ${annee}`;
}

export function suffixeFichierExport(annee: number, mois: number | "all") {
  return mois === "all" ? `${annee}` : `${annee}-${String(mois + 1).padStart(2, "0")}`;
}
