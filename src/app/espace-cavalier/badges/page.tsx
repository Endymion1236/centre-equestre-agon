"use client";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { evaluerBadges, contexteBadges, type BadgeResult } from "@/lib/badges";

export default function BadgesPage() {
  const { user, family } = useAuth();
  const children = family?.children || [];
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [niveauByChild, setNiveauByChild] = useState<Record<string, string>>({});
  const [openBadge, setOpenBadge] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedChildId && children.length > 0) setSelectedChildId(children[0].id);
  }, [children, selectedChildId]);

  // Charge le niveau de progression de l'enfant sélectionné (une fois par enfant).
  useEffect(() => {
    if (!user?.uid || !selectedChildId || niveauByChild[selectedChildId] !== undefined) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "progressions", `${user.uid}_${selectedChildId}`));
        const niveau = snap.exists() ? ((snap.data() as any).niveauEnCours || "") : "";
        setNiveauByChild((m) => ({ ...m, [selectedChildId]: niveau }));
      } catch {
        setNiveauByChild((m) => ({ ...m, [selectedChildId]: "" }));
      }
    })();
  }, [user, selectedChildId, niveauByChild]);

  const child = children.find((c: any) => c.id === selectedChildId);

  const badges: BadgeResult[] = useMemo(() => {
    if (!child) return [];
    const notes = (child as any).peda?.notes || [];
    const niveau = niveauByChild[selectedChildId];
    return evaluerBadges(contexteBadges(notes, niveau));
  }, [child, niveauByChild, selectedChildId]);

  const obtenus = badges.filter((b) => b.obtenu).length;

  if (children.length === 0) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-2">Mes badges</h1>
        <Card><p className="font-body text-sm text-slate-500 py-6 text-center">Ajoutez un cavalier à votre profil pour débloquer des badges.</p></Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">🏅</span>
        <h1 className="font-display text-2xl font-bold text-blue-800">Mes badges</h1>
        <span className="font-body text-sm text-slate-500">{obtenus}/{badges.length} obtenus</span>
      </div>
      <p className="font-body text-xs text-slate-500 mb-4">Les badges se débloquent tout seuls au fil des séances et de la progression. Clique sur un badge pour voir ses paliers.</p>

      {children.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {children.map((c: any) => (
            <button key={c.id} type="button" onClick={() => { setSelectedChildId(c.id); setOpenBadge(null); }}
              className={`font-body text-sm font-semibold px-4 py-2 rounded-full border cursor-pointer ${selectedChildId === c.id ? "bg-blue-800 text-white border-blue-800" : "bg-white text-slate-600 border-gray-200"}`}>
              {c.firstName || "Cavalier"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {badges.map((b) => {
          const isOpen = openBadge === b.id;
          return (
            <Card key={b.id} className={`cursor-pointer ${b.obtenu ? "" : "opacity-80"}`} >
              <button type="button" onClick={() => setOpenBadge(isOpen ? null : b.id)}
                className="w-full bg-transparent border-none cursor-pointer text-center flex flex-col items-center gap-1 p-0">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1 ${b.obtenu ? "bg-gold-50" : "bg-gray-100 grayscale"}`}>
                  {b.icon}
                </div>
                <span className="font-body text-sm font-bold text-blue-800">{b.label}</span>
                <span className="font-body text-xs text-slate-500">
                  {b.paliersAtteints}/{b.totalPaliers} palier{b.totalPaliers > 1 ? "s" : ""}
                </span>
                {b.prochainSeuil !== null ? (
                  <span className="font-body text-[11px] text-slate-400">{b.valeur}/{b.prochainSeuil} pour le palier suivant</span>
                ) : (
                  <span className="font-body text-[11px] text-green-600 font-semibold">Palier max atteint 🎉</span>
                )}
              </button>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="font-body text-[11px] text-slate-500 mb-2">{b.description}</p>
                  <div className="flex flex-col gap-1">
                    {b.tiers.map((seuil, i) => {
                      const atteint = b.valeur >= seuil;
                      return (
                        <div key={seuil} className="flex items-center gap-2">
                          <span className={`text-sm ${atteint ? "" : "grayscale opacity-40"}`}>{atteint ? "✅" : "🔒"}</span>
                          <span className={`font-body text-xs ${atteint ? "text-green-700 font-semibold" : "text-slate-500"}`}>
                            Palier {i + 1} · {seuil}
                          </span>
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
    </div>
  );
}
