import { adminDb } from "@/lib/firebase-admin";
import { toParisDateString } from "@/lib/date-local";
import {
  addCalendarDays,
  comparePublicPlanningSlots,
  isCalendarDate,
  tarifJournee,
  toPublicPlanningSlot,
  type PublicPlanningSlot,
} from "@/lib/public-planning";

/**
 * Recherche de créneaux pour la borne d'accueil — LECTURE SEULE, données
 * publiques uniquement (toPublicPlanningSlot : jamais de noms d'inscrits
 * ni d'identifiants familles). Partagée entre la route pipeline classique
 * (/api/borne) et la route outil de l'API Realtime (/api/borne/creneaux).
 */
export async function chercherCreneauxBorne(input: {
  start?: string;
  end?: string;
  type?: string;
} | null | undefined): Promise<string> {
  const today = toParisDateString();
  const start = isCalendarDate(input?.start || "") ? input!.start! : today;
  // Ne jamais renvoyer le passé : la borne parle toujours du futur
  const effectiveStart = start < today ? today : start;
  const requestedEnd = isCalendarDate(input?.end || "") ? input!.end! : addCalendarDays(effectiveStart, 42);
  const maxEnd = addCalendarDays(effectiveStart, 120);
  const end = requestedEnd > maxEnd ? maxEnd : requestedEnd;

  const snapshot = await adminDb
    .collection("creneaux")
    .where("date", ">=", effectiveStart)
    .where("date", "<=", end)
    .get();

  let slots = snapshot.docs
    .map((d) => toPublicPlanningSlot(d.id, d.data()))
    .filter((s): s is PublicPlanningSlot => s !== null)
    .sort(comparePublicPlanningSlots);

  if (input?.type) {
    slots = slots.filter((s) => s.activityType === input.type);
  }

  if (slots.length === 0) {
    return `Aucun créneau trouvé entre le ${effectiveStart} et le ${end}${input?.type ? ` pour le type « ${input.type} »` : ""}.`;
  }

  // Format compact pour le modèle — cap à 60 lignes pour maîtriser les tokens
  const lignes = slots.slice(0, 60).map((s) => {
    const restantes = Math.max(0, s.maxPlaces - s.enrolledCount);
    const dispo = restantes === 0 ? "COMPLET" : `${restantes} place${restantes > 1 ? "s" : ""} restante${restantes > 1 ? "s" : ""}`;
    const prix = typeof s.priceTTC === "number" && s.priceTTC > 0 ? `${s.priceTTC}€` : "prix à confirmer à l'accueil";
    const jour = tarifJournee(s);
    const prixJour = jour ? ` (journée possible : ${jour}€)` : "";
    return `[date_iso:${s.date}] [type:${s.activityType}] ${s.activityTitle} ${s.startTime}-${s.endTime} — ${prix}${prixJour} — ${dispo}`;
  });

  const suite = slots.length > 60 ? `\n(… et ${slots.length - 60} autres créneaux — affine la période)` : "";
  return lignes.join("\n") + suite;
}
