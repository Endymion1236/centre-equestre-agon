"use client";
import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, getMessagingInstance } from "@/lib/firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

export function usePushNotifications(familyId: string | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const messaging = await getMessagingInstance();
      if (!messaging) return;

      const fcmToken = await getToken(messaging, { vapidKey: VAPID_KEY });
      setToken(fcmToken);

      // Sauvegarder le token dans Firestore pour cette famille
      await setDoc(doc(db, "push_tokens", familyId), {
        token: fcmToken,
        familyId,
        platform: /iPhone|iPad|iPod|Android/.test(navigator.userAgent) ? "mobile" : "desktop",
        updatedAt: serverTimestamp(),
      }, { merge: true });

    } catch (e) {
      console.error("Push permission error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Écouter les messages en foreground
  useEffect(() => {
    if (permission !== "granted") return;
    let unsub: (() => void) | null = null;
    getMessagingInstance().then(messaging => {
      if (!messaging) return;
      unsub = onMessage(messaging, (payload) => {
        // Afficher une notification native même quand l'appli est ouverte
        if (payload.notification) {
          new Notification(payload.notification.title || "Centre Équestre", {
            body: payload.notification.body,
            icon: "/icons/icon-192x192.png",
          });
        }
      });
    });
    return () => { unsub?.(); };
  }, [permission]);

  return { permission, token, loading, requestPermission };
}
