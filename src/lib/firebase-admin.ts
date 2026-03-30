import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getMessaging } from "firebase-admin/messaging";

let app: App;

if (getApps().length === 0) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // Vercel échappe les \n en \\n — on force le remplacement quel que soit le format
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  // Remplace les séquences littérales \n (backslash + n) par de vrais sauts de ligne
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

  if (clientEmail && privateKey) {
    app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
  } else {
    app = initializeApp({ projectId, storageBucket });
  }
} else {
  app = getApps()[0];
}

export const adminDb = getFirestore(app);
export const adminStorage = getStorage(app);
export const adminMessaging = getMessaging(app);
export const adminAuth = (() => {
  const { getAuth } = require("firebase-admin/auth");
  return getAuth(app);
})();
