import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

interface PushPayload {
  familyId?: string;        // Envoyer à une famille spécifique
  familyIds?: string[];     // Envoyer à plusieurs familles
  broadcast?: boolean;      // Envoyer à toutes les familles
  title: string;
  body: string;
  url?: string;             // URL à ouvrir au clic
  icon?: string;
}

export async function POST(req: NextRequest) {
  try {
    const payload: PushPayload = await req.json();
    const { title, body, url = "/espace-cavalier", icon = "/icons/icon-192x192.png" } = payload;

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

    // Envoyer via FCM REST API
    const fcmKey = process.env.FIREBASE_SERVER_KEY;
    if (!fcmKey) return NextResponse.json({ error: "FIREBASE_SERVER_KEY manquante" }, { status: 500 });

    let sent = 0;
    // Envoyer par batch de 500 (limite FCM)
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const res = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `key=${fcmKey}`,
        },
        body: JSON.stringify({
          registration_ids: batch,
          notification: { title, body, icon },
          webpush: {
            notification: { title, body, icon, badge: "/icons/icon-72x72.png" },
            fcm_options: { link: `${process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app"}${url}` },
          },
        }),
      });
      const data = await res.json();
      sent += data.success || 0;
    }

    return NextResponse.json({ sent, total: tokens.length });
  } catch (e) {
    console.error("Push error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
