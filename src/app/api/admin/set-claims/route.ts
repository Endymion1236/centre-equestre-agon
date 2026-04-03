import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"];

// GET ?secret=xxx — initialiser les custom claims pour tous les admins
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = [];
  for (const email of ADMIN_EMAILS) {
    try {
      const u = await adminAuth.getUserByEmail(email);
      await adminAuth.setCustomUserClaims(u.uid, { admin: true });
      results.push({ email, uid: u.uid, status: "✅ claim admin=true défini" });
    } catch (e: any) {
      results.push({ email, status: "❌ " + e.message });
    }
  }
  return NextResponse.json({ results });
}
