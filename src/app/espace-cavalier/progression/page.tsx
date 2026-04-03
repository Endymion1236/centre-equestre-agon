"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Card, Badge } from "@/components/ui";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { GALOPS_PROGRAMME, DOMAINE_LABELS, getNiveauById, type Domaine } from "@/lib/galops-programme";

export default function ProgressionPage() {
  const { user, family } = useAuth();
  const children = family?.children || [];
  const [progressions, setProgressions] = useState<Record<string, any>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || children.length === 0) { setLoading(false); return; }
    (async () => {
      const result: Record<string, any> = {};
      for (const child of children) {
        const docId = `${user.uid}_${child.id}`;
        const snap = await getDoc(doc(db, "progressions", docId));
        if (snap.exists()) result[child.id] = snap.data();
      }
      setProgressions(result);
      setLoading(false);
    })();
  }, [user, children.length]);

  const toggleDomaine = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="pb-8">
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Progression</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Compétences validées par votre moniteur selon le programme FFE.</p>

      {children.length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="text-5xl block mb-4">📈</span>
          <p className="font-body text-sm text-gray-500">Ajoutez vos enfants dans votre profil pour suivre leur progression.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {children.map((child: any) => {
            const prog = progressions[child.id];
            const niveauId = prog?.niveauEnCours;
            const niveau = niveauId ? getNiveauById(niveauId) : null;
            const acquis: Record<string, boolean> = prog?.acquis || {};

            const totalAcquis = niveau ? niveau.competences.filter(c => acquis[c.id]).length : 0;
            const total = niveau?.competences.length || 0;
            const pct = total > 0 ? Math.round((totalAcquis / total) * 100) : 0;

            // Grouper par domaine
            const parDomaine = niveau?.competences.reduce((acc, c) => {
              if (!acc[c.domaine]) acc[c.domaine] = [];
              acc[c.domaine].push(c);
              return acc;
            }, {} as Record<string, typeof niveau.competences>) || {};

            return (
              <div key={child.id}>
                {/* Header cavalier */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-xl">🐴</div>
                  <div className="flex-1">
                    <h2 className="font-display text-lg font-bold text-blue-800">{child.firstName}</h2>
                    {niveau ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-body text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: niveau.color }}>
                          {niveau.label}
                        </span>
                        <span className="font-body text-xs text-slate-500">{niveau.description}</span>
                      </div>
                    ) : (
                      <span className="font-body text-xs text-slate-400">Aucune progression enregistrée</span>
                    )}
                  </div>
                </div>

                {!niveau ? (
                  <Card padding="md" className="text-center">
                    <Trophy size={24} className="text-slate-300 mx-auto mb-2" />
                    <p className="font-body text-sm text-slate-400">Le moniteur n'a pas encore enregistré de progression pour {child.firstName}.</p>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-3">
                    {/* Barre de progression globale */}
                    <Card padding="sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-body text-xs text-slate-600">Compétences acquises</span>
                        <span className="font-body text-xs font-bold text-blue-600">{totalAcquis}/{total} — {pct}%</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: niveau.color }}
                        />
                      </div>
                      {pct === 100 && (
                        <p className="font-body text-xs text-green-600 font-semibold mt-1.5 text-center">
                          🏆 Toutes les compétences acquises !
                        </p>
                      )}
                    </Card>

                    {/* Compétences par domaine */}
                    {Object.entries(parDomaine).map(([domaine, comps]) => {
                      const key = `${child.id}_${domaine}`;
                      const isOpen = expanded[key] !== false; // ouvert par défaut
                      const acquisDomaine = comps.filter(c => acquis[c.id]).length;

                      return (
                        <div key={domaine} className="border border-gray-100 rounded-xl overflow-hidden">
                          <button
                            onClick={() => toggleDomaine(key)}
                            className="w-full flex items-center justify-between p-3 bg-gray-50 cursor-pointer border-none text-left"
                          >
                            <span className="font-body text-sm font-semibold text-slate-700">
                              {DOMAINE_LABELS[domaine as Domaine] ?? domaine}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`font-body text-xs font-semibold ${acquisDomaine === comps.length ? "text-green-600" : "text-slate-500"}`}>
                                {acquisDomaine}/{comps.length}
                              </span>
                              {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="divide-y divide-gray-50">
                              {comps.map(c => (
                                <div key={c.id} className={`flex items-start gap-3 p-3 ${acquis[c.id] ? "bg-green-50" : "bg-white"}`}>
                                  {acquis[c.id]
                                    ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                                    : <Circle size={16} className="text-gray-200 flex-shrink-0 mt-0.5" />
                                  }
                                  <span className={`font-body text-sm ${acquis[c.id] ? "text-green-700" : "text-slate-500"}`}>
                                    {c.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
