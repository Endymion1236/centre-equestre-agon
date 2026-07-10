"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Cpu,
  CreditCard,
  Heart,
  Mail,
  Plus,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import StagesImpayesAlert from "@/components/admin/StagesImpayesAlert";
import { useAgentContext } from "@/hooks/useAgentContext";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { addDaysLocal, toLocalDateString } from "@/lib/date-local";
import { db } from "@/lib/firebase";

type ActionItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  tint: string;
};

const TERRAIN = "text-blue-600 bg-blue-50";
const COMMERCIAL = "text-emerald-700 bg-emerald-50";
const GESTION = "text-amber-700 bg-amber-50";
const CONFIG = "text-slate-600 bg-slate-100";

const ADMIN_PRIMARY_ACTIONS: ActionItem[] = [
  { href: "/admin/planning", icon: CalendarDays, label: "Ouvrir le planning", description: "Voir et organiser les reprises", tint: TERRAIN },
  { href: "/admin/cavaliers", icon: Users, label: "Rechercher un cavalier", description: "Familles, profils et inscriptions", tint: COMMERCIAL },
  { href: "/admin/paiements", icon: CreditCard, label: "Gérer les paiements", description: "Règlements, impayés et factures", tint: COMMERCIAL },
  { href: "/admin/montoir", icon: ClipboardList, label: "Préparer le montoir", description: "Répartir les chevaux et poneys", tint: TERRAIN },
];

const MONITEUR_PRIMARY_ACTIONS: ActionItem[] = [
  { href: "/admin/planning", icon: CalendarDays, label: "Ouvrir le planning", description: "Voir les reprises et les groupes", tint: TERRAIN },
  { href: "/admin/montoir", icon: ClipboardList, label: "Préparer le montoir", description: "Répartir les chevaux et poneys", tint: TERRAIN },
  { href: "/admin/pedagogie", icon: BookOpen, label: "Suivi pédagogique", description: "Progression et notes des cavaliers", tint: TERRAIN },
  { href: "/admin/cavalerie", icon: Heart, label: "Voir la cavalerie", description: "Suivi des chevaux et poneys", tint: TERRAIN },
];

const SECONDARY_ACTIONS: ActionItem[] = [
  { href: "/admin/cavalerie", icon: Heart, label: "Cavalerie", description: "Chevaux et poneys", tint: TERRAIN },
  { href: "/admin/comptabilite", icon: BookOpen, label: "Comptabilité", description: "Encaissements et exports", tint: GESTION },
  { href: "/admin/statistiques", icon: BarChart3, label: "Statistiques", description: "Activité et performance", tint: GESTION },
  { href: "/admin/communication", icon: Mail, label: "Communication", description: "Emails et campagnes", tint: GESTION },
  { href: "/admin/activites", icon: ClipboardList, label: "Activités", description: "Catalogue et tarifs", tint: CONFIG },
  { href: "/admin/galerie", icon: Camera, label: "Galerie", description: "Photos du site", tint: CONFIG },
  { href: "/admin/parametres", icon: Settings, label: "Paramètres", description: "Réglages généraux", tint: CONFIG },
];

