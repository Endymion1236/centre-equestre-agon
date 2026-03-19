"use client";

import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Users,
  Mail,
  Image,
  BookOpen,
  Settings,
  LogOut,
  Loader2,
  ShieldAlert,
} from "lucide-react";

const navItems = [
  { href: "/admin/dashboard", icon: BarChart3, label: "Tableau de bord" },
  { href: "/admin/activites", icon: ClipboardList, label: "Activités" },
  { href: "/admin/planning", icon: CalendarDays, label: "Planning" },
  { href: "/admin/montoir", icon: ClipboardList, label: "Montoir" },
  { href: "/admin/cavaliers", icon: Users, label: "Cavaliers" },
  { href: "/admin/forfaits", icon: CalendarDays, label: "Forfaits annuels" },
  { href: "/admin/cartes", icon: CreditCard, label: "Cartes & tickets" },
  { href: "/admin/paiements", icon: CreditCard, label: "Paiements" },
  { href: "/admin/comptabilite", icon: BookOpen, label: "Comptabilité" },
  { href: "/admin/communication", icon: Mail, label: "Communication" },
  { href: "/admin/bons-cadeaux", icon: Settings, label: "Bons cadeaux" },
  { href: "/admin/parametres", icon: Settings, label: "Paramètres" },
];

function AdminSidebar() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <div className="w-[210px] bg-blue-800 p-2 flex flex-col gap-0.5 flex-shrink-0 min-h-screen hidden md:flex">
      <div className="px-3 py-3 pb-5">
        <div className="font-display text-sm font-bold text-white">Centre Equestre</div>
        <div className="font-body text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Administration</div>
      </div>

      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-2.5 px-3 py-2.5 rounded-lg no-underline transition-all
              ${active ? "bg-blue-500/30 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}
            `}
          >
            <Icon size={16} />
            <span className={`font-body text-[13px] ${active ? "font-semibold" : "font-normal"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}

      <div className="mt-auto pt-3 border-t border-white/10">
        <div className="px-3 py-2 font-body text-[11px] text-white/30 truncate">
          {user?.email}
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-all w-full bg-transparent border-none cursor-pointer"
        >
          <LogOut size={16} />
          <span className="font-body text-[13px]">Déconnexion</span>
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="font-display text-xl font-bold text-blue-800 mb-2">Accès restreint</h1>
          <p className="font-body text-sm text-gray-500 mb-6">
            Le back-office est réservé aux administrateurs du centre équestre.
          </p>
          <Link href="/espace-cavalier" className="font-body text-sm font-semibold text-blue-500 no-underline">
            → Espace cavalier
          </Link>
        </div>
      </div>
    );
  }

  // Restrict to admin emails
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h1 className="font-display text-xl font-bold text-blue-800 mb-2">Accès réservé</h1>
          <p className="font-body text-sm text-gray-500 mb-2">
            Le back-office est réservé aux administrateurs.
          </p>
          <p className="font-body text-xs text-gray-400 mb-6">
            Connecté en tant que : {user?.email}
          </p>
          <Link href="/espace-cavalier" className="font-body text-sm font-semibold text-blue-500 no-underline">
            → Espace cavalier
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex">
      <AdminSidebar />
      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-[960px]">
          {children}
        </div>
      </div>
    </div>
  );
}
