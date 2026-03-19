"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "@/lib/firebase";
import type { Family } from "@/types";

interface AuthContextType {
  user: User | null;
  family: Family | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  family: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithFacebook: async () => {},
  signOut: async () => {},
  isAdmin: false,
});

// Nicolas & Emmeline admin emails
const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  // Ajoute ici les emails Google de Nicolas et Emmeline
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Check if family profile exists in Firestore
        const familyRef = doc(db, "families", firebaseUser.uid);
        const familySnap = await getDoc(familyRef);

        if (familySnap.exists()) {
          setFamily({ id: familySnap.id, ...familySnap.data() } as Family);
        } else {
          // Create initial family profile
          const newFamily: Partial<Family> = {
            parentName: firebaseUser.displayName || "",
            parentEmail: firebaseUser.email || "",
            parentPhone: "",
            authProvider: firebaseUser.providerData[0]?.providerId === "google.com" ? "google" : "facebook",
            authUid: firebaseUser.uid,
            children: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(familyRef, {
            ...newFamily,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setFamily({ id: firebaseUser.uid, ...newFamily } as Family);
        }
      } else {
        setFamily(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Erreur connexion Google:", error);
    }
  };

  const signInWithFacebook = async () => {
    try {
      await signInWithPopup(auth, facebookProvider);
    } catch (error) {
      console.error("Erreur connexion Facebook:", error);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setFamily(null);
    } catch (error) {
      console.error("Erreur déconnexion:", error);
    }
  };

  const isAdmin = user?.email
    ? ADMIN_EMAILS.includes(user.email)
    : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        family,
        loading,
        signInWithGoogle,
        signInWithFacebook,
        signOut,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
