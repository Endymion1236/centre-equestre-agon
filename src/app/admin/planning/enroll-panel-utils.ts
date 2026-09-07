/**
 * src/app/admin/planning/enroll-panel-utils.ts
 *
 * Calculs purs du panneau d'inscription, sortis de EnrollPanel.tsx
 * (2 900 lignes) : rien ici ne touche Firestore ni l'écran, tout se teste
 * seul. Les corps sont ceux du panneau, à l'identique ; seules les en-têtes
 * ont changé (l'état du composant arrive en paramètres).
 */

import { paymentModes } from "@/app/admin/paiements/types";
import { nomCompletCavalier } from "@/lib/nom-cavalier";
import { estQuinzaine, estSemaineAttendue, frequenceEquivalente } from "@/lib/rythme";
import type { Creneau } from "./types";

/** Libellé lisible d'un moyen de règlement d'acompte, aligné sur la caisse. */
export function libelleModeAcompte(mode: string): string {
  return paymentModes.find(m => m.id === mode)?.label || mode;
}

/**
 * Nom AFFICHÉ d'un inscrit : le `childName` est copié dans le créneau au
 * moment de l'inscription, donc il ne suit pas un renommage ultérieur. On
 * lit le nom ACTUEL de la fiche famille et on ne retombe sur la copie que si
 * l'enfant n'y est plus.
 */
export function nomActuelInscrit(families: any[], e: any): string {
  let fam: any = families.find((f: any) => f.firestoreId === e.familyId || f.id === e.familyId);
  let child: any = (fam?.children || []).find((c: any) => c.id === e.childId);
  if (!child && e.childId) {
    // L'inscription garde le familyId du moment : si l'enfant a depuis
    // changé de fiche (« Lier cavaliers », fusion, fiche recréée), on le
    // retrouve par son id à travers TOUTES les familles plutôt que de
    // retomber sur la copie figée (souvent le prénom seul).
    for (const f of families) {
      const c = ((f as any).children || []).find((c: any) => c.id === e.childId);
      if (c) { child = c; fam = f; break; }
    }
  }
  if (!child) return e.childName || "—";
  // Nom de l'enfant, sinon nom de la fiche famille (règle du gérant).
  return nomCompletCavalier(child, fam) || e.childName || "—";
}

/** Recherche famille : chaque mot tapé doit se retrouver dans le parent, l'email ou un cavalier. */
export function filtrerFamilles(allFamilies: any[], search: string): any[] {
  if (!search) return allFamilies; const terms = search.toLowerCase().trim().split(/\s+/); return allFamilies.filter(f => { const childText = (f.children || []).map((c: any) => `${c.firstName || ""} ${c.lastName || ""}`).join(" "); const searchable = `${f.parentName || ""} ${f.parentEmail || ""} ${childText}`.toLowerCase(); return terms.every(t => searchable.includes(t)); });
}

/**
 * Cavaliers en quinzaine non attendus cette semaine : ils ne sont pas dans
 * `enrolled` (sinon la feuille d'appel les compterait présents), on les
 * affiche en grisé à partir de leur forfait, comme un rappel.
 */
export function cavaliersNonAttendusQuinzaine(allForfaits: any[], creneau: Creneau, enrolledIds: string[], isStage: boolean): any[] {
  if (isStage) return [];
  const jour = new Date(creneau.date + "T12:00:00")
    .toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
  return (allForfaits || []).filter((f: any) => {
    if (!estQuinzaine(f)) return false;
    if (f.status !== "actif" && f.status !== "active") return false;
    if (enrolledIds.includes(f.childId)) return false;
    if (estSemaineAttendue(creneau.date, f)) return false;
    return (f.activityTitle || "").toLowerCase() === (creneau.activityTitle || "").toLowerCase()
      && (f.dayLabel || "").toLowerCase() === jour
      && (f.startTime || "") === (creneau.startTime || "");
  });
}

/** Prix affiché dans l'en-tête : pour les stages, le tarif configuré du nombre de jours si disponible. */
export function prixAffiche(creneau: Creneau, isStage: boolean, priceTTC: number, stageDaysCount: number): number {
  if (!isStage) return priceTTC;
  const nbJours = stageDaysCount || 1;
  const cr = creneau as any;
  const prices: Record<number, number> = {};
  if (cr.price1day) prices[1] = cr.price1day;
  if (cr.price2days) prices[2] = cr.price2days;
  if (cr.price3days) prices[3] = cr.price3days;
  if (cr.price4days) prices[4] = cr.price4days;
  return prices[nbJours] || priceTTC;
}

/**
 * Place tenue pour une famille en liste d'attente, encore valable : pas
 * expirée, et l'enfant n'est pas déjà inscrit.
 */
export function holdActifDuCreneau(creneau: Creneau, enrolled: any[]): any | null {
  const h = (creneau as any).waitlistHold;
  if (!h?.until) return null;
  if (new Date(h.until).getTime() < Date.now()) return null;
  if (enrolled.some((e: any) => e.childId === h.childId)) return null;
  return h;
}

