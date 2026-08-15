/**
 * src/app/espace-cavalier/inscription-annuelle/tarifs.ts
 *
 * Tout ce qui décide COMBIEN l'inscription annuelle d'une famille va coûter —
 * hors du calcul central lui-même, qui reste dans src/lib/forfait-pricing.ts et
 * qui est partagé avec l'espace admin (c'est ce partage qui garantit qu'une
 * famille et le centre voient le même prix).
 *
 * Ce que ce fichier contient, ce sont les ENTRÉES de ce calcul : le rang de
 * l'enfant dans la fratrie, les heures déjà inscrites, la licence/adhésion déjà
 * payées cette saison, l'âge qui décide du tarif de licence. Chacune de ces
 * valeurs change directement le montant facturé, et toutes vivaient jusqu'ici
 * dans des `useMemo` au milieu du composant — donc invérifiables autrement
 * qu'en inscrivant un vrai enfant, c'est-à-dire en créant un vrai paiement.
 *
 * Toutes les fonctions de ce fichier sont PURES : elles reçoivent leurs données
 * en paramètres (jamais l'état React), ne lisent pas Firestore et ne rendent
 * rien. Voir tests/unit/inscription-annuelle-tarifs.test.ts.
 *
 * Règles métier encodées ici, à ne pas « simplifier » :
 *  - licence FFE et adhésion sont ANNUELLES : jamais refacturées deux fois à un
 *    même enfant sur une même saison, que le premier forfait soit en base ou
 *    encore dans le panier ;
 *  - les heures ajoutées en cours de saison se facturent au DIFFÉRENTIEL vers
 *    le forfait supérieur, plafonné à 3×/semaine, jamais à plein tarif ;
 *  - un forfait annulé (status ≠ "actif") ne compte ni pour le rang, ni pour
 *    les prérequis, ni pour la fréquence déjà inscrite.
 */

import { seasonOf, type ForfaitTarifs } from "@/lib/forfait-pricing";
import { MIN_SEASON_INSCRIPTION } from "./constantes";
import type { PanierItem } from "./types";

