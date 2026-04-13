"use client";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function EspaceMoniteurLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, userRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && user && userRole !== "moniteur" && userRole !== "admin") router.push("/");
  }, [loading, user, userRole]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user || (userRole !== "moniteur" && userRole !== "admin")) return null;

  return (
    <div className="min-h-screen bg-cream">
      {/* Header moniteur */}
      <header className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🐴</span>
            <div>
              <div className="font-display text-sm font-bold text-blue-800">Centre Équestre d'Agon</div>
              <div className="font-body text-[10px] text-slate-400">Espace collaborateur</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-body text-xs text-slate-500">{user.displayName || user.email}</span>
            <button onClick={() => { import("firebase/auth").then(({ getAuth, signOut }) => signOut(getAuth())); }}
              className="font-body text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer">
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
