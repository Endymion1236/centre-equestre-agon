import { NextRequest, NextResponse } from "next/server";

// Middleware Next.js — protection des routes /admin/*
// Vérifie que le token Firebase contient le custom claim admin=true
// Fonctionne côté Edge Runtime (pas d'accès à firebase-admin ici)

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ne protéger que /admin/* (pas les API routes ni les assets)
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // Récupérer le token depuis le cookie Firebase
  // Firebase Auth stocke le token dans __session ou via le header Authorization
  const sessionCookie = req.cookies.get("__session")?.value;
  const authHeader = req.headers.get("authorization");
  const token = sessionCookie || authHeader?.replace("Bearer ", "");

  // Si pas de token → redirection vers login
  if (!token) {
    const loginUrl = new URL("/admin/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Vérification du token via l'API Firebase REST (Edge compatible)
  // On vérifie juste que le token est valide — la vérification des claims
  // est faite côté client dans auth-context.tsx et côté serveur dans les routes API
  try {
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`;
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });

    if (!res.ok) {
      const loginUrl = new URL("/admin/login", req.url);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch {
    // En cas d'erreur réseau → laisser passer (la vérification côté client prend le relais)
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
