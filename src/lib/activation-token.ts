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

export interface VerifyTokenResult {
  ok: boolean;
  error?: "not_found" | "expired" | "used" | "internal";
  customToken?: string;
  email?: string;
}

/**
 * Verifie un token et, s'il est valide, retourne un Firebase custom token
 * pour connecter la famille cote client.
 *
 * Le user Firebase Auth est cree s'il n'existe pas (par email).
 */
export async function verifyActivationToken(token: string): Promise<VerifyTokenResult> {
  if (!token || typeof token !== "string" || token.length < 32) {
    return { ok: false, error: "not_found" };
  }

  try {
    const ref = adminDb.collection(COLLECTION).doc(token);
    const snap = await ref.get();

    if (!snap.exists) {
      return { ok: false, error: "not_found" };
    }

    const data = snap.data() as any;
    const now = Date.now();

    // Expiration ?
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
    if (!email) {
      return { ok: false, error: "internal" };
    }

    // Recuperer ou creer le user Firebase Auth
    let uid: string;
    try {
      const user = await adminAuth.getUserByEmail(email);
      uid = user.uid;
    } catch (e: any) {
      if (e.code === "auth/user-not-found") {
        const created = await adminAuth.createUser({ email, emailVerified: true });
        uid = created.uid;
      } else {
        console.error("verifyActivationToken getUser:", e);
        return { ok: false, error: "internal" };
      }
    }

    // Marquer comme utilise (si pas deja fait dans la fenetre de grace)
    if (!data.used) {
      await ref.update({ used: true, usedAt: new Date(now).toISOString() });
    }

    // Generer le custom token Firebase pour connexion cote client
    const customToken = await adminAuth.createCustomToken(uid);

    return { ok: true, customToken, email };
  } catch (e) {
    console.error("verifyActivationToken fatal:", e);
    return { ok: false, error: "internal" };
  }
}
