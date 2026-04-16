"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Card } from "@/components/ui";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Trophy, Lock } from "lucide-react";
import { GALOPS_PROGRAMME, DOMAINE_LABELS, getNiveauById, type Domaine } from "@/lib/galops-programme";

export default function ProgressionPage() {
  const { user, family } = useAuth();
  const children = family?.children || [];
  const [progressions, setProgressions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Accordéon niveaux : childId_niveauId → boolean
  const [openNiveaux, setOpenNiveaux] = useState<Record<string, boolean>>({});
  // Accordéon domaines : childId_niveauId_domaine → boolean
  const [openDomaines, setOpenDomaines] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user || children.length === 0) { setLoading(false); return; }
    (async () => {
      const result: Record<string, any> = {};
      for (const child of children) {
        const snap = await getDoc(doc(db, "progressions", `${user.uid}_${child.id}`));
        if (snap.exists()) result[child.id] = snap.data();
      }
      setProgressions(result);
      setLoading(false);
    })();
  }, [user, children.length]);

  const toggleNiveau = (key: string) =>
    setOpenNiveaux(p => ({ ...p, [key]: !p[key] }));

  const toggleDomaine = (key: string) =>
    setOpenDomaines(p => ({ ...p, [key]: p[key] === false ? true : false }));

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="pb-8">
      <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Progression</h1>
      <p className="font-body text-sm text-gray-600 mb-6">Compétences validées par votre moniteur selon le programme FFE.</p>

      {children.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Trophy size={32} className="text-slate-300 mx-auto mb-3"/>
          <p className="font-body text-sm text-gray-500">Ajoutez vos enfants dans votre profil pour suivre leur progression.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-10">
          {children.map((child: any) => {
            const prog = progressions[child.id];
            const niveauEnCoursId = prog?.niveauEnCours;
            const acquis: Record<string, boolean> = prog?.acquis || {};

            // Index du niveau en cours dans le programme
            const niveauEnCoursIdx = GALOPS_PROGRAMME.findIndex(n => n.id === niveauEnCoursId);

            // Niveaux précédents = tous les niveaux avant le niveau en cours
            const niveauxPrecedents = niveauEnCoursIdx > 0
              ? GALOPS_PROGRAMME.slice(0, niveauEnCoursIdx)
              : [];

            const niveauEnCours = niveauEnCoursIdx >= 0 ? GALOPS_PROGRAMME[niveauEnCoursIdx] : null;

            return (
              <div key={child.id}>
                {/* Header cavalier */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-xl">🐴</div>
                  <div>
                    <h2 className="font-display text-lg font-bold text-blue-800">{child.firstName}</h2>
                    {niveauEnCours ? (
                      <span className="font-body text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: niveauEnCours.color }}>
                        {niveauEnCours.label}
                      </span>
                    ) : (
                      <span className="font-body text-xs text-slate-400">Aucune progression enregistrée</span>
                    )}
                  </div>
                </div>

                {/* Note du moniteur (celle sélectionnée pour le bilan) */}
                {child.peda?.notes?.some((n: any) => n.featured) && (
                  <div className="mb-4 bg-purple-50 border border-purple-100 rounded-xl p-4">
                    <div className="font-body text-xs font-semibold text-purple-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      💬 Message du moniteur
                    </div>
                    {child.peda.notes.filter((n: any) => n.featured).map((note: any, i: number) => (
                      <div key={i} className="bg-white rounded-lg p-3 border border-purple-100">
                        <div className="font-body text-sm text-slate-700 leading-relaxed">{note.text}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="font-body text-[10px] text-purple-400">
                            {new Date(note.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                          </span>
                          {note.activity && (
                            <span className="font-body text-[10px] text-purple-300">· {note.activity}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!niveauEnCours ? (
                  <Card padding="md" className="text-center">
                    <Trophy size={24} className="text-slate-300 mx-auto mb-2"/>
                    <p className="font-body text-sm text-slate-400">Le moniteur n'a pas encore enregistré de progression pour {child.firstName}.</p>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-3">

                    {/* ── Niveau en cours ───────────────────────────────── */}
                    <NiveauAccordeon
                      child={child} niveau={niveauEnCours} acquis={acquis}
                      isCurrent openByDefault
                      openNiveaux={openNiveaux} toggleNiveau={toggleNiveau}
                      openDomaines={openDomaines} toggleDomaine={toggleDomaine}
                    />

                    {/* ── Niveaux précédents ────────────────────────────── */}
                    {niveauxPrecedents.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="font-body text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mt-2">
                          Niveaux précédents
                        </div>
                        {[...niveauxPrecedents].reverse().map(niveau => (
                          <NiveauAccordeon
                            key={niveau.id}
                            child={child} niveau={niveau} acquis={acquis}
                            isCurrent={false} openByDefault={false}
                            openNiveaux={openNiveaux} toggleNiveau={toggleNiveau}
                            openDomaines={openDomaines} toggleDomaine={toggleDomaine}
                          />
                        ))}
                      </div>
                    )}
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

// ── Composant accordéon pour un niveau ───────────────────────────────────────
function NiveauAccordeon({ child, niveau, acquis, isCurrent, openByDefault, openNiveaux, toggleNiveau, openDomaines, toggleDomaine }: {
  child: any; niveau: any; acquis: Record<string, boolean>;
  isCurrent: boolean; openByDefault: boolean;
  openNiveaux: Record<string, boolean>;
  toggleNiveau: (k: string) => void;
  openDomaines: Record<string, boolean>;
  toggleDomaine: (k: string) => void;
}) {
  const niveauKey = `${child.id}_${niveau.id}`;
  const isOpen = openNiveaux[niveauKey] !== undefined ? openNiveaux[niveauKey] : openByDefault;

  const totalAcquis = niveau.competences.filter((c: any) => acquis[c.id]).length;
  const total = niveau.competences.length;
  const pct = total > 0 ? Math.round((totalAcquis / total) * 100) : 0;
  const isComplete = pct === 100;

  const parDomaine = niveau.competences.reduce((acc: any, c: any) => {
    if (!acc[c.domaine]) acc[c.domaine] = [];
    acc[c.domaine].push(c);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className={`rounded-2xl border overflow-hidden ${isCurrent ? "border-blue-200" : "border-gray-100"}`}>
      {/* Header niveau */}
      <button
        onClick={() => toggleNiveau(niveauKey)}
        className={`w-full flex items-center justify-between p-4 cursor-pointer border-none text-left ${isCurrent ? "bg-white" : "bg-gray-50"}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ backgroundColor: niveau.color }}>
            {niveau.labelCourt}
          </div>
          <div>
            <div className="font-body text-sm font-semibold text-blue-800">{niveau.label}</div>
            <div className="font-body text-xs text-slate-500">{niveau.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {isComplete ? (
            <span className="font-body text-[11px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✅ Acquis</span>
          ) : (
            <span className="font-body text-[11px] font-semibold text-blue-600">{pct}%</span>
          )}
          {isOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
        </div>
      </button>

      {/* Barre de progression (toujours visible) */}
      <div className="px-4 pb-2 bg-white">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: isComplete ? "#22c55e" : niveau.color }}/>
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="font-body text-[10px] text-slate-400">{totalAcquis}/{total} compétences</span>
          {isComplete && <span className="font-body text-[10px] text-green-500 font-semibold">🏆 Niveau validé !</span>}
        </div>
      </div>

      {/* Contenu accordéon — domaines */}
      {isOpen && (
        <div className="border-t border-gray-100">
          {Object.entries(parDomaine).map(([domaine, comps]: [string, any]) => {
            const domaineKey = `${niveauKey}_${domaine}`;
            // Ouvert par défaut sauf si explicitement fermé
            const isDomOpen = openDomaines[domaineKey] !== false;
            const acquisDomaine = comps.filter((c: any) => acquis[c.id]).length;

            return (
              <div key={domaine} className="border-b border-gray-50 last:border-0">
                <button
                  onClick={() => toggleDomaine(domaineKey)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/50 cursor-pointer border-none text-left"
                >
                  <span className="font-body text-sm font-semibold text-slate-700">
                    {DOMAINE_LABELS[domaine as Domaine] ?? domaine}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`font-body text-xs font-semibold ${acquisDomaine === comps.length ? "text-green-600" : "text-slate-400"}`}>
                      {acquisDomaine}/{comps.length}
                    </span>
                    {isDomOpen ? <ChevronDown size={13} className="text-slate-400"/> : <ChevronRight size={13} className="text-slate-400"/>}
                  </div>
                </button>
                {isDomOpen && (
                  <div className="divide-y divide-gray-50">
                    {comps.map((c: any) => (
                      <div key={c.id} className={`flex items-start gap-3 px-4 py-3 ${acquis[c.id] ? "bg-green-50/40" : "bg-white"}`}>
                        {acquis[c.id]
                          ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5"/>
                          : <Circle size={16} className="text-gray-200 flex-shrink-0 mt-0.5"/>
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
}
