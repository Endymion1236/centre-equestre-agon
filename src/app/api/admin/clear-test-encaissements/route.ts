/**
 * POST /api/admin/clear-test-encaissements
 *
 * Supprime UNIQUEMENT les encaissements de test (familyName commençant par
 * "TEST ") via l'Admin SDK, qui bypasse l'inaltérabilité NF525 des règles
 * Firestore. Destiné à la page /admin/test-rapprochement pour repartir d'un
 * état propre entre deux scénarios.
 *
 * Sécurité :
 *   - Bloqué sur la PROD par assertResetAllowed (sauf déblocage explicite).
 *   - Ne touche QUE les docs dont familyName commence par "TEST " — aucune
 *     donnée réelle ne peut être supprimée par cette route.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { assertResetAllowed } from "@/lib/reset-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = assertResetAllowed();
  if (guard) return guard;

  try {
    const snap = await adminDb.collection("encaissements").get();
    const testDocs = snap.docs.filter(d => {
      const name = (d.data().familyName || "") as string;
      return name.startsWith("TEST ");
    });

    let deleted = 0;
    // Suppression par lots (batch limité à 500)
    for (let i = 0; i < testDocs.length; i += 450) {
      const batch = adminDb.batch();
      for (const d of testDocs.slice(i, i + 450)) {
        batch.delete(d.ref);
        deleted++;
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, deleted });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
