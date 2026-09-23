import { prelevementPlanifie, resteHorsSepa } from "@/lib/sepa-remise";
import { estBalade } from "@/lib/cgv-clauses";
import { estCommandeInscriptionAnnuelle } from "@/lib/inscription-annuelle-paiement";
export type ImpayeTypeFilter = "all" | "invoice" | "echeance";

/** Ce que la commande vend : de quoi trier les impayés par activité. */
export type NatureImpaye = "stage" | "balade" | "seance" | "forfait" | "autre";

export const NATURES_IMPAYES: { id: NatureImpaye; label: string; emoji: string }[] = [
  { id: "stage", label: "Stages", emoji: "🏕️" },
  { id: "balade", label: "Promenades", emoji: "🌲" },
  { id: "seance", label: "Séances", emoji: "🐴" },
  { id: "forfait", label: "Forfaits annuels", emoji: "📅" },
  { id: "autre", label: "Autres", emoji: "📎" },
];

export interface ImpayeFilters {
  familyFilter?: string;
  typeFilter?: ImpayeTypeFilter;
  natureFilter?: NatureImpaye | "all";
  /** « Rien réglé » : ne garder que les commandes sans le moindre encaissement. */
  rienRegle?: boolean;
  search?: string;
}

/** Aucun centime encaissé sur la commande — ni acompte, ni règlement partiel. */
export function rienRegle(payment: any): boolean {
  return Number(payment?.paidAmount || 0) < 0.005;
}

const TYPES_STAGE = new Set(["stage", "stage_journee"]);
const TYPES_SEANCE = new Set(["cours", "cours_collectif", "cours_particulier", "competition"]);

/**
 * La nature d'une commande, lue sur ses lignes. Le type d'activité est la
 * référence ; le libellé sert de repli pour les commandes anciennes ou saisies
 * au bureau, qui n'en portent pas toujours. Un forfait annuel prime : il
 * contient souvent une ligne « cours » qui ne doit pas le faire passer pour
 * une séance.
 */
export function natureCommande(payment: any): NatureImpaye {
  if (estCommandeInscriptionAnnuelle(payment)) return "forfait";
  const items: any[] = Array.isArray(payment?.items) ? payment.items : [];
  const type = (item: any) => String(item?.activityType || "").toLowerCase();
  if (payment?.type === "stage"
    || items.some((item) => TYPES_STAGE.has(type(item))
      || (Array.isArray(item?.stageDates) && item.stageDates.length > 0)
      || /\bstage\b/i.test(String(item?.activityTitle || "")))) {
    return "stage";
  }
  if (items.some((item) => estBalade(item))) return "balade";
  if (items.some((item) => TYPES_SEANCE.has(type(item))
    || item?.creneauId
    || (Array.isArray(item?.creneauIds) && item.creneauIds.length > 0)
    || item?.date)) {
    return "seance";
  }
  return "autre";
}

export function compterParNature(unpaid: any[]): Record<NatureImpaye, number> {
  const compte: Record<NatureImpaye, number> = { stage: 0, balade: 0, seance: 0, forfait: 0, autre: 0 };
  for (const payment of unpaid) compte[natureCommande(payment)]++;
  return compte;
}

export interface ImpayeGroup {
  key: string;
  label: string;
  eventDate: string;
  payments: any[];
  isOrphan: boolean;
}

export interface MultiEncaissementFamille {
  familyId: string;
  name: string;
  pays: any[];
  total: number;
}

/** Réglé par prélèvement, organisé ou non. Pour l'affichage ; les règles de suivi passent par `prelevementPlanifie`. */
export function estPaiementSepa(payment: any): boolean {
  return payment?.paymentMode === "prelevement_sepa" || payment?.status === "sepa_scheduled";
}

/** Facture annoncée en prélèvement, mais dont aucune échéance n'est encore posée. */
export function prelevementAPreparer(payment: any): boolean {
  return estPaiementSepa(payment) && !prelevementPlanifie(payment);
}

