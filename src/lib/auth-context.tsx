"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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
import { doc, getDoc } from "firebase/firestore";
import type { DocumentSnapshot } from "firebase/firestore";
import { auth, db, googleProvider, facebookProvider } from "@/lib/firebase";
import { estEmailAdmin, repliEmailAutorise } from "@/lib/admin-emails";
import {
  ErreurConnexion,
  codeEnvoiConfirmation,
  codeFirebase,
  messageConfirmationAdresse,
  messageEnvoiConfirmation,
  secondesAvantRenvoi,
  type CodeConfirmationAdresse,
  type CodeEnvoiConfirmation,
  type ResultatEnvoiConfirmation,
} from "@/lib/auth-erreurs";
import type { Family } from "@/types";

/** Ce que sait l'écran du dernier envoi du lien de confirmation. */
export interface EtatConfirmation {
  /** Horodatage (ms) du dernier envoi RÉUSSI, automatique ou manuel. */
  dernierEnvoi: number | null;
  /** Dernière erreur d'envoi, automatique ou manuelle, tant qu'elle n'est pas levée. */
  erreur: { code: CodeEnvoiConfirmation; message: string; codeFirebase?: string } | null;
}

export type ResultatConfirmationAdresse =
  | { ok: true }
  | { ok: false; code: CodeConfirmationAdresse; message: string };

/** Issue d'un chargement de la fiche famille. */
type IssueChargement = "staff" | "trouvee" | "a-confirmer" | "absente";

interface AuthContextType {
  user: User | null;
  family: Family | null;
  loading: boolean;
  /** Rejette une `ErreurConnexion` (code + message français) en cas d'échec. */
  signInWithGoogle: () => Promise<void>;
  /** Rejette une `ErreurConnexion` (code + message français) en cas d'échec. */
  signInWithFacebook: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isMoniteur: boolean;
  userRole: "admin" | "moniteur" | "cavalier";
  /** Une fiche existe à cette adresse, mais elle n'est pas encore confirmée. */
  emailAConfirmer: boolean;
  /** Dernier envoi du lien de confirmation et son éventuelle erreur. */
  etatConfirmation: EtatConfirmation;
  /**
   * Renvoie le lien de confirmation Firebase à l'adresse du compte connecté.
   * Ne lève jamais : le résultat dit si l'email est parti, sinon pourquoi.
   */
  renvoyerConfirmation: () => Promise<ResultatEnvoiConfirmation>;
  /**
   * « J'ai confirmé mon adresse » : recharge le compte, rafraîchit le jeton
   * et retente le rattachement de la fiche.
   */
  confirmerAdresse: () => Promise<ResultatConfirmationAdresse>;
  /** Recharge la fiche du compte courant (après une connexion réussie, par ex.). */
  rechargerFamille: () => Promise<void>;
}

