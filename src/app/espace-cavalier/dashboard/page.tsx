"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, Badge, Button } from "@/components/ui";
import Link from "next/link";
import { Calendar, Receipt, Users, Star } from "lucide-react";

export default function DashboardPage() {
  const { user, family } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "Bonjour";

  const hasIncompleteChildren = family?.children?.some(
    (c) => !c.sanitaryForm
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">
        Bonjour {firstName} 👋
      </h1>
      <p className="font-body text-sm text-gray-400 mb-8">
        Voici un résumé de l&apos;activité de votre famille.
      </p>

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { icon: Calendar, value: "0", label: "Réservations à venir", color: "text-blue-500" },
          { icon: Receipt, value: "0€", label: "Prochain prélèvement", color: "text-gold-400" },
          { icon: Star, value: "—", label: "Avis à donner", color: "text-gold-400" },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Icon size={20} className="text-blue-500" />
                </div>
                <div>
                  <div className={`font-body text-xl font-bold ${stat.color}`}>
                    {stat.value}
                  </div>
                  <div className="font-body text-xs text-gray-400">
                    {stat.label}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quick actions */}
      <h2 className="font-display text-lg font-bold text-blue-800 mb-4">
        Actions rapides
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/espace-cavalier/reserver", icon: "📅", label: "Réserver un stage" },
          { href: "/espace-cavalier/reserver", icon: "🌅", label: "Réserver une balade" },
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
                      <div className="font-body text-xs text-gray-400">
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
