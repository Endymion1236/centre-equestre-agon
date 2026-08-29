import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { estEmailAdmin, repliEmailAutorise } from "@/lib/admin-emails";

/**
 * Vérifie le token Firebase dans le header Authorization.
 * Retourne le DecodedIdToken si valide, ou une NextResponse 401.
 *
 * Usage dans une route API :
 * ```ts
 * import { verifyAuth } from "@/lib/api-auth";
 *
 * export async function POST(req: NextRequest) {
 *   const auth = await verifyAuth(req);
 *   if (auth instanceof NextResponse) return auth; // 401
 *   // auth.uid, auth.email, auth.admin, etc.
 * }
 * ```
 *
 * Pour les routes admin uniquement :
 * ```ts
 * const auth = await verifyAuth(req, { adminOnly: true });
 * ```
 */

interface AuthOptions {
  /** Si true, exige le custom claim `admin: true` (ou email admin connu) */
  adminOnly?: boolean;
  /** Si true, exige le custom claim `admin: true`/`moniteur: true` (ou email admin) */
  staffOnly?: boolean;
}

/**
 * L'autorité est le custom claim `admin: true`.
 *
 * Le repli par email (liste dans lib/admin-emails.ts) est conservé UNIQUEMENT
 * hors production, et uniquement si l'adresse du jeton est vérifiée. Sans ces
 * deux conditions, n'importe qui pouvant créer un compte avec l'une de ces
 * adresses héritait de l'administration complète — l'inscription par
 * email/mot de passe étant active sur ce projet, la seule barrière était un
 * réglage de la console Firebase. Audit 29/08/2026.
 */
export function isAdminToken(decoded: any): boolean {
  if (decoded?.admin === true) return true;
  if (!repliEmailAutorise()) return false;
  return decoded?.email_verified === true && estEmailAdmin(decoded?.email);
}

export async function verifyAuth(
  req: NextRequest,
  options?: AuthOptions
): Promise<any | NextResponse> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  try {
    const decoded = await adminAuth.verifyIdToken(token);

    if (options?.adminOnly && !isAdminToken(decoded)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    if (options?.staffOnly && !isAdminToken(decoded) && decoded.moniteur !== true) {
      return NextResponse.json(
        { error: "Accès réservé au personnel" },
        { status: 403 }
      );
    }

    return decoded;
  } catch (error: any) {
    console.error("Auth verification failed:", error.code || error.message);
    return NextResponse.json(
      { error: "Token invalide ou expiré" },
      { status: 401 }
    );
  }
}
