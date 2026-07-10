"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  MessageCircle,
  Trophy,
} from "lucide-react";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { DOMAINE_LABELS, GALOPS_PROGRAMME, type Domaine } from "@/lib/galops-programme";
import {
  computeProgressionPercent,
  DEFAULT_ECHELLE_LABELS,
  DEFAULT_VALIDATED_FFE_LEVEL,
  getCompetenceLevel,
  isCompetenceValidated,
  isDomaineEchelle,
  type ProgressionLabelsSettings,
} from "@/lib/progression-helpers";

export default function ProgressionPage() {
  const { user, family } = useAuth();
  const children = family?.children || [];
  const [progressions, setProgressions] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState("");

  const [echelleLabels, setEchelleLabels] = useState<string[]>(DEFAULT_ECHELLE_LABELS);
  const [seuilFFE, setSeuilFFE] = useState<number>(DEFAULT_VALIDATED_FFE_LEVEL);
  const [journalCache, setJournalCache] = useState<any[] | null>(null);
  const [openNiveaux, setOpenNiveaux] = useState<Record<string, boolean>>({});
  const [openDomaines, setOpenDomaines] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getDoc(doc(db, "settings", "progression_labels"))
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as ProgressionLabelsSettings;
        if (Array.isArray(data.echelle) && data.echelle.length === 5) setEchelleLabels(data.echelle);
        if (typeof data.validatedFfe === "number") setSeuilFFE(data.validatedFfe);
      })
      .catch(() => {});
  }, []);

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
    if (!user || children.length === 0) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const result: Record<string, any> = {};
      for (const child of children) {
        const snap = await getDoc(doc(db, "progressions", `${user.uid}_${child.id}`));
        if (snap.exists()) result[child.id] = snap.data();
      }
      setProgressions(result);
      setLoading(false);
    };

    load();
  }, [user, children.length]);

  const toggleNiveau = (key: string) => setOpenNiveaux((current) => ({ ...current, [key]: !current[key] }));
  const toggleDomaine = (key: string) => setOpenDomaines((current) => ({ ...current, [key]: !current[key] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedChild: any = children.find((child: any) => child.id === selectedChildId) || children[0];
  const progression = selectedChild ? progressions[selectedChild.id] : null;
  const niveauEnCoursId = progression?.niveauEnCours;
  const acquis: Record<string, any> = progression?.acquis || {};
  const niveauEnCoursIndex = GALOPS_PROGRAMME.findIndex((niveau) => niveau.id === niveauEnCoursId);
  const niveauEnCours = niveauEnCoursIndex >= 0 ? GALOPS_PROGRAMME[niveauEnCoursIndex] : null;
  const niveauxPrecedents = niveauEnCoursIndex > 0 ? GALOPS_PROGRAMME.slice(0, niveauEnCoursIndex).reverse() : [];
  const totalCompetences = niveauEnCours?.competences.length || 0;
  const competencesValidees = niveauEnCours
    ? niveauEnCours.competences.filter((competence: any) => isCompetenceValidated(acquis[competence.id], seuilFFE)).length
    : 0;
  const progressionGlobale = niveauEnCours ? computeProgressionPercent(niveauEnCours.competences as any, acquis) : 0;
  const validationFFE = totalCompetences > 0 ? Math.round((competencesValidees / totalCompetences) * 100) : 0;
  const featuredNote = selectedChild?.peda?.notes
    ?.filter((note: any) => note.featured)
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return (
    <div className="pb-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Progression</h1>
        <p className="font-body text-sm text-gray-600">Les acquis, les objectifs et le suivi de chaque cavalier.</p>
      </div>

      {children.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Trophy size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="font-body text-sm text-gray-500">Ajoutez vos cavaliers dans Ma famille pour suivre leur progression.</p>
        </Card>
      ) : (
        <>
          {children.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
              {children.map((child: any) => {
                const active = child.id === selectedChild?.id;
                const childProgression = progressions[child.id];
                const childLevel = GALOPS_PROGRAMME.find((niveau) => niveau.id === childProgression?.niveauEnCours);
                return (
                  <button
                    type="button"
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    className={`min-w-[140px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer text-left transition-all ${
                      active ? "bg-blue-800 border-blue-800 text-white" : "bg-white border-gray-200 text-blue-800"
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${active ? "bg-white/15" : "bg-blue-50"}`}>🐴</span>
                    <span className="min-w-0">
                      <span className="block font-body text-sm font-bold truncate">{child.firstName}</span>
                      <span className={`block font-body text-xs truncate ${active ? "text-blue-100" : "text-gray-500"}`}>
                        {childLevel?.label || "Suivi à venir"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedChild && (
            <>
              <Card padding="md" className="mb-5 !bg-gradient-to-br !from-blue-800 !to-blue-600 !border-blue-700 text-white">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-2xl">🐴</div>
                    <div>
                      <div className="font-display text-xl font-bold text-white">{selectedChild.firstName}</div>
                      <div className="font-body text-sm text-blue-100 mt-0.5">
                        {niveauEnCours ? niveauEnCours.label : "Aucune progression enregistrée"}
                      </div>
                    </div>
                  </div>

                  {niveauEnCours && (
                    <div className="text-right">
                      <div className="font-display text-3xl font-bold text-white">{progressionGlobale}%</div>
                      <div className="font-body text-xs text-blue-100">de progression</div>
                    </div>
                  )}
                </div>

                {niveauEnCours && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between font-body text-xs text-blue-100 mb-1.5">
                      <span>{competencesValidees}/{totalCompetences} compétences validées</span>
                      <span>{validationFFE}% FFE</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
                      <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progressionGlobale}%` }} />
                    </div>
                  </div>
                )}
              </Card>

              {featuredNote && (
                <Card padding="md" className="mb-5 !bg-purple-50 !border-purple-100">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                      <MessageCircle size={19} className="text-purple-600" />
                    </div>
                    <div>
                      <div className="font-body text-xs font-bold uppercase tracking-wider text-purple-700">Dernier message du moniteur</div>
                      <p className="font-body text-sm text-slate-700 leading-relaxed mt-2">{featuredNote.text}</p>
                      <div className="font-body text-xs text-purple-500 mt-2">
                        {new Date(featuredNote.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                        {featuredNote.activity ? ` · ${featuredNote.activity}` : ""}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {!niveauEnCours ? (
                <Card padding="lg" className="text-center">
                  <Trophy size={28} className="text-slate-300 mx-auto mb-3" />
                  <div className="font-display text-lg font-bold text-blue-800">Le suivi va bientôt commencer</div>
                  <p className="font-body text-sm text-gray-500 mt-1">Le moniteur n’a pas encore enregistré de progression pour {selectedChild.firstName}.</p>
                </Card>
              ) : (
                <section className="mb-5">
                  <div className="mb-3">
                    <h2 className="font-display text-lg font-bold text-blue-800">Compétences</h2>
                    <p className="font-body text-xs text-gray-600 mt-0.5">Ouvrez le niveau pour consulter le détail par domaine.</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <NiveauAccordeon
                      child={selectedChild}
                      niveau={niveauEnCours}
                      acquis={acquis}
                      isCurrent
                      openByDefault={false}
                      openNiveaux={openNiveaux}
                      toggleNiveau={toggleNiveau}
                      openDomaines={openDomaines}
                      toggleDomaine={toggleDomaine}
                      echelleLabels={echelleLabels}
                      seuilFFE={seuilFFE}
                    />

                    {niveauxPrecedents.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="font-body text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Niveaux précédents</div>
                        {niveauxPrecedents.map((niveau) => (
                          <NiveauAccordeon
                            key={niveau.id}
                            child={selectedChild}
                            niveau={niveau}
                            acquis={acquis}
                            isCurrent={false}
                            openByDefault={false}
                            openNiveaux={openNiveaux}
                            toggleNiveau={toggleNiveau}
                            openDomaines={openDomaines}
                            toggleDomaine={toggleDomaine}
                            echelleLabels={echelleLabels}
                            seuilFFE={seuilFFE}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <JournalSeances
                child={selectedChild}
                familyId={user!.uid}
                journalCache={journalCache}
                setJournalCache={setJournalCache}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function NiveauAccordeon({
  child,
  niveau,
  acquis,
  isCurrent,
  openByDefault,
  openNiveaux,
  toggleNiveau,
  openDomaines,
  toggleDomaine,
  echelleLabels,
  seuilFFE,
}: {
  child: any;
  niveau: any;
  acquis: Record<string, any>;
  isCurrent: boolean;
  openByDefault: boolean;
  openNiveaux: Record<string, boolean>;
  toggleNiveau: (key: string) => void;
  openDomaines: Record<string, boolean>;
  toggleDomaine: (key: string) => void;
  echelleLabels: string[];
  seuilFFE: number;
}) {
  const niveauKey = `${child.id}_${niveau.id}`;
  const isOpen = openNiveaux[niveauKey] !== undefined ? openNiveaux[niveauKey] : openByDefault;
  const totalAcquis = niveau.competences.filter((competence: any) => isCompetenceValidated(acquis[competence.id], seuilFFE)).length;
  const total = niveau.competences.length;
  const pctFFE = total > 0 ? Math.round((totalAcquis / total) * 100) : 0;
  const pctProgression = computeProgressionPercent(niveau.competences as any, acquis);
  const isComplete = pctFFE === 100;

  const parDomaine = niveau.competences.reduce((accumulator: Record<string, any[]>, competence: any) => {
    if (!accumulator[competence.domaine]) accumulator[competence.domaine] = [];
    accumulator[competence.domaine].push(competence);
    return accumulator;
  }, {});

  return (
    <div className={`rounded-2xl border overflow-hidden ${isCurrent ? "border-blue-200" : "border-gray-100"}`}>
      <button
        type="button"
        onClick={() => toggleNiveau(niveauKey)}
        className={`w-full flex items-center justify-between gap-3 p-4 cursor-pointer border-none text-left ${isCurrent ? "bg-white" : "bg-gray-50"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ backgroundColor: niveau.color }}
          >
            {niveau.labelCourt}
          </div>
          <div className="min-w-0">
            <div className="font-body text-sm font-bold text-blue-800 truncate">{niveau.label}</div>
            <div className="font-body text-xs text-gray-500 truncate">{niveau.description}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {isComplete ? (
            <span className="font-body text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">Acquis</span>
          ) : (
            <div className="text-right">
              <div className="font-body text-xs font-bold text-blue-600">{pctProgression}%</div>
              <div className="font-body text-[10px] text-gray-400">{totalAcquis}/{total} validées</div>
            </div>
          )}
          {isOpen ? <ChevronDown size={17} className="text-gray-400" /> : <ChevronRight size={17} className="text-gray-400" />}
        </div>
      </button>

      <div className="px-4 pb-3 bg-white">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pctProgression}%`, backgroundColor: isComplete ? "#22c55e" : niveau.color }}
          />
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-gray-100">
          {Object.entries(parDomaine).map(([domaine, competences]: [string, any]) => {
            const domaineKey = `${niveauKey}_${domaine}`;
            const isDomaineOpen = Boolean(openDomaines[domaineKey]);
            const acquisDomaine = competences.filter((competence: any) => isCompetenceValidated(acquis[competence.id], seuilFFE)).length;
            const domaineEchelle = isDomaineEchelle(domaine as Domaine);

            return (
              <div key={domaine} className="border-b border-gray-100 last:border-0">
                <button
                  type="button"
                  onClick={() => toggleDomaine(domaineKey)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/60 cursor-pointer border-none text-left"
                >
                  <span className="font-body text-sm font-semibold text-slate-700">{DOMAINE_LABELS[domaine as Domaine] ?? domaine}</span>
                  <span className="flex items-center gap-2">
                    <span className={`font-body text-xs font-bold ${acquisDomaine === competences.length ? "text-green-600" : "text-gray-400"}`}>
                      {acquisDomaine}/{competences.length}
                    </span>
                    {isDomaineOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  </span>
                </button>

                {isDomaineOpen && (
                  <div className="divide-y divide-gray-50">
                    {competences.map((competence: any) => {
                      const level = getCompetenceLevel(acquis[competence.id]);
                      const validated = isCompetenceValidated(acquis[competence.id], seuilFFE);

                      if (domaineEchelle) {
                        return (
                          <div key={competence.id} className={`px-4 py-3 ${level > 0 ? "bg-slate-50/40" : "bg-white"}`}>
                            <div className="flex items-start gap-3 mb-2">
                              {validated ? (
                                <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                              ) : level > 0 ? (
                                <div
                                  className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center font-body text-[9px] font-bold text-white"
                                  style={{ background: `linear-gradient(135deg, hsl(${(level - 1) * 30}, 75%, 50%), hsl(${(level - 1) * 30}, 70%, 45%))` }}
                                >
                                  {level}
                                </div>
                              ) : (
                                <Circle size={16} className="text-gray-200 flex-shrink-0 mt-0.5" />
                              )}
                              <span className={`font-body text-sm flex-1 ${validated ? "text-green-700" : level > 0 ? "text-slate-700" : "text-slate-500"}`}>
                                {competence.label}
                              </span>
                            </div>

                            <div className="flex gap-0.5 ml-7">
                              {[1, 2, 3, 4, 5].map((step) => {
                                const reached = level >= step;
                                return (
                                  <div
                                    key={step}
                                    title={`Niveau ${step} : ${echelleLabels[step - 1]}${level === step ? " (actuel)" : ""}`}
                                    className="h-1.5 flex-1 rounded-sm transition-all"
                                    style={
                                      reached
                                        ? { background: `linear-gradient(135deg, hsl(${(step - 1) * 30}, 75%, 55%), hsl(${(step - 1) * 30}, 70%, 50%))` }
                                        : { background: "#e5e7eb" }
                                    }
                                  />
                                );
                              })}
                            </div>
                            {level > 0 && <div className="ml-7 mt-1 font-body text-xs text-slate-500">{echelleLabels[level - 1]}</div>}
                          </div>
                        );
                      }

                      return (
                        <div key={competence.id} className={`flex items-start gap-3 px-4 py-3 ${validated ? "bg-green-50/40" : "bg-white"}`}>
                          {validated ? (
                            <CheckCircle2 size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Circle size={16} className="text-gray-200 flex-shrink-0 mt-0.5" />
                          )}
                          <span className={`font-body text-sm ${validated ? "text-green-700" : "text-slate-500"}`}>{competence.label}</span>
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

function JournalSeances({
  child,
  familyId,
  journalCache,
  setJournalCache,
}: {
  child: any;
  familyId: string;
  journalCache: any[] | null;
  setJournalCache: (value: any[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(10);

  const seasonStart = (() => {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}-09-01`;
  })();

  const todayString = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();

  const toggle = async () => {
    const next = !open;
    setOpen(next);

    if (next && journalCache === null && !loading) {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, "creneaux"), where("date", ">=", seasonStart), where("date", "<=", todayString)),
        );
        const familySlots = snap.docs
          .map((item) => ({ id: item.id, ...item.data() } as any))
          .filter((slot) => (slot.enrolled || []).some((entry: any) => entry.familyId === familyId));
        setJournalCache(familySlots);
      } catch (error) {
        console.error("[journal] chargement:", error);
        setJournalCache([]);
      }
      setLoading(false);
    }
  };

  const entries = (journalCache || [])
    .map((slot) => {
      const enrollment = (slot.enrolled || []).find((entry: any) => entry.childId === child.id);
      if (!enrollment) return null;
      return {
        id: slot.id,
        date: slot.date,
        title: slot.activityTitle,
        startTime: slot.startTime,
        horse: enrollment.horseName || "",
        presence: enrollment.presence || "",
        theme: (slot.notePreparation || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.date.localeCompare(a.date) || (b.startTime || "").localeCompare(a.startTime || "")) as any[];

  const podium = (() => {
    const counts: Record<string, number> = {};
    entries.forEach((entry) => {
      if (!entry.horse || entry.presence === "absent" || entry.presence === "absent_nonjustified") return;
      counts[entry.horse] = (counts[entry.horse] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  })();

  const presenceBadge = (presence: string) => {
    if (presence === "absent") return <span className="font-body text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full whitespace-nowrap">Absent</span>;
    if (presence === "absent_nonjustified") return <span className="font-body text-xs font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">Absent</span>;
    if (presence) return <span className="font-body text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full whitespace-nowrap">Présent</span>;
    return null;
  };

  return (
    <section className="mt-5">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 cursor-pointer text-left"
      >
        <span className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><BookOpen size={18} className="text-blue-600" /></span>
          <span>
            <span className="block font-body text-sm font-bold text-blue-800">Historique des séances</span>
            <span className="block font-body text-xs text-gray-600">Poneys montés, présence et thèmes travaillés</span>
          </span>
        </span>
        {open ? <ChevronDown size={17} className="text-gray-400" /> : <ChevronRight size={17} className="text-gray-400" />}
      </button>

      {open && (
        <div className="mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-blue-400"><Loader2 size={20} className="animate-spin" /></div>
          ) : entries.length === 0 ? (
            <Card padding="md" className="text-center">
              <p className="font-body text-sm text-slate-400">Aucune séance enregistrée cette saison.</p>
            </Card>
          ) : (
            <>
              {podium.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {podium.map(([horse, count], index) => (
                    <div key={horse} className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-3 py-1.5">
                      <span className="text-sm">{["🥇", "🥈", "🥉"][index]}</span>
                      <span className="font-body text-xs font-semibold text-amber-800">{horse}</span>
                      <span className="font-body text-xs text-amber-500">×{count}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {entries.slice(0, visible).map((entry: any) => (
                  <Card key={entry.id} padding="sm">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800">
                          {entry.title}
                          {entry.horse && <span className="ml-2 font-normal text-slate-600">🐴 {entry.horse}</span>}
                        </div>
                        <div className="font-body text-xs text-slate-500 mt-0.5 capitalize">
                          {new Date(`${entry.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}
                          {entry.startTime && <span className="lowercase"> · {entry.startTime}</span>}
                        </div>
                        {entry.theme && (
                          <div className="font-body text-xs text-slate-600 mt-1 italic truncate">📝 {entry.theme.length > 90 ? `${entry.theme.slice(0, 90)}…` : entry.theme}</div>
                        )}
                      </div>
                      {presenceBadge(entry.presence)}
                    </div>
                  </Card>
                ))}
              </div>

              {entries.length > visible && (
                <button
                  type="button"
                  onClick={() => setVisible((current) => current + 15)}
                  className="w-full mt-2 py-2 font-body text-xs font-semibold text-blue-500 bg-white border border-blue-100 rounded-lg cursor-pointer"
                >
                  Afficher plus ({entries.length - visible} séances restantes)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