function formatDateLabel() {
  const label = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatMoney(value: number | null) {
  if (value === null) return "…";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function occupancyColor(rate: number) {
  if (rate >= 100) return "bg-orange-500";
  if (rate >= 75) return "bg-emerald-500";
  if (rate >= 40) return "bg-blue-500";
  return "bg-slate-300";
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-48 rounded-[28px] bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl bg-slate-100" />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="h-72 rounded-2xl bg-slate-100" />
        <div className="h-72 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { isAdmin, user } = useAuth();
  const { setAgentContext } = useAgentContext("dashboard");

  const [familyCount, setFamilyCount] = useState(0);
  const [activityCount, setActivityCount] = useState(0);
  const [caMois, setCaMois] = useState<number | null>(null);
  const [tauxRemplissage, setTauxRemplissage] = useState<number | null>(null);
  const [todaySlots, setTodaySlots] = useState<any[]>([]);
  const [billing, setBilling] = useState<any>(null);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAgentContext({ module_actif: "dashboard", description: "tableau de bord, priorités et activité du jour" });
  }, [setAgentContext]);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [familiesSnap, activitiesSnap, encaissementsSnap, creneauxSnap] = await Promise.all([
          getDocs(collection(db, "families")),
          getDocs(collection(db, "activities")),
          getDocs(collection(db, "encaissements")),
          getDocs(collection(db, "creneaux")),
        ]);

        setFamilyCount(familiesSnap.size);
        setActivityCount(activitiesSnap.size);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyRevenue = encaissementsSnap.docs.reduce((total, document) => {
          const payment: any = document.data();
          if (payment.mode === "avoir") return total;
          const amount = Number(payment.montant || 0);
          const date = payment.date?.seconds ? new Date(payment.date.seconds * 1000) : null;
          if (!date || amount <= 0 || date < startOfMonth || date > now) return total;
          return total + amount;
        }, 0);
        setCaMois(Math.round(monthlyRevenue * 100) / 100);

        const today = toLocalDateString(now);
        const in30Days = addDaysLocal(30, now);
        let totalPlaces = 0;
        let totalEnrolled = 0;
        const allSlots = creneauxSnap.docs.map((document) => ({ id: document.id, ...document.data() } as any));

        allSlots.forEach((slot) => {
          if (slot.status === "cancelled" || slot.status === "closed") return;
          const date = typeof slot.date === "string" ? slot.date : "";
          const maxPlaces = Number(slot.maxPlaces || 0);
          if (date >= today && date <= in30Days && maxPlaces > 0) {
            const enrolled = Number(slot.enrolledCount || slot.enrolled?.length || 0);
            totalPlaces += maxPlaces;
            totalEnrolled += Math.min(enrolled, maxPlaces);
          }
        });

        setTauxRemplissage(totalPlaces > 0 ? Math.round((totalEnrolled / totalPlaces) * 100) : 0);
        setTodaySlots(
          allSlots
            .filter((slot) => slot.date === today && slot.status !== "cancelled" && slot.status !== "closed")
            .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")))
        );
      } catch (error) {
        console.error("Erreur chargement dashboard:", error);
        setCaMois(0);
        setTauxRemplissage(0);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();

    if (isAdmin) {
      authFetch("/api/billing")
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data && (data.anthropic !== undefined || data.openai !== undefined || data.elevenlabs !== undefined)) {
            setBilling(data);
          }
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  const primaryActions = isAdmin ? ADMIN_PRIMARY_ACTIONS : MONITEUR_PRIMARY_ACTIONS;
  const firstName = user?.displayName?.split(" ")?.[0] || "";
  const todayStats = useMemo(() => {
    const enrolled = todaySlots.reduce((total, slot) => total + Number(slot.enrolledCount || slot.enrolled?.length || 0), 0);
    const capacity = todaySlots.reduce((total, slot) => total + Number(slot.maxPlaces || 0), 0);
    return {
      enrolled,
      capacity,
      rate: capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0,
    };
  }, [todaySlots]);

  const nextSlot = useMemo(() => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return todaySlots.find((slot) => {
      const [hours, mins] = String(slot.startTime || "00:00").split(":").map(Number);
      return hours * 60 + mins >= minutes;
    }) || null;
  }, [todaySlots]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="pb-10">
      <section className="relative mb-6 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#07111f_0%,#12346b_55%,#2050a0_100%)] px-5 py-6 text-white shadow-[0_24px_70px_rgba(12,26,46,0.18)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border border-white/10 bg-white/[0.04]" />
        <div className="pointer-events-none absolute -bottom-32 right-20 h-64 w-64 rounded-full bg-gold-400/10 blur-2xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-blue-100">
              <span className="h-2 w-2 rounded-full bg-gold-400 shadow-[0_0_0_4px_rgba(240,160,16,0.12)]" />
              {formatDateLabel()}
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-4xl">
              {firstName ? `Bonjour ${firstName}` : "Tableau de bord"}
            </h1>
            <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-blue-100/75">
              Une vue claire de la journée, des priorités et des outils essentiels du centre.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-xs text-blue-100/75">
              <span><strong className="text-white">{todaySlots.length}</strong> reprise{todaySlots.length > 1 ? "s" : ""} aujourd’hui</span>
              <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:block" />
              <span><strong className="text-white">{todayStats.enrolled}</strong> cavalier{todayStats.enrolled > 1 ? "s" : ""} attendu{todayStats.enrolled > 1 ? "s" : ""}</span>
              {nextSlot && (
                <>
                  <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:block" />
                  <span>Prochaine à <strong className="text-gold-300">{nextSlot.startTime}</strong></span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Link href="/admin/planning" className="no-underline">
              <span className="flex min-w-[190px] items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-body text-sm font-bold text-white backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15">
                <span className="flex items-center gap-2"><CalendarDays size={17} /> Planning</span>
                <ArrowRight size={15} className="text-white/60" />
              </span>
            </Link>
            {isAdmin && (
              <Link href="/admin/activites" className="no-underline">
                <span className="flex min-w-[190px] items-center justify-between gap-3 rounded-xl bg-gold-400 px-4 py-3 font-body text-sm font-bold text-slate-950 shadow-[0_8px_24px_rgba(240,160,16,0.2)] transition-all hover:-translate-y-0.5 hover:bg-gold-300">
                  <span className="flex items-center gap-2"><Plus size={17} /> Nouvelle activité</span>
                  <ArrowRight size={15} />
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {isAdmin && (
        <section className="mb-6">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-lg font-bold text-blue-900">À traiter</h2>
            <span className="font-body text-xs text-gray-400">Les éléments qui demandent votre attention</span>
          </div>
          <StagesImpayesAlert />
        </section>
      )}

      <section className="mb-7">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { icon: CreditCard, value: formatMoney(caMois), label: "Encaissé ce mois", detail: "encaissements validés", tint: COMMERCIAL },
            { icon: Clock3, value: String(todaySlots.length), label: todaySlots.length > 1 ? "Reprises aujourd’hui" : "Reprise aujourd’hui", detail: `${todayStats.enrolled} cavaliers attendus`, tint: TERRAIN },
            { icon: TrendingUp, value: tauxRemplissage === null ? "…" : `${tauxRemplissage}%`, label: "Remplissage à 30 jours", detail: "sur les créneaux ouverts", tint: GESTION },
            { icon: Users, value: String(familyCount), label: "Familles actives", detail: "dans la base clients", tint: TERRAIN },
          ].map((item) => {
            const Icon = item.icon;
            const [iconColor, backgroundColor] = item.tint.split(" ");
            return (
              <Card key={item.label} padding="md" className="group relative overflow-hidden !rounded-2xl">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-gold-400 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-2xl font-bold text-blue-900 sm:text-3xl">{item.value}</div>
                    <div className="mt-1 font-body text-xs font-bold text-blue-900">{item.label}</div>
                    <div className="mt-1 hidden font-body text-[11px] text-gray-400 sm:block">{item.detail}</div>
                  </div>
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${backgroundColor}`}>
                    <Icon size={19} className={iconColor} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="mb-1 font-body text-[10px] font-bold uppercase tracking-[0.15em] text-blue-500">Programme</div>
              <h2 className="font-display text-xl font-bold text-blue-900">Aujourd’hui</h2>
              <p className="mt-0.5 font-body text-xs text-gray-500">Les reprises dans l’ordre de la journée.</p>
            </div>
            <Link href="/admin/planning" className="rounded-lg px-2 py-1 font-body text-xs font-bold text-blue-600 no-underline hover:bg-blue-50">Voir le planning →</Link>
          </div>

          {todaySlots.length === 0 ? (
            <Card padding="lg" className="text-center !rounded-2xl">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                <CalendarDays size={27} className="text-blue-300" />
              </div>
              <div className="font-body text-sm font-bold text-blue-900">Aucune reprise planifiée aujourd’hui</div>
              <p className="mt-1 font-body text-xs text-gray-500">La journée est libre dans le planning.</p>
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden !rounded-2xl">
              <div className="border-b border-gray-100 bg-slate-50/70 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-body text-xs font-bold text-blue-900">Occupation globale du jour</div>
                  <div className="font-body text-xs font-bold text-blue-700">{todayStats.enrolled}/{todayStats.capacity || "—"}</div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full ${occupancyColor(todayStats.rate)} transition-all duration-700`} style={{ width: `${Math.min(todayStats.rate, 100)}%` }} />
                </div>
              </div>
              <div className="relative divide-y divide-gray-100">
                {todaySlots.map((slot) => {
                  const enrolled = Number(slot.enrolledCount || slot.enrolled?.length || 0);
                  const maxPlaces = Number(slot.maxPlaces || 0);
                  const rate = maxPlaces > 0 ? Math.round((enrolled / maxPlaces) * 100) : 0;
                  const isNext = nextSlot?.id === slot.id;
                  return (
                    <Link key={slot.id} href="/admin/planning" className={`block no-underline transition-colors ${isNext ? "bg-blue-50/55" : "hover:bg-slate-50"}`}>
                      <div className="flex items-center gap-3 px-4 py-3.5 sm:gap-4">
                        <div className="w-[58px] flex-shrink-0">
                          <div className={`font-display text-lg font-bold ${isNext ? "text-blue-700" : "text-blue-900"}`}>{slot.startTime || "—"}</div>
                          {slot.endTime && <div className="font-body text-[11px] text-gray-400">{slot.endTime}</div>}
                        </div>
                        <div className={`h-10 w-1 flex-shrink-0 rounded-full ${isNext ? "bg-gold-400" : "bg-blue-100"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate font-body text-sm font-bold text-blue-900">{slot.activityTitle || slot.title || "Activité"}</div>
                            {isNext && <span className="rounded-full bg-gold-100 px-2 py-0.5 font-body text-[9px] font-bold uppercase tracking-wide text-gold-700">Prochaine</span>}
                          </div>
                          <div className="mt-0.5 truncate font-body text-xs text-gray-500">
                            {[slot.moniteurName || slot.instructorName, slot.location].filter(Boolean).join(" · ") || "Planning du centre"}
                          </div>
                        </div>
                        <div className="w-20 flex-shrink-0 text-right">
                          <div className={`font-body text-xs font-bold ${rate >= 100 ? "text-orange-600" : "text-emerald-700"}`}>
                            {maxPlaces > 0 ? `${enrolled}/${maxPlaces}` : enrolled}
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-full rounded-full ${occupancyColor(rate)}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </section>

        <section>
          <div className="mb-3">
            <div className="mb-1 font-body text-[10px] font-bold uppercase tracking-[0.15em] text-blue-500">Raccourcis</div>
            <h2 className="font-display text-xl font-bold text-blue-900">Actions courantes</h2>
            <p className="mt-0.5 font-body text-xs text-gray-500">Les chemins les plus utiles au quotidien.</p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
            {primaryActions.map((action, index) => {
              const Icon = action.icon;
              const [iconColor, backgroundColor] = action.tint.split(" ");
              return (
                <Link key={action.href} href={action.href} className="group no-underline">
                  <Card hover padding="sm" className="!rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${backgroundColor}`}>
                        <Icon size={20} className={iconColor} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-body text-[10px] font-bold text-gray-300">0{index + 1}</span>
                          <div className="font-body text-sm font-bold text-blue-900">{action.label}</div>
                        </div>
                        <div className="mt-0.5 truncate font-body text-xs text-gray-500">{action.description}</div>
                      </div>
                      <ArrowRight size={16} className="flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {isAdmin && (
        <section className="mb-5">
          <button
            type="button"
            onClick={() => setShowMoreTools((value) => !value)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-[0_4px_20px_rgba(12,26,46,0.025)] transition-colors hover:border-blue-200 hover:bg-blue-50/20"
          >
            <div>
              <div className="font-display text-lg font-bold text-blue-900">Autres outils</div>
              <div className="mt-0.5 font-body text-xs text-gray-500">{activityCount} activités configurées · gestion, communication et réglages</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              {showMoreTools ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {showMoreTools && (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {SECONDARY_ACTIONS.map((action) => {
                const Icon = action.icon;
                const [iconColor, backgroundColor] = action.tint.split(" ");
                return (
                  <Link key={action.href} href={action.href} className="group no-underline">
                    <Card hover padding="sm" className="h-full !rounded-2xl">
                      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${backgroundColor}`}>
                        <Icon size={19} className={iconColor} />
                      </div>
                      <div className="font-body text-sm font-bold text-blue-900">{action.label}</div>
                      <div className="mt-1 font-body text-xs text-gray-500">{action.description}</div>
                      <ArrowRight size={14} className="mt-3 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500" />
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {isAdmin && billing && (
        <section>
          <button
            type="button"
            onClick={() => setShowBilling((value) => !value)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left shadow-[0_4px_20px_rgba(12,26,46,0.025)] transition-colors hover:border-purple-200 hover:bg-purple-50/20"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50"><Cpu size={19} className="text-purple-600" /></div>
              <div>
                <div className="font-body text-sm font-bold text-blue-900">Consommation IA</div>
                <div className="mt-0.5 font-body text-xs text-gray-500">Détail technique des services utilisés ce mois-ci</div>
              </div>
            </div>
            {showBilling ? <ChevronUp size={18} className="text-purple-500" /> : <ChevronDown size={18} className="text-purple-500" />}
          </button>

          {showBilling && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="no-underline">
                <Card hover padding="md" className="!rounded-2xl">
                  <div className="font-body text-sm font-bold text-blue-900">Claude</div>
                  <div className="mt-2 font-display text-2xl font-bold text-orange-500">
                    {typeof billing.anthropic?.cost === "number" ? `${billing.anthropic.cost.toFixed(2)} €` : "—"}
                  </div>
                  <div className="mt-1 font-body text-xs text-gray-500">Emails et assistant IA</div>
                </Card>
              </a>
              <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer" className="no-underline">
                <Card hover padding="md" className="!rounded-2xl">
                  <div className="font-body text-sm font-bold text-blue-900">Whisper</div>
                  <div className="mt-2 font-display text-2xl font-bold text-green-600">
                    {typeof billing.openai?.cost === "number" ? `${billing.openai.cost.toFixed(2)} $` : "—"}
                  </div>
                  <div className="mt-1 font-body text-xs text-gray-500">Transcription vocale</div>
                </Card>
              </a>
              <a href="https://elevenlabs.io/app/subscription" target="_blank" rel="noopener noreferrer" className="no-underline">
                <Card hover padding="md" className="!rounded-2xl">
                  <div className="font-body text-sm font-bold text-blue-900">ElevenLabs</div>
                  <div className="mt-2 font-display text-2xl font-bold text-purple-600">
                    {typeof billing.elevenlabs?.used === "number" ? `${Math.round(billing.elevenlabs.used / 1000)}k` : "—"}
                  </div>
                  <div className="mt-1 font-body text-xs text-gray-500">Caractères de synthèse vocale</div>
                </Card>
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
