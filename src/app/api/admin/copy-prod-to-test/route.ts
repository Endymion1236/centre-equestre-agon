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
 * cette route ne peut pas écrire en production, même appelée à tort. Le
 * vidage « base propre » ne connaît lui aussi que la destination.
 *
 * Refuse également de s'exécuter si source et destination sont la même base —
 * cas d'une configuration incomplète, où la copie n'aurait aucun sens. C'est
 * aussi pourquoi le bouton ne fonctionne que depuis le site de PRODUCTION :
 * appelé depuis la préversion test, source et destination se confondent.
 *
 * ── Protections ──────────────────────────────────────────────────────────
 *
 *   - verifyAuth adminOnly ;
 *   - DRY-RUN par défaut : ?apply=true pour écrire réellement ;
 *   - mot-clé ?confirm=COPIER-VERS-TEST exigé pour l'écriture ;
 *   - écriture en `set` sans fusion : la copie doit être fidèle, pas un
 *     mélange entre l'ancien contenu de test et le nouveau.
 *
 * ── Base propre (?propre=true) ───────────────────────────────────────────
 *
 * Par défaut, les documents présents dans la base de test et absents de la
 * production ne sont PAS supprimés. Avec ?propre=true, la base de test est
 * VIDÉE avant la copie (toutes ses collections, sous-collections comprises) :
 * la base de test devient alors une réplique exacte de la production au
 * moment de la copie. L'outil de reset de la production a été retiré le
 * 30/08/2026 (loi anti-fraude) ; celui-ci ne peut vider QUE la base de test.
 *
 * ── Garder des familles de données (?garder=compta-depenses,…) ───────────
 *
 * Les groupes listés dans ?garder= (cf. lib/groupes-copie-test) ne sont ni
 * vidés ni recopiés : le travail fait en test sur ces données (rapprochements,
 * justificatifs…) survit à la remise à niveau du reste.
 *
 * ── Sous-collections ─────────────────────────────────────────────────────
 *
 * `listCollections()` ne voit que le premier niveau. Les sous-collections
 * connues (historique des pièces et des doublons, événements de limitation
 * de débit) sont copiées par requête de groupe, au même chemin.
 *
 * ── Ce qui n'est PAS copié ───────────────────────────────────────────────
 *
 *   - les comptes Firebase Auth : la base de test a ses propres utilisateurs.
 *     Une famille qui se connecte en test retrouve sa fiche par son adresse
 *     (rattachement /api/famille/lier-compte) ;
 *   - les fichiers Storage (justificatifs, photos) : les métadonnées sont
 *     copiées, pas les fichiers. « Voir la pièce » échouera en test.
 *
 * ⚠️ Cette copie emporte des données personnelles réelles. La base de test
 * doit être protégée comme la production : mêmes règles Firestore, mêmes
 * accès restreints.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { firestoreDeTest, projetDeTest, BaseDeTestIndisponible } from "@/lib/firebase-admin-test";
import { lireGroupesGardes, planifierCopie, resumeParGroupe } from "@/lib/groupes-copie-test";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MOT_CLE = "COPIER-VERS-TEST";

/** Firestore limite un lot à 500 écritures. */
const TAILLE_LOT = 400;

