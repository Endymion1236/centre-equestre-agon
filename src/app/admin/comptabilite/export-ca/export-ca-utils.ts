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

export function aplatirLignesFactures<T extends Record<string, any>>(factures: T[]) {
  return factures.flatMap((facture) =>
    (facture.items || []).map((item: any) => ({ ...item, facture })),
  );
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
