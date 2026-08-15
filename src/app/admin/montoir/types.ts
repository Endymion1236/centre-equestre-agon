/**
 * src/app/admin/montoir/types.ts
 *
 * Types et constantes partages par les modules du montoir — la feuille d'appel
 * qu'on tient en bord de carriere.
 *
 * Pourquoi les sortir de page.tsx : la page n'est plus seule a manipuler ces
 * formes. La cloture, le registre des chutes, la carte de reprise et la ligne
 * cavalier parlent tous du meme `Creneau` et du meme seuil de chutes. Une
 * deuxieme definition « a peu pres pareille » quelque part, et c'est une
 * affectation de poney ou un statut de presence qui se met a diverger d'un
 * ecran a l'autre.
 */

export interface Creneau { id: string; activityTitle: string; activityType: string; date: string; startTime: string; endTime: string; monitor: string; maxPlaces: number; enrolled: any[]; status: string; rotationPoneys?: boolean; }

/** Couleur d'accent par type d'activite (horaire affiche a gauche de la reprise). */
export const typeColors: Record<string,string> = {stage:"#27ae60",balade:"#e67e22",cours:"#2050A0",competition:"#7c3aed"};

export const SEUIL_CHUTES_PONEY = 3; // à partir de N chutes sur la saison → signal visuel

/**
 * Cavaliers proposes au bilan pedagogique juste apres une cloture.
 * `cid` est le creneau qui vient d'etre cloture.
 */
export type QuickNoteChild = { cid: string; children: any[] };

/** Chute en cours de saisie : la reprise et l'inscrit concernes. */
export type ChuteModal = { c: Creneau; e: any };

/** Champs du formulaire de chute (seules les circonstances sont obligatoires). */
export type ChuteForm = { circonstances: string; gravite: string; consequence: string; suites: string };

/** Signature du toast global, tel que le fournit `useToast`. */
export type Toast = (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;
