import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

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

// Emails admin reconnus meme sans custom claim. Doit rester aligne avec
// ADMIN_EMAILS dans auth-context.tsx et la liste dans firestore.rules.
// Permet a un admin connu par email d'acceder aux routes admin meme sur
// une base Firebase sans claims configures (ex: base de test).
const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
];

function isAdminToken(decoded: any): boolean {
  return decoded.admin === true || ADMIN_EMAILS.includes(decoded.email || "");
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
