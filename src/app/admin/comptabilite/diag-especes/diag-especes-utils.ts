export interface EncaissementDiagnostic {
  id: string;
  montant: number;
  remiseId?: string;
  isAvoir?: boolean;
  correctionDe?: string;
}

export interface RemiseDiagnostic {
  id: string;
  total?: number;
  paymentMode?: string;
  encaissementIds?: string[];
  status?: string;
}

export function arrondirDiagnostic(valeur: number): number {
  const arrondi = Math.round(valeur * 100) / 100;
  return Object.is(arrondi, -0) ? 0 : arrondi;
}

export function calculerDiagnosticEspeces<
  E extends EncaissementDiagnostic,
  R extends RemiseDiagnostic,
>(encaissements: E[], remises: R[]) {
  const totalBrut = arrondirDiagnostic(
    encaissements.reduce((total, encaissement) => total + Number(encaissement.montant || 0), 0),
  );
  const totalPositif = arrondirDiagnostic(
    encaissements
      .filter((encaissement) => encaissement.montant > 0)
      .reduce((total, encaissement) => total + encaissement.montant, 0),
  );
  const totalNegatif = arrondirDiagnostic(
    encaissements
      .filter((encaissement) => encaissement.montant < 0)
      .reduce((total, encaissement) => total + encaissement.montant, 0),
  );

  const avecRemise = encaissements.filter((encaissement) => Boolean(encaissement.remiseId));
  const sansRemise = encaissements.filter((encaissement) => !encaissement.remiseId);
  const totalRemis = arrondirDiagnostic(
    avecRemise.reduce((total, encaissement) => total + encaissement.montant, 0),
  );
  const totalSansRemise = arrondirDiagnostic(
    sansRemise.reduce((total, encaissement) => total + encaissement.montant, 0),
  );

  const encaissementIds = new Set(encaissements.map((encaissement) => encaissement.id));
  const remisesEspeces = remises.filter((remise) =>
    (remise.encaissementIds || []).some((id) => encaissementIds.has(id)) ||
    remise.paymentMode === "especes"
  );
  const remisIds = new Set(remisesEspeces.flatMap((remise) => remise.encaissementIds || []));
  const encaissementsVusDansRemises = encaissements.filter((encaissement) => remisIds.has(encaissement.id));
  const incoherencesRemiseId = encaissementsVusDansRemises.filter(
    (encaissement) => !encaissement.remiseId,
  );

  return {
    totalBrut,
    totalPositif,
    totalNegatif,
    avecRemise,
    sansRemise,
    totalRemis,
    totalSansRemise,
    remisesEspeces,
    encaissementsVusDansRemises,
    incoherencesRemiseId,
  };
}
