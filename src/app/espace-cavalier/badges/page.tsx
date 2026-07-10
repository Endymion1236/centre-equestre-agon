"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle2, Lock, Sparkles } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { evaluerBadges, contexteBadges, type BadgeResult } from "@/lib/badges";
import { db } from "@/lib/firebase";

type BadgeFilter = "all" | "earned" | "locked";

export default function BadgesPage() {
  const { user, family } = useAuth();
  const children = family?.children || [];
  const [selectedChildId, setSelectedChildId] = useState("");
  const [niveauByChild, setNiveauByChild] = useState<Record<string, string>>({});
  const [openBadge, setOpenBadge] = useState<string | null>(null);
  const [filter, setFilter] = useState<BadgeFilter>("all");

  useEffect(() => {
    if (children.length === 0) {
      setSelectedChildId("");
      return;
    }
    if (!children.some((child: any) => child.id === selectedChildId)) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  useEffect(() => {
    if (!user?.uid || !selectedChildId || niveauByChild[selectedChildId] !== undefined) return;

    const loadLevel = async () => {
      try {
        const snap = await getDoc(doc(db, "progressions", `${user.uid}_${selectedChildId}`));
        const level = snap.exists() ? ((snap.data() as any).niveauEnCours || "") : "";
        setNiveauByChild((current) => ({ ...current, [selectedChildId]: level }));
      } catch {
        setNiveauByChild((current) => ({ ...current, [selectedChildId]: "" }));
      }
    };

    loadLevel();
  }, [user, selectedChildId, niveauByChild]);

  const child: any = children.find((item: any) => item.id === selectedChildId) || children[0];

  const badges: BadgeResult[] = useMemo(() => {
    if (!child) return [];
    const notes = child.peda?.notes || [];
    return evaluerBadges(contexteBadges(notes, niveauByChild[child.id]));
  }, [child, niveauByChild]);

  const earnedCount = badges.filter((badge) => badge.obtenu).length;
  const progress = badges.length > 0 ? Math.round((earnedCount / badges.length) * 100) : 0;
  const visibleBadges = badges.filter((badge) => {
    if (filter === "earned") return badge.obtenu;
    if (filter === "locked") return !badge.obtenu;
    return true;
  });

  const changeChild = (childId: string) => {
    setSelectedChildId(childId);
    setOpenBadge(null);
    setFilter("all");
  };

  if (children.length === 0) {
    return (
      <div className="pb-8">
        <div className="mb-5">
          <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Mes badges</h1>
          <p className="font-body text-sm text-gray-600">Les petits défis qui racontent les progrès au club.</p>
        </div>
        <Card padding="lg" className="text-center">
          <Award size={34} className="text-gray-300 mx-auto mb-3" />
          <div className="font-display text-lg font-bold text-blue-800">Aucun cavalier enregistré</div>
          <p className="font-body text-sm text-gray-500 mt-1">Ajoutez un cavalier dans Ma famille pour commencer à débloquer des badges.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Mes badges</h1>
        <p className="font-body text-sm text-gray-600">Ils se débloquent automatiquement au fil des séances et de la progression.</p>
      </div>

      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
          {children.map((item: any) => {
            const active = item.id === child?.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => changeChild(item.id)}
                className={`min-w-[140px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer text-left transition-all ${
                  active ? "bg-blue-800 border-blue-800 text-white" : "bg-white border-gray-200 text-blue-800"
                }`}
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${active ? "bg-white/15" : "bg-blue-50"}`}>🐴</span>
                <span className="min-w-0">
                  <span className="block font-body text-sm font-bold truncate">{item.firstName || "Cavalier"}</span>
                  <span className={`block font-body text-xs ${active ? "text-blue-100" : "text-gray-500"}`}>Voir ses badges</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Card padding="md" className="mb-5 !bg-gradient-to-br !from-gold-50 !to-amber-50 !border-gold-200">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center">
              <Sparkles size={23} className="text-gold-600" />
            </div>
            <div>
              <div className="font-display text-xl font-bold text-blue-800">{child?.firstName}</div>
              <div className="font-body text-sm text-gray-600">{earnedCount} badge{earnedCount > 1 ? "s" : ""} obtenu{earnedCount > 1 ? "s" : ""} sur {badges.length}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl font-bold text-gold-600">{progress}%</div>
            <div className="font-body text-xs text-gray-500">de la collection</div>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-white overflow-hidden mt-4">
          <div className="h-full rounded-full bg-gold-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {([
          ["all", "Tous", badges.length],
          ["earned", "Obtenus", earnedCount],
          ["locked", "À débloquer", badges.length - earnedCount],
        ] as const).map(([id, label, count]) => (
          <button
            type="button"
            key={id}
            onClick={() => {
              setFilter(id);
              setOpenBadge(null);
            }}
            className={`rounded-xl border px-2 py-2.5 font-body text-xs sm:text-sm font-bold cursor-pointer transition-all ${
              filter === id ? "bg-blue-800 text-white border-blue-800" : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {label} <span className={filter === id ? "text-blue-100" : "text-gray-400"}>({count})</span>
          </button>
        ))}
      </div>

      {visibleBadges.length === 0 ? (
        <Card padding="lg" className="text-center">
          <CheckCircle2 size={30} className="text-green-400 mx-auto mb-3" />
          <div className="font-display text-lg font-bold text-blue-800">Tout est déjà débloqué ici</div>
          <p className="font-body text-sm text-gray-500 mt-1">La collection de {child?.firstName} brille de partout.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleBadges.map((badge) => {
            const open = openBadge === badge.id;
            const nextProgress = badge.prochainSeuil
              ? Math.min(100, Math.round((badge.valeur / badge.prochainSeuil) * 100))
              : 100;

            return (
              <Card key={badge.id} padding="md" className={badge.obtenu ? "!border-gold-200" : ""}>
                <button
                  type="button"
                  onClick={() => setOpenBadge(open ? null : badge.id)}
                  className="w-full flex items-start gap-3 text-left bg-transparent border-none cursor-pointer p-0"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 ${badge.obtenu ? "bg-gold-50" : "bg-gray-100 grayscale"}`}>
                    {badge.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-body text-sm font-bold text-blue-800">{badge.label}</div>
                        <div className="font-body text-xs text-gray-500 mt-0.5">{badge.paliersAtteints}/{badge.totalPaliers} palier{badge.totalPaliers > 1 ? "s" : ""}</div>
                      </div>
                      {badge.obtenu ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" /> : <Lock size={17} className="text-gray-300 flex-shrink-0" />}
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-3">
                      <div className={`h-full rounded-full ${badge.obtenu ? "bg-gold-400" : "bg-blue-300"}`} style={{ width: `${nextProgress}%` }} />
                    </div>
                    <div className="font-body text-xs text-gray-500 mt-1.5">
                      {badge.prochainSeuil !== null ? `${badge.valeur}/${badge.prochainSeuil} avant le prochain palier` : "Palier maximum atteint 🎉"}
                    </div>
                  </div>
                </button>

                {open && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="font-body text-sm text-gray-600 leading-relaxed mb-3">{badge.description}</p>
                    <div className="flex flex-col gap-2">
                      {badge.tiers.map((threshold, index) => {
                        const reached = badge.valeur >= threshold;
                        return (
                          <div key={threshold} className={`flex items-center justify-between rounded-xl px-3 py-2 ${reached ? "bg-green-50" : "bg-gray-50"}`}>
                            <span className={`font-body text-xs font-semibold ${reached ? "text-green-700" : "text-gray-500"}`}>Palier {index + 1}</span>
                            <span className={`font-body text-xs font-bold ${reached ? "text-green-600" : "text-gray-400"}`}>{reached ? "✓ Atteint" : `Objectif : ${threshold}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
