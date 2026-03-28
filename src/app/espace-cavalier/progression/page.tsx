"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, Badge } from "@/components/ui";

const galopProgression: Record<string, { label: string; color: string; skills: string[] }> = {
  "—": { label: "Découverte", color: "#8A96A8", skills: ["Premier contact avec le poney", "Apprendre à approcher un poney", "Monter et descendre avec aide"] },
  "Bronze": { label: "Galop de Bronze", color: "#CD7F32", skills: ["Panser seul", "Mener en main", "Se diriger au pas", "S'arrêter", "Trotter enlevé en cercle", "Connaître les parties du poney"] },
  "Argent": { label: "Galop d'Argent", color: "#C0C0C0", skills: ["Seller et brider seul", "Trotter enlevé en autonomie", "Galoper en équilibre", "Enchaîner pas-trot-galop", "Savoir faire un volte", "Connaître les robes"] },
  "Or": { label: "Galop d'Or", color: "#FFD700", skills: ["Galoper assis", "Trotter sans étriers", "Sauter un petit obstacle", "Aborder en extérieur", "Soigner et entretenir son poney", "Connaître l'alimentation"] },
  "G1": { label: "Galop 1", color: "#2050A0", skills: ["Aborder le poney", "Le panser", "Amener sur le montoir", "Se mettre en selle, descendre", "Conduire au pas", "Trotter"] },
  "G2": { label: "Galop 2", color: "#2050A0", skills: ["Effectuer un pansage complet", "Déplacer la croupe et les épaules", "Trotter enlevé", "Galoper", "Changer d'allure", "Barres au sol"] },
  "G3": { label: "Galop 3", color: "#183878", skills: ["Entretien courant", "Longer un cheval", "Galoper assis", "Sauter un obstacle isolé", "Réaliser un parcours", "Trotter et galoper en extérieur"] },
  "G4": { label: "Galop 4", color: "#183878", skills: ["Soins vétérinaires de base", "Transport du cheval", "Enchaîner obstacles 80cm", "Incurvation aux 3 allures", "Transition dans le calme", "Galoper en extérieur varié"] },
};

export default function ProgressionPage() {
  const { family } = useAuth();
  const children = family?.children || [];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Progression</h1>
      <p className="font-body text-sm text-gray-600 mb-8">Suivez la progression équestre de vos cavaliers à travers les galops FFE.</p>

      {children.length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="text-5xl block mb-4">📈</span>
          <p className="font-body text-sm text-gray-500">Ajoutez vos enfants dans votre profil pour suivre leur progression.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {children.map((child: any) => {
            const level = child.galopLevel || "—";
            const prog = galopProgression[level] || galopProgression["—"];
            const allLevels = Object.entries(galopProgression);
            const currentIdx = allLevels.findIndex(([k]) => k === level);

            return (
              <div key={child.id}>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl">🧒</div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-blue-800">{child.firstName}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge color={level !== "—" ? "blue" : "gray"}>{prog.label}</Badge>
                      {child.birthDate && (
                        <span className="font-body text-xs text-gray-600">
                          {Math.floor((Date.now() - new Date(typeof child.birthDate === "string" ? child.birthDate : child.birthDate?.seconds ? child.birthDate.seconds * 1000 : 0).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} ans
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <Card padding="md" className="mb-4">
                  <div className="font-body text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Progression</div>
                  <div className="flex gap-1 mb-3">
                    {allLevels.map(([key, val], i) => (
                      <div key={key} className="flex-1">
                        <div className={`h-2 rounded-full transition-all ${i <= currentIdx ? "bg-blue-500" : "bg-gray-100"}`} />
                        <div className={`font-body text-[10px] mt-1 text-center ${i <= currentIdx ? "text-blue-500 font-semibold" : "text-gray-600"}`}>
                          {key === "—" ? "🌱" : key}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Current level skills */}
                <Card padding="md">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-body text-xs font-bold" style={{ background: prog.color }}>
                      {level === "—" ? "🌱" : level.replace("G", "")}
                    </span>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">{prog.label}</div>
                      <div className="font-body text-xs text-gray-600">Compétences à acquérir</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {prog.skills.map((skill, i) => (
                      <div key={i} className="flex items-center gap-2 font-body text-sm text-gray-500 bg-sand rounded-lg px-3 py-2">
                        <span className="text-gold-400">◦</span> {skill}
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Next level teaser */}
                {currentIdx < allLevels.length - 1 && (
                  <div className="mt-3 p-4 bg-blue-50 rounded-xl border border-blue-500/8">
                    <div className="font-body text-xs font-semibold text-blue-800">
                      Prochaine étape : {allLevels[currentIdx + 1][1].label}
                    </div>
                    <div className="font-body text-xs text-gray-600 mt-1">
                      {allLevels[currentIdx + 1][1].skills.length} compétences à débloquer
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
