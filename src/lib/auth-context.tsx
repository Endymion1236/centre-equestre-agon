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
  sendEmailVerification,
  updateProfile,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import type { DocumentSnapshot } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "@/lib/firebase";
import { estEmailAdmin, repliEmailAutorise } from "@/lib/admin-emails";
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
  /** Une fiche existe à cette adresse, mais elle n'est pas encore confirmée. */
  emailAConfirmer: boolean;
  /** Renvoie le lien de confirmation à l'adresse du compte connecté. */
  renvoyerConfirmation: () => Promise<void>;
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
  emailAConfirmer: false,
  renvoyerConfirmation: async () => {},
});


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailAConfirmer, setEmailAConfirmer] = useState(false);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // Vérifier les custom claims pour ne pas créer de fiche famille pour admin/moniteur
        const tokenResult = await firebaseUser.getIdTokenResult();
        const isStaff = tokenResult.claims.admin === true || tokenResult.claims.moniteur === true;

        if (isStaff) {
          // Admin ou moniteur : pas de fiche famille
          setFamily(null);
          setEmailAConfirmer(false);
        } else {
        // 1. Chercher une fiche famille par uid (cas normal : déjà lié)
        //
        // Cette lecture n'était protégée par rien : sur une 4G qui coupe
        // (« Failed to get document because the client is offline »), la
        // promesse rejetait hors de tout catch — Sentry recevait l'alerte, et
        // surtout setLoading(false) n'était jamais atteint : l'espace famille
        // restait sur son sablier (alerte du 04/09/2026, /espace-cavalier/
        // factures). On réessaie une fois après un court délai, puis on
        // continue sans fiche : la page s'affiche, la fiche reviendra à la
        // prochaine connexion.
        const familyRef = doc(db, "families", firebaseUser.uid);
        let familySnap: DocumentSnapshot | null = null;
        for (let tentative = 0; tentative < 2 && !familySnap; tentative++) {
          try {
            familySnap = await getDoc(familyRef);
          } catch (e) {
            console.warn(`Fiche famille illisible (tentative ${tentative + 1}) :`, e);
            if (tentative === 0) await new Promise((r) => setTimeout(r, 1500));
          }
        }

        if (!familySnap) {
          setFamily(null);
          setEmailAConfirmer(false);
        } else if (familySnap.exists()) {
          const data = familySnap.data() as any;
          let resolved = false;
          // Compte fusionné : on bascule sur le compte conservé.
          if (data.status === "merged" && data.mergedInto) {
            try {
              const keptSnap = await getDoc(doc(db, "families", data.mergedInto));
              if (keptSnap.exists()) { setFamily({ id: keptSnap.id, ...keptSnap.data() } as Family); resolved = true; }
            } catch { /* fallback ci-dessous */ }
          }
          if (!resolved) setFamily({ id: familySnap.id, ...familySnap.data() } as Family);
        } else {
          // 2. Rattachement à une fiche pré-créée par l'admin — CÔTÉ SERVEUR.
          //
          // Cette étape se faisait ici même : requête `families` par email
          // puis recopie de la fiche entière sous l'uid. La copie emportait
          // `linkedChildren`, le champ qui autorise à réserver pour l'enfant
          // d'une autre famille : le navigateur composant le document, il
          // suffisait de créer sa fiche à la première connexion avec les liens
          // de son choix. Les règles interdisent désormais à une famille
          // d'écrire ces champs — le report est fait par /api/famille/lier-compte
          // en Admin SDK, après vérification de l'adresse du jeton.
          //
          // Bénéfice au passage : la requête par email était régulièrement
          // refusée par les règles, et une famille pré-inscrite repartait alors
          // sur une fiche vierge, sans ses enfants. L'Admin SDK ne connaît pas
          // ce cas.
          let linked = false;
          let aConfirmer = false;
          try {
            const token = await firebaseUser.getIdToken();
            const res = await fetch("/api/famille/lier-compte", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.lie && data.family) {
                setFamily(data.family as Family);
                linked = true;
              }
            } else if (res.status === 403) {
              // Une fiche existe bien à cette adresse, mais elle n'a pas été
              // confirmée : le serveur refuse de la rattacher. On renvoie le
              // lien et on l'explique, plutôt que de laisser un espace vide.
              const data = await res.json().catch(() => null);
              if (data?.error === "EMAIL_NON_VERIFIE") {
                aConfirmer = true;
                try { await sendEmailVerification(firebaseUser); } catch { /* déjà envoyé */ }
              }
            }
          } catch (e) {
            console.warn("Rattachement de compte impossible, bascule en création:", e);
          }
          setEmailAConfirmer(aConfirmer);

          if (!linked) {
            // La route serveur crée la fiche vierge quand aucune n'existe :
            // si on arrive ici, c'est qu'elle a échoué (réseau, incident).
            // On ne crée plus la fiche depuis le navigateur — les règles
            // interdisent désormais à une famille de se déclarer elle-même
            // `parentEmail`, `authUid` et `authProvider`.
            console.error("Fiche famille indisponible — nouvelle tentative à la prochaine connexion.");
            setFamily(null);
          }
        }
        } // fin else !isStaff
      } else {
        setFamily(null);
        setEmailAConfirmer(false);
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
    // Sans cette confirmation, l'adresse ne prouve rien : le serveur refuse
    // alors de rattacher une fiche déjà remplie (cf. /api/famille/lier-compte).
    try {
      await sendEmailVerification(cred.user);
    } catch (e) {
      console.warn("Envoi du lien de confirmation impossible:", e);
    }
  };

  const renvoyerConfirmation = async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
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
    // Première lecture rapide depuis le cache pour affichage immédiat
    user.getIdTokenResult(false).then(result => {
      setAdminClaim(result.claims.admin === true);
      setMoniteurClaim(result.claims.moniteur === true);
    }).catch(() => { setAdminClaim(null); setMoniteurClaim(false); });
    // Puis refresh forcé pour récupérer les claims à jour (cas où un admin
    // vient d'attribuer le rôle moniteur : le cache local ne le voit pas encore)
    user.getIdTokenResult(true).then(result => {
      setAdminClaim(result.claims.admin === true);
      setMoniteurClaim(result.claims.moniteur === true);
    }).catch(() => {});
  }, [user]);

  // isAdmin : le custom claim Firebase fait autorite. Le repli par email
  // (source unique dans lib/admin-emails.ts) ne s'applique que hors base de
  // production et sur une adresse verifiee, exactement comme cote serveur
  // dans lib/api-auth.ts — sans quoi l'affichage admin et les droits reels
  // divergeraient. Ce n'est de toute facon qu'un rendu : les donnees restent
  // protegees par les regles Firestore.
  const isAdmin =
    adminClaim === true ||
    (repliEmailAutorise() && !!user?.emailVerified && estEmailAdmin(user?.email));
  
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
        emailAConfirmer,
        renvoyerConfirmation,
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
