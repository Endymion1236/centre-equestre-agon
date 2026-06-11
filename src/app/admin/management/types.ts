export type JourSemaine = "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche";
export const JOURS: JourSemaine[] = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
export const JOURS_LABELS: Record<JourSemaine, string> = {
  lundi: "Lundi", mardi: "Mardi", mercredi: "Mercredi",
  jeudi: "Jeudi", vendredi: "Vendredi", samedi: "Samedi", dimanche: "Dimanche",
};

export type CategorieTache = "ecuries" | "soins" | "menage" | "animation" | "preparation" | "checklist" | "admin" | "pause" | "autre";
export const CATEGORIES: { id: CategorieTache; label: string; color: string; emoji: string }[] = [
  { id: "ecuries",     label: "Écuries",      color: "#92400e", emoji: "🐴" },
  { id: "soins",       label: "Soins",        color: "#065f46", emoji: "💊" },
  { id: "menage",      label: "Ménage",       color: "#1e40af", emoji: "🧹" },
  { id: "animation",   label: "Animation",    color: "#7c3aed", emoji: "🎠" },
  { id: "preparation", label: "Préparation",  color: "#b45309", emoji: "🔧" },
  { id: "checklist",   label: "Check-listes", color: "#0e7490", emoji: "✅" },
  { id: "admin",       label: "Admin",        color: "#374151", emoji: "📋" },
  { id: "pause",       label: "Pause",        color: "#9ca3af", emoji: "☕" },
  { id: "autre",       label: "Autre",        color: "#6b7280", emoji: "📌" },
];

export interface TacheType {
  id: string;
  label: string;
  categorie: CategorieTache;
  dureeMinutes: number;   // durée estimée
  recurrente: boolean;    // apparaît par défaut chaque semaine
  joursDefaut: JourSemaine[]; // jours où elle apparaît par défaut
  horairesDefaut?: string[];  // horaires de début standards ex: ["08:45","09:00","10:00"]
  obligatoire?: boolean;      // tâche obligatoire — vérifiée par l'IA
  joursObligatoires?: JourSemaine[]; // jours où la tâche est obligatoire
  binomeRequis?: boolean;     // tâche qui nécessite 2 personnes (ex: rentrer les chevaux,
                              // ramasser les crottins). À l'assignation, on propose
                              // automatiquement d'ajouter un 2e salarié sur le même créneau.
  notes?: string;
  createdAt?: any;
}

export interface Salarie {
  id: string;
  nom: string;
  couleur: string;    // couleur d'affichage
  actif: boolean;
  createdAt?: any;
}

export interface TachePlanifiee {
  id: string;
  tacheTypeId: string;
  tacheLabel: string;       // copie du label (au cas où tacheType modifié)
  categorie: CategorieTache;
  salarieId: string;
  salarieName: string;
  jour: JourSemaine;
  heureDebut: string;       // "08:00"
  dureeMinutes: number;
  semaine: string;          // "2026-W15" format ISO
  done: boolean;
  notes?: string;
  createdAt?: any;
  // ── Traçabilité d'import (modèle de semaine) ───────────────────────
  // Permet de retrouver toutes les tâches issues d'un même import pour
  // pouvoir l'annuler en bloc ou détecter des doublons lors d'un ré-import.
  importBatchId?: string;        // UUID unique pour chaque application de modèle
  importedFromModeleId?: string; // id du modèle source
  importedFromModeleNom?: string;// nom du modèle source (au cas où renommé/supprimé)
  importedAt?: any;              // serverTimestamp
}

export interface PlanningISemaine {
  id: string;           // = semaine ex: "2026-W15"
  semaine: string;
  taches: TachePlanifiee[];
  genereParIA: boolean;
  createdAt?: any;
  updatedAt?: any;
}

// ── Modèles de planning ───────────────────────────────────────────────

