import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ═══════════════════════════════════════════════════════════════
// INSTRUCTIONS POUR NICOLAS :
// 1. Va sur https://console.firebase.google.com/
// 2. Crée un nouveau projet "centre-equestre-agon"
// 3. Active Authentication > Méthodes : Google + Facebook
// 4. Active Firestore Database (mode test pour commencer)
// 5. Active Storage
// 6. Va dans Paramètres > Général > "Vos applications" > Web
// 7. Copie les valeurs ci-dessous
// ═══════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "REMPLACER_PAR_TA_CLE",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "centre-equestre-agon.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "centre-equestre-agon",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "centre-equestre-agon.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "REMPLACER",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "REMPLACER",
};

// Initialize Firebase (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
