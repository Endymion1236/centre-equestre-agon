"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import Link from "next/link";
import {
  Plus, Users, CalendarDays, CreditCard, TrendingUp,
  ClipboardList, BookOpen, Mail, Settings, Camera, Heart, BarChart3, Cpu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import StagesImpayesAlert from "@/components/admin/StagesImpayesAlert";

export default function AdminDashboard() {
  const { setAgentContext } = useAgentContext("dashboard");

  useEffect(() => {
    setAgentContext({ module_actif: "dashboard", description: "tableau de bord, stats globales" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [familyCount, setFamilyCount] = useState(0);
  const [activityCount, setActivityCount] = useState(0);
  const [billing, setBilling] = useState<any>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const familiesSnap = await getDocs(collection(db, "families"));
        setFamilyCount(familiesSnap.size);
        const activitiesSnap = await getDocs(collection(db, "activities"));
        setActivityCount(activitiesSnap.size);
      } catch (e) {
        console.error("Erreur chargement stats:", e);
      }
    }
    fetchStats();
    // Billing IA
    authFetch("/api/billing").then(r => r.json()).then(setBilling).catch(() => {});
  }, []);

  const quickActions: { href: string; icon: LucideIcon; label: string; color: string }[] = [
    { href: "/admin/activites", icon: ClipboardList, label: "Gérer les activités", color: "text-blue-500" },
    { href: "/admin/planning", icon: CalendarDays, label: "Planning", color: "text-blue-500" },
    { href: "/admin/cavaliers", icon: Users, label: "Cavaliers", color: "text-blue-500" },
    { href: "/admin/cavalerie", icon: Heart, label: "Cavalerie", color: "text-red-400" },
    { href: "/admin/paiements", icon: CreditCard, label: "Paiements", color: "text-green-600" },
    { href: "/admin/comptabilite", icon: BookOpen, label: "Comptabilité", color: "text-orange-500" },
    { href: "/admin/statistiques", icon: BarChart3, label: "Statistiques", color: "text-purple-600" },
    { href: "/admin/communication", icon: Mail, label: "Communication", color: "text-blue-500" },
    { href: "/admin/parametres", icon: Settings, label: "Paramètres", color: "text-gray-500" },
    { href: "/admin/galerie", icon: Camera, label: "Galerie", color: "text-blue-500" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Tableau de bord</h1>
          <p className="font-body text-sm text-gray-400">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Link href="/admin/activites">
          <button className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 transition-colors">
            <Plus size={16} />
            Créer une activité
          </button>
        </Link>
      </div>

      {/* Alertes stages impayés */}
      <StagesImpayesAlert />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Users, value: familyCount.toString(), label: "Familles inscrites", color: "text-blue-500", iconColor: "text-blue-500", bg: "bg-blue-50" },
          { icon: CalendarDays, value: activityCount.toString(), label: "Activités créées", color: "text-blue-500", iconColor: "text-blue-500", bg: "bg-blue-50" },
          { icon: CreditCard, value: "0€", label: "CA ce mois", color: "text-green-600", iconColor: "text-green-600", bg: "bg-green-50" },
          { icon: TrendingUp, value: "—", label: "Taux de remplissage", color: "text-gold-400", iconColor: "text-amber-500", bg: "bg-amber-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} padding="md">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                  <Icon size={20} className={kpi.iconColor} />
                </div>
              </div>
              <div className={`font-body text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="font-body text-xs text-gray-400">{kpi.label}</div>
            </Card>
          );
        })}
      </div>

      {/* Quick actions grid */}
      <h2 className="font-display text-lg font-bold text-blue-800 mb-4">Accès rapide</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <Link key={i} href={action.href} className="no-underline">
              <Card hover padding="sm" className="text-center !py-5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
                  <Icon size={20} className={action.color} />
                </div>
                <span className="font-body text-xs font-semibold text-blue-800">{action.label}</span>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Coûts IA du mois */}
      {billing && (
        <>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-4 mt-10 flex items-center gap-2">
            <Cpu size={20} className="text-purple-500" /> Consommation IA
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {/* Anthropic */}
            <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="no-underline">
            <Card padding="md" hover>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                  <span className="text-sm">🧠</span>
                </div>
                <span className="font-body text-sm font-semibold text-blue-800">Claude (Anthropic)</span>
              </div>
              {billing.anthropic?.cost !== null ? (
                <div className="font-body text-2xl font-bold text-orange-500">{billing.anthropic.cost.toFixed(2)}€</div>
              ) : (
                <div className="font-body text-xs text-gray-500">{billing.anthropic?.error || "—"}</div>
              )}
              <div className="font-body text-[10px] text-gray-400 mt-1">Génération emails, assistant IA</div>
              <div className="font-body text-[10px] text-blue-500 mt-2">Voir le détail →</div>
            </Card>
            </a>

            {/* OpenAI Whisper */}
            <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer" className="no-underline">
            <Card padding="md" hover>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <span className="text-sm">🎤</span>
                </div>
                <span className="font-body text-sm font-semibold text-blue-800">Whisper (OpenAI)</span>
              </div>
              {billing.openai?.cost !== null ? (
                <div className="font-body text-2xl font-bold text-green-500">{billing.openai.cost.toFixed(2)}$</div>
              ) : (
                <div className="font-body text-xs text-gray-500">{billing.openai?.error || "—"}</div>
              )}
              <div className="font-body text-[10px] text-gray-400 mt-1">Transcription vocale</div>
              <div className="font-body text-[10px] text-blue-500 mt-2">Voir le détail →</div>
            </Card>
            </a>

            {/* ElevenLabs */}
            <a href="https://elevenlabs.io/app/subscription" target="_blank" rel="noopener noreferrer" className="no-underline">
            <Card padding="md" hover>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <span className="text-sm">🔊</span>
                </div>
                <span className="font-body text-sm font-semibold text-blue-800">ElevenLabs</span>
              </div>
              {billing.elevenlabs?.used !== null ? (
                <>
                  <div className="font-body text-2xl font-bold text-purple-500">
                    {Math.round((billing.elevenlabs.used / 1000))}k
                    <span className="text-sm font-normal text-gray-400"> / {Math.round((billing.elevenlabs.limit / 1000))}k car.</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-purple-400 rounded-full" style={{ width: `${Math.min(100, (billing.elevenlabs.used / billing.elevenlabs.limit) * 100)}%` }} />
                  </div>
                  <div className="font-body text-[10px] text-gray-400 mt-1">Plan {billing.elevenlabs.plan} · Synthèse vocale</div>
                </>
              ) : (
                <div className="font-body text-xs text-gray-500">{billing.elevenlabs?.error || "—"}</div>
              )}
              <div className="font-body text-[10px] text-blue-500 mt-2">Voir le détail →</div>
            </Card>
            </a>
          </div>
        </>
      )}

      {/* Placeholder for today's schedule */}
      <h2 className="font-display text-lg font-bold text-blue-800 mb-4 mt-10">Aujourd&apos;hui</h2>
      <Card padding="lg" className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
          <CalendarDays size={28} className="text-blue-300" />
        </div>
        <p className="font-body text-sm text-gray-500">
          Aucune reprise planifiée aujourd&apos;hui. Créez vos premières activités pour commencer !
        </p>
        <Link href="/admin/activites" className="font-body text-sm font-semibold text-blue-500 no-underline mt-3 inline-block">
          Créer une activité →
        </Link>
      </Card>
    </div>
  );
}
