import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/test-charge-balances  (admin uniquement)
//
// Déclencheur MANUEL du cron de prélèvement des soldes de stages, pour
// tester le flux acompte → MIT sans terminal : relaie vers
// /api/cron/charge-stage-balances?date=… en ajoutant le CRON_SECRET
// côté serveur (jamais exposé au navigateur).
//
// Body : { date: "YYYY-MM-DD" } — date de DÉBUT du stage à traiter.
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const date = (body?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date requise (YYYY-MM-DD)." }, { status: 400 });
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 500 });
    }
    const origin = req.nextUrl.origin;
    const r = await fetch(`${origin}/api/cron/charge-stage-balances?date=${date}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const d = await r.json().catch(() => ({}));
    console.log(`[test-charge-balances] déclenché par ${auth.email || auth.uid} pour ${date} →`, JSON.stringify(d).slice(0, 300));
    return NextResponse.json(d, { status: r.status });
  } catch (e: any) {
    console.error("[test-charge-balances]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