/** Tâche dans un modèle (sans semaine, sans id Firestore) */
export interface TacheModele {
  tacheTypeId: string;
  tacheLabel: string;
  categorie: CategorieTache;
  salarieId: string;
  salarieName: string;
  jour: JourSemaine;
  heureDebut: string;       // "08:00"
  dureeMinutes: number;
  notes?: string;
}

/** Modèle de planning réutilisable */
export interface ModelePlanning {
  id: string;
  nom: string;              // "Semaine scolaire", "Vacances été"
  description?: string;     // Note libre
  type: "scolaire" | "vacances" | "autre";
  couleur: string;          // Pour différencier visuellement
  taches: TacheModele[];    // Toutes les tâches du modèle
  createdAt?: any;
  updatedAt?: any;
}

// Helper : obtenir le numéro de semaine ISO
export function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// Helper : obtenir le lundi d'une semaine ISO
export function getLundideSemaine(semaine: string): Date {
  const [year, week] = semaine.split("-W").map(Number);
  const jan4 = new Date(year, 0, 4, 12, 0, 0); // midi pour éviter DST
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const lundi = new Date(startOfWeek1);
  lundi.setDate(startOfWeek1.getDate() + (week - 1) * 7);
  lundi.setHours(12, 0, 0, 0); // forcer midi local
  return lundi;
}

// Formater minutes en Xh YYmin
export function fmtDuree(minutes: number): string {
  if (minutes <= 0) return '0min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return m + 'min';
  if (m === 0) return h + 'h';
  return h + 'h' + String(m).padStart(2, '0');
}

export function formatDateCourte(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/**
 * Convertit "HH:MM" en minutes depuis minuit. Helper interne au calcul.
 */
function _heureToMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * Temps de travail effectif d'un ensemble de tâches **du même jour** :
 *
 *   amplitude (fin de la dernière tâche non-pause − début de la première)
 *     − somme des durées des tâches de catégorie "pause"
 *
 * Cohérent avec la logique d'affichage de TabHoraires : les pauses sont
 * marquées **explicitement** par l'admin (catégorie `"pause"`). Les battements
 * courts entre deux tâches non-pause sont comptés en travail (puisqu'ils sont
 * dans l'amplitude et pas déduits).
 *
 * ⚠️ Pour un cumul semaine, sommer le résultat sur chaque jour. NE PAS appeler
 * avec toutes les tâches de la semaine : l'amplitude couvrirait plusieurs
 * jours et donnerait un résultat erroné.
 */
export function calcTempsTravailJour(
  tachesDuJour: { heureDebut: string; dureeMinutes: number; categorie: string }[]
): number {
  const travail = tachesDuJour.filter(t => t.categorie !== "pause");
  if (travail.length === 0) return 0;
  const sorted = [...travail].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const debutMin = _heureToMin(sorted[0].heureDebut);
  const lastT = sorted[sorted.length - 1];
  const finMin = _heureToMin(lastT.heureDebut) + lastT.dureeMinutes;
  const amplitude = finMin - debutMin;
  const pauseMin = tachesDuJour
    .filter(t => t.categorie === "pause")
    .reduce((s, t) => s + t.dureeMinutes, 0);
  return Math.max(0, amplitude - pauseMin);
}

/**
 * Bornes horaires de la journée : début de la première tâche non-pause et
 * fin de la dernière (heure de début + durée). Sert à afficher l'heure de
 * fin de journée dans le récap du semainier. Retourne null si aucune tâche.
 */
export function bornesJournee(
  tachesDuJour: { heureDebut: string; dureeMinutes: number; categorie: string }[]
): { debut: string; fin: string } | null {
  const travail = tachesDuJour.filter(t => t.categorie !== "pause");
  if (travail.length === 0) return null;
  const sorted = [...travail].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  const lastT = sorted[sorted.length - 1];
  const finMin = _heureToMin(lastT.heureDebut) + (lastT.dureeMinutes || 0);
  const minToH = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { debut: sorted[0].heureDebut, fin: minToH(finMin) };
}
