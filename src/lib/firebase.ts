import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc",
  authDomain: "gestion-2026.firebaseapp.com",
  projectId: "gestion-2026",
  storageBucket: "gestion-2026.firebasestorage.app",
  messagingSenderId: "785848912923",
  appId: "1:785848912923:web:47f03aa109fa13eb1c7cbe",
};

// Initialize Firebase (singleton)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

// ─── Firestore avec cache local IndexedDB ──────────────────────────────
// persistentLocalCache : met en cache les données lues localement, les
// requêtes suivantes sont servies depuis le cache (2-3× plus rapide sur
// les rechargements de page).
// persistentMultipleTabManager : gère proprement le cas où l'utilisateur
// ouvre plusieurs onglets (sinon erreur "failed-precondition").
//
// On utilise initializeFirestore (au lieu de getFirestore) pour pouvoir
// passer la config de cache au moment de l'initialisation.
// Safe côté serveur (SSR) : IndexedDB n'existe pas en Node mais Firebase
// détecte l'environnement et ne plante pas — il retombe sur un cache mémoire.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const storage = getStorage(app);

// Persistance Auth locale (default déjà, mais on le rend explicite pour
// éviter les regressions en cas de changement de version Firebase).
// Browser : persistance via IndexedDB/localStorage.
// Uniquement côté client (auth.setPersistence throw côté serveur).
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("Firebase Auth persistence setup failed:", err);
  });
}

// Messaging (push notifications) — uniquement côté client
export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
};

// Auth providers
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

export default app;
