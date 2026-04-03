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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Enregistrer le service worker explicitement avant de demander le token
  const ensureServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
    if (!("serviceWorker" in navigator)) {
      console.warn("Push: serviceWorker non supporté");
      return null;
    }
    try {
      // Vérifier si déjà enregistré
      const existing = await navigator.serviceWorker.getRegistration("/sw.js");
      if (existing) {
        console.log("Push: SW déjà enregistré", existing.scope);
        return existing;
      }
      // Enregistrer explicitement
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      console.log("Push: SW enregistré", reg.scope);
      return reg;
    } catch (e: any) {
      console.error("Push: erreur SW", e.message);
      return null;
    }
  };

  const requestPermission = async () => {
    if (!familyId) { setError("familyId manquant"); return; }
    if (!VAPID_KEY) { setError("VAPID_KEY non configurée"); return; }

    setLoading(true);
    setError(null);

    try {
      // 1. S'assurer que le service worker est prêt
      const swReg = await ensureServiceWorker();
      if (!swReg) {
        setError("Service worker non disponible sur ce navigateur");
        return;
      }

      // 2. Demander la permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Permission refusée");
        return;
      }

      // 3. Obtenir l'instance messaging
      const messaging = await getMessagingInstance();
      if (!messaging) {
        setError("Firebase Messaging non supporté sur ce navigateur");
        return;
      }

      // 4. Obtenir le token FCM en passant le service worker
      console.log("Push: demande token FCM...");
      const fcmToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (!fcmToken) {
        setError("Impossible d'obtenir le token FCM");
        return;
      }

      console.log("Push: token obtenu ✅", fcmToken.slice(0, 20) + "...");
      setToken(fcmToken);

      // 5. Sauvegarder dans Firestore
      await setDoc(doc(db, "push_tokens", familyId), {
        token: fcmToken,
        familyId,
        platform: /Android/.test(navigator.userAgent) ? "android"
          : /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios"
          : "desktop",
        userAgent: navigator.userAgent.slice(0, 100),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      console.log("Push: token sauvegardé en Firestore ✅");

    } catch (e: any) {
      console.error("Push error:", e);
      setError(e.message || "Erreur inconnue");
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

  return { permission, token, loading, error, requestPermission };
}
