import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";

/**
 * POST /api/admin/tester-petit-groupe  { date: "AAAA-MM-JJ", dry?: boolean }
 *
 * Déclenche depuis l'admin la mécanique « balade sous le minimum » sur une
 * date précise — celle que le cron du soir viserait à J-2. Le cron exige le
 * CRON_SECRET : le relayer ICI, côté serveur, évite d'avoir à le copier dans
 * un terminal pour tester (demande du gérant : « un bouton dans la solution »).
 *
 * dry: true simule sans rien envoyer ni écrire — c'est le mode du premier
 * clic, avant confirmation de l'envoi réel.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const { date, dry } = await req.json().catch(() => ({} as any));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET absent" }, { status: 500 });

  const url = `${req.nextUrl.origin}/api/cron/balades-petit-groupe?date=${encodeURIComponent(String(date))}${dry ? "&dry=1" : ""}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
