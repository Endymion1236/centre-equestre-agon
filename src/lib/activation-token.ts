/**
 * Tokens d'activation "maison" — duree de vie longue (7 jours).
 *
 * Probleme contourne : les liens generes par adminAuth.generateSignInWithEmailLink
 * expirent en ~1 heure (limite Firebase non configurable). Inutilisable quand
 * une famille recoit l'email le soir et clique le lendemain.
 *
 * Solution : on genere NOTRE propre token aleatoire, stocke dans Firestore avec
 * une expiration qu'on choisit (7 jours). Au clic, le serveur echange ce token
 * contre un Firebase custom token (createCustomToken) -> connexion cote client
 * via signInWithCustomToken. On garde la maitrise totale de la duree de vie et
 * de la revocation.
 *
 * Securite :
 *   - Token = 32 octets aleatoires cryptographiques (crypto.randomBytes), non
 *     devinable. Stocke en clair cote Firestore (acces admin uniquement via
 *     regles), mais c'est un secret a usage unique de courte duree relative.
 *   - Marque 'used' apres connexion reussie (usage unique).
 *   - Tolerance pre-scan antivirus : on ne marque 'used' qu'a l'echange reel,
 *     et on autorise un court delai de grace si le meme token est rejoue dans
 *     les 60s (cas du scanner email qui ouvre puis l'utilisateur qui ouvre).
 *
 * Adresse confirmee par le lien :
 *   Presenter un token valide prouve que l'on lit la boite mail. Le compte
 *   Firebase est donc marque `emailVerified` AVANT l'emission du custom token.
 *   Sans cela, un compte cree a l'envoi du lien (emailVerified: false, cf.
 *   magic-link.ts) restait non verifie apres la connexion, et
 *   /api/famille/lier-compte refusait a juste titre de rattacher la fiche :
 *   la famille etait connectee mais bloquee sur « Confirmez votre adresse »
 *   (signalement du 07/09/2026).
 */

import { randomBytes } from "crypto";
import { adminAuth, adminDb } from "./firebase-admin";

const COLLECTION = "activation-tokens";
const DEFAULT_TTL_DAYS = 7;
const GRACE_REPLAY_MS = 60_000; // 60s de grace pour le double-clic / pre-scan

export interface CreateTokenOptions {
  email: string;
  familyId?: string;
  ttlDays?: number;
}

export interface CreateTokenResult {
  token: string;
  expiresAt: string;
}

/**
 * Cree un token d'activation et le stocke. Retourne le token a inclure dans
 * l'URL du lien email.
 */
