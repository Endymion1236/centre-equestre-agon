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

    // ── Purge des lignes de rapprochement de test ──
    // Les bankLines de test (libellés REMISE / VIR de test / PRLV assurance,
    // ou rapprochées à des familles "TEST") restent dans rapprochements/{YYYY-MM}
    // et s'empilent à chaque import. On les retire pour repartir propre.
    // On ne touche QU'AUX lignes reconnaissables comme du test (mois témoin =
    // mois courant et mois précédent, qui couvrent la "semaine dernière").
    let bankLinesRemoved = 0;
    const now = new Date();
    const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthsToClean = [ymOf(now), ymOf(prevMonth)];

    const isTestLine = (bl: any): boolean => {
      const label = (bl.label || "").toUpperCase();
      if (label.includes("ASSURANCE MATERIEL")) return true;       // débit piège
      if (label.includes("INCONNU REMBOURSEMENT")) return true;    // virement piège
      if (label.includes("REMISE CARTE BANCAIRE")) return true;    // remises CB de test
      if (label.includes("REMISE CB TPE")) return true;
      if (label.includes("REMISE CHEQUES")) return true;
      if (label.includes("VIR RECU TEST")) return true;            // virements de test
      // Lignes rapprochées à une famille "TEST ..."
      if ((bl.matchedEncs || []).some((e: any) => (e.familyName || "").startsWith("TEST "))) return true;
      return false;
    };

    for (const ym of monthsToClean) {
      const ref = adminDb.collection("rapprochements").doc(ym);
      const docSnap = await ref.get();
      if (!docSnap.exists) continue;
      const data = docSnap.data() as any;
      const before = (data.bankLines || []) as any[];
      const kept = before.filter(bl => !isTestLine(bl));
      const removed = before.length - kept.length;
      if (removed > 0) {
        bankLinesRemoved += removed;
        if (kept.length === 0) {
          await ref.delete();
        } else {
          await ref.set({
            ...data,
            bankLines: kept,
            totalLines: kept.length,
            totalMatched: kept.filter((b: any) => b.matched).length,
          }, { merge: true });
        }
      }
    }

    return NextResponse.json({ success: true, deleted, bankLinesRemoved });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || String(e) }, { status: 500 });
  }
}
