/**
 * GET /api/admin/migrate-paiements-collection?secret=xxx
 *
 * One-shot de migration : copie les documents de la collection `paiements` (FR)
 * vers `payments` (EN) pour régulariser les paiements d'inscription annuelle
 * créés avant le fix de la collection cible.
 *
 * Origine du bug : espace-cavalier/inscription-annuelle/page.tsx utilisait
 * addDoc(collection(db, "paiements")) au lieu de "payments". Tout le reste
 * du système lit depuis "payments" — donc les inscriptions annuelles étaient
 * invisibles en admin (historique, stats) et côté cavalier (factures).
 *
 * Mode dry-run par défaut. ?apply=true pour exécuter.
 *
 * Stratégie :
 *   - Chaque doc source est copié vers payments/{newId}
 *   - Le champ migratedFrom est ajouté pour traçabilité
 *   - Le doc source reçoit migratedTo + migratedAt (pas supprimé — on garde
 *     la trace pour pouvoir rollback ou auditer)
 *
 * Les champs sont mappés au format payments standard (ajout paidAmount=0,
 * source="inscription-annuelle-migration" si manquants).
 *
 * ⚠️ À supprimer après exécution réussie.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Route non configurée" }, { status: 500 });
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";

  try {
    // Charger tous les docs de la collection paiements (FR)
    const sourceSnap = await adminDb.collection("paiements").get();

    if (sourceSnap.empty) {
      return NextResponse.json({
        mode: apply ? "apply" : "dry-run",
        found: 0,
        migrated: 0,
        alreadyMigrated: 0,
        skipped: 0,
        message: "Aucun document dans la collection 'paiements' — rien à migrer.",
      });
    }

    const toMigrate: any[] = [];
    const alreadyMigrated: any[] = [];

    for (const doc of sourceSnap.docs) {
      const data = doc.data();
      if (data.migratedTo) {
        alreadyMigrated.push({
          sourceId: doc.id,
          migratedTo: data.migratedTo,
          familyName: data.familyName || "",
          label: data.label || "",
        });
        continue;
      }
      toMigrate.push({
        sourceId: doc.id,
        familyId: data.familyId || null,
        familyName: data.familyName || "",
        childName: data.childName || "",
        label: data.label || "",
        totalTTC: data.totalTTC || 0,
        type: data.type || null,
        status: data.status || "pending",
        data,
      });
    }

    if (!apply) {
      return NextResponse.json({
        mode: "dry-run",
        found: sourceSnap.size,
        toMigrateCount: toMigrate.length,
        alreadyMigratedCount: alreadyMigrated.length,
        toMigrate: toMigrate.map(({ data, ...rest }) => rest),
        alreadyMigrated,
        hint: "Ajouter ?apply=true pour exécuter la migration.",
      });
    }

    // Mode apply : copier vers payments + marquer la source
    let migrated = 0;
    const errors: any[] = [];

    for (const item of toMigrate) {
      try {
        // Créer le doc cible avec les champs standards du format payments
        const targetRef = adminDb.collection("payments").doc();
        const targetData: any = {
          ...item.data,
          // Champs standards payments si manquants
          paidAmount: item.data.paidAmount ?? 0,
          source: item.data.source || "inscription-annuelle-migration",
          // Traçabilité de la migration
          migratedFrom: `paiements/${item.sourceId}`,
          migratedAt: FieldValue.serverTimestamp(),
        };
        // `status: "echeance"` de l'ancien code est conservé tel quel
        // (il est uniquement utilisé en lecture admin, pas créé côté client)

        await targetRef.set(targetData);

        // Marquer la source pour éviter double migration
        await adminDb.collection("paiements").doc(item.sourceId).update({
          migratedTo: `payments/${targetRef.id}`,
          migratedAt: FieldValue.serverTimestamp(),
        });

        migrated++;
      } catch (e: any) {
        console.error(`Migration échouée pour paiements/${item.sourceId}:`, e);
        errors.push({
          sourceId: item.sourceId,
          error: e.message || String(e),
        });
      }
    }

    return NextResponse.json({
      mode: "apply",
      found: sourceSnap.size,
      migrated,
      alreadyMigrated: alreadyMigrated.length,
      errors: errors.length,
      errorDetails: errors,
      hint: migrated > 0
        ? "Migration effectuée. Les documents source sont conservés avec le flag migratedTo pour audit."
        : "Aucun document migré.",
    });
  } catch (e: any) {
    console.error("migrate-paiements-collection error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
