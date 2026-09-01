import type { ChequeDiffere, ChequeDiffereFilter } from "./types";

export interface ChequesDifferesStats {
  pendingCheques: ChequeDiffere[];
  overdueCheques: ChequeDiffere[];
  totalPending: number;
  totalOverdue: number;
  totalDeposited: number;
}

export function dateIsoDuJour(date = new Date()): string {
  return date.toISOString().split("T")[0];
}

export function correspondRechercheCheque(cheque: ChequeDiffere, recherche: string): boolean {
  const q = recherche.trim().toLowerCase();
  if (!q) return true;
  return (
    (cheque.familyName || "").toLowerCase().includes(q) ||
    (cheque.numero || "").toLowerCase().includes(q) ||
    (cheque.banque || "").toLowerCase().includes(q)
  );
}

export function filtrerChequesDifferes(
  cheques: ChequeDiffere[],
  filtre: ChequeDiffereFilter,
  recherche: string,
  today: string,
): ChequeDiffere[] {
  return cheques
    .filter((cheque) => {
      if (filtre === "pending" && cheque.status !== "pending") return false;
      if (filtre === "overdue" && !(cheque.status === "pending" && cheque.dateEncaissementPrevue < today)) return false;
      if (filtre === "deposited" && cheque.status !== "deposited") return false;
      return correspondRechercheCheque(cheque, recherche);
    })
    .sort((a, b) => a.dateEncaissementPrevue.localeCompare(b.dateEncaissementPrevue));
}

export function calculerStatsChequesDifferes(
  cheques: ChequeDiffere[],
  today: string,
): ChequesDifferesStats {
  const pendingCheques = cheques.filter((cheque) => cheque.status === "pending");
  const overdueCheques = pendingCheques.filter((cheque) => cheque.dateEncaissementPrevue < today);

  return {
    pendingCheques,
    overdueCheques,
    totalPending: pendingCheques.reduce((somme, cheque) => somme + (cheque.montant || 0), 0),
    totalOverdue: overdueCheques.reduce((somme, cheque) => somme + (cheque.montant || 0), 0),
    totalDeposited: cheques
      .filter((cheque) => cheque.status === "deposited")
      .reduce((somme, cheque) => somme + (cheque.montant || 0), 0),
  };
}

export function grouperChequesEnAttenteParMois(
  cheques: ChequeDiffere[],
): Record<string, ChequeDiffere[]> {
  return cheques.reduce<Record<string, ChequeDiffere[]>>((groupes, cheque) => {
    if (cheque.status !== "pending") return groupes;
    const mois = cheque.dateEncaissementPrevue.slice(0, 7);
    if (!groupes[mois]) groupes[mois] = [];
    groupes[mois].push(cheque);
    return groupes;
  }, {});
}

export function libelleMoisFr(mois: string): string {
  const [annee, numeroMois] = mois.split("-");
  const date = new Date(Number.parseInt(annee, 10), Number.parseInt(numeroMois, 10) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
