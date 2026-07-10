"use client";

import { useEffect, useState } from "react";
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
  UserCheck,
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
const COMMERCIAL = "text-green-700 bg-green-50";
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

  return (
    <div className="pb-8">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <div>
          <p className="font-body text-sm font-semibold text-blue-500 mb-1">{formatDateLabel()}</p>
          <h1 className="font-display text-3xl font-bold text-blue-800">
            {firstName ? `Bonjour ${firstName}` : "Tableau de bord"}
          </h1>
          <p className="font-body text-sm text-gray-600 mt-1">Les priorités du jour et les accès que vous utilisez le plus.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/admin/planning" className="no-underline">
            <button className="inline-flex items-center gap-2 font-body text-sm font-bold text-blue-700 bg-blue-50 px-4 py-2.5 rounded-xl border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors">
              <CalendarDays size={16} /> Planning
            </button>
          </Link>
          {isAdmin && (
            <Link href="/admin/activites" className="no-underline">
              <button className="inline-flex items-center gap-2 font-body text-sm font-bold text-white bg-blue-500 px-4 py-2.5 rounded-xl border-none cursor-pointer hover:bg-blue-600 transition-colors">
                <Plus size={16} /> Nouvelle activité
              </button>
            </Link>
          )}
        </div>
      </div>

      {isAdmin && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-display text-lg font-bold text-blue-800">À traiter</h2>
            <span className="font-body text-xs text-gray-500">Les éléments qui demandent votre attention</span>
          </div>
          <StagesImpayesAlert />
        </section>
      )}

      <section className="mb-7">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { icon: CreditCard, value: formatMoney(caMois), label: "Encaissé ce mois", tint: COMMERCIAL },
            { icon: Clock3, value: String(todaySlots.length), label: todaySlots.length > 1 ? "Reprises aujourd’hui" : "Reprise aujourd’hui", tint: TERRAIN },
            { icon: TrendingUp, value: tauxRemplissage === null ? "…" : `${tauxRemplissage}%`, label: "Remplissage à 30 jours", tint: GESTION },
            { icon: Users, value: String(familyCount), label: "Familles actives", tint: TERRAIN },
          ].map((item) => {
            const Icon = item.icon;
            const [iconColor, backgroundColor] = item.tint.split(" ");
            return (
              <Card key={item.label} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-2xl sm:text-3xl font-bold text-blue-800">{item.value}</div>
                    <div className="font-body text-xs text-gray-500 mt-1">{item.label}</div>
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${backgroundColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={19} className={iconColor} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6 mb-8">
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="font-display text-lg font-bold text-blue-800">Aujourd’hui</h2>
              <p className="font-body text-xs text-gray-600 mt-0.5">Le programme de la journée, dans l’ordre.</p>
            </div>
            <Link href="/admin/planning" className="font-body text-xs font-bold text-blue-500 no-underline">Voir le planning →</Link>
          </div>

          {todaySlots.length === 0 ? (
            <Card padding="lg" className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <CalendarDays size={24} className="text-blue-300" />
              </div>
              <div className="font-body text-sm font-bold text-blue-800">Aucune reprise planifiée aujourd’hui</div>
              <p className="font-body text-xs text-gray-500 mt-1">La journée est libre dans le planning.</p>
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="divide-y divide-gray-100">
                {todaySlots.map((slot) => {
                  const enrolled = Number(slot.enrolledCount || slot.enrolled?.length || 0);
                  const maxPlaces = Number(slot.maxPlaces || 0);
                  const full = maxPlaces > 0 && enrolled >= maxPlaces;
                  return (
                    <Link key={slot.id} href="/admin/planning" className="no-underline block hover:bg-blue-50/40 transition-colors">
                      <div className="flex items-center gap-4 px-4 py-3.5">
                        <div className="w-[58px] flex-shrink-0">
                          <div className="font-display text-lg font-bold text-blue-800">{slot.startTime || "—"}</div>
                          {slot.endTime && <div className="font-body text-xs text-gray-400">{slot.endTime}</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-body text-sm font-bold text-blue-800 truncate">{slot.activityTitle || slot.title || "Activité"}</div>
                          <div className="font-body text-xs text-gray-500 mt-0.5 truncate">
                            {[slot.moniteurName || slot.instructorName, slot.location].filter(Boolean).join(" · ") || "Planning du centre"}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`font-body text-xs font-bold ${full ? "text-orange-600" : "text-green-700"}`}>
                            {maxPlaces > 0 ? `${enrolled}/${maxPlaces}` : enrolled}
                          </div>
                          <div className="font-body text-xs text-gray-400">cavaliers</div>
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
            <h2 className="font-display text-lg font-bold text-blue-800">Actions courantes</h2>
            <p className="font-body text-xs text-gray-600 mt-0.5">Les quatre chemins les plus utiles au quotidien.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
            {primaryActions.map((action) => {
              const Icon = action.icon;
              const [iconColor, backgroundColor] = action.tint.split(" ");
              return (
                <Link key={action.href} href={action.href} className="no-underline">
                  <Card hover padding="sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${backgroundColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={20} className={iconColor} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-body text-sm font-bold text-blue-800">{action.label}</div>
                        <div className="font-body text-xs text-gray-500 mt-0.5 truncate">{action.description}</div>
                      </div>
                      <ArrowRight size={16} className="text-gray-300 flex-shrink-0" />
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
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 cursor-pointer text-left"
          >
            <div>
              <div className="font-display text-lg font-bold text-blue-800">Autres outils</div>
              <div className="font-body text-xs text-gray-500 mt-0.5">{activityCount} activités configurées · gestion, communication et réglages</div>
            </div>
            {showMoreTools ? <ChevronUp size={18} className="text-blue-500" /> : <ChevronDown size={18} className="text-blue-500" />}
          </button>

          {showMoreTools && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-3">
              {SECONDARY_ACTIONS.map((action) => {
                const Icon = action.icon;
                const [iconColor, backgroundColor] = action.tint.split(" ");
                return (
                  <Link key={action.href} href={action.href} className="no-underline">
                    <Card hover padding="sm" className="h-full">
                      <div className={`w-10 h-10 rounded-xl ${backgroundColor} flex items-center justify-center mb-3`}>
                        <Icon size={19} className={iconColor} />
                      </div>
                      <div className="font-body text-sm font-bold text-blue-800">{action.label}</div>
                      <div className="font-body text-xs text-gray-500 mt-1">{action.description}</div>
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
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center"><Cpu size={19} className="text-purple-600" /></div>
              <div>
                <div className="font-body text-sm font-bold text-blue-800">Consommation IA</div>
                <div className="font-body text-xs text-gray-500 mt-0.5">Détail technique des services utilisés ce mois-ci</div>
              </div>
            </div>
            {showBilling ? <ChevronUp size={18} className="text-purple-500" /> : <ChevronDown size={18} className="text-purple-500" />}
          </button>

          {showBilling && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="no-underline">
                <Card hover padding="md">
                  <div className="font-body text-sm font-bold text-blue-800">Claude</div>
                  <div className="font-display text-2xl font-bold text-orange-500 mt-2">
                    {typeof billing.anthropic?.cost === "number" ? `${billing.anthropic.cost.toFixed(2)} €` : "—"}
                  </div>
                  <div className="font-body text-xs text-gray-500 mt-1">Emails et assistant IA</div>
                </Card>
              </a>
              <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer" className="no-underline">
                <Card hover padding="md">
                  <div className="font-body text-sm font-bold text-blue-800">Whisper</div>
                  <div className="font-display text-2xl font-bold text-green-600 mt-2">
                    {typeof billing.openai?.cost === "number" ? `${billing.openai.cost.toFixed(2)} $` : "—"}
                  </div>
                  <div className="font-body text-xs text-gray-500 mt-1">Transcription vocale</div>
                </Card>
              </a>
              <a href="https://elevenlabs.io/app/subscription" target="_blank" rel="noopener noreferrer" className="no-underline">
                <Card hover padding="md">
                  <div className="font-body text-sm font-bold text-blue-800">ElevenLabs</div>
                  <div className="font-display text-2xl font-bold text-purple-600 mt-2">
                    {typeof billing.elevenlabs?.used === "number" ? `${Math.round(billing.elevenlabs.used / 1000)}k` : "—"}
                  </div>
                  <div className="font-body text-xs text-gray-500 mt-1">Caractères de synthèse vocale</div>
                </Card>
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
