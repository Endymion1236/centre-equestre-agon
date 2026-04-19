"use client";
import { useAgentContext } from "@/hooks/useAgentContext";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
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
  const { isAdmin, isMoniteur, user } = useAuth();
  const { setAgentContext } = useAgentContext("dashboard");

  // Log diagnostic (à retirer après validation que le filtrage fonctionne
  // pour tous les moniteurs — utile si un moniteur rapporte encore voir les
  // cartes admin, cela permettra de voir l'état réel au moment du render)
  useEffect(() => {
    if (typeof window !== "undefined" && user) {
      console.log("[Dashboard auth]", {
        email: user.email,
        isAdmin,
        isMoniteur,
        willShowAdminShortcuts: isAdmin,
      });
    }
  }, [user, isAdmin, isMoniteur]);

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
    // Billing IA — admin uniquement (l'API renvoie 403 aux moniteurs)
    if (isAdmin) {
      authFetch("/api/billing")
        .then(r => {
          if (!r.ok) return null;
          return r.json();
        })
        .then(data => {
          // Ne setter billing que si la réponse contient bien la structure attendue
          if (data && (data.anthropic !== undefined || data.openai !== undefined || data.elevenlabs !== undefined)) {
            setBilling(data);
          }
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  // Couleurs par section sémantique (alignées sur les séparateurs de la sidebar) :
  //   Terrain       → blue   (activités opérationnelles, cavalerie, planning)
  //   Commercial    → green  (ventes, cavaliers, paiements)
  //   Gestion       → amber  (compta, stats, communication)
  //   Configuration → slate  (paramètres, galerie, modèles)
  const TERRAIN = "text-blue-500 bg-blue-50";
  const COMMERCIAL = "text-green-600 bg-green-50";
  const GESTION = "text-amber-600 bg-amber-50";
  const CONFIG = "text-slate-500 bg-slate-50";

  // Liste complète (admin) — les moniteurs n'en voient qu'un sous-ensemble
  // aligné sur MONITEUR_PAGES du layout admin.
  const ALL_ACTIONS: { href: string; icon: LucideIcon; label: string; tint: string }[] = [
    { href: "/admin/planning", icon: CalendarDays, label: "Planning", tint: TERRAIN },
    { href: "/admin/cavalerie", icon: Heart, label: "Cavalerie", tint: TERRAIN },
    { href: "/admin/cavaliers", icon: Users, label: "Cavaliers", tint: COMMERCIAL },
    { href: "/admin/paiements", icon: CreditCard, label: "Paiements", tint: COMMERCIAL },
    { href: "/admin/comptabilite", icon: BookOpen, label: "Comptabilité", tint: GESTION },
    { href: "/admin/statistiques", icon: BarChart3, label: "Statistiques", tint: GESTION },
    { href: "/admin/communication", icon: Mail, label: "Communication", tint: GESTION },
    { href: "/admin/activites", icon: ClipboardList, label: "Activités", tint: CONFIG },
    { href: "/admin/parametres", icon: Settings, label: "Paramètres", tint: CONFIG },
    { href: "/admin/galerie", icon: Camera, label: "Galerie", tint: CONFIG },
  ];
  // Pages autorisées aux moniteurs (même liste que MONITEUR_PAGES dans /admin/layout.tsx).
  // On ajoute aussi Montoir, Suivi péda. et Management qui n'étaient pas dans
  // les raccourcis admin mais qui sont des pages Terrain utiles à Éméline.
  const MONITEUR_ACTIONS: { href: string; icon: LucideIcon; label: string; tint: string }[] = [
    { href: "/admin/planning", icon: CalendarDays, label: "Planning", tint: TERRAIN },
    { href: "/admin/montoir", icon: ClipboardList, label: "Montoir", tint: TERRAIN },
    { href: "/admin/cavalerie", icon: Heart, label: "Cavalerie", tint: TERRAIN },
    { href: "/admin/pedagogie", icon: BookOpen, label: "Suivi péda.", tint: TERRAIN },
    { href: "/admin/management", icon: Users, label: "Mon planning", tint: TERRAIN },
  ];
  const quickActions = isAdmin ? ALL_ACTIONS : MONITEUR_ACTIONS;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-blue-800">Tableau de bord</h1>
          <p className="font-body text-sm text-gray-400">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin/activites">
            <button className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-blue-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-blue-400 transition-colors">
              <Plus size={16} />
              Créer une activité
            </button>
          </Link>
        )}
      </div>

      {/* Alertes stages impayés — admin uniquement (info financière) */}
      {isAdmin && <StagesImpayesAlert />}

      {/* KPIs — toutes les valeurs sont en slate sombre (neutre) ; seule l'icône
          porte la couleur sémantique. Évite l'effet "sapin de Noël". */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Users, value: familyCount.toString(), label: "Familles inscrites", tint: TERRAIN },
          { icon: CalendarDays, value: activityCount.toString(), label: "Activités créées", tint: TERRAIN },
          { icon: CreditCard, value: "0€", label: "CA ce mois", tint: COMMERCIAL },
          { icon: TrendingUp, value: "—", label: "Taux de remplissage", tint: GESTION },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          const [iconColor, bgColor] = kpi.tint.split(" ");
          return (
            <Card key={i} padding="md">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center`}>
                  <Icon size={20} className={iconColor} />
                </div>
              </div>
              <div className="font-body text-2xl font-bold text-blue-800">{kpi.value}</div>
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
          const [iconColor, bgColor] = action.tint.split(" ");
          return (
            <Link key={i} href={action.href} className="no-underline">
              <Card hover padding="sm" className="text-center !py-5">
                <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center mx-auto mb-2`}>
                  <Icon size={20} className={iconColor} />
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
              {typeof billing.anthropic?.cost === "number" ? (
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
              {typeof billing.openai?.cost === "number" ? (
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
              {typeof billing.elevenlabs?.used === "number" && typeof billing.elevenlabs?.limit === "number" && billing.elevenlabs.limit > 0 ? (
                <>
                  <div className="font-body text-2xl font-bold text-purple-500">
                    {Math.round((billing.elevenlabs.used / 1000))}k
                    <span className="text-sm font-normal text-gray-400"> / {Math.round((billing.elevenlabs.limit / 1000))}k car.</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-purple-400 rounded-full" style={{ width: `${Math.min(100, (billing.elevenlabs.used / billing.elevenlabs.limit) * 100)}%` }} />
                  </div>
                  <div className="font-body text-[10px] text-gray-400 mt-1">Plan {billing.elevenlabs.plan || "—"} · Synthèse vocale</div>
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
          Aucune reprise planifiée aujourd&apos;hui. {isAdmin ? "Créez vos premières activités pour commencer !" : "Consultez le planning pour voir les prochaines reprises."}
        </p>
        {isAdmin ? (
          <Link href="/admin/activites" className="font-body text-sm font-semibold text-blue-500 no-underline mt-3 inline-block">
            Créer une activité →
          </Link>
        ) : (
          <Link href="/admin/planning" className="font-body text-sm font-semibold text-blue-500 no-underline mt-3 inline-block">
            Voir le planning →
          </Link>
        )}
      </Card>
    </div>
  );
}