export function soldeRestant(payment: any): number {
  return Number(payment?.totalTTC || 0) - Number(payment?.paidAmount || 0);
}

/**
 * Ce qui est dû MAINTENANT, hors prélèvements déjà planifiés : une commande
 * réglée moitié en SEPA garde sa seconde moitié visible dans les impayés
 * (lib/sepa-remise). Le reste brut (`soldeRestant`) sert aux montants « à
 * venir », où la part SEPA compte bel et bien.
 */
export function duMaintenant(payment: any): number {
  return resteHorsSepa(payment);
}

export function listerImpayes(payments: any[], today: string): any[] {
  return payments.filter((payment) => {
    if (payment?.status === "cancelled" || payment?.status === "paid") return false;
    if (duMaintenant(payment) <= 0.005) return false;
    // Commande dont le prélèvement est ORGANISÉ : elle ne reste ici que pour
    // la part non couverte par l'échéancier (`sepaRestant`). Le seul mode de
    // paiement « SEPA », sans échéance posée — le cas d'une facture de
    // récurrence — ne fait plus disparaître ce qui est dû
    // (cf. prelevementPlanifie).
    if (prelevementPlanifie(payment) && typeof payment?.sepaRestant !== "number") return false;
    if (payment?.paymentMode === "cheque_differe") return false;
    if (Number(payment?.echeancesTotal || 0) > 1) {
      return Boolean(payment?.echeanceDate && payment.echeanceDate < today);
    }
    return true;
  });
}

export function filtrerImpayes(unpaid: any[], filters: ImpayeFilters): any[] {
  const typeFilter = filters.typeFilter || "all";
  const search = filters.search?.trim().toLowerCase() || "";

  return unpaid.filter((payment) => {
    if (filters.familyFilter && payment.familyId !== filters.familyFilter) return false;

    const isEcheance = Number(payment?.echeancesTotal || 0) > 1;
    if (typeFilter === "invoice" && isEcheance) return false;
    if (typeFilter === "echeance" && !isEcheance) return false;

    if (filters.natureFilter && filters.natureFilter !== "all" && natureCommande(payment) !== filters.natureFilter) return false;
    if (filters.rienRegle && !rienRegle(payment)) return false;

    if (!search) return true;
    const inName = String(payment?.familyName || "").toLowerCase().includes(search);
    const inItems = (payment?.items || []).some((item: any) =>
      String(item?.activityTitle || "").toLowerCase().includes(search) ||
      String(item?.childName || "").toLowerCase().includes(search),
    );
    const inDate = payment?.date?.seconds
      ? new Date(payment.date.seconds * 1000).toLocaleDateString("fr-FR").toLowerCase().includes(search)
      : false;
    return inName || inItems || inDate;
  });
}

export function calculerResumeImpayes(unpaid: any[], filtered = unpaid) {
  return {
    totalDue: unpaid.reduce((total, payment) => total + duMaintenant(payment), 0),
    totalFiltre: filtered.reduce((total, payment) => total + duMaintenant(payment), 0),
    nbInvoice: unpaid.filter((payment) => Number(payment?.echeancesTotal || 0) <= 1).length,
    nbEcheance: unpaid.filter((payment) => Number(payment?.echeancesTotal || 0) > 1).length,
  };
}

