/**
 * POST /api/admin/reset-family-financial
 *
 * Réinitialise TOUTES les données financières d'une famille (utile pour
 * créer un compte de test "vierge" sans avoir à recréer la famille +
 * enfants + auth).
 *
 * Body : { familyId: string, apply?: boolean }
 *   - apply=false (défaut) : dry-run, retourne ce qui SERA supprimé
 *   - apply=true : exécute réellement
 *
 * Ce qui est supprimé :
 *   - payments (tous statuts confondus)
 *   - avoirs
 *   - rattrapages
 *   - forfaits
 *   - cartes
 *   - echeances-sepa
 *   - mandats-sepa
 *   - reservations
 *   - bonsRecup (collection legacy)
 *   - paiements offerts éventuels
 *
 * Ce qui est PRÉSERVÉ :
 *   - le doc family (parent, enfants, contact, etc.)
 *   - les enfants (id, prénom, âge, galop, etc.)
 *   - les inscriptions sur les créneaux (enrolled[] reste intact)
 *   - le compte Firebase Auth
 *   - les emails-log (audit)
 *
 * 🔒 Sécurité : adminOnly via verifyAuth.
 * ⚠️ Opération irréversible quand apply=true.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Collections où familyId est un champ direct du document
const COLLECTIONS_BY_FAMILYID = [
  "payments",
  "avoirs",
  "rattrapages",
  "forfaits",
  "cartes",
  "echeances-sepa",
  "mandats-sepa",
  "reservations",
  "bonsRecup",
  "fidelite_transactions", // Historique des gains/conso de points
  "recurrences",           // Pensions et autres prestations recurrentes
];

// Collections où le doc ID EST le familyId (1 doc max par famille)
const COLLECTIONS_BY_DOC_ID = [
  "fidelite", // Solde de points stocké à fidelite/{familyId}
];

export async function POST(req: NextRequest) {
  // 🔒 Admin uniquement (suppression de masse)
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const reqBody = await req.json();
    const { familyId, apply } = reqBody;

    if (!familyId) {
      return NextResponse.json({ error: "familyId requis" }, { status: 400 });
    }

    // NB : opération ciblée sur UNE seule famille, déjà protégée par
    // l'auth admin + le dry-run + la confirmation nommée côté UI.
    // Le garde-fou anti-prod ne s'applique qu'aux resets massifs
    // (reset-base, reset-compta), pas aux opérations par-famille.

    // Vérifier que la famille existe (sécurité supplémentaire)
    const famDoc = await adminDb.collection("families").doc(familyId).get();
    if (!famDoc.exists) {
      return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    }
    const famData = famDoc.data();
    const familyName = famData?.parentName || famData?.name || familyId;

    // ── Phase 1 : inventaire ─────────────────────────────────────────
    // On compte (et liste les IDs) ce qui SERA supprimé. Permet à
    // l'admin de valider avant le coup fatal.
    const inventory: Record<string, { count: number; ids: string[] }> = {};

    for (const colName of COLLECTIONS_BY_FAMILYID) {
      const snap = await adminDb
        .collection(colName)
        .where("familyId", "==", familyId)
        .get();
      inventory[colName] = {
        count: snap.size,
        ids: snap.docs.map(d => d.id),
      };
    }

    // Collections ou le doc ID EST le familyId : check existence direct
    for (const colName of COLLECTIONS_BY_DOC_ID) {
      const docSnap = await adminDb.collection(colName).doc(familyId).get();
      if (docSnap.exists) {
        inventory[colName] = { count: 1, ids: [familyId] };
      } else {
        inventory[colName] = { count: 0, ids: [] };
      }
    }

    const totalDocs = Object.values(inventory).reduce((s, x) => s + x.count, 0);

    // Mode dry-run : on n'écrit rien, on retourne juste l'inventaire
    if (!apply) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        familyId,
        familyName,
        totalDocs,
        inventory,
        message: `DRY-RUN : ${totalDocs} document(s) seraient supprimés pour la famille "${familyName}".`,
      });
    }

    // ── Phase 2 : suppression effective ──────────────────────────────
    // On batch par 450 (limite Firestore 500) pour chaque collection.
    const deletedByCollection: Record<string, number> = {};

    for (const [colName, info] of Object.entries(inventory)) {
      if (info.count === 0) {
        deletedByCollection[colName] = 0;
        continue;
      }
      let deleted = 0;
      for (let i = 0; i < info.ids.length; i += 450) {
        const batch = adminDb.batch();
        const chunk = info.ids.slice(i, i + 450);
        for (const id of chunk) {
          batch.delete(adminDb.collection(colName).doc(id));
        }
        await batch.commit();
        deleted += chunk.length;
      }
      deletedByCollection[colName] = deleted;
    }

    const totalDeleted = Object.values(deletedByCollection).reduce((s, n) => s + n, 0);

    // ── Phase 3 : nettoyer creneaux.enrolled[] ──────────────────────
    // Le reset des reservations a supprime les docs, mais l'inscription
    // au niveau du creneau (enrolled[]) doit aussi etre purgee, sinon :
    // - L'admin voit la famille toujours inscrite
    // - Les places restantes sont incorrectes
    // - Cote client, l'enfant est inscrit dans le creneau mais pas dans
    //   ses reservations (incoherent)
    //
    // On scanne tous les creneaux et on retire les entries ou familyId
    // matche. On ne touche qu'aux creneaux qui ont effectivement un
    // enrolled[] non-vide pour cette famille (perf).
    let creneauxCleaned = 0;
    const allCreneauxSnap = await adminDb.collection("creneaux").get();
    for (const doc of allCreneauxSnap.docs) {
      const data = doc.data();
      const enrolled = (data.enrolled || []) as any[];
      if (enrolled.length === 0) continue;
      const filtered = enrolled.filter(e => e.familyId !== familyId);
      if (filtered.length === enrolled.length) continue; // pas concerne
      // Mise a jour : nouveau enrolled + enrolledCount
      await doc.ref.update({
        enrolled: filtered,
        enrolledCount: filtered.length,
      });
      creneauxCleaned++;
    }

    // Audit log
    console.log(`[reset-family-financial] Famille "${familyName}" (${familyId}) :`, deletedByCollection, `+ ${creneauxCleaned} creneaux purges`);

    return NextResponse.json({
      success: true,
      dryRun: false,
      familyId,
      familyName,
      totalDeleted,
      deletedByCollection,
      creneauxCleaned,
      message: `✅ ${totalDeleted} document(s) supprimés pour la famille "${familyName}". ${creneauxCleaned} créneau(x) purgé(s) des inscriptions. La fiche famille est préservée.`,
    });
  } catch (error: any) {
    console.error("[reset-family-financial] Erreur:", error);
    return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
  }
}
