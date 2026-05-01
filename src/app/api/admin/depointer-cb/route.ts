/**
 * POST /api/admin/depointer-cb
 *
 * Dépointe tous les encaissements en mode CB Terminal d'une période donnée :
 * - Met `reconciledByBank: false` sur chaque encaissement CB
 * - Vide les liens `paymentId` et `remiseId` (s'ils existent)
 *
 * Workflow type Nicolas après désactivation du matching CB sous-ensembles :
 * il a besoin de repartir d'un état propre pour utiliser Détail CA sur
 * chaque remise CARTE et obtenir un rapprochement transaction-par-transaction
 * fiable.
 *
 * Body JSON :
 *   { period: "2026-04", confirm: "DEPOINTER-CB-2026-04" }
 *
 * GET ?period=2026-04 → dry-run, renvoie le décompte sans modifier
 * POST avec confirm token = exécute
 *
 * Auth admin obligatoire (claim admin=true ou email admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
];

export const dynamic = "force-dynamic";

async function checkAdmin(req: NextRequest): Promise<{ ok: boolean; email?: string; error?: string }> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { ok: false, error: "Token manquant" };
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const isAdmin = decoded.admin === true || ADMIN_EMAILS.includes(decoded.email || "");
    if (!isAdmin) return { ok: false, error: "Réservé admin" };
    return { ok: true, email: decoded.email };
  } catch (e) {
    return { ok: false, error: "Token invalide" };
  }
}

/**
 * Récupère tous les encaissements CB Terminal d'une période donnée.
 * On filtre côté client car les schemas peuvent varier (date string vs Timestamp).
 */
async function getCbEncaissementsForPeriod(period: string) {
  const snap = await adminDb.collection("encaissements").where("mode", "==", "cb_terminal").get();
  const matching: any[] = [];
  for (const doc of snap.docs) {
    const e = doc.data() as any;
    let dateStr: string | null = null;
    if (typeof e.date === "string") {
      dateStr = e.date;
    } else if (e.date?.seconds) {
      const d = new Date(e.date.seconds * 1000);
      dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    if (!dateStr) continue;
    if (!dateStr.startsWith(period)) continue;
    matching.push({ id: doc.id, ref: doc.ref, data: e, date: dateStr });
  }
  return matching;
}

// GET = dry run
export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const period = req.nextUrl.searchParams.get("period");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Param period requis au format YYYY-MM" }, { status: 400 });
  }

  const encs = await getCbEncaissementsForPeriod(period);
  const reconciled = encs.filter(e => e.data.reconciledByBank).length;

  return NextResponse.json({
    success: true,
    period,
    confirmToken: `DEPOINTER-CB-${period}`,
    total: encs.length,
    reconciledByBank: reconciled,
    notReconciled: encs.length - reconciled,
    aDepointer: reconciled, // ce qui sera modifié par le POST
    samples: encs.slice(0, 5).map(e => ({
      id: e.id,
      date: e.date,
      familyName: e.data.familyName,
      activityTitle: e.data.activityTitle,
      montant: e.data.montant,
      reconciledByBank: !!e.data.reconciledByBank,
      paymentId: e.data.paymentId || null,
      remiseId: e.data.remiseId || null,
    })),
  });
}

// POST = exécution réelle (nécessite confirm token)
export async function POST(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { period, confirm } = body || {};
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Param period requis au format YYYY-MM" }, { status: 400 });
  }
  if (confirm !== `DEPOINTER-CB-${period}`) {
    return NextResponse.json({ error: `confirm token invalide, attendu DEPOINTER-CB-${period}` }, { status: 400 });
  }

  const encs = await getCbEncaissementsForPeriod(period);
  const aDepointer = encs.filter(e => e.data.reconciledByBank);

  let modified = 0;
  // Batch par 400 (limite Firestore = 500)
  for (let i = 0; i < aDepointer.length; i += 400) {
    const batch = adminDb.batch();
    for (const e of aDepointer.slice(i, i + 400)) {
      batch.update(e.ref, {
        reconciledByBank: false,
        // On ne touche PAS paymentId/remiseId : ces liens restent utiles pour
        // tracer l'historique. Si un nouveau Détail CA les rapproche correctement,
        // ils seront mis à jour.
      });
      modified++;
    }
    await batch.commit();
  }

  // Journal d'audit
  await adminDb.collection("audit_log").add({
    action: "depointer_cb_periode",
    period,
    nbEncaissementsDepointes: modified,
    executedAt: new Date().toISOString(),
    executedBy: auth.email,
  }).catch(() => {/* best effort */});

  return NextResponse.json({
    success: true,
    period,
    nbEncaissementsDepointes: modified,
    message: `${modified} encaissements CB de ${period} dépointés. Ils réapparaîtront dans 'Encaissements à remettre'. Utilisez 'Détail CA' sur chaque remise CARTE pour les re-rapprocher.`,
  });
}
