"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import VoiceAssistant from "@/components/VoiceAssistant";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  Home,
  Calendar,
  ClipboardList,
  Receipt,
  Users,
  Star,
  MoreHorizontal,
  ChevronLeft,
  TrendingUp,
  LogOut,
  Loader2,
  ExternalLink,
  FlaskConical,
} from "lucide-react";

const navItems = [
  { href: "/espace-cavalier/dashboard", icon: Home, label: "Tableau de bord" },
  { href: "/espace-cavalier/reserver", icon: Calendar, label: "Réserver" },
  { href: "/espace-cavalier/reservations", icon: ClipboardList, label: "Mes réservations" },
  { href: "/espace-cavalier/factures", icon: Receipt, label: "Mes factures" },
  { href: "/espace-cavalier/profil", icon: Users, label: "Profil famille" },
  { href: "/espace-cavalier/progression", icon: TrendingUp, label: "Progression" },
  { href: "/espace-cavalier/satisfaction", icon: Star, label: "Satisfaction" },
  { href: "/espace-cavalier/test-protocol", icon: FlaskConical, label: "Tests" },
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
            <p className="font-body text-xs text-gray-600 leading-relaxed">
              En vous connectant, vous acceptez nos{" "}
              <a href="#" className="text-blue-500 no-underline">CGV</a> et notre{" "}
              <a href="#" className="text-blue-500 no-underline">politique de confidentialité</a>.
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link
            href="/"
            className="font-body text-sm text-gray-600 hover:text-blue-500 transition-colors no-underline"
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
    <div className="w-[230px] flex-shrink-0 min-h-screen hidden md:flex flex-col"
      style={{ background: "linear-gradient(180deg, #0C1A2E 0%, #122A5A 100%)" }}>

      {/* Logo + nom centre */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #F0A010, #F4B840)", color: "#0C1A2E" }}>
            CE
          </div>
          <div>
            <div className="font-display text-xs font-bold text-white leading-tight">Centre Équestre</div>
            <div className="font-body text-[10px] text-white/50 leading-tight">Agon-Coutainville</div>
          </div>
        </div>
        {/* Famille */}
        <div className="bg-white/8 rounded-xl px-3 py-2.5">
          <div className="font-body text-xs font-bold text-white truncate">
            {family?.parentName || "Ma famille"}
          </div>
          <div className="font-body text-[10px] mt-0.5" style={{ color: "#F0A010" }}>
            🐴 {family?.children?.length || 0} cavalier{(family?.children?.length || 0) > 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl no-underline transition-all"
              style={active ? {
                background: "linear-gradient(135deg, rgba(240,160,16,0.2), rgba(244,184,64,0.1))",
                borderLeft: "3px solid #F0A010",
                paddingLeft: "9px",
              } : {
                color: "rgba(255,255,255,0.55)",
              }}
            >
              <Icon size={17} color={active ? "#F0A010" : "rgba(255,255,255,0.55)"} />
              <span className="font-body text-[13px]" style={{
                color: active ? "#F4B840" : "rgba(255,255,255,0.55)",
                fontWeight: active ? 600 : 400,
              }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bas : retour site + déconnexion */}
      <div className="px-3 pb-5 border-t border-white/10 pt-4 flex flex-col gap-0.5">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl no-underline transition-all"
          style={{ color: "rgba(255,255,255,0.4)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color="rgba(255,255,255,0.8)"; (e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.06)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color="rgba(255,255,255,0.4)"; (e.currentTarget as HTMLElement).style.background="transparent"; }}
        >
          <ExternalLink size={17} />
          <span className="font-body text-[13px]">Retour au site</span>
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full bg-transparent border-none cursor-pointer transition-all text-left"
          style={{ color: "rgba(255,100,100,0.6)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color="rgba(255,100,100,1)"; (e.currentTarget as HTMLElement).style.background="rgba(255,80,80,0.1)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color="rgba(255,100,100,0.6)"; (e.currentTarget as HTMLElement).style.background="transparent"; }}
        >
          <LogOut size={17} />
          <span className="font-body text-[13px]">Déconnexion</span>
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
  const { user, loading, signOut, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showVoice, setShowVoice] = useState(false);
  const [voiceContext, setVoiceContext] = useState<Record<string, any>>({});
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Charger le planning réel pour le chatbot famille
  useEffect(() => {
    if (!showVoice) return;
    const loadContext = async () => {
      try {
        const now = new Date();
        // Prochains 30 jours
        const todayStr = now.toISOString().split("T")[0];
        const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
        const in30Str = in30.toISOString().split("T")[0];

        const [creneauxSnap, activitiesSnap] = await Promise.all([
          getDocs(query(
            collection(db, "creneaux"),
            where("date", ">=", todayStr),
            where("date", "<=", in30Str),
          )),
          getDocs(collection(db, "activities")),
        ]);

        const creneaux = creneauxSnap.docs.map(d => d.data())
          .filter(c => c.status !== "closed")
          .sort((a, b) => a.date.localeCompare(b.date));

        // Tarifs depuis la collection activities (mis à jour en temps réel)
        const activitiesTarifs: Record<string, string> = {};
        activitiesSnap.docs.forEach(d => {
          const a = d.data();
          if (a.title && a.priceHT) {
            const ttc = Math.round(a.priceHT * (1 + (a.tvaTaux || 5.5) / 100) * 100) / 100;
            activitiesTarifs[a.title] = `${ttc}€${a.type === "cours" ? "/séance" : ""}`;
          }
        });

        // Grouper par type
        const balades = creneaux.filter(c => c.activityType === "balade");
        const cours   = creneaux.filter(c => c.activityType === "cours");
        const stages  = creneaux.filter(c => c.activityType === "stage");
        const ponyride= creneaux.filter(c => c.activityType === "ponyride");
        const anniv   = creneaux.filter(c => c.activityType === "anniversaire");

        const fmt = (c: any) => {
          const d = new Date(c.date);
          const dLabel = d.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });
          const places = c.maxPlaces - (c.enrolled?.length || 0);
          return `${dLabel} à ${c.startTime} — ${c.activityTitle} — ${places} place${places>1?"s":""} disponible${places>1?"s":""}`;
        };

        setVoiceContext({
          centre: "Centre Équestre d'Agon-Coutainville",
          localisation: "Agon-Coutainville, Normandie (Manche)",
          date_aujourdhui: now.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" }),
          prochaines_balades: balades.slice(0,8).map(fmt),
          prochains_cours: cours.slice(0,8).map(fmt),
          prochains_stages: stages.slice(0,5).map(fmt),
          prochains_ponyrides: ponyride.slice(0,5).map(fmt),
          prochains_anniversaires: anniv.slice(0,3).map(fmt),
          total_balades_dispo: balades.filter(c => c.maxPlaces - (c.enrolled?.length||0) > 0).length,
          total_cours_dispo: cours.filter(c => c.maxPlaces - (c.enrolled?.length||0) > 0).length,
          tarifs: Object.keys(activitiesTarifs).length > 0
            ? activitiesTarifs
            : { note: "Consulter le centre pour les tarifs" },
          infos_pratiques: {
            inscription: "Via l'espace cavalier en ligne ou en contactant le centre",
            equipement: "Casque obligatoire, fourni si besoin. Tenue adaptée recommandée.",
            age_minimum_cours: "4 ans pour le pony ride, 6 ans pour les cours",
          },
        });
      } catch(e) { console.error("voiceContext famille error", e); }
    };
    loadContext();
  }, [showVoice]);

  // Redirection admin → back-office
  useEffect(() => {
    if (user && isAdmin && !loading) {
      router.replace("/admin/dashboard");
    }
  }, [user, isAdmin, loading, router]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  // Admin → en cours de redirection
  if (user && isAdmin) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-600">Redirection vers l&apos;administration...</p>
        </div>
      </div>
    );
  }

  // Not logged in → show login screen
  if (!user) {
    return <LoginScreen />;
  }

  // Mobile bottom nav items (les 5 plus importants)
  const mobileNav = [
    { href: "/espace-cavalier/dashboard", icon: Home, label: "Accueil" },
    { href: "/espace-cavalier/reserver", icon: Calendar, label: "Réserver" },
    { href: "/espace-cavalier/reservations", icon: ClipboardList, label: "Réservations" },
    { href: "/espace-cavalier/factures", icon: Receipt, label: "Factures" },
    { href: "/espace-cavalier/profil", icon: Users, label: "Profil" },
  ];

  // Menu "Plus" mobile — items accessibles via le drawer (état déclaré plus haut)
  const moreItems = [
    { href: "/espace-cavalier/progression", icon: TrendingUp, label: "Progression" },
    { href: "/espace-cavalier/satisfaction", icon: Star, label: "Satisfaction" },
    { href: "/espace-cavalier/test-protocol", icon: FlaskConical, label: "Tests" },
  ];

  // Logged in → show dashboard layout
  return (
    <div className="min-h-screen bg-cream flex">
      <CavalierSidebar />
      <div className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-50 bg-cream/95 backdrop-blur-xl border-b border-blue-500/8 px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {pathname !== "/espace-cavalier/dashboard" && (
              <Link href="/espace-cavalier/dashboard"
                className="md:hidden flex items-center gap-1 font-body text-xs font-semibold text-blue-500 bg-blue-50 px-2.5 py-1.5 rounded-lg no-underline hover:bg-blue-100">
                <ChevronLeft size={14}/> Accueil
              </Link>
            )}
            <Link href="/" className="no-underline hidden md:block">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-display text-xs font-bold">
                CE
              </div>
            </Link>
            <span className="font-display text-sm font-bold text-blue-800 hidden md:inline">Centre Equestre</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="md:hidden font-body text-xs text-gray-600 no-underline flex items-center gap-1">
              <ExternalLink size={14} /> Site
            </Link>
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center font-body text-xs font-bold text-blue-500">
              {user.displayName?.split(" ").map(n => n[0]).join("").slice(0, 2) || "?"}
            </div>
            <button onClick={signOut}
              className="md:hidden w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-400 border-none cursor-pointer hover:bg-red-100"
              title="Déconnexion">
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Page content — padding bottom pour ne pas cacher sous la nav mobile */}
        <div className="p-4 md:p-8 max-w-[900px] pb-24 md:pb-8">
          {children}
        </div>
      </div>

      {/* ─── Assistant vocal famille ─── */}
      <div className="fixed bottom-20 right-4 z-[100] flex flex-col items-end gap-3 md:bottom-6">
        {showVoice && (
          <div className="w-[320px] sm:w-[380px]">
            <VoiceAssistant
              mode="famille"
              voiceId="XB0fDUnXU5powFXDhCwa"
              placeholder="Votre question..."
              onClose={() => setShowVoice(false)}
              context={voiceContext}
            />
          </div>
        )}
        <button
          onClick={() => setShowVoice(!showVoice)}
          className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg border-none cursor-pointer hover:scale-105 transition-transform"
          style={{ background: "linear-gradient(135deg,#1a6b3c,#0C1A2E)" }}
          title="Assistant vocal">
          {showVoice ? <span className="text-lg">✕</span> : <span className="text-xl">🎙️</span>}
        </button>
      </div>

      {/* ─── Bottom Navigation Mobile ─── */}
      {/* Drawer menu Plus */}
      {showMoreMenu && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setShowMoreMenu(false)}>
          <div className="absolute bottom-16 right-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden" onClick={e => e.stopPropagation()}>
            {moreItems.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} onClick={() => setShowMoreMenu(false)}
                  className={`flex items-center gap-3 px-5 py-3.5 font-body text-sm border-b border-gray-50 last:border-0 no-underline ${isActive ? "text-blue-500 bg-blue-50 font-semibold" : "text-slate-700"}`}>
                  <item.icon size={18} className={isActive ? "text-blue-500" : "text-slate-400"}/>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 flex items-center justify-around px-2 py-2 safe-area-inset-bottom">
        {mobileNav.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg no-underline transition-all min-w-[56px]
                ${active ? "text-blue-500" : "text-gray-600"}`}>
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              <span className={`font-body text-[10px] ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
            </Link>
          );
        })}
        {/* Bouton Plus */}
        <button onClick={() => setShowMoreMenu(m => !m)}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg cursor-pointer border-none bg-transparent transition-colors ${showMoreMenu ? "text-blue-500" : "text-slate-400"}`}>
          <MoreHorizontal size={22} className={showMoreMenu ? "text-blue-500" : "text-slate-400"}/>
          <span className="font-body text-[10px] font-medium">Plus</span>
        </button>
      </div>
    </div>
  );
}
