import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { sendPush, sendPushBatch } from "@/lib/push";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

interface PushPayload {
  familyId?: string;
  familyIds?: string[];
  broadcast?: boolean;
  title: string;
  body: string;
  url?: string;
}

export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire — route admin
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const payload: PushPayload = await req.json();
    const { title, body, url } = payload;

    if (!title || !body) return NextResponse.json({ error: "title et body requis" }, { status: 400 });

    // Récupérer les tokens destinataires
    let tokens: string[] = [];

    if (payload.broadcast) {
      const snap = await adminDb.collection("push_tokens").get();
      tokens = snap.docs.map(d => d.data().token).filter(Boolean);
    } else {
      const ids = payload.familyIds || (payload.familyId ? [payload.familyId] : []);
      for (const fid of ids) {
        const snap = await adminDb.collection("push_tokens").doc(fid).get();
        if (snap.exists && snap.data()?.token) tokens.push(snap.data()!.token);
      }
    }

    if (tokens.length === 0) return NextResponse.json({ sent: 0, message: "Aucun token trouvé" });

    const { sent, failed } = await sendPushBatch(tokens, title, body, url);

    return NextResponse.json({ sent, failed, total: tokens.length });
  } catch (e) {
    console.error("Push error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
