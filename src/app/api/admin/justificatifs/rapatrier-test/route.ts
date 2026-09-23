/**
 * POST /api/admin/justificatifs/rapatrier-test
 *
 * Rapatrie en PRODUCTION les justificatifs, dépenses lues sur les relevés et
 * le tableau des opérations faits sur la préversion test (règles dans
 * lib/rapatriement-test-utils). Trois étapes, appelées par l'écran Pièces :
 *
 *   { etape: "apercu" }                          → ce qui serait créé, rien n'est écrit ;
 *   { etape: "documents", confirm: MOT_CLE }     → crée les documents absents ;
 *   { etape: "fichiers",  confirm: MOT_CLE }     → copie un lot de fichiers de pièces,
 *                                                  renvoie `restants` ; l'écran rappelle.
 *
 * Garde-fous :
 *   - admin uniquement ;
 *   - refuse de tourner sur la base de test elle-même (source = destination) ;
 *   - la base de test n'est que LUE ;
 *   - en production, on ne fait que CRÉER des documents absents (`create`,
 *     qui échoue plutôt que d'écraser) : rien n'est modifié ni effacé ;
 *   - rejouable : ce qui est déjà là est compté et laissé tel quel.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { messageErreur } from "@/lib/message-erreur";
import { BaseDeTestIndisponible, firestoreDeTest, projetDeTest, seauDeTest } from "@/lib/firebase-admin-test";
import {
  COLLECTIONS_RAPATRIEES,
  fichiersACopier,
  planifierRapatriement,
  type CollectionRapatriee,
  type DocSimple,
} from "@/lib/rapatriement-test-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOT_CLE = "RAPATRIER-DEPUIS-TEST";
const TAILLE_LOT = 400;
const BUDGET_MS = 45_000;
const PREFIXE = "justificatifs-prives/";

async function lirePlan() {
  const dbTest = firestoreDeTest();
  const test: Partial<Record<CollectionRapatriee, DocSimple[]>> = {};
  const idsProd: Partial<Record<CollectionRapatriee, Set<string>>> = {};
  await Promise.all(COLLECTIONS_RAPATRIEES.map(async (c) => {
    const [snapTest, snapProd] = await Promise.all([
      dbTest.collection(c).get(),
      adminDb.collection(c).select().get(),
    ]);
    test[c] = snapTest.docs.map((d) => ({ id: d.id, data: d.data() }));
    idsProd[c] = new Set(snapProd.docs.map((d) => d.id));
  }));
  const depProd = await adminDb.collection("depenses").select("mois", "montant", "fournisseur").get();
  const depensesProd = depProd.docs.map((d) => ({ id: d.id, data: d.data() }));
  return { dbTest, plan: planifierRapatriement({ test, idsProd, depensesProd }) };
}

function resume(plan: ReturnType<typeof planifierRapatriement>) {
  const parCollection = COLLECTIONS_RAPATRIEES
    .map((c) => ({ collection: c, aCreer: plan.aCreer[c].length, dejaPresents: plan.dejaPresents[c] }))
    .filter((l) => l.aCreer + l.dejaPresents > 0);
  return {
    parCollection,
    piecesDetachees: plan.piecesDetachees.length,
    liensIgnores: plan.liensIgnores,
    doublonsProbables: plan.doublonsProbables.slice(0, 50),
    nbDoublonsProbables: plan.doublonsProbables.length,
  };
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const debut = Date.now();

  try {
    const courant = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "").trim();
    const baseTest = projetDeTest();
    if (!baseTest) return NextResponse.json({ error: "Aucune base de test configurée sur ce site (FIREBASE_TEST_PROJECT_ID)." }, { status: 400 });
    if (!courant || courant === baseTest || courant.toLowerCase().includes("test")) {
      return NextResponse.json({ error: `Ce site travaille déjà sur la base de test (${courant || "?"}). Lancez le rapatriement depuis le site de production.` }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const etape = String(body?.etape || "apercu");
    if (etape !== "apercu" && body?.confirm !== MOT_CLE) {
      return NextResponse.json({ error: "Confirmation manquante." }, { status: 400 });
    }

    // ── Aperçu ────────────────────────────────────────────────────────
    if (etape === "apercu") {
      const { plan } = await lirePlan();
      return NextResponse.json({ ok: true, source: baseTest, destination: courant, ...resume(plan) });
    }

    // ── Documents ─────────────────────────────────────────────────────
    if (etape === "documents") {
      const { dbTest, plan } = await lirePlan();
      let crees = 0;
      const ecritures: { chemin: string; data: Record<string, any> }[] = [];
      for (const c of COLLECTIONS_RAPATRIEES) {
        for (const d of plan.aCreer[c]) ecritures.push({ chemin: `${c}/${d.id}`, data: d.data });
      }
      // Historique des pièces et des doublons : sous-collection « historique »
      // des documents créés ici, et d'eux seuls.
      const parents = new Set(ecritures.map((e) => e.chemin));
      const histo = await dbTest.collectionGroup("historique").get();
      for (const h of histo.docs) {
        const parent = h.ref.parent.parent?.path;
        if (parent && parents.has(parent)) ecritures.push({ chemin: h.ref.path, data: h.data() });
      }
      for (let i = 0; i < ecritures.length; i += TAILLE_LOT) {
        const lot = adminDb.batch();
        for (const e of ecritures.slice(i, i + TAILLE_LOT)) lot.create(adminDb.doc(e.chemin), e.data);
        await lot.commit();
        crees += Math.min(TAILLE_LOT, ecritures.length - i);
      }
      await adminDb.collection("rapatriements-test").add({
        source: baseTest, uid: auth.uid, at: FieldValue.serverTimestamp(),
        documentsCrees: crees, ...resume(plan),
      });
      return NextResponse.json({ ok: true, documentsCrees: crees, ...resume(plan) });
    }

    // ── Fichiers des pièces ───────────────────────────────────────────
    if (etape === "fichiers") {
      const seauTest = await seauDeTest();
      const seauProd = adminStorage.bucket();
      const [[fTest], [fProd], piecesSnap] = await Promise.all([
        seauTest.getFiles({ prefix: PREFIXE }),
        seauProd.getFiles({ prefix: PREFIXE }),
        adminDb.collection("justificatifs").select().get(),
      ]);
      const aCopier = fichiersACopier(fTest.map((f) => f.name), fProd.map((f) => f.name), new Set(piecesSnap.docs.map((d) => d.id)));
      const copies: string[] = [];
      const echecs: string[] = [];
      for (const nom of aCopier) {
        if (Date.now() - debut > BUDGET_MS) break;
        try {
          const source = seauTest.file(nom);
          const [[contenu], [meta]] = await Promise.all([source.download(), source.getMetadata()]);
          await seauProd.file(nom).save(contenu, {
            resumable: false,
            contentType: meta.contentType || "application/octet-stream",
            metadata: { cacheControl: "private, no-store" },
          });
          copies.push(nom);
        } catch (e) {
          echecs.push(`${nom.slice(PREFIXE.length, PREFIXE.length + 12)}… : ${messageErreur(e, 120)}`);
        }
      }
      return NextResponse.json({ ok: true, copies: copies.length, echecs, restants: aCopier.length - copies.length - echecs.length });
    }

    return NextResponse.json({ error: "Étape inconnue" }, { status: 400 });
  } catch (e) {
    if (e instanceof BaseDeTestIndisponible) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[rapatrier-test]", e);
    return NextResponse.json({ error: `Rapatriement interrompu — ${messageErreur(e)}. Relancez : ce qui est déjà créé est conservé et ne sera pas dupliqué.` }, { status: 500 });
  }
}
