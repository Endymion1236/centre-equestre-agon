"use client";

import { useState, useEffect } from "react";
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
  GraduationCap,
  UserPlus,
  LayoutTemplate,
  Send,
  Ticket,
  Heart,
  TrendingUp,
  Wallet,
  ExternalLink,
  Menu,
  X,

  FileText,
} from "lucide-react";

const navItems = [
  { href: "/admin/dashboard", icon: BarChart3, label: "Tableau de bord" },
  // ─── Terrain ───
  { separator: true, label: "Terrain" },
  { href: "/admin/planning", icon: CalendarDays, label: "Planning" },
  { href: "/admin/montoir", icon: ClipboardList, label: "Montoir" },
  { href: "/admin/cavalerie", icon: Heart, label: "Cavalerie" },
  { href: "/admin/pedagogie", icon: GraduationCap, label: "Suivi péda." },
  // ─── Commercial ───
  { separator: true, label: "Commercial" },
  { href: "/admin/cavaliers", icon: Users, label: "Cavaliers" },
  { href: "/admin/passage", icon: UserPlus, label: "Passage" },
  { href: "/admin/paiements", icon: CreditCard, label: "Paiements" },
  { href: "/admin/forfaits", icon: CalendarDays, label: "Forfaits" },
  { href: "/admin/cartes", icon: CreditCard, label: "Cartes" },
  { href: "/admin/avoirs", icon: Wallet, label: "Avoirs" },
  // ─── Gestion ───
  { separator: true, label: "Gestion" },
  { href: "/admin/comptabilite", icon: BookOpen, label: "Comptabilité" },
  { href: "/admin/statistiques", icon: TrendingUp, label: "Statistiques" },
  { href: "/admin/communication", icon: Mail, label: "Communication" },
  { href: "/admin/email-reprise", icon: Send, label: "Email reprise" },
  // ─── Config ───
  { separator: true, label: "Configuration" },
  { href: "/admin/activites", icon: ClipboardList, label: "Activités" },
  { href: "/admin/documents", icon: FileText, label: "Documents" },
  { href: "/admin/modeles", icon: LayoutTemplate, label: "Modèles" },
  { href: "/admin/parametres", icon: Settings, label: "Paramètres" },
] as any[];

function AdminSidebar() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <div className="w-[210px] bg-blue-800 p-2 flex flex-col gap-0.5 flex-shrink-0 min-h-screen hidden md:flex">
      <div className="px-3 py-3 pb-5 flex items-center gap-2.5">
        <img src="/images/logo-ce-agon.png" alt="Logo" className="w-9 h-9 rounded-lg object-contain" />
        <div>
          <div className="font-display text-sm font-bold text-white">Centre Equestre</div>
          <div className="font-body text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Administration</div>
        </div>
      </div>

      {navItems.map((item, idx) => {
        if (item.separator) {
          return (
            <div key={`sep-${idx}`} className="px-3 pt-4 pb-1">
              <div className="font-body text-[9px] text-white/30 uppercase tracking-widest font-semibold">{item.label}</div>
            </div>
          );
        }
        const Icon = item.icon;
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`
              flex items-center gap-2.5 px-3 py-2 rounded-lg no-underline transition-all
              ${active ? "bg-blue-500/30 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}
            `}
          >
            <Icon size={15} />
            <span className={`font-body text-[12px] ${active ? "font-semibold" : "font-normal"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}

      <div className="mt-auto pt-3 border-t border-white/10">
        <Link
          href="/"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-white/40 hover:text-gold-400 hover:bg-gold-400/10 transition-all no-underline mb-0.5"
        >
          <ExternalLink size={16} />
          <span className="font-body text-[13px]">Retour au site</span>
        </Link>
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
  const { user, loading, isAdmin, signOut: authSignOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Fermer le menu mobile quand on change de page
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
        {/* Top bar mobile */}
        <div className="md:hidden sticky top-0 z-50 bg-blue-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white border-none cursor-pointer">
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="font-display text-sm font-bold text-white">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="font-body text-xs text-white/50 no-underline flex items-center gap-1">
              <ExternalLink size={12} /> Site
            </Link>
            <button onClick={authSignOut}
              className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-300 border-none cursor-pointer">
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Menu mobile déroulant */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-[56px] z-40 bg-black/30" onClick={() => setMobileMenuOpen(false)}>
            <div className="bg-blue-800 w-[260px] h-full overflow-y-auto p-3 flex flex-col gap-0.5 shadow-2xl" onClick={e => e.stopPropagation()}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname?.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg no-underline transition-all
                      ${active ? "bg-blue-500/30 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}>
                    <Icon size={16} />
                    <span className={`font-body text-[13px] ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
                  </Link>
                );
              })}
              <div className="mt-4 pt-3 border-t border-white/10">
                <Link href="/" className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-white/40 hover:text-gold-400 no-underline">
                  <ExternalLink size={16} />
                  <span className="font-body text-[13px]">Retour au site</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 md:p-8 max-w-[960px]">
          {children}
        </div>
      </div>
    </div>
  );
}
