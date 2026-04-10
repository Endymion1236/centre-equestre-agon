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
  /** Si true, exige le custom claim `admin: true` */
  adminOnly?: boolean;
  /** Si true, exige le custom claim `admin: true` OU `moniteur: true` */
  staffOnly?: boolean;
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

    if (options?.adminOnly && decoded.admin !== true) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs" },
        { status: 403 }
      );
    }

    if (options?.staffOnly && decoded.admin !== true && decoded.moniteur !== true) {
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
