/**
 * GET /api/admin/diag-remises?secret=xxx
 *
 * Renvoie un état détaillé de la collection 'remises' :
 *   - Nombre total de remises
 *   - Décompte par mois de createdAt
 *   - Décompte par état (pointée / non pointée)
 *   - 5 dernières remises (date, mode, total, état)
 *
 * Utile pour comprendre où sont passées les remises supposément disparues.
 * Read-only, aucun effet de bord.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  try {
    const snap = await adminDb.collection("remises").get();
    const total = snap.size;

    const parMois: Record<string, { count: number; totalEur: number }> = {};
    const parEtat = { pointees: 0, nonPointees: 0 };
    const parMode: Record<string, number> = {};
    const recentes: any[] = [];

    for (const d of snap.docs) {
      const r = d.data();
      const date = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
      const moisCle = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        : "???";

      if (!parMois[moisCle]) parMois[moisCle] = { count: 0, totalEur: 0 };
      parMois[moisCle].count += 1;
      parMois[moisCle].totalEur += r.total || 0;

      if (r.pointee) parEtat.pointees += 1;
      else parEtat.nonPointees += 1;

      const mode = r.paymentMode || r.mode || "?";
      parMode[mode] = (parMode[mode] || 0) + 1;
    }

    // 10 dernières remises par createdAt
    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 10);

    for (const r of sorted) {
      const d = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
      recentes.push({
        id: r.id,
        date: d ? d.toISOString().split("T")[0] : "???",
        mode: r.paymentMode || r.mode || "?",
        total: r.total || 0,
        pointee: !!r.pointee,
        pointeeNote: r.pointeeNote || null,
        nbEncaissements: (r.encaissementIds || []).length,
        nbPaymentsLegacy: (r.paymentIds || []).length,
      });
    }

    return NextResponse.json({
      success: true,
      total,
      parMois,
      parEtat,
      parMode,
      recentes,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
