/**
 * POST /api/admin/copy-prod-to-test
 *
 * Recopie les données de la base COURANTE vers la base de TEST, pour essayer
 * une fonctionnalité sur des données réalistes sans toucher à la production.
 *
 * Cette route était déjà appelée par /admin/import-celeris mais n'existait
 * pas : le bouton renvoyait un 404 silencieux. Elle ne copiait par ailleurs
 * que les familles ; elle copie désormais toutes les collections, sans liste
 * à tenir à jour — une collection ajoutée demain suivra d'elle-même.
 *
 * ── Sens unique, garanti par le code ──────────────────────────────────────
 *
 * La destination est toujours la base nommée par FIREBASE_TEST_PROJECT_ID, et
 * `assertBaseDeTest` refuse toute base dont le nom ne contient pas « test ».
 * Il n'existe aucun paramètre permettant d'inverser source et destination :
 * cette route ne peut pas écrire en production, même appelée à tort.
 *
 * Refuse également de s'exécuter si source et destination sont la même base —
 * cas d'une configuration incomplète, où la copie n'aurait aucun sens.
 *
 * ── Protections ──────────────────────────────────────────────────────────
 *
 *   - verifyAuth adminOnly ;
 *   - DRY-RUN par défaut : ?apply=true pour écrire réellement ;
 *   - mot-clé ?confirm=COPIER-VERS-TEST exigé pour l'écriture ;
 *   - écriture en `set` sans fusion : la copie doit être fidèle, pas un
 *     mélange entre l'ancien contenu de test et le nouveau.
 *
 * Les documents présents dans la base de test et absents de la production ne
 * sont PAS supprimés : effacer est une décision qui ne se prend pas au détour
 * d'une copie. Pour repartir propre, vider d'abord la base de test.
 *
 * ⚠️ Cette copie emporte des données personnelles réelles. La base de test
 * doit être protégée comme la production : mêmes règles Firestore, mêmes
 * accès restreints.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { firestoreDeTest, projetDeTest, BaseDeTestIndisponible } from "@/lib/firebase-admin-test";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MOT_CLE = "COPIER-VERS-TEST";

/** Firestore limite un lot à 500 écritures. */
const TAILLE_LOT = 400;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const source = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const destination = projetDeTest();

  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const confirm = req.nextUrl.searchParams.get("confirm") || "";

  try {
    if (!destination) {
      return NextResponse.json({
        error: "Aucune base de test configurée. Définissez FIREBASE_TEST_PROJECT_ID, "
          + "FIREBASE_TEST_CLIENT_EMAIL et FIREBASE_TEST_PRIVATE_KEY dans Vercel.",
        projectId: source,
      }, { status: 400 });
    }

    if (destination === source) {
      return NextResponse.json({
        error: `Source et destination sont la même base (${source}). Rien à copier.`,
        projectId: source,
      }, { status: 400 });
    }

    if (apply && confirm !== MOT_CLE) {
      return NextResponse.json({
        error: `Confirmation requise : ajoutez ?confirm=${MOT_CLE} pour copier réellement.`,
        projectId: source,
      }, { status: 403 });
    }

    // Lève si la destination ne se présente pas comme une base de test.
    const dbTest = firestoreDeTest();

    // Toutes les collections de la source, découvertes à l'exécution : aucune
    // liste à maintenir, et rien qui puisse être oublié à l'ajout d'un module.
    const collections = await adminDb.listCollections();

    const parCollection: Record<string, number> = {};
    let total = 0;

    for (const coll of collections) {
      const snap = await coll.get();
      parCollection[coll.id] = snap.size;
      total += snap.size;

      if (!apply || snap.empty) continue;

      let lot = dbTest.batch();
      let dansLeLot = 0;
      for (const docSnap of snap.docs) {
        lot.set(dbTest.collection(coll.id).doc(docSnap.id), docSnap.data());
        dansLeLot++;
        if (dansLeLot >= TAILLE_LOT) {
          await lot.commit();
          lot = dbTest.batch();
          dansLeLot = 0;
        }
      }
      if (dansLeLot > 0) await lot.commit();
    }

    return NextResponse.json({
      success: true,
      mode: apply ? "COPIE RÉELLE" : "DRY-RUN (comptage seul)",
      source,
      destination,
      projectId: source,
      total_documents: total,
      par_collection: parCollection,
      note: apply
        ? "Les documents absents de la source n'ont pas été supprimés de la base de test."
        : `Aucune écriture. Relancez avec ?apply=true&confirm=${MOT_CLE}.`,
    });
  } catch (e: unknown) {
    if (e instanceof BaseDeTestIndisponible) {
      return NextResponse.json({ error: e.message, projectId: source }, { status: 400 });
    }
    console.error("[copy-prod-to-test]", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
