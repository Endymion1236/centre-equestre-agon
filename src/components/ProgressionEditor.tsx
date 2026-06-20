"use client";
import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { GALOPS_PROGRAMME, DOMAINE_LABELS, getNiveauById, type Domaine } from "@/lib/galops-programme";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Save } from "lucide-react";
import {
  type Acquis,
  type AcquisValue,
  isDomaineEchelle,
  getCompetenceLevel,
  isCompetenceValidated,
  computeProgressionPercent,
  DEFAULT_ECHELLE_LABELS,
  DEFAULT_VALIDATED_FFE_LEVEL,
  type ProgressionLabelsSettings,
} from "@/lib/progression-helpers";

interface Props {
  childId: string;
  familyId: string;
  childName: string;
  galopLevel?: string; // niveau actuel du cavalier
  onSaved?: () => void; // callback appelé après une sauvegarde réussie (pour fermer/rediriger)
  onStats?: (stats: { pctFFE: number; pctProgression: number; totalAcquis: number; total: number }) => void; // remonte les % calculés (pour affichage compact externe)
}

export default function ProgressionEditor({ childId, familyId, childName, galopLevel, onSaved, onStats }: Props) {
  // Acquis : structure rétro-compatible, peut contenir boolean (legacy + binaire)
  // ou { level: 1-5 } (nouveau format pour pratique_*). Cf. progression-helpers.ts.
  const [acquis, setAcquis] = useState<Acquis>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedNiveau, setSelectedNiveau] = useState<string>("");
  const [expandedDomaines, setExpandedDomaines] = useState<Set<string>>(new Set(["pratique_cheval", "pratique_pied", "soins", "connaissances"]));

  // Labels échelle (chargés depuis settings/progression_labels)
  const [echelleLabels, setEchelleLabels] = useState<string[]>(DEFAULT_ECHELLE_LABELS);
  const [seuilFFE, setSeuilFFE] = useState<number>(DEFAULT_VALIDATED_FFE_LEVEL);

  const docId = `${familyId}_${childId}`;

  // Charger les labels custom une fois au montage (paramètres globaux)
  useEffect(() => {
    getDoc(doc(db, "settings", "progression_labels")).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as ProgressionLabelsSettings;
        if (Array.isArray(data.echelle) && data.echelle.length === 5) {
          setEchelleLabels(data.echelle);
        }
        if (typeof data.validatedFfe === "number") {
          setSeuilFFE(data.validatedFfe);
        }
      }
    }).catch(() => { /* fallback sur les defaults — non bloquant */ });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "progressions", docId));
        if (snap.exists()) {
          const data = snap.data();
          setAcquis(data.acquis || {});
          setSelectedNiveau(data.niveauEnCours || GALOPS_PROGRAMME[0].id);
        } else {
          // Initialiser avec le niveau actuel du cavalier
          const defaultNiveau = galopLevel && GALOPS_PROGRAMME.find(n => n.id === galopLevel)
            ? galopLevel
            : GALOPS_PROGRAMME[0].id;
          setSelectedNiveau(defaultNiveau);
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [docId, galopLevel]);

  // Toggle une compétence binaire (connaissances / soins) : true ↔ absent
  const toggle = (competenceId: string) => {
    setAcquis(prev => {
      const next = { ...prev };
      const estCoche = isCompetenceValidated(prev[competenceId], seuilFFE) || prev[competenceId] === true;
      if (estCoche) {
        // Décoche explicite : on écrit false (≠ suppression). Avec setDoc
        // merge:true, supprimer la clé ne l'effacerait PAS côté Firestore
        // (l'ancien true persisterait) → la décoche ne tenait pas au reload.
        next[competenceId] = false;
      } else {
        next[competenceId] = true;
      }
      return next;
    });
    setSaved(false);
  };

  // Set un niveau pour une compétence pratique (level: 1-5).
  // Cliquer sur le même niveau que celui actuel = remettre à 0 (decoche).
  const setLevel = (competenceId: string, level: number) => {
    setAcquis(prev => {
      const next = { ...prev };
      const currentLevel = getCompetenceLevel(prev[competenceId]);
      if (currentLevel === level) {
        // Décoche explicite : marquée false (≠ absent) pour ne pas être
        // re-validée automatiquement par les niveaux précédents.
        next[competenceId] = false;
      } else {
        next[competenceId] = { level };
      }
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    // Auto-validation des niveaux précédents : on calcule d'abord ce qui
    // serait rempli, et on demande une confirmation EXPLICITE au moniteur
    // si des compétences vont être validées automatiquement.
    const currentIdx = GALOPS_PROGRAMME.findIndex(n => n.id === selectedNiveau);
    const aValider: { id: string; domaine: string }[] = [];
    if (currentIdx > 0) {
      GALOPS_PROGRAMME.slice(0, currentIdx).forEach(niveau => {
        niveau.competences.forEach(c => {
          // Auto-valider seulement les compétences JAMAIS touchées (absentes).
          // Une compétence explicitement décochée (false) traduit un choix de
          // la monitrice → on la respecte et on ne la re-valide pas.
          if (!(c.id in acquis)) aValider.push({ id: c.id, domaine: c.domaine });
        });
      });
    }
    if (aValider.length > 0) {
      const niveauxLabels = GALOPS_PROGRAMME.slice(0, currentIdx).map(n => n.label).join(", ");
      const ok = confirm(
        `Le niveau en cours est "${GALOPS_PROGRAMME[currentIdx]?.label}".\n\n` +
        `${aValider.length} compétence(s) non évaluée(s) des niveaux précédents (${niveauxLabels}) ` +
        `seront automatiquement marquées "Acquis".\n` +
        `Les compétences déjà évaluées finement (ex. 3/5) ne seront PAS modifiées.\n\n` +
        `OK = enregistrer avec cette validation automatique\n` +
        `Annuler = ne rien enregistrer`
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // Auto-valider tous les niveaux précédents à 100%.
      // Pour les compétences pratiques, on stocke level: 5 (= acquis FFE).
      // Pour les binaires, on stocke true. Cela garantit que les niveaux
      // antérieurs comptent bien comme validés dans isCompetenceValidated.
      const enrichedAcquis: Acquis = { ...acquis };
      aValider.forEach(({ id, domaine }) => {
        enrichedAcquis[id] = isDomaineEchelle(domaine as any) ? { level: 5 } : true;
      });

      await setDoc(doc(db, "progressions", docId), {
        childId, familyId, childName,
        niveauEnCours: selectedNiveau,
        acquis: enrichedAcquis,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setAcquis(enrichedAcquis);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const niveau = getNiveauById(selectedNiveau);

  // Remonter les stats au parent (affichage compact dans un en-tête externe).
  // Placé AVANT tout return conditionnel (règles des Hooks). Recalcule en interne
  // avec gardes pour ne pas dépendre de variables calculées plus bas.
  useEffect(() => {
    if (loading || !niveau) return;
    const nbValid = niveau.competences.filter(c => isCompetenceValidated(acquis[c.id], seuilFFE)).length;
    const total = niveau.competences.length || 1;
    const pFFE = Math.round((nbValid / total) * 100);
    const pProg = computeProgressionPercent(niveau.competences, acquis);
    onStats?.({ pctFFE: pFFE, pctProgression: pProg, totalAcquis: nbValid, total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNiveau, acquis, seuilFFE, loading]);

  if (!niveau) return null;

  // Grouper les compétences par domaine
  const parDomaine = niveau.competences.reduce((acc, c) => {
    if (!acc[c.domaine]) acc[c.domaine] = [];
    acc[c.domaine].push(c);
    return acc;
  }, {} as Record<string, typeof niveau.competences>);

  // Compter via isCompetenceValidated pour gérer correctement boolean + level.
  // Une compétence pratique compte comme "validée" si son level >= seuilFFE.
  const totalAcquis = niveau.competences.filter(c => isCompetenceValidated(acquis[c.id], seuilFFE)).length;
  const pctFFE = Math.round((totalAcquis / niveau.competences.length) * 100);
  // Progression globale : sur l'échelle 1-5 chaque compétence apporte un score continu.
  const pctProgression = computeProgressionPercent(niveau.competences, acquis);

  if (loading) return <div className="text-center py-4 text-sm text-slate-400">Chargement...</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Sélecteur de niveau */}
      <div>
        <label className="font-body text-xs font-semibold text-slate-600 block mb-2">Niveau en cours</label>
        <select
          value={selectedNiveau}
          onChange={e => { setSelectedNiveau(e.target.value); setSaved(false); }}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:border-blue-500 focus:outline-none bg-white"
        >
          <optgroup label="Galops Poneys — Cycle 1">
            {GALOPS_PROGRAMME.filter(n => n.cycle === "poneys_1").map(n => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </optgroup>
          <optgroup label="Galops Poneys — Cycle 2">
            {GALOPS_PROGRAMME.filter(n => n.cycle === "poneys_2").map(n => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </optgroup>
          <optgroup label="Galops Cavaliers">
            {GALOPS_PROGRAMME.filter(n => n.cycle === "cavaliers").map(n => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Barre de progression : double indicateur (Validé FFE + Progression globale) */}
      <div className="bg-white rounded-xl border border-gray-100 p-3">
        <div className="flex justify-between items-start mb-1.5 gap-3">
          <span className="font-body text-xs text-slate-600 flex-1">{niveau.description}</span>
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-body text-xs font-bold text-blue-600">{totalAcquis}/{niveau.competences.length} — {pctFFE}% <span className="text-[10px] font-normal text-slate-400">validé FFE</span></span>
            <span className="font-body text-[11px] text-blue-400">{pctProgression}% <span className="text-[9px] text-slate-400">progression</span></span>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-green-400 transition-all duration-500"
            style={{ width: `${pctFFE}%` }}
          />
        </div>
        {/* Barre fine secondaire = progression globale (montre l'effort en cours) */}
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-blue-300 transition-all duration-500"
            style={{ width: `${pctProgression}%` }}
          />
        </div>
      </div>

      {/* Compétences par domaine */}
      {Object.entries(parDomaine).map(([domaine, comps]) => {
        const isOpen = expandedDomaines.has(domaine);
        const acquisDomaine = comps.filter(c => isCompetenceValidated(acquis[c.id], seuilFFE)).length;
        return (
          <div key={domaine} className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => {
                const next = new Set(expandedDomaines);
                isOpen ? next.delete(domaine) : next.add(domaine);
                setExpandedDomaines(next);
              }}
              className="w-full flex items-center justify-between p-3 bg-gray-50 cursor-pointer border-none text-left"
            >
              <span className="font-body text-sm font-semibold text-slate-700">
                {DOMAINE_LABELS[domaine as Domaine] ?? domaine}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-body text-xs text-slate-500">{acquisDomaine}/{comps.length}</span>
                {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              </div>
            </button>
            {isOpen && (
              <div className="divide-y divide-gray-50">
                {comps.map(c => {
                  const isEchelle = isDomaineEchelle(c.domaine);
                  const level = getCompetenceLevel(acquis[c.id]);
                  const validated = isCompetenceValidated(acquis[c.id], seuilFFE);

                  if (isEchelle) {
                    // ─── Compétence pratique : échelle 1-5 ───────────────────
                    return (
                      <div key={c.id} className={`p-3 ${level > 0 ? "bg-slate-50/40" : "bg-white"}`}>
                        <div className="flex items-start gap-3 mb-2">
                          {validated
                            ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                            : level > 0
                              ? <div className="w-[18px] h-[18px] rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center font-body text-[10px] font-bold text-white"
                                  style={{ background: `linear-gradient(135deg, hsl(${(level - 1) * 30}, 75%, 50%), hsl(${(level - 1) * 30}, 70%, 45%))` }}>
                                  {level}
                                </div>
                              : <Circle size={18} className="text-gray-300 flex-shrink-0 mt-0.5" />
                          }
                          <span className={`font-body text-sm flex-1 ${validated ? "text-green-700" : level > 0 ? "text-slate-700" : "text-slate-500"}`}>
                            {c.label}
                          </span>
                        </div>
                        {/* Échelle 1-5 cliquable */}
                        <div className="flex gap-1 ml-7">
                          {[1, 2, 3, 4, 5].map(n => {
                            const isSelected = level === n;
                            const isFFE = n >= seuilFFE;
                            return (
                              <button
                                key={n}
                                onClick={() => setLevel(c.id, n)}
                                title={`${echelleLabels[n - 1]}${isFFE ? " (validé FFE)" : ""}`}
                                className={`flex-1 py-1.5 rounded-md font-body text-[11px] font-semibold cursor-pointer transition-all border ${
                                  isSelected
                                    ? "text-white border-transparent"
                                    : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"
                                }`}
                                style={isSelected ? { background: `linear-gradient(135deg, hsl(${(n - 1) * 30}, 75%, 50%), hsl(${(n - 1) * 30}, 70%, 45%))` } : {}}
                              >
                                {n} · {echelleLabels[n - 1]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // ─── Compétence binaire (connaissances / soins) ────────────
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c.id)}
                      className={`w-full flex items-start gap-3 p-3 cursor-pointer border-none text-left transition-colors ${validated ? "bg-green-50" : "bg-white hover:bg-gray-50"}`}
                    >
                      {validated
                        ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                        : <Circle size={18} className="text-gray-300 flex-shrink-0 mt-0.5" />
                      }
                      <span className={`font-body text-sm ${validated ? "text-green-700 line-through" : "text-slate-700"}`}>
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Bouton sauvegarder */}
      <button
        onClick={save}
        disabled={saving}
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-body text-sm font-semibold border-none cursor-pointer transition-all ${
          saved ? "bg-green-500 text-white" :
          saving ? "bg-gray-200 text-slate-500" :
          "bg-blue-500 text-white hover:bg-blue-600"
        }`}
      >
        <Save size={15} />
        {saved ? "✅ Sauvegardé !" : saving ? "Sauvegarde..." : "Enregistrer la progression"}
      </button>

      {/* ── Note / commentaire du moniteur (en fin de bilan, inclus dans le PDF)
            avec analyse IA de la note dictée ── */}
      <NoteMoniteur childId={childId} familyId={familyId} childName={childName} galopLevel={galopLevel} />
    </div>
  );
}

function NoteMoniteur({ childId, familyId, childName, galopLevel }: { childId: string; familyId: string; childName: string; galopLevel?: string }) {
  const [noteText, setNoteText] = useState("");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Charger les notes récentes.
  // Filtre : on exclut les notes automatiques du Montoir (type "seance" —
  // clôture de séance "Poney : XXX" ou thème de stage). Elles n'ont pas de
  // valeur pédagogique pour un bilan de progression, et polluaient l'affichage
  // en prenant les 3 slots réservés aux vraies notes du moniteur.
  // On garde : notes libres (sans type) + bilans IA (type "bilan_ia").
  useEffect(() => {
    (async () => {
      try {
        const famDoc = await getDoc(doc(db, "families", familyId));
        if (famDoc.exists()) {
          const child = ((famDoc.data() as any).children || []).find((c: any) => c.id === childId);
          const allNotes = child?.peda?.notes || [];
          const pedaNotes = allNotes.filter((n: any) => n.type !== "seance");
          setRecentNotes(pedaNotes.slice(0, 3));
        }
      } catch (e) { console.error(e); }
    })();
  }, [familyId, childId]);

  const startRecording = async () => {
    try {
      // Vérifier que MediaRecorder est disponible
      if (typeof MediaRecorder === "undefined") {
        setNoteText(prev => prev + " [Enregistrement non supporté sur ce navigateur]");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Choisir un format supporté (ordre de préférence pour compatibilité Whisper)
      let mimeType = "";
      for (const mt of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/wav", ""]) {
        if (!mt || MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
      }
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const actualType = mediaRecorder.mimeType || mimeType || "audio/mp4";
        // Déterminer l'extension correcte pour Whisper
        let ext = "webm";
        if (actualType.includes("mp4") || actualType.includes("aac") || actualType.includes("m4a")) ext = "m4a";
        else if (actualType.includes("wav")) ext = "wav";
        else if (actualType.includes("webm")) ext = "webm";
        else ext = "mp4"; // fallback safe pour iOS
        const blob = new Blob(chunks, { type: actualType });
        await transcribeAndProcess(blob, ext);
      };
      mediaRecorder.start(1000); // chunks every second for reliability
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = chunks;
      setRecording(true);
    } catch (e: any) {
      console.error("Micro non disponible:", e);
      setNoteText(prev => prev + ` [Micro: ${e.message || "non disponible"}]`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const transcribeAndProcess = async (blob: Blob, ext: string = "webm") => {
    setProcessing(true);
    try {
      // 1. Transcrire avec Whisper
      const formData = new FormData();
      formData.append("audio", blob, `note.${ext}`);

      const token = await (await import("firebase/auth")).getAuth().currentUser?.getIdToken();
      const transRes = await fetch("/api/whisper", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!transRes.ok) {
        const errData = await transRes.json().catch(() => ({}));
        console.error("Whisper error:", transRes.status, errData);
        setNoteText(prev => prev + ` [Erreur: ${errData.error || transRes.status}]`);
        setProcessing(false);
        return;
      }
      const transData = await transRes.json();
      const transcript = transData.text;
      setRawTranscript(transcript); // matière première pour l'analyse IA

      // 2. Reformuler avec l'IA pour que ce soit un joli commentaire
      const iaRes = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "assistant",
          question: `Reformule ce commentaire oral d'un moniteur d'équitation en un message encourageant et professionnel pour les parents d'un cavalier.
Le cavalier s'appelle ${childName}.
Commentaire dicté : "${transcript}"

Règles :
- Garde les points positifs et les axes d'amélioration mentionnés
- Ton chaleureux et encourageant, adapté aux familles
- 3 à 5 phrases maximum
- Ne mets pas de formule de politesse (pas de "Bonjour" ni "Cordialement")
- Commence directement par le bilan

Réponds uniquement avec le texte reformulé, sans guillemets.`,
          context: { _systemOverride: "Tu es moniteur d'équitation au Centre Équestre d'Agon-Coutainville." },
        }),
      });

      if (iaRes.ok) {
        const data = await iaRes.json();
        setNoteText(data.answer || data.response || transcript);
      } else {
        setNoteText(transcript);
      }
    } catch (e) {
      console.error("Erreur transcription/IA:", e);
    }
    setProcessing(false);
  };

  // toggleFeatured / deleteNote : on matche par DATE (unique en pratique car
  // créée par new Date().toISOString() au moment de l'écriture) au lieu de
  // l'index. Raison : recentNotes est filtré (notes de type "seance" exclues)
  // donc l'index dans recentNotes ne correspond plus à l'index dans peda.notes.
  const toggleFeatured = async (idx: number) => {
    const target = recentNotes[idx];
    if (!target) return;
    try {
      const famDoc = await getDoc(doc(db, "families", familyId));
      if (!famDoc.exists()) return;
      const famData = famDoc.data() as any;
      const updatedChildren = (famData.children || []).map((c: any) => {
        if (c.id !== childId) return c;
        const peda = c.peda || { objectifs: [], notes: [] };
        // Retirer featured de toutes les notes, mettre sur celle cliquée (toggle)
        const updatedNotes = peda.notes.map((n: any) => ({
          ...n,
          featured: n.date === target.date ? !n.featured : false,
        }));
        return { ...c, peda: { ...peda, notes: updatedNotes } };
      });
      await setDoc(doc(db, "families", familyId), { ...famData, children: updatedChildren, updatedAt: serverTimestamp() }, { merge: true });
      // Mettre à jour localement (même filtre/indexation qu'à l'affichage)
      setRecentNotes(prev => prev.map(n => ({ ...n, featured: n.date === target.date ? !n.featured : false })));
    } catch (e) { console.error(e); }
  };

  const deleteNote = async (idx: number) => {
    const target = recentNotes[idx];
    if (!target) return;
    if (!confirm("Supprimer cette note ?")) return;
    try {
      const famDoc = await getDoc(doc(db, "families", familyId));
      if (!famDoc.exists()) return;
      const famData = famDoc.data() as any;
      const updatedChildren = (famData.children || []).map((c: any) => {
        if (c.id !== childId) return c;
        const peda = c.peda || { objectifs: [], notes: [] };
        const updatedNotes = peda.notes.filter((n: any) => n.date !== target.date);
        return { ...c, peda: { ...peda, notes: updatedNotes } };
      });
      await setDoc(doc(db, "families", familyId), { ...famData, children: updatedChildren, updatedAt: serverTimestamp() }, { merge: true });
      setRecentNotes(prev => prev.filter(n => n.date !== target.date));
    } catch (e) { console.error(e); }
  };

  // Prévenir la famille par email : la note devient alors la note ⭐ visible
  // dans l'espace famille (sinon l'email annoncerait un mot... invisible).
  const [notifyFamily, setNotifyFamily] = useState(false);

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const famDoc = await getDoc(doc(db, "families", familyId));
      if (famDoc.exists()) {
        const famData = famDoc.data() as any;
        const noteDate = new Date().toISOString();
        const updatedChildren = (famData.children || []).map((c: any) => {
          if (c.id !== childId) return c;
          const peda = c.peda || { objectifs: [], notes: [] };
          const newNote = {
            date: noteDate,
            text: noteText.trim(),
            author: "moniteur",
            activity: "Bilan progression",
            // Si on prévient la famille, cette note devient LA note visible (⭐)
            ...(notifyFamily ? { featured: true } : {}),
          };
          const anciennes = notifyFamily
            ? (peda.notes || []).map((n: any) => ({ ...n, featured: false }))
            : (peda.notes || []);
          return { ...c, peda: { ...peda, notes: [newNote, ...anciennes], updatedAt: new Date().toISOString() } };
        });
        await setDoc(doc(db, "families", familyId), { ...famData, children: updatedChildren, updatedAt: serverTimestamp() }, { merge: true });

        // Email optionnel à la famille (non bloquant)
        if (notifyFamily && famData.parentEmail) {
          authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: famData.parentEmail,
              subject: `💬 Un mot du moniteur pour ${childName}`,
              context: "admin_note_moniteur",
              familyId,
              html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                <p>Bonjour <strong>${famData.parentName || ""}</strong>,</p>
                <p>Le moniteur a laissé un mot à propos de <strong>${childName}</strong> :</p>
                <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin:16px 0;font-style:italic;color:#6b21a8;">
                  ${noteText.trim().replace(/\n/g, "<br/>")}
                </div>
                <p style="color:#555;font-size:13px;">Retrouvez ce mot et la progression complète dans votre espace famille, rubrique Progression.</p>
                <p style="color:#666;font-size:12px;">À bientôt au centre équestre !</p>
              </div>`,
            }),
          }).catch(e => console.warn("Email note moniteur:", e));
        }

        setRecentNotes(prev => [
          { date: noteDate, text: noteText.trim(), activity: "Bilan progression", ...(notifyFamily ? { featured: true } : {}) },
          ...prev.map(n => notifyFamily ? { ...n, featured: false } : n),
        ].slice(0, 3));
        setNoteText("");
        setNotifyFamily(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const [expandedNoteIdx, setExpandedNoteIdx] = useState<number | null>(null);

  // ── Analyse IA de la note dictée ──
  // rawTranscript = transcription brute de la dernière dictée (plus riche que
  // le texte reformulé) ; à défaut, on analyse le texte saisi dans la note.
  const [rawTranscript, setRawTranscript] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [motParents, setMotParents] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState("");

  const analyserNote = async () => {
    const matiere = (rawTranscript || noteText).trim();
    if (!matiere) return;
    setAnalysing(true); setAnalysis(""); setMotParents(null); setAnalysisError("");
    try {
      const token = await (await import("firebase/auth")).getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: "analyse_progression",
          child: { firstName: childName, galopLevel },
          noteVocale: matiere,
          notesRecentes: recentNotes.map(n => n.text).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.analysis) throw new Error(data.error || "Réponse vide");
      setAnalysis(data.analysis);
      setMotParents(data.motParents || null);
    } catch (e: any) {
      setAnalysisError(e.message || "Erreur lors de l'analyse");
    }
    setAnalysing(false);
  };

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
      <div className="font-body text-xs font-semibold text-purple-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        💬 Note pour {childName}
      </div>

      {/* Zone de texte */}
      <textarea
        value={noteText}
        onChange={e => setNoteText(e.target.value)}
        placeholder={`Félicitations, axes d'amélioration, encouragements pour ${childName}...`}
        rows={3}
        className="w-full px-3 py-2 rounded-lg border border-purple-200 font-body text-sm bg-white focus:outline-none focus:border-purple-400 resize-y mb-3"
      />

      {/* Boutons */}
      <div className="flex gap-2 flex-wrap mb-3">
        {!recording ? (
          <button onClick={startRecording} disabled={processing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-purple-700 bg-white border border-purple-200 cursor-pointer hover:bg-purple-100 disabled:opacity-40">
            🎙️ Dicter
          </button>
        ) : (
          <button onClick={stopRecording}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-white bg-red-500 border-none cursor-pointer animate-pulse">
            ⏹️ Arrêter
          </button>
        )}
        {processing && (
          <span className="flex items-center gap-1.5 font-body text-xs text-purple-500">
            <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            Analyse IA...
          </span>
        )}
        <button onClick={analyserNote} disabled={analysing || (!rawTranscript && !noteText.trim())}
          title="Analyse IA de la note : points forts, axes de travail, mot aux parents"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 cursor-pointer hover:bg-indigo-50 disabled:opacity-40">
          {analysing ? "✨ Analyse…" : "✨ Analyser"}
        </button>
        <div className="flex-1" />
        <button onClick={saveNote} disabled={saving || !noteText.trim()}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${saved ? "bg-green-500 text-white" : "bg-purple-500 text-white hover:bg-purple-400"} disabled:opacity-40`}>
          {saved ? "✅ Enregistrée !" : saving ? "Enregistrement..." : "💾 Enregistrer la note"}
        </button>
      </div>

      {/* Notification famille + rappel visibilité */}
      <label className="flex items-start gap-2 mb-1 cursor-pointer">
        <input type="checkbox" checked={notifyFamily} onChange={e => setNotifyFamily(e.target.checked)}
          className="accent-purple-500 w-3.5 h-3.5 mt-0.5" />
        <span className="font-body text-[11px] text-purple-700">
          Prévenir la famille par email — la note devient alors le mot visible (⭐) dans leur espace
        </span>
      </label>
      <p className="font-body text-[10px] text-purple-400 mb-3">
        Sans cette case, la note est simplement enregistrée au dossier : utilisez ⭐ ci-dessous pour la rendre visible côté famille et dans le bilan PDF.
      </p>

      {/* Résultat de l'analyse IA de la note dictée */}
      {analysisError && <p className="font-body text-xs text-red-500 mb-3">{analysisError}</p>}
      {analysis && (
        <div className="bg-white border border-indigo-200 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-body text-[10px] font-semibold text-indigo-500 uppercase tracking-wider">
              ✨ Analyse de la note {rawTranscript ? "dictée" : "saisie"}
            </div>
            <button onClick={() => { setAnalysis(""); setMotParents(null); }}
              title="Supprimer l'analyse (elle n'est jamais enregistrée)"
              className="font-body text-xs text-indigo-400 bg-transparent border-none cursor-pointer hover:text-indigo-600 px-1">
              ✕
            </button>
          </div>
          <div className="font-body text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {analysis.split(/\*\*(.*?)\*\*/g).map((part, i) =>
              i % 2 === 1 ? <strong key={i} className="text-indigo-800">{part}</strong> : part
            )}
          </div>
          <div className="flex gap-2 justify-end mt-2 flex-wrap">
            {motParents && (
              <button onClick={() => { setNoteText(motParents); setAnalysis(""); setMotParents(null); }}
                className="font-body text-[11px] font-semibold text-white bg-indigo-500 border-none rounded-lg px-3 py-1.5 cursor-pointer hover:bg-indigo-600">
                ✏️ Utiliser le mot aux parents dans la note
              </button>
            )}
            <button onClick={async () => { try { await navigator.clipboard.writeText(analysis); } catch {} }}
              className="font-body text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-indigo-100">
              📋 Copier
            </button>
          </div>
        </div>
      )}

      {/* Notes récentes — sélectionner celle qui apparaît dans le bilan */}
      {recentNotes.length > 0 && (
        <div>
          <div className="font-body text-[10px] text-purple-400 font-semibold mb-1.5">
            Notes précédentes — cliquez dessus pour voir le détail, ⭐ pour choisir celle du bilan PDF
          </div>
          {recentNotes.map((n: any, i: number) => {
            const isExpanded = expandedNoteIdx === i;
            return (
              <div key={i} className={`rounded px-2 py-1.5 mb-1 border ${n.featured ? "bg-purple-50 border-purple-300" : "bg-white border-purple-100"}`}>
                <div className="flex items-start gap-2 font-body text-xs text-slate-600">
                  <button onClick={() => toggleFeatured(i)}
                    className="bg-transparent border-none cursor-pointer p-0 text-sm flex-shrink-0 mt-0.5"
                    title={n.featured ? "Retirer du bilan" : "Afficher dans le bilan PDF"}>
                    {n.featured ? "⭐" : "☆"}
                  </button>
                  <button
                    onClick={() => setExpandedNoteIdx(isExpanded ? null : i)}
                    className="flex-1 bg-transparent border-none text-left cursor-pointer p-0 font-body text-xs"
                    title={isExpanded ? "Masquer" : "Voir le détail"}>
                    <span className="text-purple-400">{new Date(n.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                    {" — "}
                    <span className={isExpanded ? "text-slate-700" : "text-slate-500 line-clamp-2"}>
                      {n.text}
                    </span>
                  </button>
                  <button onClick={() => deleteNote(i)}
                    className="bg-transparent border-none cursor-pointer p-0 text-red-300 hover:text-red-500 flex-shrink-0 mt-0.5 text-sm"
                    title="Supprimer cette note">
                    ✕
                  </button>
                </div>
                {isExpanded && (
                  <div className="mt-2 pl-6 flex flex-col gap-2">
                    {n.activity && (
                      <div className="font-body text-[10px] text-purple-400">
                        Activité : {n.activity}
                      </div>
                    )}
                    <div className="font-body text-sm text-slate-700 whitespace-pre-wrap bg-white rounded-lg p-2 border border-purple-100">
                      {n.text || <span className="text-slate-400 italic">(note vide)</span>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setNoteText(n.text || "");
                          setExpandedNoteIdx(null);
                          // Scroll vers le haut pour voir le champ de saisie
                          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="font-body text-[11px] text-purple-700 bg-white border border-purple-300 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-purple-100">
                        ✏️ Reprendre ce texte
                      </button>
                      <button
                        onClick={() => setExpandedNoteIdx(null)}
                        className="font-body text-[11px] text-slate-500 bg-transparent border-none cursor-pointer px-2 py-1.5">
                        Fermer
                      </button>
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
