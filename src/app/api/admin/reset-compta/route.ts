/**
 * GET  /api/admin/reset-compta?secret=xxx
 * POST /api/admin/reset-compta?secret=xxx (body: { confirm: "RESET-COMPTA-YYYY-MM-DD" })
 *
 * Remise à zéro totale de la comptabilité du centre équestre.
 * Utilisée en phase de test pour pouvoir refaire des scénarios propres
 * avant la mise en prod de septembre 2026.
 *
 * Sécurité :
 *   - CRON_SECRET obligatoire (même pattern que delete-family)
 *   - GET = dry-run : affiche ce qui SERAIT effacé/réinitialisé, SANS rien modifier
 *   - POST = apply : effacer pour de vrai. Exige un body confirm token qui contient
 *     la date du jour au format YYYY-MM-DD pour empêcher tout replay d'une commande
 *     accidentelle 2 jours plus tard.
 *
 * Action :
 *   SUPPRESSION COMPLÈTE de :
 *     - encaissements (tous les mouvements de trésorerie)
 *     - remises (bordereaux chèques/CB/espèces)
 *     - rapprochements (lignes CSV Crédit Agricole importées)
 *     - echeances-sepa (échéances SEPA programmées)
 *     - cheques-differes (chèques en attente de dépôt)
 *     - avoirs (avoirs émis)
 *     - fidelite (cumuls fidélité par famille)
 *
 *   RÉINITIALISATION (docs conservés, status remis à zéro) de :
 *     - payments (remis en status='pending', paidAmount=0, reconciledByBank false,
 *       paidAt null). Les identifiants (famille, items, totalTTC) sont préservés
 *       pour que les reservations qui pointent dessus via paymentId restent
 *       cohérentes et que les créneaux apparaissent en "à encaisser".
 *
 *   NON TOUCHÉES :
 *     - reservations (conservées, ce qui permet aux cavaliers de rester inscrits)
 *     - mandats-sepa (documents à valeur légale)
 *     - families, children, creneaux, activities, cavalerie, cartes, forfaits
 *
 * ⚠️ IRRÉVERSIBLE — réservé à la phase de test interne.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Collections à supprimer entièrement
const DELETE_COLLECTIONS = [
  "encaissements",
  "remises",
  "rapprochements",
  "echeances-sepa",
  "cheques-differes",
  "avoirs",
  "fidelite",
];

async function buildReport() {
  const counts: Record<string, number> = {};
  let totalEncaissements = 0;
  let totalAvoirs = 0;

  // Compter chaque collection
  for (const col of DELETE_COLLECTIONS) {
    const snap = await adminDb.collection(col).get();
    counts[col] = snap.size;
    if (col === "encaissements") {
      totalEncaissements = snap.docs.reduce((s, d) => s + (d.data().montant || 0), 0);
    }
    if (col === "avoirs") {
      totalAvoirs = snap.docs.reduce((s, d) => s + (d.data().montant || d.data().amount || 0), 0);
    }
  }

  // Compter les payments à réinitialiser (tous ceux qui ne sont pas en draft/cancelled)
  const paymentsSnap = await adminDb.collection("payments").get();
  const paymentsToReset = paymentsSnap.docs.filter(d => {
    const s = d.data().status;
    return s !== "draft" && s !== "cancelled";
  });
  counts["payments (à réinitialiser)"] = paymentsToReset.length;
  const totalPayments = paymentsToReset.reduce((s, d) => s + (d.data().totalTTC || 0), 0);
  const totalEncaissePayments = paymentsToReset.reduce((s, d) => s + (d.data().paidAmount || 0), 0);

  // Collections préservées (juste pour info dans le rapport)
  const preservedCounts: Record<string, number> = {};
  for (const col of ["reservations", "mandats-sepa", "families"]) {
    const snap = await adminDb.collection(col).get();
    preservedCounts[col] = snap.size;
  }

  return {
    deleteCollections: counts,
    preservedCollections: preservedCounts,
    totals: {
      encaissementsEuros: Math.round(totalEncaissements * 100) / 100,
      avoirsEuros: Math.round(totalAvoirs * 100) / 100,
      paymentsTotalEuros: Math.round(totalPayments * 100) / 100,
      paymentsDejaEncaisseEuros: Math.round(totalEncaissePayments * 100) / 100,
    },
  };
}

async function applyReset() {
  const startedAt = new Date();
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  // 1. Supprimer complètement les collections
  for (const col of DELETE_COLLECTIONS) {
    try {
      const snap = await adminDb.collection(col).get();
      let count = 0;
      // Supprimer par batch de 400 (limite Firestore = 500)
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = adminDb.batch();
        for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
        count += Math.min(400, docs.length - i);
      }
      deleted[col] = count;
    } catch (e: any) {
      errors.push(`${col}: ${e.message}`);
      deleted[col] = -1;
    }
  }

  // 2. Réinitialiser les payments (status pending, paidAmount 0)
  let resetCount = 0;
  try {
    const snap = await adminDb.collection("payments").get();
    const docs = snap.docs.filter(d => {
      const s = d.data().status;
      return s !== "draft" && s !== "cancelled";
    });
    for (let i = 0; i < docs.length; i += 400) {
      const batch = adminDb.batch();
      for (const d of docs.slice(i, i + 400)) {
        batch.update(d.ref, {
          status: "pending",
          paidAmount: 0,
          reconciledByBank: false,
          paidAt: null,
          updatedAt: new Date(),
        });
      }
      await batch.commit();
      resetCount += Math.min(400, docs.length - i);
    }
  } catch (e: any) {
    errors.push(`payments reset: ${e.message}`);
  }
  deleted["payments (réinitialisés)"] = resetCount;

  // 3. Journal audit
  try {
    await adminDb.collection("audit_log").add({
      action: "reset-compta",
      performedAt: startedAt,
      deleted,
      errors: errors.length > 0 ? errors : null,
      durationMs: Date.now() - startedAt.getTime(),
    });
  } catch (e) {
    // pas bloquant si audit_log échoue
    console.error("audit_log failed:", e);
  }

  return { deleted, errors, durationMs: Date.now() - startedAt.getTime() };
}

function checkSecret(req: NextRequest): string | null {
  const secret = req.nextUrl.searchParams.get("secret");
  const envSecret = process.env.CRON_SECRET;
  if (!envSecret) return "CRON_SECRET non configuré côté serveur";
  if (secret !== envSecret) return "Secret invalide";
  return null;
}

function expectedConfirmToken(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `RESET-COMPTA-${y}-${m}-${day}`;
}

// GET = dry-run
export async function GET(req: NextRequest) {
  const err = checkSecret(req);
  if (err) return NextResponse.json({ success: false, error: err }, { status: 401 });

  try {
    const report = await buildReport();
    return NextResponse.json({
      success: true,
      mode: "dry-run",
      message: "Aucune modification effectuée. Pour appliquer, faire un POST avec confirm token.",
      confirmTokenExpected: expectedConfirmToken(),
      report,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST = apply
export async function POST(req: NextRequest) {
  const err = checkSecret(req);
  if (err) return NextResponse.json({ success: false, error: err }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Body JSON manquant ou invalide" },
      { status: 400 }
    );
  }

  const expected = expectedConfirmToken();
  if (body?.confirm !== expected) {
    return NextResponse.json({
      success: false,
      error: `Confirm token invalide. Attendu : "${expected}"`,
    }, { status: 403 });
  }

  try {
    const result = await applyReset();
    return NextResponse.json({
      success: true,
      mode: "applied",
      ...result,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
