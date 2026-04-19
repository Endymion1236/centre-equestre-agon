"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export default function EspaceMoniteurLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, userRole, signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // ─── Redirection automatique vers /admin/dashboard ─────────────────────────
  // Tout collaborateur connecté (admin OU moniteur) est redirigé vers l'admin.
  // Cela unifie l'expérience : Emmeline Lagy (admin) et Éméline Pannella
  // (moniteur) voient la même interface, juste avec des items de sidebar
  // différents selon leurs droits (filtrage via MONITEUR_PAGES dans
  // /admin/layout.tsx).
  useEffect(() => {
    if (loading) return;
    if (user && (userRole === "admin" || userRole === "moniteur")) {
      router.replace("/admin/dashboard");
    }
  }, [user, userRole, loading, router]);

  const handleLogin = async () => {
    setLoggingIn(true);
    setLoginError("");
    try {
      await signInWithEmail(email, password);
    } catch (e: any) {
      setLoginError(e.message?.includes("invalid") ? "Email ou mot de passe incorrect" : "Erreur de connexion");
    }
    setLoggingIn(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Pas connecté → formulaire de connexion
  if (!user) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🐴</div>
            <h1 className="font-display text-xl font-bold text-blue-800">Espace Collaborateur</h1>
            <p className="font-body text-xs text-slate-400 mt-1">Centre Équestre d'Agon-Coutainville</p>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="votre.email@exemple.fr"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Mot de passe</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400" />
            </div>
            {loginError && <p className="font-body text-xs text-red-500">{loginError}</p>}
            <button onClick={handleLogin} disabled={loggingIn || !email || !password}
              className="w-full py-2.5 rounded-lg font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-400 disabled:opacity-50 mt-2">
              {loggingIn ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
              {loggingIn ? "Connexion..." : "Se connecter"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Connecté mais pas moniteur ni admin → accès refusé
  if (userRole !== "moniteur" && userRole !== "admin") {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-2">Accès réservé</h2>
          <p className="font-body text-sm text-slate-500 mb-4">Cet espace est réservé aux collaborateurs du centre équestre.</p>
          <button onClick={() => { import("firebase/auth").then(({ getAuth, signOut }) => signOut(getAuth())); }}
            className="font-body text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg border-none cursor-pointer">
            Déconnexion
          </button>
        </div>
      </div>
    );
  }

  // Admin ou moniteur connecté → on affiche un loader le temps que
  // la redirection vers /admin/dashboard se termine (évite un flash
  // de l'ancien contenu "Planning équipe")
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="font-body text-sm text-slate-500">Redirection vers l'espace admin…</p>
      </div>
    </div>
  );
}
