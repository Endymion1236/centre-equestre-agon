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
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "@/lib/firebase";
import type { Family } from "@/types";

interface AuthContextType {
  user: User | null;
  family: Family | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isMoniteur: boolean;
  userRole: "admin" | "moniteur" | "cavalier";
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  family: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithFacebook: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signOut: async () => {},
  isAdmin: false,
  isMoniteur: false,
  userRole: "cavalier",
});

// Nicolas & Emmeline admin emails
const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
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
        // 1. Chercher une fiche famille par uid (cas normal : déjà lié)
        const familyRef = doc(db, "families", firebaseUser.uid);
        const familySnap = await getDoc(familyRef);

        if (familySnap.exists()) {
          setFamily({ id: familySnap.id, ...familySnap.data() } as Family);
        } else {
          // 2. Chercher une fiche famille existante par email (créée par l'admin)
          let linked = false;
          if (firebaseUser.email) {
            try {
              const emailQuery = query(
                collection(db, "families"),
                where("parentEmail", "==", firebaseUser.email)
              );
              const emailSnap = await getDocs(emailQuery);

              if (!emailSnap.empty) {
                // Trouvé ! On lie le compte auth à cette fiche existante
                const existingDoc = emailSnap.docs[0];
                const existingData = existingDoc.data();
                const provider = firebaseUser.providerData[0]?.providerId === "google.com" ? "google" : "facebook";

                // Copier la fiche vers l'ID = uid (document principal pour les accès futurs)
                const familyData = {
                  ...existingData,
                  authUid: firebaseUser.uid,
                  authProvider: provider,
                  parentName: existingData.parentName || firebaseUser.displayName || "",
                  updatedAt: serverTimestamp(),
                };
                await setDoc(familyRef, familyData);

                // Supprimer l'ancienne fiche (ID auto-généré) pour éviter les doublons
                // Seulement si l'ancien ID est différent du nouveau (uid)
                if (existingDoc.id !== firebaseUser.uid) {
                  await deleteDoc(doc(db, "families", existingDoc.id));
                }

                setFamily({ id: firebaseUser.uid, ...familyData } as unknown as Family);
                linked = true;
                console.log(`Compte lié : ${firebaseUser.email} → ancien ${existingDoc.id} supprimé → nouveau ${firebaseUser.uid}`);
              }
            } catch (e) {
              console.error("Erreur recherche email:", e);
            }
          }

          if (!linked) {
            // 3. Aucune fiche trouvée → créer un nouveau profil
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

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
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

  // isAdmin : custom claim Firebase en priorité, fallback sur liste emails
  const [adminClaim, setAdminClaim] = useState<boolean | null>(null);
  const [moniteurClaim, setMoniteurClaim] = useState<boolean>(false);

  useEffect(() => {
    if (!user) { setAdminClaim(null); setMoniteurClaim(false); return; }
    user.getIdTokenResult(false).then(result => {
      setAdminClaim(result.claims.admin === true);
      setMoniteurClaim(result.claims.moniteur === true);
    }).catch(() => { setAdminClaim(null); setMoniteurClaim(false); });
  }, [user]);

  const isAdmin = adminClaim !== null
    ? adminClaim
    : (user?.email ? ADMIN_EMAILS.includes(user.email) : false);
  
  const isMoniteur = moniteurClaim;
  const userRole: "admin" | "moniteur" | "cavalier" = isAdmin ? "admin" : isMoniteur ? "moniteur" : "cavalier";

  return (
    <AuthContext.Provider
      value={{
        user,
        family,
        loading,
        signInWithGoogle,
        signInWithFacebook,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        isAdmin,
        isMoniteur,
        userRole,
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