/** Cavaliers de la famille inscriptibles : pas déjà inscrits, pas sur un créneau qui chevauche cet horaire. */
export function cavaliersDisponibles(children: any[], enrolledIds: string[], allCreneaux: (Creneau & { id: string })[], creneau: Creneau & { id: string }): any[] {
  return children.filter((c: any) => {
  if (enrolledIds.includes(c.id)) return false;
  // Vérifier si l'enfant est déjà inscrit sur un autre créneau qui chevauche cet horaire
  const conflict = allCreneaux.find(other => {
    if (other.id === creneau.id) return false;
    if (other.date !== creneau.date) return false;
    if (!(other.enrolled || []).some((e: any) => e.childId === c.id)) return false;
    // Vérifier le chevauchement horaire : deux créneaux se chevauchent si
    // l'un commence avant que l'autre ne finisse et vice versa
    const s1 = creneau.startTime, e1 = creneau.endTime;
    const s2 = other.startTime, e2 = other.endTime;
    return s1 < e2 && s2 < e1;
  });
  return !conflict;
  });
}

/**
 * Fin de saison "effective" pour un créneau donné.
 *
 * Une saison court de septembre à juin (fin = 30/06 par convention).
 * - Si le créneau est dans la saison en cours (avant `dateFinSaisonRef`),
 *   on garde la fin de saison de référence définie dans les paramètres.
 * - Si le créneau est postérieur (pré-inscription pour la saison suivante),
 *   on bascule sur la fin de saison N+1.
 */
export function finSaisonEffective(dateFinSaisonRef: string, creneauDateStr: string): Date {
  const refFin = new Date(dateFinSaisonRef);
  const creneauDate = new Date(creneauDateStr);
  if (creneauDate <= refFin) return refFin;
  // Créneau dans une saison future — calculer le 30/06 qui suit
  const m = creneauDate.getMonth(); // 0-11
  const y = creneauDate.getFullYear();
  // Saison qui démarre en septembre Y_start et finit le 30/06 Y_start+1
  const yearStart = m >= 8 ? y : y - 1;
  return new Date(yearStart + 1, 5, 30); // mois 5 = juin
}

/**
 * Saison FFE d'une date : du 1er septembre Y au 30 juin Y+1 → Y.
 * - mois >= 8 (sept-déc) → saison Y/Y+1, on retourne Y
 * - mois <= 7 (janv-août) → saison Y-1/Y, on retourne Y-1
 */
export function seasonOf(dateStr: string | Date | { seconds: number }): number {
  let d: Date;
  if (typeof dateStr === "string") d = new Date(dateStr);
  else if (dateStr instanceof Date) d = dateStr;
  else if (dateStr && (dateStr as any).seconds) d = new Date((dateStr as any).seconds * 1000);
  else return 0;
  if (isNaN(d.getTime())) return 0;
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * Rang de l'enfant dans la famille pour l'adhésion dégressive : enfants
 * déjà inscrits en forfait annuel POUR LA MÊME SAISON que le créneau, + 1.
 */
export function rangEnfantFamille(fam: any, allForfaits: any[], selChild: string, creneauDateStr: string): number {
  if (!fam) return 1;
  const targetSeason = seasonOf(creneauDateStr);
  const enfantsInscrits = new Set<string>();
  allForfaits
    .filter((f: any) => f.familyId === fam.firestoreId)
    .forEach((f: any) => {
      if (!f.childId || f.childId === selChild) return;
      if (f.status && f.status !== "actif" && f.status !== "active") return;
      // Comparaison de saison : on accepte le forfait si sa saison
      // (champ dédié ou createdAt) correspond à celle du créneau cible.
      const forfaitSeason = f.seasonStartYear ?? seasonOf(f.createdAt);
      if (forfaitSeason !== targetSeason) return;
      enfantsInscrits.add(f.childId);
    });
  return enfantsInscrits.size + 1;
}

/**
 * Fréquence (cours/semaine) déjà inscrite pour CET enfant cette saison ;
 * un forfait en quinzaine ne compte que pour moitié.
 */
export function frequenceDejaInscrite(fam: any, allForfaits: any[], selChild: string, creneauDateStr: string): number {
  if (!fam || !selChild) return 0;
  const targetSeason = seasonOf(creneauDateStr);
  let total = 0;
  allForfaits
    .filter((f: any) => f.familyId === fam.firestoreId && f.childId === selChild)
    .forEach((f: any) => {
      if (f.status && f.status !== "actif" && f.status !== "active") return;
      const forfaitSeason = f.seasonStartYear ?? seasonOf(f.createdAt);
      if (forfaitSeason !== targetSeason) return;
      total += frequenceEquivalente(f.frequence, f);
    });
  return total;
}