const ETAT_CONFIRMATION_VIERGE: EtatConfirmation = { dernierEnvoi: null, erreur: null };

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
  etatConfirmation: ETAT_CONFIRMATION_VIERGE,
  renvoyerConfirmation: async () => ({ ok: false, code: "aucun-compte", message: messageEnvoiConfirmation("aucun-compte") }),
  confirmerAdresse: async () => ({ ok: false, code: "aucun-compte", message: messageConfirmationAdresse("aucun-compte") }),
  rechargerFamille: async () => {},
});


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailAConfirmer, setEmailAConfirmer] = useState(false);
  const [etatConfirmation, setEtatConfirmation] = useState<EtatConfirmation>(ETAT_CONFIRMATION_VIERGE);

  // Numéro de la dernière demande de chargement : une réponse arrivée après
  // une déconnexion ou un changement de compte est ignorée (aucune ancienne
  // fiche ne réapparaît).
  const sequenceRef = useRef(0);
  // Chargement en cours : « J'ai confirmé » attend la fin du précédent au
  // lieu de lancer un second rattachement en parallèle.
  const chargementRef = useRef<Promise<IssueChargement> | null>(null);
  // Comptes pour lesquels un lien de confirmation a déjà été envoyé
  // automatiquement dans cette session (inscription ou premier refus) :
  // un seul envoi automatique, jamais de boucle.
  const envoiAutoRef = useRef<Set<string>>(new Set());
  // Miroir synchrone de etatConfirmation.dernierEnvoi pour la temporisation.
  const dernierEnvoiRef = useRef<number | null>(null);

  const enregistrerEnvoi = useCallback((resultat: ResultatEnvoiConfirmation) => {
    if (resultat.ok) {
      dernierEnvoiRef.current = resultat.envoyeA;
      setEtatConfirmation({ dernierEnvoi: resultat.envoyeA, erreur: null });
    } else {
      setEtatConfirmation((prev) => ({
        dernierEnvoi: prev.dernierEnvoi,
        erreur: { code: resultat.code, message: resultat.message, codeFirebase: resultat.codeFirebase },
      }));
    }
  }, []);

  /** Envoi effectif du lien Firebase. Ne lève jamais. */
  const envoyerConfirmation = useCallback(async (u: User): Promise<ResultatEnvoiConfirmation> => {
    try {
      await sendEmailVerification(u);
      return { ok: true, envoyeA: Date.now() };
    } catch (e) {
      const code = codeEnvoiConfirmation(e);
      console.warn(`Envoi du lien de confirmation refusé (${codeFirebase(e) || "sans code"}) → ${code}`);
      return { ok: false, code, message: messageEnvoiConfirmation(code), codeFirebase: codeFirebase(e) || undefined };
    }
  }, []);

  /**
   * Charge la fiche famille du compte donné et met l'état à jour — sauf si,
   * entre-temps, un autre compte s'est connecté ou celui-ci s'est déconnecté.
   *
   * `forcerJeton` : relit les claims avec un jeton rafraîchi (après une
   * confirmation d'adresse, le jeton en cache porte encore email_verified=false).
   */
  const chargerFamille = useCallback(async (firebaseUser: User, forcerJeton = false): Promise<IssueChargement> => {
    const sequence = ++sequenceRef.current;
    const toujoursActuel = () => sequence === sequenceRef.current && auth.currentUser?.uid === firebaseUser.uid;

    const execution = (async (): Promise<IssueChargement> => {
      // Vérifier les custom claims pour ne pas créer de fiche famille pour admin/moniteur
      let isStaff = false;
      try {
        const tokenResult = await firebaseUser.getIdTokenResult(forcerJeton);
        isStaff = tokenResult.claims.admin === true || tokenResult.claims.moniteur === true;
      } catch (e) {
        // Jeton illisible (réseau) : on sort proprement, la page s'affiche
        // sans fiche plutôt que de rester sur son sablier.
        console.warn("Lecture du jeton impossible :", codeFirebase(e) || e);
        if (toujoursActuel()) setFamily(null);
        return "absente";
      }

      if (isStaff) {
        // Admin ou moniteur : pas de fiche famille
        if (toujoursActuel()) {
          setFamily(null);
          setEmailAConfirmer(false);
        }
        return "staff";
      }

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
        if (toujoursActuel()) setFamily(null);
        return "absente";
      }

      if (familySnap.exists()) {
        const data = familySnap.data() as any;
        let fiche: Family | null = null;
        // Compte fusionné : on bascule sur le compte conservé.
        if (data.status === "merged" && data.mergedInto) {
          try {
            const keptSnap = await getDoc(doc(db, "families", data.mergedInto));
            if (keptSnap.exists()) fiche = { id: keptSnap.id, ...keptSnap.data() } as Family;
          } catch { /* fallback ci-dessous */ }
        }
        if (!fiche) fiche = { id: familySnap.id, ...data } as Family;
        if (toujoursActuel()) {
          setFamily(fiche);
          // La fiche est là : plus rien à confirmer, on efface le bandeau et
          // les traces d'envoi (cas d'un compte qui vient d'être confirmé et
          // dont la fiche a déjà été rattachée dans un autre onglet).
          setEmailAConfirmer(false);
          setEtatConfirmation(ETAT_CONFIRMATION_VIERGE);
        }
        return "trouvee";
      }

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
      let issue: IssueChargement = "absente";
      let ficheLiee: Family | null = null;
      try {
        const token = await firebaseUser.getIdToken(forcerJeton);
        const res = await fetch("/api/famille/lier-compte", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.lie && data.family) {
            ficheLiee = data.family as Family;
            issue = "trouvee";
          }
        } else if (res.status === 403) {
          // Une fiche existe bien à cette adresse, mais elle n'a pas été
          // confirmée : le serveur refuse de la rattacher. On l'explique
          // (bandeau) plutôt que de laisser un espace vide.
          const data = await res.json().catch(() => null);
          if (data?.error === "EMAIL_NON_VERIFIE") issue = "a-confirmer";
        } else {
          console.warn(`Rattachement refusé (HTTP ${res.status}).`);
        }
      } catch (e) {
        console.warn("Rattachement de compte impossible :", e);
      }

      if (!toujoursActuel()) return issue;

      if (issue === "trouvee") {
        setFamily(ficheLiee);
        setEmailAConfirmer(false);
        setEtatConfirmation(ETAT_CONFIRMATION_VIERGE);
        return issue;
      }

      // La route serveur crée la fiche vierge quand aucune n'existe : si on
      // arrive ici sans fiche, c'est qu'elle a échoué (réseau, incident) ou
      // qu'elle attend la confirmation de l'adresse. On ne crée plus la fiche
      // depuis le navigateur — les règles interdisent à une famille de se
      // déclarer elle-même `parentEmail`, `authUid` et `authProvider`.
      setFamily(null);
      setEmailAConfirmer(issue === "a-confirmer");

      if (issue === "a-confirmer" && !envoiAutoRef.current.has(firebaseUser.uid)) {
        // Un seul envoi automatique par compte et par session : si
        // l'inscription vient d'en envoyer un, ou si ce n'est pas la
        // première fois qu'on passe ici, on laisse la main au bouton.
        envoiAutoRef.current.add(firebaseUser.uid);
        const resultat = await envoyerConfirmation(firebaseUser);
        if (toujoursActuel()) enregistrerEnvoi(resultat);
      }
      return issue;
    })();

    chargementRef.current = execution;
    try {
      return await execution;
    } finally {
      if (chargementRef.current === execution) chargementRef.current = null;
    }
  }, [envoyerConfirmation, enregistrerEnvoi]);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      try {
        if (firebaseUser) {
          await chargerFamille(firebaseUser);
        } else {
          // Déconnexion : les réponses encore en vol sont périmées.
          sequenceRef.current++;
          dernierEnvoiRef.current = null;
          setFamily(null);
          setEmailAConfirmer(false);
          setEtatConfirmation(ETAT_CONFIRMATION_VIERGE);
        }
      } catch (e) {
        console.error("Chargement de la session impossible :", e);
      } finally {
        // Quoi qu'il arrive, on sort du sablier.
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [chargerFamille]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      // Plus de console.error muet : l'écran de connexion affiche la cause
      // (popup bloquée, annulation, domaine non autorisé, réseau…).
      throw new ErreurConnexion(error, "google");
    }
  };

  const signInWithFacebook = async () => {
    try {
      await signInWithPopup(auth, facebookProvider);
    } catch (error) {
      throw new ErreurConnexion(error, "facebook");
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
    // On note l'envoi pour que l'observateur d'authentification n'en refasse
    // pas un second dans la foulée.
    envoiAutoRef.current.add(cred.user.uid);
    enregistrerEnvoi(await envoyerConfirmation(cred.user));
  };

  const renvoyerConfirmation = async (): Promise<ResultatEnvoiConfirmation> => {
    const u = auth.currentUser;
    if (!u) {
      const resultat: ResultatEnvoiConfirmation = { ok: false, code: "aucun-compte", message: messageEnvoiConfirmation("aucun-compte") };
      enregistrerEnvoi(resultat);
      return resultat;
    }
    const attente = secondesAvantRenvoi(dernierEnvoiRef.current, Date.now());
    if (attente > 0) {
      const resultat: ResultatEnvoiConfirmation = { ok: false, code: "trop-tot", message: messageEnvoiConfirmation("trop-tot", attente) };
      enregistrerEnvoi(resultat);
      return resultat;
    }
    const resultat = await envoyerConfirmation(u);
    if (auth.currentUser?.uid === u.uid) enregistrerEnvoi(resultat);
    return resultat;
  };

  const confirmerAdresse = async (): Promise<ResultatConfirmationAdresse> => {
    const u = auth.currentUser;
    if (!u) return { ok: false, code: "aucun-compte", message: messageConfirmationAdresse("aucun-compte") };

    // Un chargement encore en cours (connexion qui vient d'aboutir) : on
    // attend sa fin plutôt que d'empiler un second rattachement.
    if (chargementRef.current) await chargementRef.current.catch(() => undefined);
    if (auth.currentUser?.uid !== u.uid) return { ok: false, code: "aucun-compte", message: messageConfirmationAdresse("aucun-compte") };

    try {
      await u.reload();          // relit emailVerified depuis Firebase
      await u.getIdToken(true);  // jeton neuf, avec email_verified à jour
    } catch (e) {
      const code: CodeConfirmationAdresse = codeFirebase(e) === "auth/network-request-failed" ? "reseau" : "inconnue";
      return { ok: false, code, message: messageConfirmationAdresse(code) };
    }

    const issue = await chargerFamille(u, true);
    if (issue === "trouvee" || issue === "staff") return { ok: true };
    if (issue === "a-confirmer") return { ok: false, code: "toujours-non-verifiee", message: messageConfirmationAdresse("toujours-non-verifiee") };
    return { ok: false, code: "inconnue", message: messageConfirmationAdresse("inconnue") };
  };

  const rechargerFamille = async () => {
    const u = auth.currentUser;
    if (!u) return;
    if (chargementRef.current) await chargementRef.current.catch(() => undefined);
    await chargerFamille(u, true);
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
        etatConfirmation,
        renvoyerConfirmation,
        confirmerAdresse,
        rechargerFamille,
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