// Calcule l'âge à partir d'une date de naissance, en gérant les formats
// variés (string ISO, Date, Firestore Timestamp {seconds}). Retourne null
// si la date est absente ou invalide (évite l'affichage "NaN ans").
export function ageFromBirthDate(birthDate: any): number | null {
  if (!birthDate) return null;
  let d: Date;
  if (typeof birthDate === "string") d = new Date(birthDate);
  else if (birthDate instanceof Date) d = birthDate;
  else if (birthDate?.seconds) d = new Date(birthDate.seconds * 1000);
  else if (birthDate?.toDate) { try { d = birthDate.toDate(); } catch { return null; } }
  else return null;
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

/**
 * Tarif de licence à appliquer : -18 ans ou +18 ans.
 * Date de naissance absente ou illisible → -18 ans par défaut, cas le plus
 * courant en club (et le moins cher : on ne surfacture jamais par ignorance).
 */
export function estLicenceMoins18(birthDate: any): boolean {
  const a = ageFromBirthDate(birthDate);
  if (a === null) return true; // par défaut -18 (cas le plus courant en club)
  return a < 18;
}

/**
 * Rang de l'enfant dans la famille pour la saison visée
 * (= nb d'autres enfants déjà inscrits en forfait cette saison + 1).
 * Même logique que l'admin (filtrage par saison). Ce rang pilote à la fois la
 * réduction famille et le tarif d'adhésion dégressif.
 */
export function calculeRangEnfant(params: {
  familyId?: string;
  allForfaits: any[];
  panier: PanierItem[];
  selectedChild: string;
  targetSeason: number;
}): number {
  const { familyId, allForfaits, panier, selectedChild, targetSeason } = params;
  if (!familyId) return 1;
  const enfants = new Set<string>();
  // Enfants déjà inscrits en base pour cette saison
  allForfaits.forEach((f: any) => {
    if (!f.childId || f.childId === selectedChild) return;
    const fSeason = f.seasonStartYear ?? seasonOf(f.createdAt);
    if (fSeason !== targetSeason) return;
    enfants.add(f.childId);
  });
  // + enfants déjà placés dans le panier (hors enfant courant)
  panier.forEach(p => {
    if (p.childId !== selectedChild) enfants.add(p.childId);
  });
  return enfants.size + 1;
}

/**
 * Enfants DÉJÀ inscrits pour la saison d'inscription.
 * Empêche une double inscription (re-paiement licence/adhésion, rang faussé).
 * On regarde la saison MIN_SEASON_INSCRIPTION (seule saison ouverte au
 * self-service) : forfaits actifs en base + enfants déjà dans le panier.
 */
export function calculeChildIdsDejaInscrits(allForfaits: any[], panier: PanierItem[]): Set<string> {
  const set = new Set<string>();
  allForfaits.forEach((f: any) => {
    if (!f.childId) return;
    if (f.status && f.status !== "actif") return; // ignore les forfaits annulés
    const fSeason = f.seasonStartYear ?? seasonOf(f.createdAt);
    if (fSeason !== MIN_SEASON_INSCRIPTION) return;
    set.add(f.childId);
  });
  panier.forEach(p => set.add(p.childId));
  return set;
}

/**
 * Licence / adhésion déjà prises pour l'enfant courant cette saison ?
 *
 * Licence FFE et adhésion sont ANNUELLES : payées une seule fois par enfant
 * et par saison. Si l'enfant a déjà un forfait actif portant la licence
 * (resp. l'adhésion) sur la saison visée — en base OU dans le panier — on ne
 * les re-facture pas sur une 2e inscription (2e cours). La saison de
 * référence est celle réellement visée par le créneau choisi (targetSeason),
 * pas la constante : robuste quelle que soit la date des créneaux.
 */
export function calculePrereqDejaPris(params: {
  allForfaits: any[];
  panier: PanierItem[];
  selectedChild: string;
  targetSeason: number;
}): { licence: boolean; adhesion: boolean } {
  const { allForfaits, panier, selectedChild, targetSeason } = params;
  let licence = false, adhesion = false;
  if (!selectedChild) return { licence, adhesion };
  allForfaits.forEach((f: any) => {
    if (f.childId !== selectedChild) return;
    if (f.status && f.status !== "actif") return;
    const fSeason = f.seasonStartYear ?? seasonOf(f.createdAt);
    if (fSeason !== targetSeason) return;
    if (f.licenceFFE) licence = true;
    if (f.adhesion) adhesion = true;
  });
  panier.forEach(p => {
    if (p.childId !== selectedChild) return;
    if ((p as any).seasonStartYear !== undefined && (p as any).seasonStartYear !== targetSeason) return;
    if (p.avecLicence) licence = true;
    if (p.avecAdhesion) adhesion = true;
  });
  return { licence, adhesion };
}

/**
 * Fréquence (cours/semaine) déjà inscrite pour l'enfant cette saison.
 *
 * Somme des fréquences des forfaits actifs (base + panier) sur la saison
 * visée. Sert à facturer une heure supplémentaire au DIFFÉRENTIEL (passage
 * 1×→2× etc.) plutôt qu'à plein tarif, et à plafonner le choix à 3×/sem.
 */
export function calculeFrequenceDejaInscrite(params: {
  allForfaits: any[];
  panier: PanierItem[];
  selectedChild: string;
  targetSeason: number;
}): number {
  const { allForfaits, panier, selectedChild, targetSeason } = params;
  if (!selectedChild) return 0;
  let total = 0;
  allForfaits.forEach((f: any) => {
    if (f.childId !== selectedChild) return;
    if (f.status && f.status !== "actif") return;
    const fSeason = f.seasonStartYear ?? seasonOf(f.createdAt);
    if (fSeason !== targetSeason) return;
    total += Number(f.frequence) || 0;
  });
  panier.forEach(p => {
    if (p.childId !== selectedChild) return;
    if ((p as any).seasonStartYear !== undefined && (p as any).seasonStartYear !== targetSeason) return;
    total += Number(p.frequence) || 0;
  });
  return total;
}

/** Tarif plein annuel pour une fréquence hebdomadaire, plafonné à 3×/sem. */
export function tarifPourFrequence(tarifs: ForfaitTarifs, f: number): number {
  return f >= 3 ? tarifs.forfait3x : f === 2 ? tarifs.forfait2x : tarifs.forfait1x;
}

/**
 * Prix ANNONCÉ sur les vignettes du choix de forfait, pour l'ajout de
 * `nNouveau` heure(s) par semaine.
 *
 * Première inscription → tarif plein de la fréquence choisie.
 * Ajout d'heures à un forfait existant → seule la DIFFÉRENCE vers le forfait
 * cumulé (plafonné à 3×/sem) est facturée, jamais un second forfait plein.
 * Ce montant doit rester cohérent avec calculerForfaitAnnuel() : c'est le prix
 * que la famille a lu avant de cliquer.
 */
export function prixAjoutAffiche(params: {
  tarifs: ForfaitTarifs;
  frequenceDejaInscrite: number;
  nNouveau: number;
}): number {
  const { tarifs, frequenceDejaInscrite, nNouveau } = params;
  const ajout = frequenceDejaInscrite > 0;
  const tarifFreq = (f: number) => tarifPourFrequence(tarifs, f);
  if (!ajout) return tarifFreq(nNouveau);
  const cumul = Math.min(3, frequenceDejaInscrite + nNouveau);
  return Math.max(0, tarifFreq(cumul) - tarifFreq(frequenceDejaInscrite));
}