export function grouperImpayesParEvenement(filtered: any[]): ImpayeGroup[] {
  const groupsMap = new Map<string, ImpayeGroup>();

  for (const payment of filtered) {
    const firstItem = (payment.items || []).find((item: any) => item.date);
    if (firstItem?.date) {
      const activityTitle = String(payment.items?.[0]?.activityTitle || "").trim();
      const key = `${firstItem.date}_${activityTitle}`;
      if (!groupsMap.has(key)) {
        const date = new Date(`${firstItem.date}T12:00:00`);
        const dateLabel = date.toLocaleDateString("fr-FR", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        });
        groupsMap.set(key, {
          key,
          label: `${activityTitle} · ${dateLabel}`,
          eventDate: firstItem.date,
          payments: [],
          isOrphan: false,
        });
      }
      groupsMap.get(key)!.payments.push(payment);
    } else {
      if (!groupsMap.has("_orphan_")) {
        groupsMap.set("_orphan_", {
          key: "_orphan_",
          label: "Autres factures",
          eventDate: "9999-99-99",
          payments: [],
          isOrphan: true,
        });
      }
      groupsMap.get("_orphan_")!.payments.push(payment);
    }
  }

  const groups = [...groupsMap.values()].sort((a, b) => {
    if (a.isOrphan !== b.isOrphan) return a.isOrphan ? 1 : -1;
    return b.eventDate.localeCompare(a.eventDate);
  });

  for (const group of groups) {
    group.payments = [...group.payments].sort((a: any, b: any) => {
      if (group.isOrphan) return Number(b.date?.seconds || 0) - Number(a.date?.seconds || 0);
      return String(a.familyName || "").localeCompare(String(b.familyName || ""), "fr");
    });
  }

  return groups;
}

export function preparerMultiEncaissements(unpaid: any[]): MultiEncaissementFamille[] {
  const parFamille = new Map<string, MultiEncaissementFamille>();

  for (const payment of unpaid) {
    const reglable =
      payment?.paymentMode !== "cheque_differe" &&
      !prelevementPlanifie(payment) &&
      Number(payment?.echeancesTotal || 0) <= 1 &&
      soldeRestant(payment) > 0.005;
    if (!reglable) continue;

    const familyId = payment.familyId || "";
    const entry: MultiEncaissementFamille = parFamille.get(familyId) || {
      familyId,
      name: payment.familyName || "Famille",
      pays: [],
      total: 0,
    };
    entry.pays.push(payment);
    entry.total += soldeRestant(payment);
    parFamille.set(familyId, entry);
  }

  return [...parFamille.values()]
    .filter((entry) => entry.pays.length >= 2)
    .sort((a, b) => b.total - a.total);
}

export interface ResumeAttentes {
  /** Ce que l'onglet Impayés afficherait : dû et exigible aujourd'hui. */
  impayes: any[];
  totalImpayes: number;
  /** Dû mais pas encore exigible : échéances à venir, prélèvements SEPA
   *  programmés, chèques différés déposés. */
  aVenir: any[];
  totalAVenir: number;
}

/**
 * Sépare, pour un ensemble de familles, ce qui est réellement impayé de ce
 * qui est simplement dû plus tard.
 *
 * Le bandeau du panneau d'inscription annonçait « 3 paiements en attente »
 * pour une famille qui venait de choisir un règlement en trois fois, alors
 * que l'onglet Impayés n'en montrait aucun : les échéances n'y entrent qu'à
 * leur date. Même règle ici (listerImpayes), pour que les deux écrans
 * disent la même chose.
 */
export function resumerAttentes(payments: any[], familyIds: string[], today: string): ResumeAttentes {
  const familles = new Set(familyIds);
  const dus = (payments || []).filter((payment) =>
    familles.has(payment?.familyId) &&
    (payment?.status === "pending" || payment?.status === "partial") &&
    soldeRestant(payment) > 0.005,
  );
  const impayes = listerImpayes(dus, today);
  const idsImpayes = new Set(impayes.map((payment) => payment.id));
  const aVenir = dus.filter((payment) => !idsImpayes.has(payment.id));
  const somme = (liste: any[], montant: (p: any) => number) => Math.round(liste.reduce((s, payment) => s + montant(payment), 0) * 100) / 100;
  // Impayé : ce qui est dû maintenant, hors SEPA. À venir : le reste brut,
  // part SEPA comprise — c'est bien de l'argent attendu.
  return { impayes, totalImpayes: somme(impayes, duMaintenant), aVenir, totalAVenir: somme(aVenir, soldeRestant) };
}
