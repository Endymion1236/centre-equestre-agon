/**
 * src/app/espace-cavalier/reserver/utils-reservation.ts
 *
 * Fonctions PURES de l'écran de réservation famille : formatage de dates,
 * places restantes, détection de conflits d'horaires et surtout calcul du
 * tarif d'un stage.
 *
 * Pourquoi les sortir de `page.tsx` : le prix affiché dans le récapitulatif
 * « avant ajout » et le prix réellement écrit dans le panier étaient calculés
 * par DEUX blocs de code jumeaux, recopiés à l'identique dans le composant.
 * Toute correction devait être faite deux fois, sous peine que la famille voie
 * un montant et paie l'autre. `calculerTarifStage` est désormais l'unique
 * endroit où ce tarif se décide — l'affichage et le panier appellent la même
 * fonction, l'écart est structurellement impossible.
 *
 * Rien ici ne lit l'état React : tout arrive en paramètre explicite, ce qui
 * rend ces règles testables et réutilisables telles quelles.
 */

import type { CartItem, Creneau } from "./types";

/**
 * Date locale au format YYYY-MM-DD.
 *
 * On reconstruit la chaîne à la main plutôt que d'utiliser toISOString() :
 * celui-ci passe en UTC et peut renvoyer la veille en soirée (heure d'été),
 * ce qui décalerait les bornes des requêtes Firestore d'un jour.
 */
export const fmtDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Un créneau est-il un stage (semaine ou journée) ? */
export const estStage = (c: Creneau) => c.activityType === "stage" || c.activityType === "stage_journee";

// ── Hold liste d'attente (place réservée 24h) ──
// Un hold est actif s'il n'est pas expiré ET que l'enfant concerné n'est pas
// encore inscrit (dès qu'il s'inscrit, le hold devient sans objet).
export const holdActive = (c: any) => {
  const h = c?.waitlistHold;
  if (!h?.until) return false;
  if (new Date(h.until).getTime() < Date.now()) return false;
  if ((c.enrolled || []).some((e: any) => e.childId === h.childId)) return false;
  return true;
};

// Places visibles : la place sous hold est masquée pour les autres familles,
// mais reste disponible pour la famille notifiée (elle peut réserver).
export const placesRestantes = (c: Creneau, familyId: string) => {
  const base = c.maxPlaces - (c.enrolled?.length || 0);
  if (holdActive(c) && (c as any).waitlistHold?.familyId !== familyId) return Math.max(0, base - 1);
  return base;
};

// Helper : 2 plages horaires se chevauchent-elles le meme jour ?
// Compare date + intersection [start,end]. Renvoie true si chevauchement.
export const chevauchement = (a: { date: string; startTime: string; endTime: string }, b: { date: string; startTime: string; endTime: string }) => {
  if (a.date !== b.date) return false;
  // Comparaison HH:MM en string fonctionne tant qu'on a le format "HH:MM" ou "HH:MM:SS"
  const aStart = a.startTime || "00:00";
  const aEnd = a.endTime || "23:59";
  const bStart = b.startTime || "00:00";
  const bEnd = b.endTime || "23:59";
  // Pas de chevauchement si a finit avant que b commence, ou b finit avant a
  return !(aEnd <= bStart || bEnd <= aStart);
};

// Recuperer pour un enfant la liste de tous ses creneaux deja "pris" :
// - inscriptions deja payees (enrolled[] des creneaux en base)
// - items dans le panier (stages et cours)
export const creneauxOccupesEnfant = (
  childId: string,
  creneaux: Creneau[],
  cart: CartItem[],
  familyId: string,
): { date: string; startTime: string; endTime: string }[] => {
  const slots: { date: string; startTime: string; endTime: string }[] = [];
  // 1. Inscriptions deja payees : on parcourt creneaux qui ont enrolled[]
  for (const c of creneaux) {
    if ((c.enrolled || []).some((e: any) => e.childId === childId && e.familyId === familyId)) {
      slots.push({ date: c.date, startTime: c.startTime, endTime: c.endTime });
    }
  }
  // 2. Items du panier : parcourir creneauIds[] et resoudre vers le creneau
  for (const item of cart) {
    if (item.childId !== childId) continue;
    for (const cid of (item.creneauIds || [])) {
      const cr = creneaux.find(c => c.id === cid);
      if (cr) slots.push({ date: cr.date, startTime: cr.startTime, endTime: cr.endTime });
    }
  }
  return slots;
};

