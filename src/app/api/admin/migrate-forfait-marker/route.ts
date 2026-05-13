/**
 * POST /api/admin/migrate-forfait-marker
 *
 * Migration : ajoute le marqueur paymentSource: "forfait" sur les
 * enrolled[] des créneaux pour les enfants ayant un forfait actif.
 *
 * Cible :
 *  - les inscriptions faites AVANT le fix qui ajoutait ce marqueur
 *  - permet à l'UI de reconnaître ces inscriptions comme couvertes
 *    par un forfait (badge vert émeraude au lieu de gris)
 *
 * Stratégie :
 *  - On lit tous les forfaits actifs ("active" ou "actif")
 *  - Pour chaque forfait : on cherche les créneaux futurs (date >= today)
 *    où l'enfant est inscrit ET où l'enrolled n'a pas déjà paymentSource
 *  - On met à jour l'enrolled en place
 *
 * Body : { familyId?: string, apply?: boolean }
 *  - familyId optionnel : restreint à une famille (utile pour tests)
 *  - apply=false (défaut) : dry-run, retourne ce qui SERAIT modifié
 *  - apply=true : exécute réellement
 *
 * 🔒 Admin uniquement.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { familyId, apply } = await req.json();
    const today = new Date().toISOString().split("T")[0];

    // ── 1. Récupérer tous les forfaits actifs (optionnellement filtrés) ──
    let forfaitsQuery = adminDb.collection("forfaits")
      .where("status", "in", ["active", "actif"]);
    const forfaitsSnap = await forfaitsQuery.get();

    const targetForfaits = forfaitsSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter((f: any) => !familyId || f.familyId === familyId);

    if (targetForfaits.length === 0) {
      return NextResponse.json({
        success: true,
        totalForfaits: 0,
        updates: [],
        message: "Aucun forfait actif trouvé" + (familyId ? ` pour la famille ${familyId}` : ""),
      });
    }

    // ── 2. Construire un index childId → forfaitId pour lookup rapide ──
    const childToForfait: Record<string, { forfaitId: string; familyId: string }> = {};
    for (const f of targetForfaits) {
      if (f.childId && !childToForfait[f.childId]) {
        childToForfait[f.childId] = { forfaitId: f.id, familyId: f.familyId };
      }
    }
    const targetChildIds = Object.keys(childToForfait);

    // ── 3. Parcourir les créneaux FUTURS et trouver ceux qui ont besoin d'update ──
    // (les créneaux passés sont historiques, pas besoin de toucher)
    const creneauxSnap = await adminDb.collection("creneaux")
      .where("date", ">=", today)
      .get();

    const updates: { creneauId: string; childIds: string[]; newEnrolled: any[] }[] = [];

    for (const cd of creneauxSnap.docs) {
      const data = cd.data() as any;
      // Skip stages : pas couverts par forfaits annuels
      if (data.activityType === "stage" || data.activityType === "stage_journee") continue;
      const enrolled = data.enrolled || [];
      if (enrolled.length === 0) continue;

      let modified = false;
      const updatedChildIds: string[] = [];
      const newEnrolled = enrolled.map((e: any) => {
        // Skip si l'enrolled a déjà un paymentSource (card, forfait, etc)
        if (e.paymentSource) return e;
        // L'enfant a-t-il un forfait actif ?
        const f = childToForfait[e.childId];
        if (!f) return e;
        // Sécurité : familyId doit matcher (évite de tagger un homonyme)
        if (e.familyId && e.familyId !== f.familyId) return e;
        modified = true;
        updatedChildIds.push(e.childId);
        return { ...e, paymentSource: "forfait", forfaitId: f.forfaitId };
      });

      if (modified) {
        updates.push({ creneauId: cd.id, childIds: updatedChildIds, newEnrolled });
      }
    }

    // ── 4. Mode dry-run vs apply ──
    if (!apply) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalForfaits: targetForfaits.length,
        totalChildren: targetChildIds.length,
        totalCreneauxToUpdate: updates.length,
        sample: updates.slice(0, 10).map(u => ({
          creneauId: u.creneauId,
          childIds: u.childIds,
        })),
        message: `DRY-RUN : ${updates.length} créneaux à mettre à jour pour ${targetChildIds.length} enfant(s)`,
      });
    }

    // Exécution réelle, en batchs de 450
    let updated = 0;
    for (let i = 0; i < updates.length; i += 450) {
      const batch = adminDb.batch();
      const chunk = updates.slice(i, i + 450);
      for (const u of chunk) {
        batch.update(adminDb.collection("creneaux").doc(u.creneauId), {
          enrolled: u.newEnrolled,
        });
      }
      await batch.commit();
      updated += chunk.length;
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      totalForfaits: targetForfaits.length,
      totalChildren: targetChildIds.length,
      totalCreneauxUpdated: updated,
      message: `✅ ${updated} créneaux mis à jour avec paymentSource:"forfait" pour ${targetChildIds.length} enfant(s)`,
    });
  } catch (error: any) {
    console.error("[migrate-forfait-marker] Erreur:", error);
    return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
  }
}
