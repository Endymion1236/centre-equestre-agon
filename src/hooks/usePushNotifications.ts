"use client";
import { useEffect, useState } from "react";
import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, getMessagingInstance } from "@/lib/firebase";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (e: any) {
    console.error("Push SW error:", e.message);
    return null;
  }
}

async function registerToken(familyId: string): Promise<string | null> {
  if (!VAPID_KEY) return null;
  const swReg = await ensureServiceWorker();
  if (!swReg) return null;
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  try {
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!fcmToken) return null;
    await setDoc(doc(db, "push_tokens", familyId), {
      token: fcmToken,
      familyId,
      platform: /Android/.test(navigator.userAgent) ? "android"
        : /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios"
        : "desktop",
      updatedAt: serverTimestamp(),
    }, { merge: true });
    console.log("Push: token enregistré ✅");
    return fcmToken;
  } catch (e: any) {
    console.error("Push getToken error:", e.message);
    return null;
  }
}

export function usePushNotifications(familyId: string | null) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = Notification.permission;
    setPermission(perm);

    // Si permission déjà accordée ET familyId connu → tenter l'enregistrement auto
    if (perm === "granted" && familyId) {
      // Vérifier d'abord si le token existe déjà en Firestore
      getDoc(doc(db, "push_tokens", familyId)).then(snap => {
        if (!snap.exists() || !snap.data()?.token) {
          // Token manquant → le ré-enregistrer silencieusement
          console.log("Push: token manquant, ré-enregistrement auto...");
          registerToken(familyId).then(t => { if (t) setToken(t); });
        } else {
          setToken(snap.data()!.token);
        }
      }).catch(() => {});
    }
  }, [familyId]);

  const requestPermission = async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") { setError("Permission refusée"); return; }
      const t = await registerToken(familyId);
      if (t) { setToken(t); }
      else { setError("Impossible d'obtenir le token FCM"); }
    } catch (e: any) {
      setError(e.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  // Messages foreground — passe par le SW pour Android Chrome
  useEffect(() => {
    if (permission !== "granted") return;
    let unsub: (() => void) | null = null;
    getMessagingInstance().then(messaging => {
      if (!messaging) return;
      unsub = onMessage(messaging, async (payload) => {
        const title = payload.notification?.title || "Centre Équestre";
        const body = payload.notification?.body || "";
        const url = (payload.fcmOptions as any)?.link || "/espace-cavalier";
        // Utiliser le SW pour afficher la notif (fonctionne sur Android Chrome)
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.getRegistration("/");
          if (reg) {
            reg.showNotification(title, {
              body,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-72x72.png",
              tag: "ce-agon-fg",
              data: { url },
            });
            return;
          }
        }
        // Fallback desktop
        new Notification(title, { body, icon: "/icons/icon-192x192.png" });
      });
    });
    return () => { unsub?.(); };
  }, [permission]);

  return { permission, token, loading, error, requestPermission };
}
