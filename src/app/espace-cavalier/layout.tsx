"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Award,
  Calendar,
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  Home,
  Loader2,
  LogOut,
  MoreHorizontal,
  Receipt,
  Star,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import VoiceAssistant from "@/components/VoiceAssistant";
import { ToastProvider } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { addDaysLocal, toLocalDateString } from "@/lib/date-local";
import { db } from "@/lib/firebase";

type NavItem = {
  href: string;
  icon: any;
  label: string;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/espace-cavalier/dashboard", icon: Home, label: "Accueil" },
  { href: "/espace-cavalier/reserver", icon: Calendar, label: "Réserver" },
  { href: "/espace-cavalier/reservations", icon: ClipboardList, label: "Mes activités" },
  { href: "/espace-cavalier/factures", icon: Receipt, label: "Paiements" },
  { href: "/espace-cavalier/profil", icon: Users, label: "Ma famille" },
];

const FOLLOW_UP_NAV: NavItem[] = [
  { href: "/espace-cavalier/progression", icon: TrendingUp, label: "Progression" },
  { href: "/espace-cavalier/badges", icon: Award, label: "Badges" },
];

const HELP_NAV: NavItem[] = [
  { href: "/espace-cavalier/satisfaction", icon: Star, label: "Donner mon avis" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function LoginScreen() {
  const { signInWithGoogle, signInWithFacebook, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<"social" | "login" | "register" | "magic">("social");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const reset = () => {
    setEmail("");
    setPassword("");
    setDisplayName("");
    setError("");
    setMagicSent(false);
  };

  const changeMode = (next: typeof mode) => {
    reset();
    setMode(next);
  };

  const login = async () => {
    setError("");
    if (!email || !password) {
      setError("Remplissez tous les champs.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      if (["auth/user-not-found", "auth/wrong-password", "auth/invalid-credential"].includes(err?.code)) {
        setError("Email ou mot de passe incorrect.");
      } else {
        setError("Erreur de connexion. Réessayez.");
      }
    }
    setLoading(false);
  };

  const register = async () => {
    setError("");
    if (!displayName || !email || !password) {
      setError("Remplissez tous les champs.");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);
    try {
      await signUpWithEmail(email, password, displayName);
    } catch (err: any) {
      if (err?.code === "auth/email-already-in-use") setError("Cet email est déjà utilisé. Essayez de vous connecter.");
      else if (err?.code === "auth/invalid-email") setError("Adresse email invalide.");
      else setError("Impossible de créer le compte. Réessayez.");
    }
    setLoading(false);
  };

  const sendMagicLink = async () => {
    setError("");
    if (!email || !email.includes("@")) {
      setError("Adresse email invalide.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setMagicSent(true);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Erreur. Réessayez dans quelques instants.");
      }
    } catch {
      setError("Erreur réseau. Réessayez dans quelques instants.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-display text-xl font-bold mx-auto mb-4">CE</div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Espace famille</h1>
          <p className="font-body text-sm text-gray-600 mt-2">
            {mode === "register" ? "Créez votre compte pour gérer les activités de vos cavaliers." : "Réservez, suivez les activités et retrouvez vos paiements au même endroit."}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          {mode === "social" && (
            <div className="flex flex-col gap-3">
              <button type="button" onClick={signInWithGoogle} className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl border border-gray-200 bg-white font-body text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continuer avec Google
              </button>
              <button type="button" onClick={signInWithFacebook} className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl bg-[#1877F2] font-body text-sm font-semibold text-white border-none cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Continuer avec Facebook
              </button>

              <div className="flex items-center gap-3 my-1"><div className="flex-1 h-px bg-gray-200"/><span className="font-body text-xs text-gray-400">ou</span><div className="flex-1 h-px bg-gray-200"/></div>

              <button type="button" onClick={() => changeMode("login")} className="w-full px-5 py-3.5 rounded-xl border border-gray-200 bg-white font-body text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50">Continuer avec un email</button>
              <button type="button" onClick={() => changeMode("magic")} className="w-full py-2 font-body text-xs text-blue-600 bg-transparent border-none cursor-pointer">Pas de mot de passe ? Recevoir un lien de connexion</button>
              <button type="button" onClick={() => changeMode("register")} className="w-full py-2.5 font-body text-sm font-semibold text-gray-600 bg-gray-50 rounded-xl border-none cursor-pointer">Créer un compte</button>
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="flex flex-col gap-3">
              <div className="text-center mb-2">
                <h2 className="font-display text-lg font-bold text-blue-800">{mode === "login" ? "Connexion" : "Créer mon compte"}</h2>
              </div>
              {mode === "register" && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nom et prénom" className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400"/>}
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Adresse email" className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400"/>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (mode === "login" ? login() : register())} placeholder="Mot de passe" className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400"/>
              {error && <p className="font-body text-xs text-red-600 text-center">{error}</p>}
              <button type="button" disabled={loading} onClick={mode === "login" ? login : register} className="w-full px-5 py-3.5 rounded-xl bg-blue-600 font-body text-sm font-bold text-white border-none cursor-pointer disabled:opacity-50">
                {loading ? "Chargement..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
              </button>
              {mode === "login" && <button type="button" onClick={() => changeMode("magic")} className="font-body text-xs text-blue-600 bg-transparent border-none cursor-pointer py-1">Recevoir un lien sans mot de passe</button>}
              <button type="button" onClick={() => changeMode("social")} className="font-body text-xs text-gray-500 bg-transparent border-none cursor-pointer py-2">← Retour</button>
            </div>
          )}

          {mode === "magic" && (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-lg font-bold text-blue-800 text-center">Lien de connexion</h2>
              {!magicSent ? (
                <>
                  <p className="font-body text-sm text-gray-600 text-center">Saisissez votre email. Vous recevrez un lien pour vous connecter sans mot de passe.</p>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMagicLink()} placeholder="votre.email@exemple.fr" className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400"/>
                  {error && <p className="font-body text-xs text-red-600 text-center">{error}</p>}
                  <button type="button" disabled={loading} onClick={sendMagicLink} className="w-full px-5 py-3.5 rounded-xl bg-blue-600 font-body text-sm font-bold text-white border-none cursor-pointer disabled:opacity-50">{loading ? "Envoi..." : "Recevoir mon lien"}</button>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl mx-auto mb-3">✓</div>
                  <div className="font-body text-sm font-bold text-blue-800">Email envoyé</div>
                  <p className="font-body text-xs text-gray-600 mt-2">Si un compte correspond à cette adresse, le lien arrivera dans quelques minutes. Pensez à vérifier les spams.</p>
                </div>
              )}
              <button type="button" onClick={() => changeMode("social")} className="font-body text-xs text-gray-500 bg-transparent border-none cursor-pointer py-2">← Retour</button>
            </div>
          )}
        </div>

        <p className="font-body text-xs text-gray-500 text-center mt-5 leading-relaxed">
          En utilisant cet espace, vous acceptez les <Link href="/cgv" className="text-blue-600">conditions générales</Link> et la <Link href="/confidentialite" className="text-blue-600">politique de confidentialité</Link>.
        </p>
      </div>
    </div>
  );
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActivePath(pathname, item.href);

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl no-underline transition-all border-l-[3px] ${
        active ? "bg-white/10 border-gold-400 text-gold-300" : "border-transparent text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      <Icon size={18} />
      <span className="font-body text-sm font-medium">{item.label}</span>
    </Link>
  );
}

function CavalierSidebar({ pathname }: { pathname: string }) {
  const { signOut } = useAuth();

  return (
    <aside className="hidden md:flex w-[240px] min-h-screen bg-blue-900 flex-col sticky top-0 self-start h-screen">
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/espace-cavalier/dashboard" className="flex items-center gap-3 no-underline">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-blue-900 flex items-center justify-center font-display text-sm font-bold">CE</div>
          <div>
            <div className="font-display text-sm font-bold text-white">Centre Équestre</div>
            <div className="font-body text-xs text-white/45">Espace famille</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => <SidebarLink key={item.href} item={item} pathname={pathname} />)}
        </div>

        <div className="font-body text-[11px] font-bold uppercase tracking-wider text-white/30 px-3 mt-6 mb-2">Suivi des cavaliers</div>
        <div className="flex flex-col gap-1">
          {FOLLOW_UP_NAV.map((item) => <SidebarLink key={item.href} item={item} pathname={pathname} />)}
        </div>

        <div className="font-body text-[11px] font-bold uppercase tracking-wider text-white/30 px-3 mt-6 mb-2">Votre avis</div>
        <div className="flex flex-col gap-1">
          {HELP_NAV.map((item) => <SidebarLink key={item.href} item={item} pathname={pathname} />)}
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-white/10 flex flex-col gap-1">
        <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-xl no-underline text-white/45 hover:text-white hover:bg-white/5">
          <ExternalLink size={17} /> <span className="font-body text-sm">Retour au site</span>
        </Link>
        <button type="button" onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-300/70 hover:text-red-200 hover:bg-red-500/10 bg-transparent border-none cursor-pointer">
          <LogOut size={17} /> <span className="font-body text-sm">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}

function EspaceCavalierLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut, isAdmin, isMoniteur } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showAssistantHint, setShowAssistantHint] = useState(false);
  const [voiceContext, setVoiceContext] = useState<Record<string, any>>({});

  useEffect(() => {
    try {
      if (!localStorage.getItem("ce_assistant_hint_seen")) setShowAssistantHint(true);
    } catch {
      // Le stockage local peut être indisponible en navigation privée.
    }
  }, []);

  useEffect(() => {
    setShowMoreMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (user && isAdmin && !loading) router.replace("/admin/dashboard");
    else if (user && isMoniteur && !loading) router.replace("/espace-moniteur/planning");
  }, [user, isAdmin, isMoniteur, loading, router]);

  useEffect(() => {
    if (!showVoice) return;

    const loadContext = async () => {
      try {
        const now = new Date();
        const today = toLocalDateString(now);
        const inThirtyDays = addDaysLocal(30, now);
        const [slotsSnapshot, activitiesSnapshot] = await Promise.all([
          getDocs(query(collection(db, "creneaux"), where("date", ">=", today), where("date", "<=", inThirtyDays))),
          getDocs(collection(db, "activities")),
        ]);

        const slots = slotsSnapshot.docs
          .map((item) => item.data())
          .filter((slot: any) => slot.status !== "closed")
          .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

        const prices: Record<string, string> = {};
        activitiesSnapshot.docs.forEach((item) => {
          const activity: any = item.data();
          if (!activity.title || activity.priceHT === undefined) return;
          const total = Math.round(activity.priceHT * (1 + (activity.tvaTaux || 5.5) / 100) * 100) / 100;
          prices[activity.title] = `${total}€${activity.type === "cours" ? "/séance" : ""}`;
        });

        const formatSlot = (slot: any) => {
          const date = new Date(`${slot.date}T12:00:00`);
          const dateLabel = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          const available = Math.max(0, (slot.maxPlaces || 0) - (slot.enrolled?.length || 0));
          return `${dateLabel} à ${slot.startTime} : ${slot.activityTitle}, ${available} place${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""}.`;
        };

        const byType = (type: string, limit: number) => slots.filter((slot: any) => slot.activityType === type).slice(0, limit).map(formatSlot);

        setVoiceContext({
          centre: "Centre Équestre d'Agon-Coutainville",
          date_aujourdhui: now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          prochains_stages: byType("stage", 6),
          prochaines_balades: byType("balade", 8),
          prochains_cours: byType("cours", 8),
          prochaines_activites_poney: byType("ponyride", 6),
          tarifs: Object.keys(prices).length > 0 ? prices : { information: "Consultez le centre pour les tarifs." },
          infos_pratiques: {
            inscription: "Via l'espace famille ou en contactant le centre.",
            equipement: "Casque obligatoire, fourni si besoin. Tenue adaptée recommandée.",
          },
        });
      } catch (error) {
        console.error("[assistant famille] contexte indisponible", error);
      }
    };

    loadContext();
  }, [showVoice]);

  const dismissAssistantHint = () => {
    setShowAssistantHint(false);
    try {
      localStorage.setItem("ce_assistant_hint_seen", "1");
    } catch {
      // Rien à faire.
    }
  };

  if (loading || (user && (isAdmin || isMoniteur))) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  const mobileNav: NavItem[] = PRIMARY_NAV.slice(0, 4);
  const moreItems: NavItem[] = [PRIMARY_NAV[4], ...FOLLOW_UP_NAV, ...HELP_NAV];
  const activeMore = moreItems.some((item) => isActivePath(pathname, item.href));
  const currentPage = [...PRIMARY_NAV, ...FOLLOW_UP_NAV, ...HELP_NAV].find((item) => isActivePath(pathname, item.href));

  return (
    <div className="min-h-screen bg-cream flex">
      <CavalierSidebar pathname={pathname} />

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur-xl border-b border-blue-500/10 px-4 md:px-7 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {pathname !== "/espace-cavalier/dashboard" && (
              <Link href="/espace-cavalier/dashboard" className="md:hidden w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center no-underline">
                <ChevronLeft size={18} />
              </Link>
            )}
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-blue-800 truncate md:hidden">{currentPage?.label || "Espace famille"}</div>
              <div className="hidden md:block font-display text-sm font-bold text-blue-800">Centre Équestre d’Agon-Coutainville</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="md:hidden w-9 h-9 rounded-xl bg-white border border-gray-100 text-gray-500 flex items-center justify-center no-underline" aria-label="Retour au site"><ExternalLink size={16} /></Link>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-body text-xs font-bold">
              {user.displayName?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"}
            </div>
            <button type="button" onClick={signOut} className="md:hidden w-9 h-9 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border-none cursor-pointer" aria-label="Se déconnecter"><LogOut size={16} /></button>
          </div>
        </header>

        <main className="p-4 md:p-8 max-w-[940px] pb-28 md:pb-10">{children}</main>
      </div>

      <div className="fixed bottom-20 left-4 z-[70] flex flex-col items-start gap-3 md:bottom-6">
        {showVoice && (
          <div className="w-[calc(100vw-2rem)] sm:w-[380px]">
            <VoiceAssistant mode="famille" voiceId="FvmvwvObRqIHojkEGh5N" placeholder="Votre question..." onClose={() => setShowVoice(false)} context={voiceContext} />
          </div>
        )}

        {showAssistantHint && !showVoice && (
          <div className="relative w-[calc(100vw-2rem)] sm:w-[310px] bg-white rounded-2xl shadow-xl border border-gray-100 p-4 pr-9">
            <button type="button" onClick={dismissAssistantHint} className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center text-gray-400 bg-transparent border-none cursor-pointer" aria-label="Fermer"><X size={15} /></button>
            <div className="font-body text-sm font-bold text-blue-800">Besoin d’aide ? 💬</div>
            <p className="font-body text-xs text-gray-600 leading-relaxed mt-1">Demandez les prochains stages, les horaires ou les places disponibles.</p>
            <button type="button" onClick={() => { dismissAssistantHint(); setShowVoice(true); }} className="mt-3 px-3 py-2 rounded-lg font-body text-xs font-bold text-green-700 bg-green-50 border-none cursor-pointer">Essayer l’assistant</button>
          </div>
        )}

        <button type="button" onClick={() => { setShowVoice((value) => !value); if (showAssistantHint) dismissAssistantHint(); }} className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-none cursor-pointer" style={{ background: "linear-gradient(135deg,#1a6b3c,#0C1A2E)" }} aria-label="Assistant IA">
          {showVoice ? <X size={22} /> : <span className="text-xl">💬</span>}
        </button>
      </div>

      {showMoreMenu && (
        <div className="md:hidden fixed inset-0 z-[55] bg-black/20" onClick={() => setShowMoreMenu(false)}>
          <div className="absolute bottom-[76px] left-3 right-3 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2" onClick={(event) => event.stopPropagation()}>
            <div className="font-body text-xs font-bold uppercase tracking-wider text-gray-400 px-3 py-2">Plus</div>
            {moreItems.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setShowMoreMenu(false)} className={`flex items-center gap-3 px-3 py-3 rounded-xl no-underline font-body text-sm font-semibold ${active ? "bg-blue-50 text-blue-600" : "text-gray-700"}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? "bg-blue-100" : "bg-gray-50"}`}><Icon size={18} /></div>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-1 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] flex items-center justify-around">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={`min-w-[58px] flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl no-underline ${active ? "text-blue-600" : "text-gray-500"}`}>
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span className={`font-body text-[11px] ${active ? "font-bold" : "font-medium"}`}>{item.label === "Mes activités" ? "Activités" : item.label}</span>
            </Link>
          );
        })}

        <button type="button" onClick={() => setShowMoreMenu((value) => !value)} className={`min-w-[58px] flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl border-none bg-transparent cursor-pointer ${showMoreMenu || activeMore ? "text-blue-600" : "text-gray-500"}`}>
          <MoreHorizontal size={21} strokeWidth={showMoreMenu || activeMore ? 2.4 : 1.8} />
          <span className={`font-body text-[11px] ${showMoreMenu || activeMore ? "font-bold" : "font-medium"}`}>Plus</span>
        </button>
      </nav>
    </div>
  );
}

export default function EspaceCavalierLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <EspaceCavalierLayoutInner>{children}</EspaceCavalierLayoutInner>
    </ToastProvider>
  );
}