/**
 * Tarif d'UNE inscription à un stage.
 *
 * Mode JOUR : prix jour brut, AUCUNE remise, AUCUN plancher.
 * Mode SEMAINE : remise dégressive selon le rang de l'inscription dans la
 * famille (2e stage -10€, 3e -20€, puis -10€ de plus par stage), bornée par le
 * prix plancher configuré côté admin (Réglages > Réductions) pour que le cumul
 * des réductions ne fasse jamais descendre un stage sous le seuil décidé par
 * le gérant.
 *
 * Le rang est passé par l'appelant (compteur d'inscriptions stage de la famille,
 * base + panier) : cette fonction ne connaît ni la famille ni le panier.
 */
export const calculerTarifStage = (
  prixBase: number,
  rang: number,
  isJourMode: boolean,
  prixPlancherStage: number,
): { prixFinal: number; remise: number } => {
  if (isJourMode) {
    return { remise: 0, prixFinal: Math.max(0, Math.round(prixBase * 100) / 100) };
  }
  const remiseSemaine = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
  let prixFinal = Math.max(0, Math.round((prixBase - remiseSemaine) * 100) / 100);
  let remise = remiseSemaine;
  // Plancher uniquement en mode semaine.
  if (prixPlancherStage > 0 && prixFinal < prixPlancherStage) {
    prixFinal = prixPlancherStage;
    remise = Math.max(0, Math.round((prixBase - prixPlancherStage) * 100) / 100);
  }
  return { prixFinal, remise };
};

/**
 * En-tête « Semaine du ... au ... » intercalé dans la liste des stages.
 * `lundi` est la clé de groupe (YYYY-MM-DD du lundi). On lit la date à midi
 * pour ne pas se faire décaler d'un jour par le fuseau, et on n'écrit le mois
 * du lundi que si la semaine est à cheval sur deux mois.
 */
export const libelleSemaine = (lundi: string) => {
  const mon = new Date(lundi + "T12:00:00");
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = (d: Date, withMonth: boolean) => d.toLocaleDateString("fr-FR", withMonth ? { day: "numeric", month: "long" } : { day: "numeric" });
  const sameMonth = mon.getMonth() === sun.getMonth();
  return `Semaine du ${f(mon, !sameMonth)} au ${f(sun, true)}`;
};

/**
 * Affichage clair AVEC le mois. Si le stage couvre plusieurs jours, on montre
 * la plage "du lun. 6 au ven. 10 juillet" ; sinon le jour seul avec son mois.
 */
export const libellePlageJours = (joursUniques: Creneau[]) => {
  if (joursUniques.length === 0) return "";
  const fmt = (d: string, withMonth = true) =>
    new Date(d).toLocaleDateString("fr-FR", withMonth
      ? { weekday: "short", day: "numeric", month: "short" }
      : { weekday: "short", day: "numeric" });
  if (joursUniques.length === 1) return fmt(joursUniques[0].date);
  const premier = joursUniques[0].date;
  const dernier = joursUniques[joursUniques.length - 1].date;
  return `du ${fmt(premier, false)} au ${fmt(dernier)}`;
};

/**
 * Lien « Ajouter un cavalier » vers le profil, avec le chemin de RETOUR.
 *
 * Le paramètre `?creneau=<id>` permet de rouvrir la modale de réservation
 * d'origine une fois le cavalier créé : la famille reprend là où elle en
 * était, nouveau cavalier dans la liste, au lieu de retomber sur la liste
 * des créneaux et de devoir tout refaire.
 */
export const lienAjoutCavalier = (bookingCreneau: Creneau | null) =>
  `/espace-cavalier/profil?action=ajouter-cavalier&retour=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search + (bookingCreneau ? `${window.location.search ? "&" : "?"}creneau=${bookingCreneau.id}` : "") : "/espace-cavalier/reserver")}`;

/**
 * Règle métier : 12 ans minimum pour les promenades.
 * « Année des 12 ans » : l'enfant doit être né au plus tard l'année N-12
 * (où N = année courante). Ex : en 2026, il faut être né en 2014 ou avant.
 * Pas de date de naissance renseignée → trop jeune par précaution.
 */
export const tropJeunePourBalade = (ch: any) => {
  const bd: any = ch?.birthDate;
  const bdDate = bd?.seconds ? new Date(bd.seconds * 1000) : (bd ? new Date(bd) : null);
  if (!bdDate || isNaN(bdDate.getTime())) return true; // date absente → bloqué
  return bdDate.getFullYear() > new Date().getFullYear() - 12;
};
