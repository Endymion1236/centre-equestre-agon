"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import Link from "next/link";
import { Plus, Users, CalendarDays, CreditCard, TrendingUp } from "lucide-react";

export default function AdminDashboard() {
  const [familyCount, setFamilyCount] = useState(0);
  const [activityCount, setActivityCount] = useState(0);

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
  }, []);

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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { icon: Users, value: familyCount.toString(), label: "Familles inscrites", color: "text-blue-500", delta: "" },
          { icon: CalendarDays, value: activityCount.toString(), label: "Activités créées", color: "text-blue-500", delta: "" },
          { icon: CreditCard, value: "0€", label: "CA ce mois", color: "text-green-600", delta: "" },
          { icon: TrendingUp, value: "—", label: "Taux de remplissage", color: "text-gold-400", delta: "" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} padding="md">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Icon size={20} className="text-blue-500" />
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { href: "/admin/activites", icon: "🏇", label: "Gérer les activités" },
          { href: "/admin/planning", icon: "📅", label: "Planning" },
          { href: "/admin/cavaliers", icon: "👥", label: "Cavaliers" },
          { href: "/admin/paiements", icon: "💳", label: "Paiements" },
          { href: "/admin/comptabilite", icon: "📒", label: "Comptabilité" },
          { href: "/admin/communication", icon: "📧", label: "Communication" },
          { href: "/admin/parametres", icon: "⚙️", label: "Paramètres" },
          { href: "/admin/galerie", icon: "📷", label: "Galerie" },
        ].map((action, i) => (
          <Link key={i} href={action.href} className="no-underline">
            <Card hover padding="sm" className="text-center !py-5">
              <span className="text-2xl block mb-2">{action.icon}</span>
              <span className="font-body text-xs font-semibold text-blue-800">{action.label}</span>
            </Card>
          </Link>
        ))}
      </div>

      {/* Placeholder for today's schedule */}
      <h2 className="font-display text-lg font-bold text-blue-800 mb-4 mt-10">Aujourd&apos;hui</h2>
      <Card padding="lg" className="text-center">
        <span className="text-4xl block mb-3">📅</span>
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
