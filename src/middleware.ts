import { NextRequest, NextResponse } from "next/server";

// Middleware minimal — ne prétend pas faire ce qu'il ne fait pas.
// La vraie protection admin est assurée par :
// 1. Firebase custom claims (vérifiés dans auth-context.tsx côté client)
// 2. adminAuth.verifyIdToken() dans les routes API sensibles
// 3. CRON_SECRET pour les routes cron/admin internes

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bloquer les routes cron si pas le bon secret
  if (pathname.startsWith("/api/cron/")) {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/cron/:path*"],
};
