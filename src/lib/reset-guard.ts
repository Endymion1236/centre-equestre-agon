/**
 * Garde-fou anti-reset accidentel de la PRODUCTION.
 *
 * Contexte : un environnement de test (branche 'test' -> projet Firebase
 * gestion-2026-test) coexiste avec la prod (gestion-2026). Les routes de
 * reset (reset-base, reset-compta, reset-family-financial, reset-pre-prod)
 * sont destructrices. Si par erreur les variables d'env Vercel pointaient
 * la branche test vers la prod, un reset effacerait les vraies donnees.
 *
 * Ce helper verifie le projectId Firebase ACTIF au runtime et bloque toute
 * operation destructrice si on est sur la prod, SAUF deblocage explicite.
 *
 * Usage dans une route de reset :
 *
 *   import { assertResetAllowed } from "@/lib/reset-guard";
 *   const guard = assertResetAllowed(body);
 *   if (guard) return guard; // NextResponse 403 si bloque
 *
 * Pour reset la prod volontairement (ex: bascule pre-prod septembre), passer
 * dans le body : { confirmProdReset: "OUI-JE-VEUX-EFFACER-LA-PROD-2026" }
 */

import { NextResponse } from "next/server";

// ProjectId de la PROD. Toute base differente est consideree comme un
// environnement de test/dev ou le reset est libre.
const PROD_PROJECT_ID = "gestion-2026";

// Phrase de deblocage pour reset la prod en connaissance de cause.
// Volontairement longue et explicite : impossible a taper par accident.
export const PROD_UNLOCK_PHRASE = "OUI-JE-VEUX-EFFACER-LA-PROD-2026";

/**
 * Retourne le projectId Firebase reellement actif au runtime.
 * Priorite identique a firebase-admin.ts.
 */
export function getActiveProjectId(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    PROD_PROJECT_ID // fallback = prod (le code en dur historique)
  );
}

export function isProdEnvironment(): boolean {
  return getActiveProjectId() === PROD_PROJECT_ID;
}

/**
 * Verifie qu'une operation de reset est autorisee.
 * - Si on est sur un env de test (projectId != prod) -> autorise (retourne null)
 * - Si on est sur la prod -> BLOQUE, sauf si body.confirmProdReset == phrase
 *
 * Retourne une NextResponse 403 si bloque, ou null si autorise.
 */
export function assertResetAllowed(body?: { confirmProdReset?: string }): NextResponse | null {
  const projectId = getActiveProjectId();

  // Env de test/dev : reset libre
  if (projectId !== PROD_PROJECT_ID) {
    console.log(`[reset-guard] OK — environnement non-prod (${projectId})`);
    return null;
  }

  // On est sur la PROD : deblocage explicite requis
  if (body?.confirmProdReset === PROD_UNLOCK_PHRASE) {
    console.warn(`[reset-guard] ⚠️ RESET PROD AUTORISE explicitement (projectId=${projectId})`);
    return null;
  }

  console.error(`[reset-guard] ⛔ RESET BLOQUE — tentative sur la PROD (${projectId}) sans deblocage`);
  return NextResponse.json(
    {
      error: "Reset bloqué : opération destructrice sur la base de PRODUCTION.",
      details: `La base active est "${projectId}" (production). Pour effacer un environnement de test, vérifie que tu es bien sur la branche test (base gestion-2026-test). Pour effacer la prod volontairement, passe confirmProdReset avec la phrase de déblocage.`,
      activeProjectId: projectId,
    },
    { status: 403 },
  );
}
