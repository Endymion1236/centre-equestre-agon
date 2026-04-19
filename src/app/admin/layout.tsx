"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ToastProvider } from "@/components/ui/Toast";
import GlobalSearch from "@/components/admin/GlobalSearch";
import GlobalKeyboardShortcuts from "@/components/admin/GlobalKeyboardShortcuts";
import VoiceAssistant from "@/components/VoiceAssistant";
import { db } from "@/lib/firebase";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
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
  Globe,
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
  Building2,
  FileText,
  CheckCircle2,
  ChevronDown,
  Search,
} from "lucide-react";

const navItems = [
  { href: "/admin/dashboard", icon: BarChart3, label: "Tableau de bord" },
  // ─── Terrain ───
  { separator: true, label: "Terrain" },
  { href: "/admin/planning", icon: CalendarDays, label: "Planning" },
  { href: "/admin/montoir", icon: ClipboardList, label: "Montoir" },
  { href: "/admin/competitions", icon: Ticket, label: "Compétitions" },
  { href: "/admin/cavalerie", icon: Heart, label: "Cavalerie" },
  { href: "/admin/pedagogie", icon: GraduationCap, label: "Suivi péda." },
  { href: "/admin/management", icon: ClipboardList, label: "Management" },
  // ─── Commercial ───
  { separator: true, label: "Commercial" },
  { href: "/admin/cavaliers", icon: Users, label: "Cavaliers" },
  { href: "/admin/paiements", icon: CreditCard, label: "Paiements" },
  { href: "/admin/devis", icon: FileText, label: "Devis" },
  { href: "/admin/forfaits", icon: CalendarDays, label: "Forfaits" },
  { href: "/admin/cartes", icon: CreditCard, label: "Cartes" },
  { href: "/admin/avoirs", icon: Wallet, label: "Avoirs" },
  { href: "/admin/sepa", icon: Building2, label: "Prélèvements SEPA" },
  // ─── Gestion ───
  { separator: true, label: "Gestion" },
  { href: "/admin/comptabilite", icon: BookOpen, label: "Comptabilité" },
  { href: "/admin/statistiques", icon: TrendingUp, label: "Statistiques" },
  { href: "/admin/communication", icon: Mail, label: "Communication" },
  { href: "/admin/email-templates", icon: Mail, label: "Templates email" },
  { href: "/admin/email-reprise", icon: Send, label: "Email reprise" },
  // ─── Config ───
  { separator: true, label: "Configuration" },
  { href: "/admin/activites", icon: ClipboardList, label: "Activités" },
  { href: "/admin/documents", icon: FileText, label: "Documents" },
  { href: "/admin/modeles", icon: LayoutTemplate, label: "Modèles" },
  { href: "/admin/contenu", icon: Globe, label: "Contenu site" },
  { href: "/admin/equipe", icon: Users, label: "Accès moniteurs" },
  { href: "/admin/parametres", icon: Settings, label: "Paramètres" },
  { href: "/admin/tests", icon: CheckCircle2, label: "Plan de tests" },
] as any[];

