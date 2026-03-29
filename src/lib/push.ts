import { adminMessaging, adminDb } from "@/lib/firebase-admin";

interface PushOptions {
  token: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Envoie une notification push via FCM v1 (firebase-admin/messaging)
 * Plus besoin de FIREBASE_SERVER_KEY — utilise le service account automatiquement
 */
export async function sendPush({ token, title, body, url, icon }: PushOptions): Promise<boolean> {
  try {
    await adminMessaging.send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: icon || "/icons/icon-192x192.png",
          badge: "/icons/icon-72x72.png",
        },
        fcmOptions: {
          link: url || `${process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app"}/espace-cavalier`,
        },
      },
    });
    return true;
  } catch (error: any) {
    // Token invalide ou expiré — supprimer de la base
    if (
      error?.code === "messaging/registration-token-not-registered" ||
      error?.code === "messaging/invalid-registration-token"
    ) {
      console.log(`  🗑️ Token invalide supprimé`);
      // Chercher et supprimer le token
      try {
        const snap = await adminDb.collection("push_tokens").where("token", "==", token).get();
        for (const doc of snap.docs) {
          await doc.ref.delete();
        }
      } catch { /* pas grave */ }
    } else {
      console.error("Push error:", error?.code || error?.message || error);
    }
    return false;
  }
}

/**
 * Envoie une push à plusieurs tokens (batch)
 */
export async function sendPushBatch(
  tokens: string[],
  title: string,
  body: string,
  url?: string
): Promise<{ sent: number; failed: number }> {
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  // FCM v1 sendEachForMulticast (max 500 par batch)
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);

    try {
      const response = await adminMessaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-72x72.png",
          },
          fcmOptions: {
            link: url || `${process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app"}/espace-cavalier`,
          },
        },
      });

      sent += response.successCount;
      failed += response.failureCount;

      // Nettoyer les tokens invalides
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
          adminDb.collection("push_tokens")
            .where("token", "==", batch[idx])
            .get()
            .then(snap => snap.docs.forEach(doc => doc.ref.delete()))
            .catch(() => {});
        }
      });
    } catch (error) {
      console.error("Push batch error:", error);
      failed += batch.length;
    }
  }

  return { sent, failed };
}
