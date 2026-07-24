"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellOff,
  BookMarked,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  ExternalLink,
  FileText,
  Gift,
  GitMerge,
  Globe,
  GraduationCap,
  Heart,
  Image,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  LogOut,
  Mail,
  Inbox,
  Menu,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Receipt,
  RotateCw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Ticket,
  TicketCheck,
  TrendingUp,
  Trophy,
  UserMinus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import GlobalKeyboardShortcuts from "@/components/admin/GlobalKeyboardShortcuts";
import GlobalSearch from "@/components/admin/GlobalSearch";
import VoiceAssistant from "@/components/VoiceAssistant";
import { ToastProvider } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  moniteur?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  moniteur?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/admin/dashboard", icon: LayoutGrid, label: "Pilotage", moniteur: true },
  { href: "/admin/planning", icon: CalendarDays, label: "Planning", moniteur: true },
  { href: "/admin/cavaliers", icon: Users, label: "Cavaliers" },
  { href: "/admin/paiements", icon: CreditCard, label: "Paiements" },
];

const NAV_GROUPS: NavGroup[] = [
  {
    id: "terrain",
    label: "Terrain",
    icon: Heart,
    moniteur: true,
    items: [
      { href: "/admin/montoir", icon: ClipboardList, label: "Montoir", moniteur: true },
      { href: "/admin/cavalerie", icon: Heart, label: "Cavalerie", moniteur: true },
      { href: "/admin/pedagogie", icon: GraduationCap, label: "Suivi pédagogique", moniteur: true },
      { href: "/admin/management", icon: CalendarDays, label: "Équipe & planning", moniteur: true },
      { href: "/admin/registre-chutes", icon: AlertTriangle, label: "Registre des chutes", moniteur: true },
      { href: "/admin/recurrences", icon: RotateCw, label: "Récurrences" },
      { href: "/admin/competitions", icon: Ticket, label: "Compétitions" },
      { href: "/admin/organisation-concours", icon: Trophy, label: "Organisation concours" },
      { href: "/admin/livret-pedagogique", icon: BookOpen, label: "Livret pédagogique" },
    ],
  },
  {
    id: "clients",
    label: "Clients & ventes",
    icon: Users,
    items: [
      { href: "/admin/cavaliers", icon: Users, label: "Familles & cavaliers" },
      { href: "/admin/paiements", icon: CreditCard, label: "Paiements" },
      { href: "/admin/devis", icon: FileText, label: "Devis" },
      { href: "/admin/forfaits", icon: CalendarDays, label: "Forfaits" },
      { href: "/admin/cartes", icon: CreditCard, label: "Cartes de séances" },
      { href: "/admin/avoirs", icon: Wallet, label: "Avoirs" },
      { href: "/admin/bons-cadeaux", icon: Gift, label: "Bons cadeaux" },
      { href: "/admin/bons-recup", icon: TicketCheck, label: "Rattrapages" },
      { href: "/admin/sepa", icon: Building2, label: "Prélèvements SEPA" },
      { href: "/admin/doublons", icon: GitMerge, label: "Doublons" },
    ],
  },
  {
    id: "gestion",
    label: "Gestion",
    icon: BarChart3,
    items: [
      { href: "/admin/comptabilite", icon: BookOpen, label: "Comptabilité" },
      { href: "/admin/statistiques", icon: TrendingUp, label: "Statistiques" },
      { href: "/admin/reinscriptions", icon: UserMinus, label: "Réinscriptions" },
      { href: "/admin/satisfaction", icon: MessageSquare, label: "Satisfaction" },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: Mail,
    items: [
      { href: "/admin/boite", icon: Inbox, label: "Boîte email (IA)" },
      { href: "/admin/communication", icon: Mail, label: "Campagnes" },
      { href: "/admin/whatsapp", icon: MessageCircle, label: "WhatsApp" },
      { href: "/admin/email-templates", icon: LayoutTemplate, label: "Modèles d’email" },
      { href: "/admin/email-reprise", icon: Send, label: "Email de reprise" },
      { href: "/admin/emails-log", icon: Receipt, label: "Journal des emails" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    icon: Settings,
    items: [
      { href: "/admin/activites", icon: ClipboardList, label: "Activités" },
      { href: "/admin/documents", icon: FileText, label: "Documents" },
      { href: "/admin/modeles", icon: LayoutTemplate, label: "Modèles" },
      { href: "/admin/contenu", icon: Globe, label: "Contenu du site" },
      { href: "/admin/galerie", icon: Image, label: "Galerie photos" },
      { href: "/admin/parametres?section=moniteurs", icon: Users, label: "Moniteurs & accès" },
      { href: "/admin/parametres", icon: Settings, label: "Paramètres" },
      { href: "/admin/manuel", icon: BookMarked, label: "Manuel" },
      { href: "/admin/tests", icon: CheckCircle2, label: "Plan de tests" },
    ],
  },
];

const MOBILE_PRIMARY = PRIMARY_NAV;

function basePath(href: string) {
  return href.split("?")[0];
}

function isActive(pathname: string, href: string) {
  const path = basePath(href);
  return pathname === path || pathname.startsWith(`${path}/`);
}

function filterForRole(items: NavItem[], isMoniteur: boolean, isAdmin: boolean) {
  if (isAdmin || !isMoniteur) return items;
  return items.filter((item) => item.moniteur);
}

function NavLink({ item, pathname, nbImpayes, onClick, compact = false }: {
  item: NavItem;
  pathname: string;
  nbImpayes: number;
  onClick?: () => void;
  compact?: boolean;
}) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  const showBadge = basePath(item.href) === "/admin/paiements" && nbImpayes > 0;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl no-underline transition-all ${compact ? "px-3 py-2.5" : "px-3 py-2.5"} ${
        active
          ? "bg-gold-400/20 text-gold-200 shadow-[inset_0_0_0_1px_rgba(240,160,16,0.24)]"
          : "text-white/85 hover:text-white hover:bg-white/10"
      }`}
    >
      <Icon size={17} className={active ? "text-gold-300" : "text-white/70 group-hover:text-white"} />
      <span className="font-body text-[13px] font-medium flex-1 truncate">{item.label}</span>
      {showBadge && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white font-body text-[10px] font-bold flex items-center justify-center">
          {nbImpayes}
        </span>
      )}
    </Link>
  );
}

function AdminSidebar({ nbImpayes }: { nbImpayes: number }) {
  const { user, signOut, isMoniteur, isAdmin } = useAuth();
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["terrain"]));

  const visiblePrimary = filterForRole(PRIMARY_NAV, isMoniteur, isAdmin);
  const visibleGroups = NAV_GROUPS
    .filter((group) => isAdmin || !isMoniteur || group.moniteur)
    .map((group) => ({ ...group, items: filterForRole(group.items, isMoniteur, isAdmin) }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some((item) => isActive(pathname, item.href)));
    if (!activeGroup) return;
    setOpenGroups((current) => new Set([...current, activeGroup.id]));
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside
      data-testid="admin-nav"
      data-print-hide
      className="hidden md:flex sticky top-0 h-screen w-[248px] flex-shrink-0 flex-col border-r border-white/5 px-3 py-3"
      style={{ background: "linear-gradient(180deg, #060D17 0%, #0C1A2E 48%, #122A5A 100%)" }}
    >
      <div className="flex items-center gap-3 px-2 py-2 mb-3">
        <img src="/images/logo-ce-agon.png" alt="Centre équestre" className="w-11 h-11 rounded-xl object-contain ring-1 ring-white/10" />
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold text-white leading-tight">Centre Équestre</div>
          <div className="font-body text-[10px] text-gold-400 uppercase tracking-[0.18em] font-bold mt-1">
            {isMoniteur && !isAdmin ? "Espace moniteur" : "Administration"}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("open-global-search"))}
        className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 text-white/65 hover:bg-white/10 hover:text-white cursor-pointer mb-3"
      >
        <Search size={15} />
        <span className="font-body text-[12px] flex-1 text-left">Rechercher</span>
        <kbd className="font-body text-[9px] px-1.5 py-0.5 rounded bg-white/10">Ctrl K</kbd>
      </button>

      <nav className="flex-1 min-h-0 overflow-y-auto pr-0.5">
        <div className="flex flex-col gap-1 mb-4">
          {visiblePrimary.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} nbImpayes={nbImpayes} />
          ))}
        </div>

        <div className="h-px bg-white/10 mb-3" />

        <div className="flex flex-col gap-1.5">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const open = openGroups.has(group.id);
            const active = group.items.some((item) => isActive(pathname, item.href));
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 border-none cursor-pointer transition-all ${
                    active ? "bg-white/8 text-gold-300" : "bg-transparent text-white/85 hover:text-white hover:bg-white/8"
                  }`}
                >
                  <GroupIcon size={16} />
                  <span className="font-body text-[13px] font-bold flex-1 text-left">{group.label}</span>
                  <ChevronDown size={14} className={`transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
                </button>
                {open && (
                  <div className="ml-2 mt-1 pl-2 border-l border-white/10 flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <NavLink key={item.href} item={item} pathname={pathname} nbImpayes={nbImpayes} compact />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="pt-3 mt-3 border-t border-white/10">
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/80 hover:text-white hover:bg-white/8 no-underline">
          <ExternalLink size={15} />
          <span className="font-body text-[12px]">Voir le site</span>
        </Link>
        <div className="px-3 pt-2 font-body text-[11px] text-white/55 truncate" title={user?.email || ""}>{user?.email}</div>
        <button type="button" onClick={signOut} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-red-300 hover:text-red-200 hover:bg-red-500/10 bg-transparent border-none cursor-pointer">
          <LogOut size={15} />
          <span className="font-body text-[12px]">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}

function AccessDenied({ signedIn, email }: { signedIn: boolean; email?: string | null }) {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <ShieldAlert className="w-12 h-12 text-orange-400 mx-auto mb-4" />
        <h1 className="font-display text-xl font-bold text-blue-800 mb-2">Accès réservé</h1>
        <p className="font-body text-sm text-gray-500 mb-2">
          {signedIn ? "Le back-office est réservé aux administrateurs et moniteurs." : "Connectez-vous avec un compte autorisé pour accéder au back-office."}
        </p>
        {email && <p className="font-body text-xs text-gray-400 mb-6">Connecté : {email}</p>}
        <Link href="/espace-cavalier" className="font-body text-sm font-semibold text-blue-500 no-underline">Retour à l’espace cavalier</Link>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, isMoniteur, userRole, signOut } = useAuth();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [voiceContext, setVoiceContext] = useState<Record<string, any>>({});
  const [moduleContext, setModuleContext] = useState<Record<string, any>>({});
  const [nbImpayes, setNbImpayes] = useState(0);
  // Une modale plein écran (`fixed inset-0`) ouverte au-dessus du contenu se
  // fait recouvrir en bas par la barre de navigation mobile (z-[60] > z-50),
  // tronquant boutons et champs. On détecte ces overlays et on masque la
  // barre tant qu'ils sont montés — correction globale, plutôt que modale
  // par modale.
  const [overlayOuvert, setOverlayOuvert] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () => {
      // Overlays plein écran = un enfant direct de <body> avec inset-0 + z >= 50.
      const overlays = document.querySelectorAll('[class*="fixed"][class*="inset-0"]');
      let found = false;
      overlays.forEach((el) => {
        const cl = el.className || "";
        if (typeof cl === "string" && (cl.includes("z-50") || cl.includes("z-[2") || cl.includes("z-[1"))) {
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.height > window.innerHeight * 0.4) found = true;
        }
      });
      setOverlayOuvert(found);
    };
    const obs = new MutationObserver(check);
    // childList sur le body seul : les overlays sont montés/démontés comme
    // enfants directs. Pas de subtree/attributes global, trop coûteux sur une
    // page dynamique (le planning re-render beaucoup).
    obs.observe(document.body, { childList: true });
    check();
    return () => obs.disconnect();
  }, []);
  const pushNotifications = usePushNotifications(user?.uid || null, { role: userRole, email: user?.email });

  const visibleMobile = filterForRole(MOBILE_PRIMARY, isMoniteur, isAdmin);
  const visibleGroups = NAV_GROUPS
    .filter((group) => isAdmin || !isMoniteur || group.moniteur)
    .map((group) => ({ ...group, items: filterForRole(group.items, isMoniteur, isAdmin) }))
    .filter((group) => group.items.length > 0);

  const allVisibleItems = [...visibleMobile, ...visibleGroups.flatMap((group) => group.items)];
  const currentItem = allVisibleItems.find((item) => isActive(pathname, item.href));

  useEffect(() => setMoreOpen(false), [pathname]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    getDocs(collection(db, "payments"))
      .then((snapshot) => {
        const count = snapshot.docs.filter((item) => {
          const data = item.data();
          return data.paymentMode !== "cheque_differe" && (data.status === "pending" || data.status === "partial");
        }).length;
        setNbImpayes(count);
      })
      .catch(() => {});
  }, [user, isAdmin]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setModuleContext((current) => ({ ...current, ...detail }));
    };
    window.addEventListener("agent:setContext", handler);
    return () => window.removeEventListener("agent:setContext", handler);
  }, []);

  useEffect(() => {
    if (!showVoice || !user) return;
    const load = async () => {
      try {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const mondayStr = monday.toISOString().split("T")[0];
        const sundayStr = sunday.toISOString().split("T")[0];

        const [slotsSnapshot, familiesSnapshot, paymentsSnapshot, monitorsSnapshot, inscriptionSnapshot, centreSnapshot] = await Promise.all([
          getDocs(query(collection(db, "creneaux"), where("date", ">=", mondayStr), where("date", "<=", sundayStr))),
          getDocs(collection(db, "families")),
          getDocs(collection(db, "payments")),
          getDocs(collection(db, "moniteurs")),
          getDoc(doc(db, "settings", "inscription")),
          getDoc(doc(db, "settings", "centre")),
        ]);

        const slots = slotsSnapshot.docs.map((item) => item.data());
        const families = familiesSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as any));
        const payments = paymentsSnapshot.docs.map((item) => item.data());
        const todaySlots = slots.filter((slot: any) => slot.date === todayStr);
        const totalEnrolled = slots.reduce((sum: number, slot: any) => sum + (slot.enrolled?.length || 0), 0);
        const totalPlaces = slots.reduce((sum: number, slot: any) => sum + (slot.maxPlaces || 0), 0);
        const pending = payments.filter((payment: any) => payment.paymentMode !== "cheque_differe" && (payment.status === "pending" || payment.status === "partial"));

        setVoiceContext({
          date_aujourdhui: now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          reprises_aujourdhui: todaySlots.map((slot: any) => `${slot.startTime} — ${slot.activityTitle} — ${slot.enrolled?.length || 0}/${slot.maxPlaces || 0}`),
          creneaux_semaine: slots.length,
          inscrits_semaine: totalEnrolled,
          places_semaine: totalPlaces,
          taux_remplissage: totalPlaces > 0 ? `${Math.round((totalEnrolled / totalPlaces) * 100)}%` : "N/A",
          total_familles: families.length,
          total_cavaliers: families.reduce((sum: number, family: any) => sum + (family.children?.length || 0), 0),
          impayes: pending.length,
          familles: families.slice(0, 50).map((family: any) => ({
            id: family.id,
            nom: family.parentName,
            email: family.parentEmail || "",
            cavaliers: (family.children || []).map((child: any) => child.firstName).join(", "),
          })),
          moniteurs: monitorsSnapshot.docs.map((item) => (item.data() as any).name).filter(Boolean).sort(),
          tarifs_inscription: inscriptionSnapshot.exists() ? inscriptionSnapshot.data() : null,
          infos_centre: centreSnapshot.exists() ? centreSnapshot.data() : null,
          ...moduleContext,
        });
      } catch (error) {
        console.error("voiceContext admin error", error);
      }
    };
    load();
  }, [showVoice, user]);

  if (loading) {
    return <div className="min-h-screen bg-cream flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  if (!user) return <AccessDenied signedIn={false} />;
  if (!isAdmin && !isMoniteur) return <AccessDenied signedIn email={user.email} />;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-cream flex">
        <AdminSidebar nbImpayes={nbImpayes} />

        <div className="flex-1 min-w-0 overflow-x-hidden">
          <header className="md:hidden sticky top-0 z-50 bg-blue-900/95 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-body text-[10px] uppercase tracking-[0.18em] text-gold-400 font-bold">Administration</div>
              <div className="font-display text-sm font-bold text-white truncate">{currentItem?.label || "Centre équestre"}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => window.dispatchEvent(new Event("open-global-search"))} className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center border-none cursor-pointer" aria-label="Rechercher">
                <Search size={17} />
              </button>
              {nbImpayes > 0 && isAdmin && (
                <Link href="/admin/paiements?tab=impayes" className="min-w-9 h-9 px-2 rounded-xl bg-red-500 text-white font-body text-xs font-bold flex items-center justify-center no-underline">
                  {nbImpayes}
                </Link>
              )}
            </div>
          </header>

          <main className="w-full max-w-[1440px] px-3 py-4 md:px-7 lg:px-9 md:py-8 pb-28 md:pb-10">
            {pushNotifications.permission !== "granted" && (
              <div className={`mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                pushNotifications.permission === "denied"
                  ? "border-orange-200 bg-orange-50"
                  : "border-blue-200 bg-blue-50"
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                    pushNotifications.permission === "denied" ? "bg-orange-100 text-orange-600" : "bg-white text-blue-600"
                  }`}>
                    {pushNotifications.permission === "denied" ? <BellOff size={19} /> : <Bell size={19} />}
                  </div>
                  <div>
                    <div className="font-body text-sm font-bold text-blue-950">
                      {pushNotifications.permission === "denied" ? "Notifications bloquées sur cet appareil" : "Recevoir les changements de planning"}
                    </div>
                    <p className="mt-1 font-body text-xs leading-relaxed text-slate-500">
                      {pushNotifications.permission === "denied"
                        ? "Autorisez les notifications dans les réglages du navigateur pour être prévenu sur ce téléphone."
                        : "Activez-les sur votre téléphone pour recevoir les créations, modifications et suppressions de créneaux."}
                    </p>
                    {pushNotifications.error && <p className="mt-1 font-body text-xs text-red-600">{pushNotifications.error}</p>}
                  </div>
                </div>
                {pushNotifications.permission === "default" && (
                  <button
                    type="button"
                    onClick={pushNotifications.requestPermission}
                    disabled={pushNotifications.loading}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-none bg-blue-700 px-4 py-2.5 font-body text-xs font-bold text-white shadow-sm disabled:opacity-50"
                  >
                    {pushNotifications.loading ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
                    Activer les notifications
                  </button>
                )}
              </div>
            )}
            {children}
          </main>
        </div>

        <div className="fixed bottom-20 left-4 md:bottom-6 md:left-[272px] z-[100] flex flex-col items-start gap-3">
          {showVoice && (
            <div className="w-[calc(100vw-2rem)] sm:w-[420px]" style={{ maxHeight: "75vh" }}>
              <VoiceAssistant mode="admin" voiceId="FvmvwvObRqIHojkEGh5N" placeholder="Posez votre question..." onClose={() => setShowVoice(false)} context={voiceContext} />
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowVoice((open) => !open)}
            className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-white shadow-lg border-none cursor-pointer hover:scale-105 transition-transform"
            style={{ background: "linear-gradient(135deg,#0C1A2E,#122A5A)" }}
            title="Assistant IA"
          >
            {showVoice ? <X size={20} /> : <MessageCircle size={23} />}
          </button>
        </div>

        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-[70] bg-black/40" onClick={() => setMoreOpen(false)}>
            <div className="absolute bottom-[72px] left-3 right-3 max-h-[72vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-3" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between px-2 py-2 mb-1">
                <div>
                  <div className="font-display text-lg font-bold text-blue-800">Tous les outils</div>
                  <div className="font-body text-xs text-gray-500">Rangés par usage</div>
                </div>
                <button type="button" onClick={() => setMoreOpen(false)} className="w-9 h-9 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center border-none cursor-pointer"><X size={17} /></button>
              </div>

              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <section key={group.id} className="mt-3">
                    <div className="flex items-center gap-2 px-2 mb-2">
                      <GroupIcon size={15} className="text-blue-500" />
                      <div className="font-body text-xs font-bold uppercase tracking-wider text-blue-800">{group.label}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(pathname, item.href);
                        return (
                          <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 no-underline ${active ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-100 text-gray-700"}`}>
                            <Icon size={16} className={active ? "text-blue-500" : "text-gray-400"} />
                            <span className="font-body text-xs font-semibold leading-tight">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-gray-100">
                <Link href="/" className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 text-gray-600 px-3 py-3 no-underline font-body text-xs font-semibold"><ExternalLink size={15} /> Voir le site</Link>
                <button type="button" onClick={signOut} className="flex items-center justify-center gap-2 rounded-xl bg-red-50 text-red-600 px-3 py-3 border-none font-body text-xs font-semibold cursor-pointer"><LogOut size={15} /> Déconnexion</button>
              </div>
            </div>
          </div>
        )}

        <nav data-print-hide className={`md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-white border-t border-gray-200 px-1.5 py-2 flex items-center justify-around safe-area-inset-bottom transition-transform duration-200 ${overlayOuvert ? "translate-y-full pointer-events-none" : ""}`}>
          {visibleMobile.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={`relative min-w-[58px] flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 no-underline ${active ? "text-blue-600" : "text-gray-500"}`}>
                <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                <span className="font-body text-[10px] font-semibold">{item.label}</span>
                {basePath(item.href) === "/admin/paiements" && nbImpayes > 0 && (
                  <span className="absolute -top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{nbImpayes}</span>
                )}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen((open) => !open)} className={`min-w-[58px] flex flex-col items-center gap-0.5 rounded-xl px-2 py-1 border-none bg-transparent cursor-pointer ${moreOpen ? "text-blue-600" : "text-gray-500"}`}>
            <MoreHorizontal size={21} />
            <span className="font-body text-[10px] font-semibold">Plus</span>
          </button>
        </nav>

        <GlobalSearch />
        <GlobalKeyboardShortcuts />
      </div>
    </ToastProvider>
  );
}
