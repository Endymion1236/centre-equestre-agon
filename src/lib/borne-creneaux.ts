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
 * Une carte affichée sur l'écran de la borne : ce que le visiteur voit
 * pendant que Câlin parle. Un stage d'une semaine tient sur UNE carte
 * (« du lun. 26 au ven. 30 octobre »), son lien pointe sur le premier jour :
 * la page Réserver sait en déduire la semaine entière.
 */
export interface CarteCreneauBorne {
  /** Identifiant du créneau (premier jour pour un stage) — sert au lien. */
  id: string;
  activityTitle: string;
  activityType: string;
  date: string;
  /** Dernier jour, pour un stage sur plusieurs jours. */
  dateFin?: string;
  nbJours: number;
  startTime: string;
  endTime: string;
  priceTTC: number | null;
  /** Tarif d'une journée isolée, quand l'inscription à la journée est ouverte. */
  priceTTCDay: number | null;
  placesRestantes: number;
}

/** Un stage regroupe ses jours : même titre, même semaine (lundi ISO). */
function cleStage(s: PublicPlanningSlot): string {
  const d = new Date(`${s.date}T12:00:00`);
  const lundi = new Date(d);
  lundi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const iso = `${lundi.getFullYear()}-${String(lundi.getMonth() + 1).padStart(2, "0")}-${String(lundi.getDate()).padStart(2, "0")}`;
  return `${s.activityTitle}|${iso}`;
}

/** Cartes à afficher, à partir des créneaux publics triés. */
export function cartesPourEcran(slots: PublicPlanningSlot[], max = 12): CarteCreneauBorne[] {
  const cartes: CarteCreneauBorne[] = [];
  const stages = new Map<string, CarteCreneauBorne>();
  for (const s of slots) {
    const restantes = Math.max(0, s.maxPlaces - s.enrolledCount);
    const prix = typeof s.priceTTC === "number" && s.priceTTC > 0 ? s.priceTTC : null;
    const estStage = s.activityType === "stage" || s.activityType === "stage_journee";
    if (!estStage) {
      cartes.push({
        id: s.id, activityTitle: s.activityTitle, activityType: s.activityType,
        date: s.date, nbJours: 1, startTime: s.startTime, endTime: s.endTime,
        priceTTC: prix, priceTTCDay: null, placesRestantes: restantes,
      });
      continue;
    }
    const cle = cleStage(s);
    const existante = stages.get(cle);
    if (existante) {
      existante.dateFin = s.date > (existante.dateFin || existante.date) ? s.date : existante.dateFin;
      existante.nbJours += 1;
      existante.placesRestantes = Math.min(existante.placesRestantes, restantes);
      continue;
    }
    const carte: CarteCreneauBorne = {
      id: s.id, activityTitle: s.activityTitle, activityType: s.activityType,
      date: s.date, dateFin: s.date, nbJours: 1, startTime: s.startTime, endTime: s.endTime,
      priceTTC: prix, priceTTCDay: tarifJournee(s), placesRestantes: restantes,
    };
    stages.set(cle, carte);
    cartes.push(carte);
  }
  return cartes.slice(0, max);
}

/**
 * Recherche de créneaux pour la borne d'accueil — LECTURE SEULE, données
 * publiques uniquement (toPublicPlanningSlot : jamais de noms d'inscrits
 * ni d'identifiants familles). Partagée entre la route pipeline classique
 * (/api/borne) et la route outil de l'API Realtime (/api/borne/creneaux).
 *
 * Renvoie le texte compact lu par le modèle ET les cartes à afficher à
 * l'écran de la borne : ce que Câlin annonce, le visiteur le voit, et peut
 * le réserver depuis son téléphone.
 */
export async function chercherCreneauxBorneDetaille(input: {
  start?: string;
  end?: string;
  type?: string;
} | null | undefined): Promise<{ texte: string; cartes: CarteCreneauBorne[] }> {
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
    return {
      texte: `Aucun créneau trouvé entre le ${effectiveStart} et le ${end}${input?.type ? ` pour le type « ${input.type} »` : ""}.`,
      cartes: [],
    };
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
  return { texte: lignes.join("\n") + suite, cartes: cartesPourEcran(slots) };
}

/** Le seul texte, pour les appelants qui ne pilotent pas d'écran. */
export async function chercherCreneauxBorne(input: Parameters<typeof chercherCreneauxBorneDetaille>[0]): Promise<string> {
  return (await chercherCreneauxBorneDetaille(input)).texte;
}
