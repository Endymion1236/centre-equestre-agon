"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  ClipboardList,
  Receipt,
  Users,
  Star,
  LogOut,
  Loader2,
} from "lucide-react";

const navItems = [
  { href: "/espace-cavalier/dashboard", icon: Home, label: "Tableau de bord" },
  { href: "/espace-cavalier/reserver", icon: Calendar, label: "Réserver" },
  { href: "/espace-cavalier/reservations", icon: ClipboardList, label: "Mes réservations" },
  { href: "/espace-cavalier/factures", icon: Receipt, label: "Mes factures" },
  { href: "/espace-cavalier/profil", icon: Users, label: "Profil famille" },
  { href: "/espace-cavalier/satisfaction", icon: Star, label: "Satisfaction" },
];

function LoginScreen() {
  const { signInWithGoogle, signInWithFacebook } = useAuth();

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-display font-bold text-xl mx-auto mb-4">
            CE
          </div>
          <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">
            Espace cavalier
          </h1>
          <p className="font-body text-sm text-gray-500">
            Connectez-vous pour réserver, gérer votre famille et suivre vos activités.
          </p>
        </div>

        <div className="card p-8">
          <div className="flex flex-col gap-3">
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl border border-gray-200 bg-white font-body text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuer avec Google
            </button>

            <button
              onClick={signInWithFacebook}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-[#1877F2] font-body text-sm font-semibold text-white hover:bg-[#166FE5] transition-all cursor-pointer border-none"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Continuer avec Facebook
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-blue-500/8 text-center">
            <p className="font-body text-xs text-gray-400 leading-relaxed">
              En vous connectant, vous acceptez nos{" "}
              <a href="#" className="text-blue-500 no-underline">CGV</a> et notre{" "}
              <a href="#" className="text-blue-500 no-underline">politique de confidentialité</a>.
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link
            href="/"
            className="font-body text-sm text-gray-400 hover:text-blue-500 transition-colors no-underline"
          >
            ← Retour au site
          </Link>
        </div>
      </div>
    </div>
  );
}

function CavalierSidebar() {
  const { user, family, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <div className="w-[230px] bg-white border-r border-blue-500/8 p-4 flex flex-col gap-0.5 flex-shrink-0 min-h-screen hidden md:flex">
      {/* Family header */}
      <div className="px-3 py-3 pb-5 border-b border-blue-500/8 mb-2">
        <div className="font-display text-sm font-bold text-blue-800">
          {family?.parentName || "Ma famille"}
        </div>
        <div className="font-body text-xs text-gray-400 mt-0.5">
          {family?.children?.length || 0} cavalier{(family?.children?.length || 0) > 1 ? "s" : ""} inscrit{(family?.children?.length || 0) > 1 ? "s" : ""}
        </div>
      </div>

      {/* Nav items */}
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg no-underline transition-all
              ${active ? "bg-blue-50 text-blue-500" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"}
            `}
          >
            <Icon size={18} />
            <span className={`font-body text-[13px] ${active ? "font-semibold" : "font-medium"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}

      {/* Logout */}
      <div className="mt-auto pt-4 border-t border-blue-500/8">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all w-full bg-transparent border-none cursor-pointer"
        >
          <LogOut size={18} />
          <span className="font-body text-[13px] font-medium">Déconnexion</span>
        </button>
      </div>
    </div>
  );
}

export default function EspaceCavalierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-400">Chargement...</p>
        </div>
      </div>
    );
  }

  // Not logged in → show login screen
  if (!user) {
    return <LoginScreen />;
  }

  // Logged in → show dashboard layout
  return (
    <div className="min-h-screen bg-cream flex">
      <CavalierSidebar />
      <div className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-50 bg-cream/95 backdrop-blur-xl border-b border-blue-500/8 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="no-underline">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-display text-xs font-bold">
                CE
              </div>
            </Link>
            <span className="font-display text-sm font-bold text-blue-800">Centre Equestre</span>
            <span className="font-body text-xs text-gray-400 ml-1">Espace cavalier</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center font-body text-xs font-bold text-blue-500">
              {user.displayName?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?"}
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="p-6 md:p-8 max-w-[900px]">
          {children}
        </div>
      </div>
    </div>
  );
}