function AdminSidebar({ nbImpayes }: { nbImpayes: number }) {
  const { user, signOut, isMoniteur, userRole } = useAuth();
  const pathname = usePathname();

  const MONITEUR_PAGES = [
    "/admin/dashboard",
    "/admin/planning",
    "/admin/montoir",
    "/admin/cavalerie",
    "/admin/pedagogie",
    "/admin/management",
  ];
  const MONITEUR_SECTIONS = ["Terrain"];

  const filteredNavItems = isMoniteur
    ? navItems.filter((item: any) => {
        if (item.separator) return MONITEUR_SECTIONS.includes(item.label);
        return MONITEUR_PAGES.includes(item.href);
      })
    : navItems;

  // Regrouper les items par section (label du séparateur précédent).
  // Les items sans séparateur en amont (ex: Dashboard) forment une section "null".
  const sections = useMemo(() => {
    const out: { label: string | null; items: any[] }[] = [];
    let curr: { label: string | null; items: any[] } = { label: null, items: [] };
    for (const it of filteredNavItems) {
      if (it.separator) {
        if (curr.items.length > 0) out.push(curr);
        curr = { label: it.label, items: [] };
      } else {
        curr.items.push(it);
      }
    }
    if (curr.items.length > 0) out.push(curr);
    return out;
  }, [filteredNavItems]);

  // Section contenant le path actif — on la force dépliée
  const activeSectionLabel = useMemo(() => {
    for (const s of sections) {
      if (s.items.some((i: any) => pathname?.startsWith(i.href))) return s.label;
    }
    return null;
  }, [sections, pathname]);

  // État collapse persistant (localStorage)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin-sidebar-collapsed");
      if (saved) setCollapsed(new Set(JSON.parse(saved)));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("admin-sidebar-collapsed", JSON.stringify([...collapsed])); } catch {}
  }, [collapsed]);

  const toggleSection = (label: string) => {
    if (label === activeSectionLabel) return; // pas de repli sur la section active
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  return (
    <div
      data-testid="admin-nav"
      className="w-[228px] border-r border-white/5 py-3 px-2.5 flex flex-col gap-0.5 flex-shrink-0 hidden md:flex sticky top-0 h-screen"
      style={{ background: "linear-gradient(180deg, #060D17 0%, #0C1A2E 45%, #122A5A 100%)" }}
    >
      {/* ─── Logo ─── */}
      <div className="px-2.5 pt-2 pb-4 flex items-center gap-3 border-b border-gold-400/25 mb-3 flex-shrink-0">
        <img
          src="/images/logo-ce-agon.png"
          alt="Logo"
          className="w-12 h-12 rounded-xl object-contain shadow-[0_4px_16px_rgba(0,0,0,0.3)] ring-1 ring-white/10"
        />
        <div className="min-w-0">
          <div className="font-display text-[16px] font-bold text-white leading-tight">Centre Équestre</div>
          <div className="font-body text-[10px] text-gold-400 uppercase tracking-[0.2em] font-bold mt-1">
            {isMoniteur ? "Espace moniteur" : "Administration"}
          </div>
        </div>
      </div>

      {/* ─── Bouton recherche globale ─── */}
      <button
        onClick={() => window.dispatchEvent(new Event("open-global-search"))}
        className="flex items-center gap-2.5 px-3 py-2 mb-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/5 cursor-pointer flex-shrink-0"
        title="Recherche globale (Ctrl+K)">
        <Search size={14} className="flex-shrink-0" />
        <span className="font-body text-[12px] flex-1 text-left">Rechercher…</span>
        <kbd className="font-body text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono">⌘K</kbd>
      </button>

      {/* ─── Sections (zone scrollable si trop d'items) ─── */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 -mx-2.5 px-2.5 min-h-0">
      {sections.map((section, sIdx) => {
        const isCollapsed = section.label ? collapsed.has(section.label) : false;
        const isActiveSection = section.label === activeSectionLabel;
        return (
          <div key={`sec-${sIdx}`} className={sIdx > 0 && section.label ? "mt-2" : ""}>
            {section.label && (
              <button
                type="button"
                onClick={() => toggleSection(section.label!)}
                disabled={isActiveSection}
                className="group w-full flex items-center justify-between px-2.5 pt-3 pb-1.5 bg-transparent border-none cursor-pointer disabled:cursor-default"
              >
                <span className={`font-body text-[10px] uppercase tracking-[0.2em] font-bold transition-colors ${
                  isActiveSection ? "text-gold-400" : "text-gold-400/75 group-hover:text-gold-300"
                }`}>
                  {section.label}
                </span>
                {!isActiveSection && (
                  <ChevronDown
                    size={12}
                    className={`text-gold-400/50 group-hover:text-gold-300 transition-transform duration-200 ${
                      isCollapsed ? "-rotate-90" : ""
                    }`}
                  />
                )}
              </button>
            )}
            <div
              className="overflow-hidden transition-[max-height,opacity] duration-250 ease-in-out"
              style={{
                maxHeight: isCollapsed ? 0 : 800,
                opacity: isCollapsed ? 0 : 1,
              }}
            >
              {section.items.map((item: any) => {
                const Icon = item.icon;
                const active = pathname?.startsWith(item.href);
                const showImpayesBadge = item.href === "/admin/paiements" && nbImpayes > 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      group flex items-center gap-3 px-3 py-2 rounded-lg no-underline transition-all duration-150 mt-0.5
                      ${active
                        ? "bg-gold-400/20 text-gold-200 font-semibold shadow-[inset_0_0_0_1px_rgba(240,160,16,0.25)]"
                        : "text-white/70 hover:text-white hover:bg-white/5"}
                    `}
                  >
                    <Icon
                      size={16}
                      className={active ? "text-gold-300" : "text-white/55 group-hover:text-white/90 transition-colors"}
                    />
                    <span className="font-body text-[13px] flex-1 truncate">{item.label}</span>
                    {showImpayesBadge && (
                      <span className="flex-shrink-0 bg-red-500 text-white font-body text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                        {nbImpayes}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>

      {/* ─── Footer (toujours visible en bas de la sidebar) ─── */}
      <div className="flex-shrink-0 pt-3 mt-2 border-t border-white/10">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:text-gold-300 hover:bg-gold-400/10 transition-all no-underline mb-0.5"
        >
          <ExternalLink size={15} />
          <span className="font-body text-[13px]">Retour au site</span>
        </Link>
        <div className="px-3 pt-2 pb-1 font-body text-[11px] text-white/50 truncate" title={user?.email ?? undefined}>
          {user?.email}
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/60 hover:text-red-300 hover:bg-red-500/10 transition-all w-full bg-transparent border-none cursor-pointer"
        >
          <LogOut size={15} />
          <span className="font-body text-[13px]">Déconnexion</span>
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, isMoniteur, userRole, signOut: authSignOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [voiceContext, setVoiceContext] = useState<Record<string, any>>({});
  const [moduleContext, setModuleContext] = useState<Record<string, any>>({});
  const [nbImpayes, setNbImpayes] = useState(0);

  // Charger le nombre d'impayés
  useEffect(() => {
    if (!user || !isAdmin) return;
    getDocs(collection(db, "payments")).then(snap => {
      const count = snap.docs.filter(d => {
        const s = d.data().status;
        return s === "pending" || s === "partial";
      }).length;
      setNbImpayes(count);
    }).catch(() => {});
  }, [user, isAdmin]);

  // Écouter les événements des modules pour enrichir le contexte agent
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setModuleContext(prev => ({ ...prev, ...detail }));
    };
    window.addEventListener("agent:setContext", handler);
    return () => window.removeEventListener("agent:setContext", handler);
  }, []);

  // Charger le contexte pour l'assistant vocal
  useEffect(() => {
    if (!showVoice) return;
    const loadContext = async () => {
      try {
        const now = new Date();
        const todayStr = now.toISOString().split("T")[0];
        const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        const monStr = mon.toISOString().split("T")[0];
        const sunStr = sun.toISOString().split("T")[0];
        const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

        const [creneauxSnap, familiesSnap, paymentsSnap, moniteurSnap, inscSnap, centreSnap] = await Promise.all([
          getDocs(query(collection(db,"creneaux"), where("date",">=",monStr), where("date","<=",sunStr))),
          getDocs(collection(db,"families")),
          getDocs(collection(db,"payments")),
          getDocs(collection(db,"moniteurs")),
          getDoc(doc(db,"settings","inscription")),
          getDoc(doc(db,"settings","centre")),
        ]);

        const creneaux = creneauxSnap.docs.map(d => d.data());
        const families = familiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const payments = paymentsSnap.docs.map(d => d.data());

        const totalInscrits = creneaux.reduce((s,c) => s+(c.enrolled?.length||0),0);
        const totalPlaces   = creneaux.reduce((s,c) => s+(c.maxPlaces||0),0);
        const parType: Record<string,number> = {};
        creneaux.forEach(c => { parType[c.activityType] = (parType[c.activityType]||0)+1; });
        const today = creneaux.filter(c => c.date === todayStr);

        const paysMois = payments.filter(p => {
          const d = p.date?.seconds ? new Date(p.date.seconds*1000) : null;
          if (!d) return false;
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === monthStr;
        });
        const totalEncaisse = paysMois.filter(p=>p.status==="paid").reduce((s,p)=>s+(p.paidAmount||p.totalTTC||0),0);
        const nbImpayes = paysMois.filter(p=>p.status==="pending"||p.status==="partial").length;

        setVoiceContext(prev => ({
          date_aujourdhui: now.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}),
          semaine: `du ${mon.toLocaleDateString("fr-FR")} au ${sun.toLocaleDateString("fr-FR")}`,
          inscrits_semaine: totalInscrits,
          places_semaine: totalPlaces,
          taux_remplissage: totalPlaces>0 ? `${Math.round(totalInscrits/totalPlaces*100)}%` : "N/A",
          creneaux_semaine: creneaux.length,
          creneaux_par_type: parType,
          balades_semaine: creneaux.filter(c=>c.activityType==="balade").length,
          stages_semaine: creneaux.filter(c=>c.activityType==="stage").length,
          cours_aujourdhui: today.map(c=>`${c.activityTitle} à ${c.startTime} (${c.enrolled?.length||0}/${c.maxPlaces} inscrits)`),
          total_familles: families.length,
          total_cavaliers: families.reduce((s: number,f: any)=>s+(f.children?.length||0),0),
          encaisse_ce_mois: `${totalEncaisse.toFixed(2)}€`,
          nb_impayes_ce_mois: nbImpayes,
          detail_creneaux_semaine: creneaux.slice(0,20).map(c=>
            `${c.date} ${c.startTime} — ${c.activityTitle} — ${c.monitor} — ${c.enrolled?.length||0}/${c.maxPlaces}${c.status==="closed"?" (clôturé)":""}`
          ),
          familles: families.slice(0, 50).map((f: any) => ({
            id: f.id,
            nom: f.parentName,
            email: f.parentEmail || "",
            cavaliers: (f.children || []).map((c: any) => c.firstName).join(", "),
          })),
          // Données paramètres — disponibles depuis n'importe quelle page
          moniteurs: moniteurSnap.docs.map(d => (d.data() as any).name).filter(Boolean).sort(),
          tarifs_inscription: inscSnap.exists() ? {
            forfait1x: (inscSnap.data() as any).forfait1x || 650,
            forfait2x: (inscSnap.data() as any).forfait2x || 1100,
            forfait3x: (inscSnap.data() as any).forfait3x || 1400,
            adhesion1: (inscSnap.data() as any).adhesion1 || 60,
            adhesion2: (inscSnap.data() as any).adhesion2 || 40,
            adhesion3: (inscSnap.data() as any).adhesion3 || 20,
            dateFinSaison: (inscSnap.data() as any).dateFinSaison || "2026-06-30",
          } : null,
          infos_centre: centreSnap.exists() ? {
            nom: (centreSnap.data() as any).nom,
            tel: (centreSnap.data() as any).tel,
            email: (centreSnap.data() as any).email,
            siret: (centreSnap.data() as any).siret,
          } : null,
          ...moduleContext, // Données enrichies par le module actif
        }));
      } catch(e) { console.error("voiceContext error", e); }
    };
    loadContext();
  }, [showVoice]);
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

  if (!isAdmin && !isMoniteur) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h1 className="font-display text-xl font-bold text-blue-800 mb-2">Accès réservé</h1>
          <p className="font-body text-sm text-gray-500 mb-2">
            Le back-office est réservé aux administrateurs et moniteurs.
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
    <ToastProvider>
    <div className="min-h-screen bg-cream flex">
      <AdminSidebar nbImpayes={nbImpayes} />
      <div className="flex-1 overflow-auto">
        {/* Top bar mobile */}
        <div className="md:hidden sticky top-0 z-50 bg-blue-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white border-none cursor-pointer">
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="font-display text-sm font-bold text-white">Admin</span>
            <button
              onClick={() => window.dispatchEvent(new Event("open-global-search"))}
              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 border-none cursor-pointer"
              title="Recherche">
              <Search size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/dashboard" className="font-body text-xs text-white/70 no-underline flex items-center gap-1 bg-white/10 px-2.5 py-1.5 rounded-lg">
              <BarChart3 size={12} /> Dashboard
            </Link>
            {nbImpayes > 0 && (
              <Link href="/admin/paiements?tab=impayes" className="font-body text-xs text-white no-underline flex items-center gap-1 bg-red-500/80 px-2.5 py-1.5 rounded-lg">
                <CreditCard size={12} /> {nbImpayes}
              </Link>
            )}
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
            <div
              className="w-[260px] h-full overflow-y-auto py-3 px-2.5 flex flex-col gap-0.5 shadow-2xl"
              style={{ background: "linear-gradient(180deg, #060D17 0%, #0C1A2E 45%, #122A5A 100%)" }}
              onClick={e => e.stopPropagation()}
            >
              {(isMoniteur && !isAdmin ? navItems.filter((item: any) => {
                if (item.separator) return ["Terrain"].includes(item.label);
                return ["/admin/dashboard","/admin/planning","/admin/montoir","/admin/cavalerie","/admin/pedagogie","/admin/management"].includes(item.href);
              }) : navItems).map((item: any, idx: number) => {
                if (item.separator) {
                  return (
                    <div key={`msep-${idx}`} className="px-2.5 pt-5 pb-1.5">
                      {idx > 0 && <div className="border-t border-white/10 mb-3" />}
                      <div className="font-body text-[10px] text-gold-400/80 uppercase tracking-[0.18em] font-bold">{item.label}</div>
                    </div>
                  );
                }
                const Icon = item.icon;
                const active = pathname?.startsWith(item.href);
                const showImpayesBadge = item.href === "/admin/paiements" && nbImpayes > 0;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg no-underline transition-all duration-150
                      ${active
                        ? "bg-gold-400/20 text-gold-200 font-semibold shadow-[inset_0_0_0_1px_rgba(240,160,16,0.25)]"
                        : "text-white/70 hover:text-white hover:bg-white/5"}`}>
                    <Icon size={16} className={active ? "text-gold-300" : "text-white/55"} />
                    <span className="font-body text-[13px] flex-1 truncate">{item.label}</span>
                    {showImpayesBadge && (
                      <span className="flex-shrink-0 bg-red-500 text-white font-body text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                        {nbImpayes}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="mt-4 pt-3 border-t border-white/10">
                <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/70 hover:text-gold-300 hover:bg-gold-400/10 no-underline">
                  <ExternalLink size={15} />
                  <span className="font-body text-[13px]">Retour au site</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="p-4 md:p-8 max-w-[960px] relative">
          {children}
        </div>

        {/* ── Assistant vocal admin flottant ── */}
        <div className="fixed bottom-6 left-4 sm:left-6 z-[100] flex flex-col items-start gap-3">
          {showVoice && (
            <div className="w-[calc(100vw-2rem)] sm:w-[420px]" style={{ maxHeight: "75vh" }}>
              <VoiceAssistant
                mode="admin"
                voiceId="FvmvwvObRqIHojkEGh5N"
                placeholder="Posez votre question..."
                onClose={() => setShowVoice(false)}
                context={voiceContext}
              />
            </div>
          )}
          <button
            onClick={() => setShowVoice(!showVoice)}
            className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg border-none cursor-pointer hover:scale-105 transition-transform"
            style={{ background: "linear-gradient(135deg,#0C1A2E,#122A5A)" }}
            title="Assistant IA">
            {showVoice
              ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 4L16 16M16 4L4 16" stroke="white" strokeWidth="2.5" strokeLinecap="round"/></svg>
              : <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="white" fillOpacity="0.25" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M12 7v1m0 0l-1.5 3h3L12 8zm-1.5 3L9 13h6l-1.5-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10.5 10L9 13h6l-1.5-3" fill="white" fillOpacity="0.9"/>
                </svg>
            }
          </button>
        </div>
      </div>
      <GlobalSearch />
      <GlobalKeyboardShortcuts />
    </div>
    </ToastProvider>
  );
}
