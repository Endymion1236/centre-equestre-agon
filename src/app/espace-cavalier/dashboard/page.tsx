"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge, Button } from "@/components/ui";
import Link from "next/link";
import { Calendar, Receipt, Users, Star, CreditCard, Wallet, Bell, BellOff } from "lucide-react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function DashboardPage() {
  const { user, family } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "Bonjour";
  const [stats, setStats] = useState({ reservations: 0, resteDu: 0, avoir: 0, totalPaye: 0 });
  const { permission, loading, requestPermission } = usePushNotifications(user?.uid || null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        // Réservations à venir
        const today = new Date().toISOString().split("T")[0];
        let resCount = 0;
        try {
          const resSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", user.uid)));
          resCount = resSnap.docs.filter(d => (d.data().date || "") >= today && d.data().status !== "cancelled").length;
        } catch { /* index manquant */ }

        // Paiements
        let resteDu = 0, totalPaye = 0;
        try {
          const paySnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", user.uid)));
          paySnap.docs.forEach(d => {
            const p = d.data();
            if (p.status === "cancelled") return;
            totalPaye += p.paidAmount || 0;
            resteDu += (p.totalTTC || 0) - (p.paidAmount || 0);
          });
        } catch { /* index manquant */ }

        // Avoirs
        let avoir = 0;
        try {
          const avSnap = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", user.uid)));
          avSnap.docs.forEach(d => { const a = d.data(); if (a.status === "actif") avoir += a.remainingAmount || 0; });
        } catch { /* index manquant */ }

        setStats({ reservations: resCount, resteDu: Math.max(0, Math.round(resteDu * 100) / 100), avoir: Math.round(avoir * 100) / 100, totalPaye: Math.round(totalPaye * 100) / 100 });
      } catch (e) { console.error(e); }
    };
    load();
  }, [user]);

  const hasIncompleteChildren = family?.children?.some(
    (c) => !c.sanitaryForm
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">
        Bonjour {firstName} 👋
      </h1>
      <p className="font-body text-sm text-gray-600 mb-8">
        Voici un résumé de l&apos;activité de votre famille.
      </p>

      {/* Bannière activation notifications push */}
      {permission === "default" && (
        <Card className="!bg-blue-50 !border-blue-200 mb-5" padding="sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Bell size={20} className="text-blue-500"/>
            </div>
            <div className="flex-1">
              <div className="font-body text-sm font-semibold text-blue-800">Activez les notifications</div>
              <div className="font-body text-xs text-blue-600">Rappels de cours, confirmations d'inscription, alertes de place disponible.</div>
            </div>
            <button onClick={requestPermission} disabled={loading}
              className="font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-lg border-none cursor-pointer flex-shrink-0 disabled:opacity-50">
              {loading ? "..." : "Activer"}
            </button>
          </div>
        </Card>
      )}
      {permission === "granted" && (
        <Card className="!bg-green-50 !border-green-200 mb-5" padding="sm">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-green-600"/>
            <span className="font-body text-xs text-green-700 font-semibold">Notifications activées ✓</span>
          </div>
        </Card>
      )}

      {/* Alert: incomplete profile */}
      {family && family.children.length === 0 && (
        <Card className="!bg-gold-50 !border-gold-400/15 mb-5" padding="sm">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div className="font-body text-sm text-blue-800">
              <strong>Profil incomplet</strong> — Ajoutez vos enfants pour
              pouvoir réserver.{" "}
              <Link
                href="/espace-cavalier/profil"
                className="text-blue-500 font-semibold no-underline"
              >
                Compléter maintenant →
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Card padding="sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Calendar size={20} className="text-blue-500" /></div>
            <div>
              <div className="font-body text-xl font-bold text-blue-500">{stats.reservations}</div>
              <div className="font-body text-xs text-gray-600">Réservations</div>
            </div>
          </div>
        </Card>
        <Card padding="sm" className={stats.resteDu > 0 ? "bg-red-50" : "bg-green-50"}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.resteDu > 0 ? "bg-red-100" : "bg-green-100"}`}><CreditCard size={20} className={stats.resteDu > 0 ? "text-red-500" : "text-green-600"} /></div>
            <div>
              <div className={`font-body text-xl font-bold ${stats.resteDu > 0 ? "text-red-500" : "text-green-600"}`}>{stats.resteDu.toFixed(0)}€</div>
              <div className="font-body text-xs text-gray-600">{stats.resteDu > 0 ? "Reste dû" : "À jour"}</div>
            </div>
          </div>
        </Card>
        <Card padding="sm" className="bg-green-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center"><Receipt size={20} className="text-green-600" /></div>
            <div>
              <div className="font-body text-xl font-bold text-green-600">{stats.totalPaye.toFixed(0)}€</div>
              <div className="font-body text-xs text-gray-600">Payé</div>
            </div>
          </div>
        </Card>
        {stats.avoir > 0 && (
          <Card padding="sm" className="bg-purple-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Wallet size={20} className="text-purple-600" /></div>
              <div>
                <div className="font-body text-xl font-bold text-purple-600">{stats.avoir.toFixed(0)}€</div>
                <div className="font-body text-xs text-gray-600">Avoir</div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Quick actions */}
      <h2 className="font-display text-lg font-bold text-blue-800 mb-4">
        Actions rapides
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/espace-cavalier/reserver", icon: "📅", label: "Réserver une activité" },
          { href: "/espace-cavalier/reserver?filter=balade", icon: "🌅", label: "Réserver une balade" },
          { href: "/espace-cavalier/inscription-annuelle", icon: "📋", label: "Inscription annuelle" },
          { href: "/espace-cavalier/factures", icon: "🧾", label: "Mes factures" },
          { href: "/espace-cavalier/profil", icon: "👨‍👩‍👧‍👦", label: "Ma famille" },
        ].map((action, i) => (
          <Link key={i} href={action.href} className="no-underline">
            <Card
              hover
              padding="sm"
              className="text-center !py-5"
            >
              <span className="text-2xl block mb-2">{action.icon}</span>
              <span className="font-body text-xs font-semibold text-blue-800">
                {action.label}
              </span>
            </Card>
          </Link>
        ))}
      </div>

      {/* Family members */}
      {family && family.children.length > 0 && (
        <>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-4 mt-10">
            Vos cavaliers
          </h2>
          <div className="flex flex-col gap-3">
            {family.children.map((child) => (
              <Card key={child.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-lg">
                      🧒
                    </div>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">
                        {child.firstName}
                      </div>
                      <div className="font-body text-xs text-gray-600">
                        Niveau : {child.galopLevel || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge color={child.galopLevel && child.galopLevel !== "—" ? "blue" : "gray"}>
                      {child.galopLevel && child.galopLevel !== "—"
                        ? `Galop ${child.galopLevel}`
                        : "Débutant"}
                    </Badge>
                    {child.sanitaryForm ? (
                      <Badge color="green">Fiche OK</Badge>
                    ) : (
                      <Badge color="red">Fiche manquante</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
