// =============================================================================
// Nom d'un poney dans l'organisation de concours — logique pure
// -----------------------------------------------------------------------------
// Comme au montoir : on affiche le surnom usuel s'il est renseigné dans la
// fiche cavalerie, sinon le nom officiel. Le planning, lui, garde le nom
// officiel (`horseName`) : on reconnaît donc un poney par l'un ou l'autre.
// =============================================================================

import type { Cheval } from "./types";

export interface PoneyBase {
  equideId: string;
  /** Nom affiché : surnom s'il existe, sinon nom officiel. */
  nom: string;
  nomOfficiel: string;
}

/** Fiche `equides` → poney affichable. */
export function poneyDepuisFiche(equideId: string, fiche: { name?: unknown; surnom?: unknown }): PoneyBase {
  const officiel = String(fiche.name ?? "").trim() || "?";
  const surnom = String(fiche.surnom ?? "").trim();
  return { equideId, nom: surnom || officiel, nomOfficiel: officiel };
}

const simplifier = (s: string) => s.trim().toLowerCase();

/** Retrouve un poney par son surnom ou son nom officiel (sans tenir compte des majuscules). */
export function trouverPoney(base: PoneyBase[], nom: string): PoneyBase | undefined {
  const cible = simplifier(nom);
  if (!cible) return undefined;
  return base.find((p) => simplifier(p.nom) === cible) ?? base.find((p) => simplifier(p.nomOfficiel) === cible);
}

/**
 * Remet à jour le nom des chevaux d'un concours venus de la cavalerie
 * (anciens concours enregistrés avec le nom officiel, surnom ajouté depuis).
 * Renvoie le même tableau si rien ne change.
 */
export function chevauxAvecSurnoms(chevaux: Cheval[], base: PoneyBase[]): Cheval[] {
  let change = false;
  const out = chevaux.map((ch) => {
    const p = ch.equideId ? base.find((x) => x.equideId === ch.equideId) : undefined;
    if (!p || p.nom === ch.nom) return ch;
    change = true;
    return { ...ch, nom: p.nom };
  });
  return change ? out : chevaux;
}