export async function createActivationToken(opts: CreateTokenOptions): Promise<CreateTokenResult> {
  const email = (opts.email || "").trim().toLowerCase();
  const ttlDays = opts.ttlDays ?? DEFAULT_TTL_DAYS;

  const token = randomBytes(32).toString("hex"); // 64 caracteres hex
  const now = Date.now();
  const expiresAt = new Date(now + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await adminDb.collection(COLLECTION).doc(token).set({
    email,
    familyId: opts.familyId || null,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    used: false,
    usedAt: null,
  });

  return { token, expiresAt };
}

export type VerifyTokenError = "not_found" | "expired" | "used" | "disabled" | "internal";

export interface VerifyTokenResult {
  ok: boolean;
  error?: VerifyTokenError;
  customToken?: string;
  email?: string;
}

/** Enregistrement Firestore d'un token (collection `activation-tokens`). */
export interface TokenRecord {
  email?: string;
  expiresAt?: string | null;
  used?: boolean;
  usedAt?: string | null;
}

/** Le strict necessaire d'un UserRecord Firebase Auth. */
export interface CompteAuth {
  uid: string;
  emailVerified: boolean;
  disabled?: boolean;
}

/**
 * Dependances de la verification, injectables pour les tests unitaires
 * (aucun acces reseau ni Firebase reel). En production, voir
 * `dependancesFirebase()` ci-dessous.
 */
export interface VerifierTokenDeps {
  lireToken: (token: string) => Promise<TokenRecord | null>;
  marquerUtilise: (token: string, usedAtIso: string) => Promise<void>;
  /** Doit lever une erreur avec `code === "auth/user-not-found"` si absent. */
  getUserByEmail: (email: string) => Promise<CompteAuth>;
  createUser: (email: string) => Promise<CompteAuth>;
  /** Confirme l'adresse du compte (adminAuth.updateUser(uid, { emailVerified: true })). */
  confirmerAdresse: (uid: string) => Promise<void>;
  createCustomToken: (uid: string) => Promise<string>;
  now?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

function codeErreur(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "sans-code";
}

/**
 * Coeur de la verification, sans effet de bord hors des dependances fournies.
 *
 * Ordre des effets, voulu pour la reprise apres incident :
 *   1. controles du token (forme, existence, expiration, usage) — aucun appel
 *      Auth avant que le secret ne soit reconnu ;
 *   2. resolution du compte sur l'adresse PORTEE PAR LE TOKEN (jamais une
 *      adresse venue du navigateur) ; compte desactive → refus ;
 *   3. confirmation de l'adresse si besoin — en cas d'echec, le token n'est
 *      PAS consomme et aucun custom token n'est emis : la famille peut
 *      recliquer une fois l'incident passe ;
 *   4. marquage `used` ;
 *   5. emission du custom token (un echec ici reste rattrapable dans la
 *      fenetre de grace de 60 s).
 */
export async function verifierTokenActivation(
  token: string,
  deps: VerifierTokenDeps,
): Promise<VerifyTokenResult> {
  const log = deps.log ?? ((m, d) => console.error(m, d));
  const now = (deps.now ?? Date.now)();

  if (!token || typeof token !== "string" || token.length < 32) {
    return { ok: false, error: "not_found" };
  }

  // ── 1. Le token lui-meme ──
  let data: TokenRecord | null;
  try {
    data = await deps.lireToken(token);
  } catch (e) {
    log("verifyActivationToken lireToken:", codeErreur(e));
    return { ok: false, error: "internal" };
  }
  if (!data) return { ok: false, error: "not_found" };

  if (data.expiresAt && new Date(data.expiresAt).getTime() < now) {
    return { ok: false, error: "expired" };
  }

  // Deja utilise ? On tolere un rejeu dans les GRACE_REPLAY_MS pour gerer
  // le cas du scanner antivirus qui ouvre le lien juste avant l'utilisateur.
  if (data.used) {
    const usedAt = data.usedAt ? new Date(data.usedAt).getTime() : 0;
    if (now - usedAt > GRACE_REPLAY_MS) {
      return { ok: false, error: "used" };
    }
    // Dans la fenetre de grace : on laisse passer (re-genere un custom token)
  }

  const email = (data.email || "").trim().toLowerCase();
  if (!email) return { ok: false, error: "internal" };

  // ── 2. Le compte, sur l'adresse du token ──
  let compte: CompteAuth;
  try {
    compte = await deps.getUserByEmail(email);
  } catch (e) {
    if (codeErreur(e) !== "auth/user-not-found") {
      log("verifyActivationToken getUserByEmail:", codeErreur(e));
      return { ok: false, error: "internal" };
    }
    try {
      compte = await deps.createUser(email);
    } catch (e2) {
      log("verifyActivationToken createUser:", codeErreur(e2));
      return { ok: false, error: "internal" };
    }
  }

  if (compte.disabled) {
    log("verifyActivationToken: compte desactive", { uid: compte.uid });
    return { ok: false, error: "disabled" };
  }

  // ── 3. L'adresse est prouvee par le lien : on la confirme ──
  if (!compte.emailVerified) {
    try {
      await deps.confirmerAdresse(compte.uid);
    } catch (e) {
      log("verifyActivationToken confirmerAdresse:", { uid: compte.uid, code: codeErreur(e) });
      return { ok: false, error: "internal" };
    }
  }

  // ── 4. Usage unique ──
  if (!data.used) {
    try {
      await deps.marquerUtilise(token, new Date(now).toISOString());
    } catch (e) {
      log("verifyActivationToken marquerUtilise:", codeErreur(e));
      return { ok: false, error: "internal" };
    }
  }

  // ── 5. Le custom token pour la connexion cote client ──
  try {
    const customToken = await deps.createCustomToken(compte.uid);
    return { ok: true, customToken, email };
  } catch (e) {
    log("verifyActivationToken createCustomToken:", { uid: compte.uid, code: codeErreur(e) });
    return { ok: false, error: "internal" };
  }
}

/** Branchement reel sur Firebase Admin (Auth + Firestore). */
function dependancesFirebase(): VerifierTokenDeps {
  const col = adminDb.collection(COLLECTION);
  return {
    lireToken: async (token) => {
      const snap = await col.doc(token).get();
      return snap.exists ? (snap.data() as TokenRecord) : null;
    },
    marquerUtilise: async (token, usedAt) => {
      await col.doc(token).update({ used: true, usedAt });
    },
    getUserByEmail: async (email) => {
      const u = await adminAuth.getUserByEmail(email);
      return { uid: u.uid, emailVerified: !!u.emailVerified, disabled: !!u.disabled };
    },
    createUser: async (email) => {
      const u = await adminAuth.createUser({ email, emailVerified: true });
      return { uid: u.uid, emailVerified: true, disabled: false };
    },
    confirmerAdresse: async (uid) => {
      await adminAuth.updateUser(uid, { emailVerified: true });
    },
    createCustomToken: (uid) => adminAuth.createCustomToken(uid),
  };
}

/**
 * Verifie un token et, s'il est valide, retourne un Firebase custom token
 * pour connecter la famille cote client.
 *
 * Le user Firebase Auth est cree s'il n'existe pas (par email), et son
 * adresse est confirmee s'il existe deja sans l'etre.
 */
export async function verifyActivationToken(token: string): Promise<VerifyTokenResult> {
  try {
    return await verifierTokenActivation(token, dependancesFirebase());
  } catch (e) {
    console.error("verifyActivationToken fatal:", codeErreur(e));
    return { ok: false, error: "internal" };
  }
}
