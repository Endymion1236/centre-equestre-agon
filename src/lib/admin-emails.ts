/**
 * src/lib/admin-emails.ts — source unique des adresses administratrices.
 *
 * La liste était recopiée dans quatre fichiers (api-auth.ts, auth-context.tsx,
 * reset-base/route.ts, firestore.rules). Trois d'entre eux sont désormais
 * alimentés d'ici ; firestore.rules garde forcément sa propre copie (les
 * règles ne savent pas importer) et doit rester alignée à la main.
 *
 * ⚠️ Ce repli par email n'est PAS une identité de confiance.
 *
 * Un jeton Firebase porte l'adresse déclarée au compte, pas une adresse
 * prouvée : l'inscription par email/mot de passe est active sur ce projet
 * (createUserWithEmailAndPassword est utilisé par l'application). Accorder les
 * droits sur `token.email` seul revenait donc à faire dépendre toute
 * l'administration d'un réglage de la console Firebase (« une seule adresse
 * par compte ») et du fait que ces comptes existent déjà — deux protections
 * hors du code, qu'aucun test ne surveille.
 *
 * Règle retenue (audit 29/08/2026) : l'autorité, c'est le custom claim
 * `admin: true`. Le repli par email ne survit que pour dépanner une base SANS
 * claims configurés (base de test), et seulement si l'adresse est vérifiée.
 */

export const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
] as const;

export function estEmailAdmin(email?: string | null): boolean {
  return !!email && (ADMIN_EMAILS as readonly string[]).includes(email);
}

/**
 * Projet Firebase de PRODUCTION. Même convention que lib/reset-guard.ts.
 *
 * On discrimine sur la base de données visée, pas sur NODE_ENV : un build
 * Vercel est en `production` même quand il pointe la base de test, et se fier
 * à NODE_ENV enfermerait l'administrateur hors de son propre environnement de
 * test — là où le repli sert précisément.
 */
const PROD_PROJECT_ID = "gestion-2026";

/**
 * Le repli par email est-il autorisé sur la base actuellement visée ?
 *
 * Jamais sur la base de production : là-bas, seul le claim fait foi. Sur une
 * base de test ou en développement, il évite de devoir poser les claims à la
 * main. En l'absence d'information, on suppose la production (fermé par
 * défaut).
 */
export function repliEmailAutorise(): boolean {
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    PROD_PROJECT_ID;
  return projectId !== PROD_PROJECT_ID;
}
