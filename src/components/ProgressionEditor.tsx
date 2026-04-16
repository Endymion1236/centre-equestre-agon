"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { GALOPS_PROGRAMME, DOMAINE_LABELS, getNiveauById, type Domaine } from "@/lib/galops-programme";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Save } from "lucide-react";

interface Props {
  childId: string;
  familyId: string;
  childName: string;
  galopLevel?: string; // niveau actuel du cavalier
}

export default function ProgressionEditor({ childId, familyId, childName, galopLevel }: Props) {
  const [acquis, setAcquis] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedNiveau, setSelectedNiveau] = useState<string>("");
  const [expandedDomaines, setExpandedDomaines] = useState<Set<string>>(new Set(["pratique_cheval", "pratique_pied", "soins", "connaissances"]));

  const docId = `${familyId}_${childId}`;

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

  const toggle = (competenceId: string) => {
    setAcquis(prev => ({ ...prev, [competenceId]: !prev[competenceId] }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Auto-valider tous les niveaux précédents à 100%
      const currentIdx = GALOPS_PROGRAMME.findIndex(n => n.id === selectedNiveau);
      const enrichedAcquis = { ...acquis };
      if (currentIdx > 0) {
        GALOPS_PROGRAMME.slice(0, currentIdx).forEach(niveau => {
          niveau.competences.forEach(c => {
            enrichedAcquis[c.id] = true;
          });
        });
      }

      await setDoc(doc(db, "progressions", docId), {
        childId, familyId, childName,
        niveauEnCours: selectedNiveau,
        acquis: enrichedAcquis,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setAcquis(enrichedAcquis);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const niveau = getNiveauById(selectedNiveau);
  if (!niveau) return null;

  // Grouper les compétences par domaine
  const parDomaine = niveau.competences.reduce((acc, c) => {
    if (!acc[c.domaine]) acc[c.domaine] = [];
    acc[c.domaine].push(c);
    return acc;
  }, {} as Record<string, typeof niveau.competences>);

  const totalAcquis = niveau.competences.filter(c => acquis[c.id]).length;
  const pct = Math.round((totalAcquis / niveau.competences.length) * 100);

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

      {/* Barre de progression */}
      <div className="bg-white rounded-xl border border-gray-100 p-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="font-body text-xs text-slate-600">{niveau.description}</span>
          <span className="font-body text-xs font-bold text-blue-600">{totalAcquis}/{niveau.competences.length} — {pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-green-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Compétences par domaine */}
      {Object.entries(parDomaine).map(([domaine, comps]) => {
        const isOpen = expandedDomaines.has(domaine);
        const acquisDomaine = comps.filter(c => acquis[c.id]).length;
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
                {comps.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`w-full flex items-start gap-3 p-3 cursor-pointer border-none text-left transition-colors ${acquis[c.id] ? "bg-green-50" : "bg-white hover:bg-gray-50"}`}
                  >
                    {acquis[c.id]
                      ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                      : <Circle size={18} className="text-gray-300 flex-shrink-0 mt-0.5" />
                    }
                    <span className={`font-body text-sm ${acquis[c.id] ? "text-green-700 line-through" : "text-slate-700"}`}>
                      {c.label}
                    </span>
                  </button>
                ))}
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

      {/* ── Note / commentaire du moniteur (en fin de bilan, inclus dans le PDF) ── */}
      <NoteMoniteur childId={childId} familyId={familyId} childName={childName} />
    </div>
  );
}

// ── Composant Note Moniteur (texte + vocal + IA) ────────────────────────────
function NoteMoniteur({ childId, familyId, childName }: { childId: string; familyId: string; childName: string }) {
  const [noteText, setNoteText] = useState("");
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const mediaRecorderRef = useState<MediaRecorder | null>(null);
  const chunksRef = useState<Blob[]>([]);

  // Charger les notes récentes
  useEffect(() => {
    (async () => {
      try {
        const famDoc = await getDoc(doc(db, "families", familyId));
        if (famDoc.exists()) {
          const child = ((famDoc.data() as any).children || []).find((c: any) => c.id === childId);
          setRecentNotes(child?.peda?.notes?.slice(0, 3) || []);
        }
      } catch (e) { console.error(e); }
    })();
  }, [familyId, childId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        await transcribeAndProcess(blob);
      };
      mediaRecorder.start();
      mediaRecorderRef[1](mediaRecorder);
      chunksRef[1](chunks);
      setRecording(true);
    } catch (e) {
      console.error("Micro non disponible:", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef[0]) {
      mediaRecorderRef[0].stop();
      setRecording(false);
    }
  };

  const transcribeAndProcess = async (blob: Blob) => {
    setProcessing(true);
    try {
      // 1. Transcrire avec Whisper
      const formData = new FormData();
      formData.append("audio", blob, "note.webm");

      const token = await (await import("firebase/auth")).getAuth().currentUser?.getIdToken();
      const transRes = await fetch("/api/whisper", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!transRes.ok) {
        setNoteText(prev => prev + " [Erreur transcription]");
        setProcessing(false);
        return;
      }
      const { text: transcript } = await transRes.json();

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

  const toggleFeatured = async (idx: number) => {
    try {
      const famDoc = await getDoc(doc(db, "families", familyId));
      if (!famDoc.exists()) return;
      const famData = famDoc.data() as any;
      const updatedChildren = (famData.children || []).map((c: any) => {
        if (c.id !== childId) return c;
        const peda = c.peda || { objectifs: [], notes: [] };
        // Retirer featured de toutes les notes, mettre sur celle cliquée (toggle)
        const updatedNotes = peda.notes.map((n: any, i: number) => ({
          ...n,
          featured: i === idx ? !n.featured : false,
        }));
        return { ...c, peda: { ...peda, notes: updatedNotes } };
      });
      await setDoc(doc(db, "families", familyId), { ...famData, children: updatedChildren, updatedAt: serverTimestamp() }, { merge: true });
      // Mettre à jour localement
      setRecentNotes(prev => prev.map((n, i) => ({ ...n, featured: i === idx ? !n.featured : false })));
    } catch (e) { console.error(e); }
  };

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const famDoc = await getDoc(doc(db, "families", familyId));
      if (famDoc.exists()) {
        const famData = famDoc.data() as any;
        const updatedChildren = (famData.children || []).map((c: any) => {
          if (c.id !== childId) return c;
          const peda = c.peda || { objectifs: [], notes: [] };
          const newNote = {
            date: new Date().toISOString(),
            text: noteText.trim(),
            author: "moniteur",
            activity: "Bilan progression",
          };
          return { ...c, peda: { ...peda, notes: [newNote, ...peda.notes], updatedAt: new Date().toISOString() } };
        });
        await setDoc(doc(db, "families", familyId), { ...famData, children: updatedChildren, updatedAt: serverTimestamp() }, { merge: true });
        setRecentNotes(prev => [{ date: new Date().toISOString(), text: noteText.trim(), activity: "Bilan progression" }, ...prev].slice(0, 3));
        setNoteText("");
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
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
        <div className="flex-1" />
        <button onClick={saveNote} disabled={saving || !noteText.trim()}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-body text-xs font-semibold border-none cursor-pointer ${saved ? "bg-green-500 text-white" : "bg-purple-500 text-white hover:bg-purple-400"} disabled:opacity-40`}>
          {saved ? "✅ Envoyé !" : saving ? "Envoi..." : "📤 Envoyer la note"}
        </button>
      </div>

      {/* Notes récentes — sélectionner celle qui apparaît dans le bilan */}
      {recentNotes.length > 0 && (
        <div>
          <div className="font-body text-[10px] text-purple-400 font-semibold mb-1.5">Notes précédentes — cliquez sur ⭐ pour choisir celle du bilan PDF</div>
          {recentNotes.map((n: any, i: number) => (
            <div key={i} className={`flex items-start gap-2 font-body text-[10px] text-slate-500 rounded px-2 py-1.5 mb-1 border ${n.featured ? "bg-purple-50 border-purple-300" : "bg-white border-purple-100"}`}>
              <button onClick={() => toggleFeatured(i)}
                className="bg-transparent border-none cursor-pointer p-0 text-sm flex-shrink-0 mt-0.5"
                title={n.featured ? "Retirer du bilan" : "Afficher dans le bilan PDF"}>
                {n.featured ? "⭐" : "☆"}
              </button>
              <div className="flex-1">
                <span className="text-purple-400">{new Date(n.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                {" — "}{n.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
