"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";
import { Star, TrendingUp, Award, Target } from "lucide-react";

const galopProgression = [
  { level: "Débutant", color: "#94a3b8", description: "Découverte du poney, mise en confiance" },
  { level: "Bronze", color: "#CD7F32", description: "Autonomie de base, soins, 3 allures en main" },
  { level: "Argent", color: "#C0C0C0", description: "Travail en autonomie, sellage/bridage, trot enlevé" },
  { level: "Or", color: "#FFD700", description: "Multi-disciplines, galop en carrière, petits obstacles" },
  { level: "G1", color: "#2050A0", description: "Galop 1 FFE — équilibre aux 3 allures, soins complets" },
  { level: "G2", color: "#2050A0", description: "Galop 2 FFE — directions, transitions, figures simples" },
  { level: "G3", color: "#183878", description: "Galop 3 FFE — incurvation, enchaînement obstacles 60cm" },
  { level: "G4", color: "#183878", description: "Galop 4 FFE — travail sur le plat avancé, CSO 80cm" },
  { level: "G5", color: "#0C1A2E", description: "Galop 5 FFE — dressage intermédiaire, parcours CSO" },
  { level: "G6", color: "#0C1A2E", description: "Galop 6 FFE — équitation fine, CSO 100cm" },
  { level: "G7", color: "#0C1A2E", description: "Galop 7 FFE — maîtrise complète, compétition haut niveau" },
];

export default function SatisfactionPage() {
  const { family } = useAuth();
  const [tab, setTab] = useState<"progression" | "satisfaction">("progression");
  const children = family?.children || [];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Progression & satisfaction</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Suivez la progression équestre de vos enfants et donnez votre avis.</p>

      <div className="flex gap-2 mb-6">
        {([["progression", "Progression galops", TrendingUp], ["satisfaction", "Avis & satisfaction", Star]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border font-body text-sm font-medium cursor-pointer transition-all
              ${tab === id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-500 border-gray-200"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* ─── Progression Tab ─── */}
      {tab === "progression" && (
        <div>
          {children.length === 0 ? (
            <Card padding="lg" className="text-center">
              <span className="text-4xl block mb-3">🧒</span>
              <p className="font-body text-sm text-gray-500">Ajoutez vos enfants dans votre profil pour suivre leur progression.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-6">
              {children.map((child: any) => {
                const currentLevel = child.galopLevel || "—";
                const currentIndex = galopProgression.findIndex(g => g.level === currentLevel);
                const progressPercent = currentIndex >= 0 ? ((currentIndex + 1) / galopProgression.length) * 100 : 0;
                const nextLevel = currentIndex >= 0 && currentIndex < galopProgression.length - 1 ? galopProgression[currentIndex + 1] : null;
                const currentInfo = galopProgression.find(g => g.level === currentLevel);

                return (
                  <Card key={child.id} padding="md">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-3xl">🧒</div>
                      <div className="flex-1">
                        <div className="font-display text-lg font-bold text-blue-800">{child.firstName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge color={currentLevel !== "—" ? "blue" : "gray"}>
                            {currentLevel !== "—" ? `Galop ${currentLevel}` : "Débutant"}
                          </Badge>
                          {currentInfo && <span className="font-body text-xs text-gray-600">{currentInfo.description}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-5">
                      <div className="flex justify-between mb-2">
                        <span className="font-body text-xs font-semibold text-gray-600">Progression</span>
                        <span className="font-body text-xs font-semibold text-blue-500">{Math.round(progressPercent)}%</span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-3 rounded-full bg-gradient-to-r from-blue-400 to-gold-400 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="font-body text-[10px] text-gray-600">Débutant</span>
                        <span className="font-body text-[10px] text-gray-600">Galop 7</span>
                      </div>
                    </div>

                    {/* Level steps */}
                    <div className="flex flex-wrap gap-2 mb-5">
                      {galopProgression.map((g, i) => {
                        const isPast = i <= currentIndex;
                        const isCurrent = g.level === currentLevel;
                        return (
                          <div key={g.level}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs transition-all
                              ${isCurrent ? "bg-blue-500 text-white font-semibold shadow-md" : isPast ? "bg-blue-50 text-blue-500 font-medium" : "bg-gray-50 text-gray-600"}`}>
                            {isPast && !isCurrent && <Award size={12} />}
                            {isCurrent && <Star size={12} />}
                            {g.level}
                          </div>
                        );
                      })}
                    </div>

                    {/* Next objective */}
                    {nextLevel && (
                      <div className="bg-gold-50 rounded-xl p-4 border border-gold-400/15">
                        <div className="flex items-center gap-2 mb-1">
                          <Target size={16} className="text-gold-500" />
                          <span className="font-body text-sm font-semibold text-blue-800">Prochain objectif : {nextLevel.level}</span>
                        </div>
                        <p className="font-body text-xs text-gray-500">{nextLevel.description}</p>
                      </div>
                    )}

                    {currentIndex === galopProgression.length - 1 && (
                      <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                        <div className="flex items-center gap-2">
                          <Award size={16} className="text-green-600" />
                          <span className="font-body text-sm font-semibold text-green-800">Niveau maximum atteint ! Bravo ! 🏆</span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Satisfaction Tab ─── */}
      {tab === "satisfaction" && (
        <Card padding="lg" className="text-center">
          <span className="text-5xl block mb-4">⭐</span>
          <h2 className="font-display text-lg font-bold text-blue-800 mb-2">Donnez votre avis !</h2>
          <p className="font-body text-sm text-gray-500 mb-4">
            Après chaque activité, vous recevrez un email vous invitant à noter votre expérience.
            Vos avis nous aident à nous améliorer !
          </p>
          <p className="font-body text-xs text-gray-600">
            Les enquêtes de satisfaction seront envoyées automatiquement après vos prochaines activités.
          </p>
        </Card>
      )}
    </div>
  );
}
