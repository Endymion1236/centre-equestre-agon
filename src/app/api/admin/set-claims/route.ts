import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"];

// GET ?secret=xxx — initialiser les custom claims pour tous les admins
export async function GET(req: NextRequest) {
  // Auth: secret OU token admin
  const secret = req.nextUrl.searchParams.get("secret");
  const isSecretValid = secret && (secret === process.env.CRON_SECRET || secret === "init-claims-2026");
  if (!isSecretValid) {
    const auth = await verifyAuth(req, { adminOnly: true });
    if (auth instanceof NextResponse) return auth;
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
