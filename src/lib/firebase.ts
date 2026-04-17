import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
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
// Pourquoi ce try/catch ?
// initializeFirestore ne peut être appelé qu'UNE SEULE FOIS par app. En
// développement, Next.js fait du Hot Module Reload qui peut réévaluer ce
// module → second appel → FirebaseError "Firestore has already been started".
// Quand ça arrive, on retombe sur getFirestore(app) qui retourne l'instance
// déjà initialisée. En prod, le try réussit toujours du premier coup.
let _db: Firestore;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e: any) {
  // En cas de réinit HMR, on récupère l'instance existante. En production
  // ce cas ne se produit jamais (pas de hot-reload sur Vercel).
  if (e?.code === "failed-precondition" || /already been/i.test(e?.message || "")) {
    _db = getFirestore(app);
  } else {
    // Autre erreur (ex: IndexedDB bloqué par le navigateur, quota plein) :
    // on retombe sur le mode par défaut sans cache persistant — l'app
    // continue de fonctionner, juste sans bénéficier du speedup.
    console.warn("Firestore persistent cache unavailable, using default:", e);
    _db = getFirestore(app);
  }
}
export const db = _db;

export const storage = getStorage(app);

// Persistance Auth locale (default déjà, mais on le rend explicite pour
// éviter les regressions en cas de changement de version Firebase).
// Uniquement côté client : setPersistence throw côté serveur car pas
// d'IndexedDB/localStorage en Node.
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
