import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb, adminMessaging } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth: secret OU token admin
  const secret = req.nextUrl.searchParams.get("secret");
  const isSecretValid = secret && secret === process.env.CRON_SECRET;
  if (!isSecretValid) {
    const auth = await verifyAuth(req, { adminOnly: true });
    if (auth instanceof NextResponse) return auth;
  }

  const snap = await adminDb.collection("push_tokens").get();
  const tokens = snap.docs.map(d => ({
    familyId: d.id,
    tokenPreview: (d.data().token || "").slice(0, 25) + "...",
    platform: d.data().platform || "?",
    updatedAt: d.data().updatedAt?.toDate?.()?.toLocaleDateString("fr-FR") || "?",
  }));

  return NextResponse.json({
    tokensCount: tokens.length,
    tokens,
    config: {
      NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
        ? `✅ défini (${process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY.length} chars)`
        : "❌ MANQUANT",
    },
  });
}

export async function POST(req: NextRequest) {
  // Auth: secret OU token admin
  const secret = req.nextUrl.searchParams.get("secret");
  const isSecretValid = secret && secret === process.env.CRON_SECRET;
  if (!isSecretValid) {
    const auth = await verifyAuth(req, { adminOnly: true });
    if (auth instanceof NextResponse) return auth;
  }

  const { familyId } = await req.json();
  const snap = await adminDb.collection("push_tokens").doc(familyId).get();
  if (!snap.exists || !snap.data()?.token) {
    return NextResponse.json({ error: `Aucun token pour familyId=${familyId}` }, { status: 404 });
  }

  try {
    await adminMessaging.send({
      token: snap.data()!.token,
      notification: { title: "🐴 Test notification", body: "Les push fonctionnent !" },
      webpush: {
        notification: { icon: "/icons/icon-192x192.png" },
        fcmOptions: { link: "https://centre-equestre-agon.vercel.app/espace-cavalier" },
      },
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, code: e.code }, { status: 500 });
  }
}
