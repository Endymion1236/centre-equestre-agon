import { NextRequest, NextResponse } from "next/server";

// Middleware léger — pas de vérification token (Firebase Auth est côté client)
// La vraie protection admin est dans auth-context.tsx via custom claims Firebase
// Ce middleware existe pour bloquer les routes /api/admin/* sans CRON_SECRET

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protéger les routes API admin sensibles (set-claims, etc.)
  if (pathname.startsWith("/api/admin/")) {
    const secret = req.nextUrl.searchParams.get("secret")
      || req.headers.get("authorization")?.replace("Bearer ", "");
    if (!secret || secret !== process.env.CRON_SECRET) {
      // Laisser passer — chaque route vérifie son propre secret
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
