// ─── Types partagés ─────────────────────────────────────────────────────────

export interface Creneau {
  id?: string;
  activityId: string;
  activityTitle: string;
  activityType: string;
  date: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
  enrolledCount: number;
  enrolled: any[];
  status: string;
  priceHT?: number;
  priceTTC?: number;
  tvaTaux?: number;
  // Identifiant unique du lot de créneaux d'un stage multi-jours. Deux stages
  // créés séparément ont toujours des stageGroupId différents, même s'ils
  // partagent la même activité ET le même titre. Absent sur les créneaux
  // antérieurs à ce champ (fallback : activityId + titre).
  stageGroupId?: string;
}

// ── Deux créneaux appartiennent-ils au même stage ? ──
// Priorité au stageGroupId (fiable à 100%). Fallback legacy : même activityId
// + même titre — limite connue : deux stages homonymes créés depuis la même
// activité AVANT l'introduction du stageGroupId restent indissociables.
export function sameStage(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a.stageGroupId && b.stageGroupId) return a.stageGroupId === b.stageGroupId;
  return a.activityId === b.activityId && a.activityTitle === b.activityTitle;
}

export interface EnrolledChild {
  childId: string;
  childName: string;
  familyId: string;
  familyName: string;
  enrolledAt: string;
  // ── Marquage source de paiement (couverture inscription) ─────────────
  // Permet à l'UI de savoir comment l'inscription est couverte
  // financièrement, sans devoir matcher un item de paiement précis :
  //  - 'card'    : carte de séances (débit à la clôture)
  //  - 'forfait' : forfait annuel (un seul paiement couvre toute la saison)
  //  - undefined : paiement classique au créneau (suppose un match par creneauId)
  paymentSource?: "card" | "forfait";
  forfaitId?: string | null;
  cardId?: string | null;
  presence?: "present" | "absent" | null;
  stageKey?: string;
}

export interface Period {
  startDate: string;
  endDate: string;
}

export interface SlotDef {
  activityId: string;
  day: number;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

export const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const dayNamesFull = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Comparateur stable pour trier les créneaux.
 * Réexporté depuis @/lib/creneau-sort pour que les imports existants depuis
 * "./types" continuent de fonctionner. Voir creneau-sort.ts pour la doc.
 */
export { compareCreneaux } from "@/lib/creneau-sort";

export const typeColors: Record<string, string> = {
  stage: "#27ae60",
  stage_journee: "#16a085",
  balade: "#e67e22",
  cours: "#2050A0",
  competition: "#7c3aed",
  anniversaire: "#D63031",
  ponyride: "#16a085",
  animation: "#e84393",
};

export const payModes = [
  { id: "cb_terminal", label: "CB", icon: "💳" },
  { id: "cheque", label: "Chèque", icon: "📝" },
  { id: "especes", label: "Espèces", icon: "💶" },
  { id: "cheque_vacances", label: "Chq.Vac.", icon: "🏖️" },
  { id: "pass_sport", label: "Pass'Sport", icon: "🎽" },
  { id: "ancv", label: "ANCV", icon: "🎫" },
  { id: "carte", label: "Carte", icon: "🎟️" },
  { id: "avoir", label: "Avoir", icon: "💜" },
  { id: "prelevement_sepa", label: "SEPA", icon: "🏦" },
];

// ─── Helpers dates ───────────────────────────────────────────────────────────

export function getWeekDates(offset: number): Date[] {
  const t = new Date();
  const m = new Date(t);
  m.setDate(t.getDate() - ((t.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(m);
    d.setDate(m.getDate() + i);
    return d;
  });
}

export function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fmtDateFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
}

export function fmtMonthFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper partagé : match d'un item de paiement avec un créneau visible.
//
//  Cas couverts (par ordre de priorité) :
//
//  1. Cours unique : item a un creneauId → match strict
//
//  2. Stage moderne : enrolled.stageKey existe ET item.stageKey existe
//     → match strict sur stageKey complet (format "activityTitle_premierJour")
//     Aucune confusion possible entre 2 stages de même titre sur 2 semaines.
//
//  3. Stage legacy (avant le fix stageKey) : enrolled n'a pas de stageKey
//     → fallback sur préfixe item.stageKey commence par activityTitle + "_"
//     Limite : un cavalier qui a payé "Stage galop d'or" semaine 1 apparaît
//     "réglé" sur "Stage galop d'or" semaine 2 si l'inscription est antérieure
//     au déploiement de ce fix. Pour les nouveaux stages c'est correct.
//
//  4. Très ancien : ni creneauId ni stageKey → match par activityTitle.includes
//
//  Le bug initial (Charlyse Pierre stage A payé, stage B inscriptions
//  apparaissait "réglé") reste corrigé : ces 2 stages ont des activityTitle
//  différents donc aucun cas ne matche.
// ─────────────────────────────────────────────────────────────────────────────
export function itemMatchesCreneau(
  item: any,
  enrolledOrChildId: string | { childId: string; stageKey?: string },
  creneau: { id?: string; activityTitle: string }
): boolean {
  // Compatibilité ascendante : accepte string (childId) ou objet enrolled
  const childId = typeof enrolledOrChildId === "string"
    ? enrolledOrChildId
    : enrolledOrChildId.childId;
  const enrolledStageKey = typeof enrolledOrChildId === "object"
    ? enrolledOrChildId.stageKey
    : undefined;

  if (item.childId !== childId) return false;

  // 1. Cours unique : creneauId strict
  if (item.creneauId) return item.creneauId === creneau.id;

  // 2. Stage moderne : on a le stageKey dans l'enrolled → match strict
  if (enrolledStageKey && item.stageKey) {
    return item.stageKey === enrolledStageKey;
  }

  // 3. Stage legacy : seul l'item a un stageKey, on tente le préfixe
  if (item.stageKey) {
    return String(item.stageKey).startsWith(creneau.activityTitle + "_");
  }

  // 4. Très ancien : fallback activityTitle
  return String(item.activityTitle || "").includes(creneau.activityTitle);
}

// ─── Forfait : couverture financière effective ──────────────────────────────
// Vérifie si le forfait annuel d'un enfant a été ENCAISSÉ (au moins
// partiellement). Sans ça, on aurait des inscriptions affichées "forfait"
// (vert émeraude) alors que la commande est encore en attente d'encaissement.
//
// Stratégie : on cherche dans les paiements de la famille un paiement
// `paid` qui contient un item "Forfait" pour CET enfant. On considère
// que ça atteste d'un encaissement (peu importe le montant exact —
// pour les 3x/10x, on accepte qu'une seule échéance soit payée).
//
// Pour un check strict (montant total atteint), il faudrait sommer
// tous les paiements paid avec forfaitRef ou item "Forfait" et comparer
// à forfaitPriceTTC. Pas fait pour l'instant : le but est juste de
// distinguer "rien encore encaissé" vs "au moins un encaissement".
export function isForfaitChildPaye(
  payments: any[],
  familyId: string,
  childId: string,
): boolean {
  return payments.some((p: any) => {
    if (p.familyId !== familyId) return false;
    if (p.status !== "paid") return false;
    return (p.items || []).some((i: any) => {
      if (i.childId !== childId) return false;
      const t = String(i.activityTitle || "").toLowerCase();
      // Match : item "Forfait XXX", ou un paiement explicitement lié
      // à un forfait via forfaitRef (cas des échéances 3x/10x).
      return t.includes("forfait") || !!p.forfaitRef;
    });
  });
}
