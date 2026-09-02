export type PlanPaiement = "1x" | "3x" | "10x";

export interface ItemEcheance {
  priceTTC?: number;
  amount?: number;
  priceHT?: number;
  tva?: number;
  tvaTaux?: number;
  activityTitle?: string;
  label?: string;
  [key: string]: unknown;
}

export interface EcheanceConstruite {
  echeance: number;
  echeancesTotal: number;
  echeanceDate: string;
  totalTTC: number;
  items: ItemEcheance[];
}

export function nombreEcheances(plan?: string): 1 | 3 | 10 {
  return plan === "10x" ? 10 : plan === "3x" ? 3 : 1;
}

function enCentimes(montant: number): number {
  return Math.max(0, Math.round((Number(montant) || 0) * 100));
}

function repartirEntier(total: number, poids: number[]): number[] {
  if (poids.length === 0) return [];
  const positifs = poids.map((poidsItem) => Math.max(0, poidsItem));
  const somme = positifs.reduce((sommePoids, poidsItem) => sommePoids + poidsItem, 0);
  const poidsEffectifs = somme > 0 ? positifs : positifs.map(() => 1);
  const sommeEffective = poidsEffectifs.reduce((s, poidsItem) => s + poidsItem, 0);
  const bruts = poidsEffectifs.map((poidsItem) => total * poidsItem / sommeEffective);
  const parts = bruts.map(Math.floor);
  let reste = total - parts.reduce((s, part) => s + part, 0);
  const ordre = bruts
    .map((brut, index) => ({ index, fraction: brut - Math.floor(brut) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < reste; i++) parts[ordre[i % ordre.length].index]++;
  return parts;
}

export function datesEcheances(dateDepart: string, nombre: number): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateDepart);
  if (!match) throw new Error("Date de départ d'échéancier invalide");
  const annee = Number(match[1]);
  const mois = Number(match[2]) - 1;
  const jour = Number(match[3]);

  return Array.from({ length: nombre }, (_, index) => {
    const premier = new Date(annee, mois + index, 1, 12, 0, 0);
    const dernierJour = new Date(
      premier.getFullYear(),
      premier.getMonth() + 1,
      0,
      12,
      0,
      0,
    ).getDate();
    const date = new Date(
      premier.getFullYear(),
      premier.getMonth(),
      Math.min(jour, dernierJour),
      12,
      0,
      0,
    );
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  });
}

export function construireEcheancier(params: {
  totalTTC: number;
  items: ItemEcheance[];
  paymentPlan?: string;
  dateDepart: string;
}): EcheanceConstruite[] {
  const nombre = nombreEcheances(params.paymentPlan);
  const totalCentimes = enCentimes(params.totalTTC);
  const itemsSource = params.items.length > 0
    ? params.items
    : [{ activityTitle: "Inscription annuelle", priceTTC: params.totalTTC }];

  // Recaler d'abord les lignes sur le total de la commande : certains anciens
  // paiements contiennent un arrondi d'un centime entre items et totalTTC.
  const ciblesItems = repartirEntier(
    totalCentimes,
    itemsSource.map((item) => enCentimes(Number(item.priceTTC ?? item.amount ?? 0))),
  );
  const ciblesEcheances = repartirEntier(totalCentimes, Array.from({ length: nombre }, () => 1));
  const restantsItems = [...ciblesItems];
  const allocations: number[][] = [];

  for (let index = 0; index < nombre; index++) {
    const parts = index === nombre - 1
      ? [...restantsItems]
      : repartirEntier(ciblesEcheances[index], restantsItems);
    allocations.push(parts);
    for (let itemIndex = 0; itemIndex < restantsItems.length; itemIndex++) {
      restantsItems[itemIndex] -= parts[itemIndex];
    }
  }

  const dates = datesEcheances(params.dateDepart, nombre);
  return allocations.map((parts, index) => {
    const items = itemsSource.map((item, itemIndex) => {
      const montant = parts[itemIndex] / 100;
      const taux = Number(item.tva ?? item.tvaTaux ?? 5.5);
      const suffixe = nombre > 1 ? ` — échéance ${index + 1}/${nombre}` : "";
      return {
        ...item,
        activityTitle: `${String(item.activityTitle || item.label || "Inscription annuelle")}${suffixe}`,
        label: `${String(item.label || item.activityTitle || "Inscription annuelle")}${suffixe}`,
        priceTTC: montant,
        amount: montant,
        priceHT: Math.round((montant / (1 + taux / 100)) * 100) / 100,
      };
    }).filter((item) => Number(item.priceTTC) > 0);

    return {
      echeance: index + 1,
      echeancesTotal: nombre,
      echeanceDate: dates[index],
      totalTTC: parts.reduce((s, part) => s + part, 0) / 100,
      items,
    };
  });
}
