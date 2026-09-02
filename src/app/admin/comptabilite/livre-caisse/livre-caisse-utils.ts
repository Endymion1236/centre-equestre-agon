export function arrondirLivreCaisse(valeur: number): number {
  const arrondi = Math.round(valeur * 100) / 100;
  return Object.is(arrondi, -0) ? 0 : arrondi;
}

export function extrairePeriodeLivreCaisse<T extends { date: Date; montant: number }>(
  mouvements: T[],
  annee: number,
  mois: number,
) {
  const debutMois = new Date(annee, mois, 1, 0, 0, 0, 0);
  const debutMoisSuivant = new Date(annee, mois + 1, 1, 0, 0, 0, 0);

  const mouvementsDuMois = mouvements
    .filter((mouvement) => mouvement.date >= debutMois && mouvement.date < debutMoisSuivant)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const soldeInitial = arrondirLivreCaisse(
    mouvements
      .filter((mouvement) => mouvement.date < debutMois)
      .reduce((total, mouvement) => total + Number(mouvement.montant || 0), 0),
  );

  return { mouvementsDuMois, soldeInitial };
}

export function totaliserMontantsLivreCaisse(
  mouvements: Array<{ montant: number }>,
): number {
  return arrondirLivreCaisse(
    mouvements.reduce((total, mouvement) => total + Number(mouvement.montant || 0), 0),
  );
}

export function calculerSyntheseLivreCaisse<T extends { montant: number }>(
  mouvements: T[],
  soldeInitial: number,
) {
  let solde = arrondirLivreCaisse(soldeInitial);

  const lignes = mouvements.map((mouvement) => {
    solde = arrondirLivreCaisse(solde + Number(mouvement.montant || 0));
    return { ...mouvement, soldeApres: solde };
  });

  const totalEntrees = arrondirLivreCaisse(
    mouvements
      .filter((mouvement) => mouvement.montant > 0)
      .reduce((total, mouvement) => total + Number(mouvement.montant || 0), 0),
  );
  const totalSorties = arrondirLivreCaisse(
    mouvements
      .filter((mouvement) => mouvement.montant < 0)
      .reduce((total, mouvement) => total + Math.abs(Number(mouvement.montant || 0)), 0),
  );
  const soldeFinal = lignes.length > 0 ? lignes[lignes.length - 1].soldeApres : solde;

  return { lignes, totalEntrees, totalSorties, soldeFinal };
}
