"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ToastProvider } from "@/components/ui/Toast";
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
  { href: "/admin/devis", icon: FileText, label: "Devis" },
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
            <div key={`sep-${idx}`} className="px-3 pt-5 pb-1.5">
              {idx > 0 && <div className="border-t border-white/10 mb-3"></div>}
              <div className="font-body text-[10px] text-gold-400/80 uppercase tracking-widest font-bold">{item.label}</div>
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
  const [showVoice, setShowVoice] = useState(false);
  const [voiceContext, setVoiceContext] = useState<Record<string, any>>({});
  const [moduleContext, setModuleContext] = useState<Record<string, any>>({});

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
    <ToastProvider>
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
              {navItems.map((item: any, idx: number) => {
                if (item.separator) {
                  return (
                    <div key={`msep-${idx}`} className="px-3 pt-5 pb-1.5">
                      {idx > 0 && <div className="border-t border-white/10 mb-3"></div>}
                      <div className="font-body text-[10px] text-gold-400/80 uppercase tracking-widest font-bold">{item.label}</div>
                    </div>
                  );
                }
                const Icon = item.icon;
                const active = pathname?.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg no-underline transition-all
                      ${active ? "bg-blue-500/30 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}>
                    <Icon size={15} />
                    <span className={`font-body text-[12px] ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
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

        {/* ── Assistant vocal admin flottant ── */}
        <div className="fixed bottom-6 left-4 right-4 sm:left-6 sm:right-auto z-[100] flex flex-col items-start gap-3">
          {showVoice && (
            <div className="w-full sm:w-[420px]" style={{ maxHeight: "75vh" }}>
              <VoiceAssistant
                mode="admin"
                voiceId="XB0fDUnXU5powFXDhCwa"
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
            title="Assistant vocal admin">
            {showVoice ? <span className="text-xl">✕</span> : <span className="text-2xl">🎙️</span>}
          </button>
        </div>
      </div>
    </div>
    </ToastProvider>
  );
}
