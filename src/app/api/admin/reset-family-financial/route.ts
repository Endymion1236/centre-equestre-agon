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
];

export async function POST(req: NextRequest) {
  // 🔒 Admin uniquement (suppression de masse)
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { familyId, apply } = await req.json();

    if (!familyId) {
      return NextResponse.json({ error: "familyId requis" }, { status: 400 });
    }

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

    // Audit log
    console.log(`[reset-family-financial] Famille "${familyName}" (${familyId}) :`, deletedByCollection);

    return NextResponse.json({
      success: true,
      dryRun: false,
      familyId,
      familyName,
      totalDeleted,
      deletedByCollection,
      message: `✅ ${totalDeleted} document(s) supprimés pour la famille "${familyName}". Les inscriptions aux créneaux et la fiche famille sont préservées.`,
    });
  } catch (error: any) {
    console.error("[reset-family-financial] Erreur:", error);
    return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
  }
}
