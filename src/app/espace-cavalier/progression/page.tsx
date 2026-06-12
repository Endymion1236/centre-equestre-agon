"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { Card } from "@/components/ui";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Trophy, Lock, BookOpen, Loader2 } from "lucide-react";
import { GALOPS_PROGRAMME, DOMAINE_LABELS, getNiveauById, type Domaine } from "@/lib/galops-programme";
import {
  isDomaineEchelle,
  getCompetenceLevel,
  isCompetenceValidated,
  computeProgressionPercent,
  DEFAULT_ECHELLE_LABELS,
  DEFAULT_VALIDATED_FFE_LEVEL,
  type ProgressionLabelsSettings,
} from "@/lib/progression-helpers";

export default function ProgressionPage() {
  const { user, family } = useAuth();
  const children = family?.children || [];
  const [progressions, setProgressions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Labels custom (chargés une fois au montage)
  const [echelleLabels, setEchelleLabels] = useState<string[]>(DEFAULT_ECHELLE_LABELS);
  const [seuilFFE, setSeuilFFE] = useState<number>(DEFAULT_VALIDATED_FFE_LEVEL);
  useEffect(() => {
    getDoc(doc(db, "settings", "progression_labels")).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as ProgressionLabelsSettings;
        if (Array.isArray(data.echelle) && data.echelle.length === 5) setEchelleLabels(data.echelle);
        if (typeof data.validatedFfe === "number") setSeuilFFE(data.validatedFfe);
      }
    }).catch(() => {});
  }, []);

  // Journal des séances : créneaux passés de la saison, chargés UNE fois
  // pour toute la famille au premier dépliage (null = pas encore chargé).
  const [journalCache, setJournalCache] = useState<any[] | null>(null);

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
                      echelleLabels={echelleLabels} seuilFFE={seuilFFE}
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
                            echelleLabels={echelleLabels} seuilFFE={seuilFFE}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Journal des séances (chargé à la demande) ──────── */}
                <JournalSeances child={child} familyId={user!.uid}
                  journalCache={journalCache} setJournalCache={setJournalCache} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Composant accordéon pour un niveau ───────────────────────────────────────
