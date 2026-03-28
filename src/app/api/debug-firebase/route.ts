import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  return NextResponse.json({
    projectId: projectId ? `✅ ${projectId}` : "❌ MANQUANT",
    clientEmail: clientEmail ? `✅ ${clientEmail.slice(0, 20)}...` : "❌ MANQUANT",
    privateKey: privateKey
      ? `✅ ${privateKey.length} chars, commence par: ${privateKey.slice(0, 30)}...`
      : "❌ MANQUANT",
    privateKeyHasNewlines: privateKey?.includes("\n") ? "✅ \\n réels" : privateKey?.includes("\\n") ? "⚠️ \\\\n échappés (pas remplacés)" : "❌ pas de newlines",
  });
}
