/**
 * src/lib/firebase-admin-test.ts
 *
 * Accès à la base de TEST depuis un déploiement quelconque.
 *
 * Pourquoi une seconde connexion : `lib/firebase-admin` ouvre la base de
 * l'environnement courant, et une seule. Copier la production vers la base de
 * test suppose de tenir les deux ouvertes en même temps — la source d'un côté,
 * la destination de l'autre.
 *
 * ── Variables à définir dans Vercel ───────────────────────────────────────
 *
 *   FIREBASE_TEST_PROJECT_ID     ex. gestion-2026-test
 *   FIREBASE_TEST_CLIENT_EMAIL   compte de service du projet de TEST
 *   FIREBASE_TEST_PRIVATE_KEY    sa clé privée
 *
 * Ce sont des identifiants DISTINCTS de ceux de production. Réutiliser le
 * compte de service de production ne donnerait aucun accès au projet de test :
 * les droits Firebase sont attachés à un projet.
 *
 * ── Le garde-fou ─────────────────────────────────────────────────────────
 *
 * `assertBaseDeTest()` refuse toute base dont l'identifiant ne contient pas
 * « test ». C'est ce qui rend la copie impossible à retourner par accident :
 * même appelée depuis la base de test, elle ne pourra jamais écrire dans la
 * production. Une convention de nommage n'est pas une preuve, mais c'est la
 * seule barrière que le code puisse vérifier seul — et elle coûte assez peu
 * pour ne pas s'en priver.
 */

import { initializeApp, getApps, getApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

const NOM_APP = "base-de-test";

export class BaseDeTestIndisponible extends Error {}

/** Identifiant du projet de test, ou "" si la configuration est absente. */
export function projetDeTest(): string {
  return (process.env.FIREBASE_TEST_PROJECT_ID || "").trim();
}

/**
 * Refuse une base qui ne se présente pas comme une base de test.
 * Lève plutôt que de renvoyer un booléen : un appelant ne doit pas pouvoir
 * ignorer ce refus par omission.
 */
export function assertBaseDeTest(projectId: string): void {
  if (!projectId.toLowerCase().includes("test")) {
    throw new BaseDeTestIndisponible(
      `Refus d'écrire dans « ${projectId} » : seule une base dont le nom contient « test » peut être une destination.`,
    );
  }
}

/** Firestore de la base de test. Lève si la configuration manque. */
export function firestoreDeTest(): Firestore {
  const projectId = projetDeTest();
  if (!projectId) {
    throw new BaseDeTestIndisponible(
      "FIREBASE_TEST_PROJECT_ID n'est pas défini : aucune base de test n'est configurée.",
    );
  }
  assertBaseDeTest(projectId);

  const clientEmail = (process.env.FIREBASE_TEST_CLIENT_EMAIL || "").trim();
  let privateKey = process.env.FIREBASE_TEST_PRIVATE_KEY || "";
  // Vercel échappe les sauts de ligne de la clé : même traitement qu'en prod.
  if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new BaseDeTestIndisponible(
      "FIREBASE_TEST_CLIENT_EMAIL ou FIREBASE_TEST_PRIVATE_KEY manque : la base de test est déclarée mais inaccessible.",
    );
  }

  const existante = getApps().find((a) => a.name === NOM_APP);
  const app: App = existante
    ? getApp(NOM_APP)
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, NOM_APP);

  return getFirestore(app);
}
