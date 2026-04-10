"use client";
import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, Sparkles, Plus, Trash2, Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";

// Thèmes par défaut — chargés en Firestore si vide
const THEMES_DEFAUT = [
  "Pirates",
  "Harry Potter saison 1",
  "Harry Potter saison 2",
  "Égyptiens",
  "Gaulois saison 1",
  "Gaulois saison 2",
];

interface Theme { id: string; label: string; ordre: number; }

interface Props {
  creneau: {
    id: string;
    activityTitle: string;
    date: string;
    enrolled: { childId: string; childName: string }[];
  };
  families: any[];
}

export default function ThemeSuggestion({ creneau, families }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [analyseParEnfant, setAnalyseParEnfant] = useState<any[]>([]);
  const [themesRankes, setThemesRankes] = useState<any[]>([]);
  const [newTheme, setNewTheme] = useState("");
  const [addingTheme, setAddingTheme] = useState(false);
  const [themeChoisi, setThemeChoisi] = useState<string>("");
  const [tab, setTab] = useState<"suggestion" | "detail" | "themes">("suggestion");

  // Charger les thèmes depuis Firestore
  const loadThemes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "themes-stage"), orderBy("ordre")));
      if (snap.empty) {
        // Initialiser avec les thèmes par défaut
        for (let i = 0; i < THEMES_DEFAUT.length; i++) {
          await addDoc(collection(db, "themes-stage"), { label: THEMES_DEFAUT[i], ordre: i, createdAt: serverTimestamp() });
        }
        const snap2 = await getDocs(query(collection(db, "themes-stage"), orderBy("ordre")));
        setThemes(snap2.docs.map(d => ({ id: d.id, ...d.data() } as Theme)));
      } else {
        setThemes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Theme)));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { if (open) loadThemes(); }, [open]);

  // Récupérer l'historique des thèmes de chaque enfant
  const getThemesVus = (childId: string): string[] => {
    const seen: string[] = [];
    for (const fam of families) {
      const child = (fam.children || []).find((c: any) => c.id === childId);
      if (!child) continue;
      const notes = child.peda?.notes || [];
      notes.forEach((n: any) => {
        // Les notes de type "seance" ont un activityTitle — si c'est un stage, on cherche le thème associé
        if (n.themeStage) seen.push(n.themeStage);
      });
    }
    return [...new Set(seen)];
  };

  const analyserAvecIA = async () => {
    setIaLoading(true);
    setSuggestion(null);
    try {
      const enfants = creneau.enrolled.map(e => ({
        childId: e.childId,
        childName: e.childName,
        themesVus: getThemesVus(e.childId),
      }));

      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "theme_stage",
          stageTitle: creneau.activityTitle,
          stageDate: new Date(creneau.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          enfants,
          themesDisponibles: themes.map(t => t.label),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuggestion(data.suggestion);
        setAnalyseParEnfant(data.analyseParEnfant);
        setThemesRankes(data.themesRankes);
        if (data.suggestion?.themeSuggere) setThemeChoisi(data.suggestion.themeSuggere);
      }
    } catch (e: any) { toast(`Erreur IA : ${e.message}`, "error"); }
    setIaLoading(false);
  };

  // Confirmer le thème choisi — l'enregistrer sur le créneau ET sur les notes des cavaliers
  const confirmerTheme = async () => {
    if (!themeChoisi) return;
    try {
      // 1. Mettre à jour le créneau
      await updateDoc(doc(db, "creneaux", creneau.id), {
        themeStage: themeChoisi,
        updatedAt: serverTimestamp(),
      });

      // 2. Mettre à jour les notes pédago de chaque enfant inscrit
      for (const enf of creneau.enrolled) {
        const fam = families.find((f: any) => (f.children || []).some((c: any) => c.id === enf.childId));
        if (!fam) continue;
        const child = fam.children.find((c: any) => c.id === enf.childId);
        if (!child) continue;
        const peda = child.peda || { objectifs: [], notes: [] };
        // Vérifier qu'on n'a pas déjà enregistré ce thème pour ce créneau
        if ((peda.notes || []).some((n: any) => n.creneauId === creneau.id && n.themeStage)) continue;
        const note = {
          date: new Date().toISOString(),
          text: `Stage "${creneau.activityTitle}" — Thème : ${themeChoisi}`,
          author: "Montoir (thème)",
          type: "seance",
          creneauId: creneau.id,
          activityTitle: creneau.activityTitle,
          themeStage: themeChoisi,
        };
        const updatedChildren = fam.children.map((c: any) =>
          c.id === enf.childId
            ? { ...c, peda: { ...peda, notes: [note, ...(peda.notes || [])], updatedAt: new Date().toISOString() } }
            : c
        );
        await updateDoc(doc(db, "families", fam.id), { children: updatedChildren, updatedAt: serverTimestamp() });
      }

      toast(`✅ Thème "${themeChoisi}" enregistré pour ${creneau.enrolled.length} cavalier(s)`, "success");
      setOpen(false);
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
  };

  const ajouterTheme = async () => {
    if (!newTheme.trim()) return;
    setAddingTheme(true);
    try {
      await addDoc(collection(db, "themes-stage"), { label: newTheme.trim(), ordre: themes.length, createdAt: serverTimestamp() });
      setNewTheme("");
      await loadThemes();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setAddingTheme(false);
  };

  const supprimerTheme = async (id: string, label: string) => {
    if (!confirm(`Supprimer le thème "${label}" ?`)) return;
    await deleteDoc(doc(db, "themes-stage", id));
    await loadThemes();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-purple-100 transition-colors"
      >
        <Sparkles size={13} /> Thème IA
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-blue-800">Suggestion de thème</h2>
              <p className="font-body text-xs text-slate-500">{creneau.activityTitle} · {creneau.enrolled.length} cavalier(s)</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none text-slate-500">✕</button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {[
            { id: "suggestion", label: "🎯 Suggestion" },
            { id: "detail", label: "👥 Par cavalier" },
            { id: "themes", label: "📋 Thèmes" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex-1 py-2.5 font-body text-xs font-semibold border-none cursor-pointer transition-all ${tab === t.id ? "text-purple-600 border-b-2 border-purple-500 bg-purple-50/30" : "text-slate-500 bg-white hover:bg-gray-50"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Onglet Suggestion ── */}
          {tab === "suggestion" && (
            <div className="p-5 flex flex-col gap-4">
              {loading ? (
                <div className="text-center py-8"><Loader2 size={24} className="animate-spin text-purple-500 mx-auto" /></div>
              ) : (
                <>
                  <button onClick={analyserAvecIA} disabled={iaLoading || themes.length === 0}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-body text-sm font-semibold text-white border-none cursor-pointer disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#7c3aed,#2050A0)" }}>
                    {iaLoading ? <><Loader2 size={15} className="animate-spin" /> Analyse en cours...</> : <><Sparkles size={15} /> Analyser avec l'IA</>}
                  </button>

                  {suggestion && (
                    <div className="flex flex-col gap-3">
                      {/* Thème suggéré */}
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <div className="font-body text-[10px] font-semibold text-purple-500 uppercase tracking-wider mb-1">Thème recommandé</div>
                        <div className="font-body text-lg font-bold text-purple-800">🎭 {suggestion.themeSuggere}</div>
                        <div className="font-body text-xs text-purple-600 mt-1">{suggestion.messageEquipe}</div>
                      </div>

                      {/* Ranking */}
                      {themesRankes.length > 0 && (
                        <div>
                          <div className="font-body text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Tous les thèmes</div>
                          <div className="flex flex-col gap-1">
                            {themesRankes.map((t: any) => (
                              <div key={t.theme} className={`flex items-center justify-between px-3 py-2 rounded-lg ${t.theme === suggestion.themeSuggere ? "bg-purple-50 border border-purple-200" : "bg-gray-50"}`}>
                                <span className="font-body text-xs font-semibold text-blue-800">{t.theme}</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(t.nbEnfantsPasFait / creneau.enrolled.length) * 100}%` }} />
                                  </div>
                                  <span className="font-body text-xs text-slate-500 w-16 text-right">{t.nbEnfantsPasFait}/{creneau.enrolled.length} nouveaux</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Enfants qui ont tout fait */}
                      {suggestion.enfantsDejaFaitTout?.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                          <p className="font-body text-xs text-orange-700">
                            ⚠️ <strong>{suggestion.enfantsDejaFaitTout.join(", ")}</strong> ont déjà fait tous les thèmes !
                          </p>
                        </div>
                      )}

                      {/* Choix final */}
                      <div>
                        <label className="font-body text-xs font-semibold text-blue-800 block mb-1.5">Confirmer le thème</label>
                        <select value={themeChoisi} onChange={e => setThemeChoisi(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-purple-400 mb-3">
                          <option value="">Choisir un thème...</option>
                          {themes.map(t => <option key={t.id} value={t.label}>{t.label}</option>)}
                        </select>
                        <button onClick={confirmerTheme} disabled={!themeChoisi}
                          className="w-full py-3 rounded-xl font-body text-sm font-semibold text-white bg-green-500 hover:bg-green-600 border-none cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                          <Check size={16} /> Enregistrer "{themeChoisi}" pour ce stage
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Onglet Par cavalier ── */}
          {tab === "detail" && (
            <div className="p-5 flex flex-col gap-2">
              {analyseParEnfant.length === 0 ? (
                <p className="font-body text-sm text-slate-500 text-center py-6">Lance d'abord l'analyse IA dans l'onglet Suggestion.</p>
              ) : (
                analyseParEnfant.map((e: any) => (
                  <div key={e.childId} className="border border-gray-100 rounded-xl p-3">
                    <div className="font-body text-sm font-semibold text-blue-800 mb-2">{e.childName}</div>
                    <div className="flex flex-col gap-1.5">
                      {e.themesFaits.length > 0 && (
                        <div>
                          <div className="font-body text-[9px] font-semibold text-green-600 uppercase tracking-wider mb-1">✅ Déjà faits</div>
                          <div className="flex flex-wrap gap-1">
                            {e.themesFaits.map((t: string) => (
                              <span key={t} className="font-body text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {e.themesPasFaits.length > 0 && (
                        <div>
                          <div className="font-body text-[9px] font-semibold text-purple-500 uppercase tracking-wider mb-1">🎭 Pas encore faits</div>
                          <div className="flex flex-wrap gap-1">
                            {e.themesPasFaits.map((t: string) => (
                              <span key={t} className={`font-body text-[10px] px-2 py-0.5 rounded-full ${t === suggestion?.themeSuggere ? "bg-purple-100 text-purple-700 font-semibold" : "bg-gray-100 text-slate-600"}`}>{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {e.themesFaits.length > 0 && e.themesPasFaits.length === 0 && (
                        <div className="font-body text-[10px] text-orange-500">⚠️ A déjà fait tous les thèmes !</div>
                      )}
                      {e.themesFaits.length === 0 && (
                        <div className="font-body text-[10px] text-slate-400">Aucun thème enregistré — premier stage</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Onglet Thèmes ── */}
          {tab === "themes" && (
            <div className="p-5 flex flex-col gap-3">
              <p className="font-body text-xs text-slate-500">Liste des thèmes disponibles. Ajoutez-en autant que vous voulez.</p>
              {loading ? (
                <Loader2 size={20} className="animate-spin text-purple-500 mx-auto" />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {themes.map(t => (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                      <span className="font-body text-sm text-blue-800">🎭 {t.label}</span>
                      <button onClick={() => supprimerTheme(t.id, t.label)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer bg-red-50 text-red-400 hover:bg-red-100">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Ajouter un thème */}
              <div className="flex gap-2 mt-1">
                <input value={newTheme} onChange={e => setNewTheme(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && ajouterTheme()}
                  placeholder="Ex: Vikings, Médiéval..."
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-purple-400" />
                <button onClick={ajouterTheme} disabled={!newTheme.trim() || addingTheme}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-body text-sm font-semibold text-white bg-purple-500 border-none cursor-pointer hover:bg-purple-600 disabled:opacity-50">
                  {addingTheme ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ajouter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
