import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

// Config Firebase. Les valeurs viennent des variables d'env si presentes,
// sinon fallback sur les valeurs de PROD (gestion-2026). Cela permet :
//   - branche main / prod : pas de variables -> utilise gestion-2026 (fallback)
//   - branche test : variables NEXT_PUBLIC_FIREBASE_* definies sur Vercel
//     pour la branche test -> pointe vers gestion-2026-test
// Important : ce sont des cles PUBLIQUES (cote client), il est normal et sans
// risque qu'elles soient visibles. La securite repose sur les regles Firestore,
// pas sur le secret de ces cles.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "gestion-2026.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "gestion-2026",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "gestion-2026.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "785848912923",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:785848912923:web:47f03aa109fa13eb1c7cbe",
};

// Initialize Firebase (singleton)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

// ─── Firestore avec cache MÉMOIRE (memoryLocalCache) ───────────────────
// On utilise un cache EN MÉMOIRE (pas IndexedDB) volontairement.
//
// Pourquoi ? persistentLocalCache (IndexedDB) impose un "primary lease" :
// un seul contexte (onglet/PWA) peut détenir le verrou du cache disque à la
// fois. Quand l'utilisateur a l'onglet navigateur ET l'appli bureau (PWA)
// ouverts en même temps sur la même origine, les deux se battent pour ce
// verrou → erreur "Failed to obtain primary lease" → chargements bloqués.
//
// Le cache mémoire n'a AUCUN verrou partagé : chaque instance a son propre
// cache, indépendant. Aucun conflit possible entre onglet et appli bureau.
// Compromis : pas de cache persistant entre rechargements (un poil moins
// rapide) et pas d'offline — sans impact pour un outil d'admin en ligne.
//
// Le try/catch reste pour le Hot Module Reload de Next.js en dev :
// initializeFirestore ne peut être appelé qu'une fois par app.
let _db: Firestore;
try {
  _db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
} catch (e: any) {
  // Réinit HMR en dev → on récupère l'instance existante.
  if (e?.code === "failed-precondition" || /already been/i.test(e?.message || "")) {
    _db = getFirestore(app);
  } else {
    console.warn("Firestore cache init failed, using default:", e);
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