/** Sous-collections utilisées par l'application (chemin doc/sous-collection/doc). */
const SOUS_COLLECTIONS = ["historique", "events"] as const;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const source = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const destination = projetDeTest();

  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const propre = req.nextUrl.searchParams.get("propre") === "true";
  const confirm = req.nextUrl.searchParams.get("confirm") || "";
  let etape = "initialisation";
  const debut = Date.now();

  let garder: string[];
  try {
    garder = lireGroupesGardes(req.nextUrl.searchParams.get("garder"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), projectId: source }, { status: 400 });
  }

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
        error: `Source et destination sont la même base (${source}). Rien à copier. `
          + "Lancez la copie depuis le site de production : c'est lui qui lit la production et écrit en test.",
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

    // Étape en cours, pour que l'échec dise OÙ il s'est produit. Une copie qui
    // ne renvoie que « Erreur interne » n'est pas diagnosticable depuis
    // l'écran : il faut aller lire les logs Vercel, ce qui n'est pas à la
    // portée de qui administre le club.
    etape = "connexion à la base de test";

    // Un aller-retour minimal avant de tout lire : identifiants refusés ou
    // base Firestore jamais créée se voient ici, en une seconde, plutôt
    // qu'après plusieurs minutes de lecture.
    const collectionsTest = await dbTest.listCollections();

    // Toutes les collections de la source, découvertes à l'exécution : aucune
    // liste à maintenir, et rien qui puisse être oublié à l'ajout d'un module.
    const collections = await adminDb.listCollections();

    // Le plan dit, collection par collection, ce qui lui arrive ; les groupes
    // gardés n'y apparaissent qu'en « garder ».
    const plan = planifierCopie({
      collectionsSource: collections.map((c) => c.id),
      collectionsTest: collectionsTest.map((c) => c.id),
      propre,
      garder,
    });
    const actionDe = new Map(plan.map((p) => [p.collection, p.action]));
    const gardees = plan.filter((p) => p.action === "garder").map((p) => p.collection);

    // ── Base propre : vider la destination avant de copier ──────────────
    // `recursiveDelete` emporte les sous-collections ; il ne connaît que
    // `dbTest`, jamais `adminDb` — la production n'est pas atteignable ici.
    const effaces: Record<string, number> = {};
    let totalEffaces = 0;
    if (propre) {
      for (const coll of collectionsTest) {
        if (actionDe.get(coll.id) !== "vider-puis-copier") continue;
        etape = `comptage de « ${coll.id} » dans ${destination} (base propre)`;
        const nb = (await coll.count().get()).data().count;
        effaces[coll.id] = nb;
        totalEffaces += nb;
        if (!apply) continue;
        etape = `vidage de « ${coll.id} » (${nb} documents) dans ${destination}`;
        await dbTest.recursiveDelete(coll);
      }
    }

    const parCollection: Record<string, number> = {};
    let total = 0;

    for (const coll of collections) {
      if (actionDe.get(coll.id) === "garder") continue;
      etape = `lecture de « ${coll.id} » dans ${source}`;
      const snap = await coll.get();
      parCollection[coll.id] = snap.size;
      total += snap.size;

      if (!apply || snap.empty) continue;

      etape = `écriture de « ${coll.id} » (${snap.size} documents) vers ${destination}`;
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

    // ── Sous-collections, au même chemin que dans la source ─────────────
    const sousCollections: Record<string, number> = {};
    for (const nom of SOUS_COLLECTIONS) {
      etape = `lecture des sous-collections « ${nom} » dans ${source}`;
      const snap = await adminDb.collectionGroup(nom).get();
      // Les collections de premier niveau portant ce nom ont déjà été copiées ;
      // une sous-collection suit le sort de sa collection racine.
      const docs = snap.docs.filter((d) => d.ref.parent.parent !== null && actionDe.get(d.ref.path.split("/")[0]) !== "garder");
      sousCollections[nom] = docs.length;
      total += docs.length;
      if (!apply || docs.length === 0) continue;

      etape = `écriture des sous-collections « ${nom} » (${docs.length} documents) vers ${destination}`;
      let lot = dbTest.batch();
      let dansLeLot = 0;
      for (const docSnap of docs) {
        lot.set(dbTest.doc(docSnap.ref.path), docSnap.data());
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
      mode: apply ? (propre ? "COPIE RÉELLE SUR BASE PROPRE" : "COPIE RÉELLE") : "DRY-RUN (comptage seul)",
      source,
      destination,
      projectId: source,
      base_propre: propre,
      garder,
      groupes: resumeParGroupe(garder),
      collections_gardees: gardees,
      plan,
      effaces_test: propre ? { total: totalEffaces, par_collection: effaces } : null,
      total_documents: total,
      par_collection: parCollection,
      sous_collections: sousCollections,
      duree_secondes: Math.round((Date.now() - debut) / 1000),
      note: apply
        ? (propre
          ? `La base de test a été vidée (${totalEffaces} documents) puis recopiée${gardees.length ? `, sauf ${gardees.length} collection(s) gardée(s) telle(s) quelle(s) en test` : " : elle est identique à la production à cet instant"}. Comptes Auth et fichiers Storage non copiés.`
          : "Les documents absents de la source n'ont pas été supprimés de la base de test.")
        : `Aucune écriture. Relancez avec ?apply=true&confirm=${MOT_CLE}${propre ? "&propre=true" : ""}${garder.length ? `&garder=${garder.join(",")}` : ""}.`,
    });
  } catch (e: unknown) {
    if (e instanceof BaseDeTestIndisponible) {
      return NextResponse.json({ error: e.message, projectId: source }, { status: 400 });
    }
    console.error("[copy-prod-to-test]", e);
    // Message réel plutôt que « Erreur interne » : la route est réservée à
    // l'administration, et sans le motif la copie est impossible à réparer.
    const message = e instanceof Error ? e.message : String(e);
    const indice =
      /NOT_FOUND|does not exist|database .* not found/i.test(message)
        ? "La base Firestore du projet de test n'existe probablement pas encore. Console Firebase → projet de test → Firestore Database → Créer une base de données (mode production, même région que la production)."
      : /PERMISSION_DENIED|Missing or insufficient|403/i.test(message)
        ? "Le compte de service n'a pas les droits sur le projet de test : vérifiez que la clé provient bien de ce projet-là."
      : /UNAUTHENTICATED|invalid_grant|DECODER|PEM|private key|Getting metadata|invalid_client/i.test(message)
        ? "Identifiants refusés par Google. Trois causes, dans l'ordre de fréquence : (1) la clé a été supprimée dans la console — il en faut une nouvelle ; (2) FIREBASE_TEST_CLIENT_EMAIL et FIREBASE_TEST_PRIVATE_KEY ne viennent pas du MÊME fichier JSON ; (3) la clé est tronquée — le bloc doit commencer par -----BEGIN PRIVATE KEY----- et finir par -----END PRIVATE KEY-----, sans guillemets. Après correction, redéployez : les variables ne sont relues qu'au démarrage."
      : /FUNCTION_INVOCATION_TIMEOUT|timed? ?out|DEADLINE_EXCEEDED/i.test(message)
        ? "La copie a dépassé le temps alloué. Relancez-la telle quelle : le vidage et la copie reprennent là où ils se sont arrêtés (opérations rejouables)."
      : undefined;
    return NextResponse.json({
      error: `Copie interrompue — ${etape} : ${message}`,
      ...(indice ? { indice } : {}),
      source,
      destination,
      projectId: source,
    }, { status: 500 });
  }
}