function NiveauAccordeon({ child, niveau, acquis, isCurrent, openByDefault, openNiveaux, toggleNiveau, openDomaines, toggleDomaine, echelleLabels, seuilFFE }: {
  child: any; niveau: any; acquis: Record<string, any>;
  isCurrent: boolean; openByDefault: boolean;
  openNiveaux: Record<string, boolean>;
  toggleNiveau: (k: string) => void;
  openDomaines: Record<string, boolean>;
  toggleDomaine: (k: string) => void;
  echelleLabels: string[]; seuilFFE: number;
}) {
  const niveauKey = `${child.id}_${niveau.id}`;
  const isOpen = openNiveaux[niveauKey] !== undefined ? openNiveaux[niveauKey] : openByDefault;

  const totalAcquis = niveau.competences.filter((c: any) => isCompetenceValidated(acquis[c.id], seuilFFE)).length;
  const total = niveau.competences.length;
  const pctFFE = total > 0 ? Math.round((totalAcquis / total) * 100) : 0;
  const pctProgression = computeProgressionPercent(niveau.competences as any, acquis);
  const isComplete = pctFFE === 100;

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
            <div className="flex flex-col items-end gap-0">
              <span className="font-body text-[11px] font-semibold text-blue-600">{pctFFE}% <span className="text-[9px] text-slate-400 font-normal">validé</span></span>
              <span className="font-body text-[10px] text-blue-400">{pctProgression}% <span className="text-[9px] text-slate-400 font-normal">progression</span></span>
            </div>
          )}
          {isOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
        </div>
      </button>

      {/* Barre de progression : la principale = % validé FFE,
          la secondaire (plus fine, pâle) = % progression globale */}
      <div className="px-4 pb-2 bg-white">
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pctFFE}%`, backgroundColor: isComplete ? "#22c55e" : niveau.color }}/>
        </div>
        {!isComplete && (
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-0.5">
            <div className="h-full rounded-full transition-all duration-500 bg-blue-300"
              style={{ width: `${pctProgression}%` }}/>
          </div>
        )}
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
            const acquisDomaine = comps.filter((c: any) => isCompetenceValidated(acquis[c.id], seuilFFE)).length;
            const isEchelle = isDomaineEchelle(domaine as Domaine);

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
                    {comps.map((c: any) => {
                      const level = getCompetenceLevel(acquis[c.id]);
                      const validated = isCompetenceValidated(acquis[c.id], seuilFFE);

                      if (isEchelle) {
                        // ─── Compétence pratique : jauge 1-5 lecture seule ───
                        return (
                          <div key={c.id} className={`px-4 py-3 ${level > 0 ? "bg-slate-50/40" : "bg-white"}`}>
                            <div className="flex items-start gap-3 mb-2">
                              {validated
                                ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5"/>
                                : level > 0
                                  ? <div className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center font-body text-[9px] font-bold text-white"
                                      style={{ background: `linear-gradient(135deg, hsl(${(level - 1) * 30}, 75%, 50%), hsl(${(level - 1) * 30}, 70%, 45%))` }}>
                                      {level}
                                    </div>
                                  : <Circle size={16} className="text-gray-200 flex-shrink-0 mt-0.5"/>
                              }
                              <span className={`font-body text-sm flex-1 ${validated ? "text-green-700" : level > 0 ? "text-slate-700" : "text-slate-500"}`}>
                                {c.label}
                              </span>
                            </div>
                            {/* Jauge 5 segments lecture seule */}
                            <div className="flex gap-0.5 ml-7">
                              {[1, 2, 3, 4, 5].map(n => {
                                const isReached = level >= n;
                                return (
                                  <div key={n}
                                    title={`Niveau ${n} : ${echelleLabels[n - 1]}${level === n ? " (actuel)" : ""}`}
                                    className="h-1.5 flex-1 rounded-sm transition-all"
                                    style={isReached
                                      ? { background: `linear-gradient(135deg, hsl(${(n - 1) * 30}, 75%, 55%), hsl(${(n - 1) * 30}, 70%, 50%))` }
                                      : { background: "#e5e7eb" }
                                    }
                                  />
                                );
                              })}
                            </div>
                            {level > 0 && (
                              <div className="ml-7 mt-1 font-body text-[10px] text-slate-500">
                                {echelleLabels[level - 1]}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // ─── Compétence binaire ─────────────────────────────────
                      return (
                        <div key={c.id} className={`flex items-start gap-3 px-4 py-3 ${validated ? "bg-green-50/40" : "bg-white"}`}>
                          {validated
                            ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5"/>
                            : <Circle size={16} className="text-gray-200 flex-shrink-0 mt-0.5"/>
                          }
                          <span className={`font-body text-sm ${validated ? "text-green-700" : "text-slate-500"}`}>
                            {c.label}
                          </span>
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

// ── Journal des séances d'un cavalier ────────────────────────────────────────
// Liste antichronologique des séances passées de la saison : date, activité,
// poney monté, présence, et thème de séance (notePreparation du créneau —
// champ visible par les familles ; les notes pédagogiques internes du staff
// vivent dans la collection notes-seance, réservée au staff par les règles).
// Les créneaux de la saison sont chargés UNE seule fois pour la famille
// (cache partagé entre enfants), et seulement au premier dépliage.
function JournalSeances({ child, familyId, journalCache, setJournalCache }: {
  child: any; familyId: string;
  journalCache: any[] | null;
  setJournalCache: (v: any[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(10);

  // Début de saison équestre : 1er septembre (sept–août)
  const seasonStart = (() => {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-09-01`;
  })();
  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && journalCache === null && !loading) {
      setLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, "creneaux"),
          where("date", ">=", seasonStart),
          where("date", "<=", todayStr),
        ));
        // On ne garde que les créneaux où la famille est inscrite
        const fam = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(c => (c.enrolled || []).some((e: any) => e.familyId === familyId));
        setJournalCache(fam);
      } catch (e) {
        console.error("[journal] chargement:", e);
        setJournalCache([]);
      }
      setLoading(false);
    }
  };

  // Séances de CET enfant, antichronologiques
  const entries = (journalCache || [])
    .map(c => {
      const e = (c.enrolled || []).find((x: any) => x.childId === child.id);
      if (!e) return null;
      return {
        id: c.id, date: c.date, title: c.activityTitle,
        startTime: c.startTime, horse: e.horseName || "",
        presence: e.presence || "", theme: (c.notePreparation || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.date.localeCompare(a.date) || (b.startTime || "").localeCompare(a.startTime || "")) as any[];

  // Podium des poneys (séances où l'enfant était présent ou non marqué absent)
  const podium = (() => {
    const counts: Record<string, number> = {};
    entries.forEach(e => {
      if (!e.horse) return;
      if (e.presence === "absent" || e.presence === "absent_nonjustified") return;
      counts[e.horse] = (counts[e.horse] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  })();

  const presenceBadge = (p: string) => {
    if (p === "absent") return <span className="font-body text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full whitespace-nowrap">Absent</span>;
    if (p === "absent_nonjustified") return <span className="font-body text-[10px] font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">Absent</span>;
    if (p) return <span className="font-body text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap">Présent</span>;
    return null;
  };

  return (
    <div className="mt-4">
      <button onClick={toggle}
        className="w-full flex items-center justify-between bg-blue-50 hover:bg-blue-100 rounded-xl px-4 py-3 border-none cursor-pointer transition-colors">
        <span className="flex items-center gap-2 font-body text-sm font-semibold text-blue-800">
          <BookOpen size={16} /> Journal des séances de {child.firstName}
        </span>
        {open ? <ChevronDown size={16} className="text-blue-500" /> : <ChevronRight size={16} className="text-blue-500" />}
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-blue-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <Card padding="md" className="text-center">
              <p className="font-body text-sm text-slate-400">Aucune séance enregistrée cette saison.</p>
            </Card>
          ) : (
            <>
              {/* Podium des poneys */}
              {podium.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {podium.map(([horse, n], i) => (
                    <div key={horse} className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-3 py-1.5">
                      <span className="text-sm">{["🥇", "🥈", "🥉"][i]}</span>
                      <span className="font-body text-xs font-semibold text-amber-800">{horse}</span>
                      <span className="font-body text-[10px] text-amber-500">×{n}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Liste des séances */}
              <div className="flex flex-col gap-2">
                {entries.slice(0, visible).map((e: any) => (
                  <Card key={e.id} padding="sm">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800">
                          {e.title}
                          {e.horse && <span className="ml-2 font-normal text-slate-600">🐴 {e.horse}</span>}
                        </div>
                        <div className="font-body text-xs text-slate-500 mt-0.5 capitalize">
                          {new Date(e.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}
                          {e.startTime && <span className="lowercase"> · {e.startTime}</span>}
                        </div>
                        {e.theme && (
                          <div className="font-body text-xs text-slate-600 mt-1 italic truncate">
                            📝 {e.theme.length > 90 ? e.theme.slice(0, 90) + "…" : e.theme}
                          </div>
                        )}
                      </div>
                      {presenceBadge(e.presence)}
                    </div>
                  </Card>
                ))}
              </div>

              {entries.length > visible && (
                <button onClick={() => setVisible(v => v + 15)}
                  className="w-full mt-2 py-2 font-body text-xs font-semibold text-blue-500 bg-white border border-blue-100 rounded-lg cursor-pointer hover:bg-blue-50">
                  Afficher plus ({entries.length - visible} séances restantes)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
