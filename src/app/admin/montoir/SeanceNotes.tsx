"use client";
import { useState, useEffect, useRef } from "react";
import { collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { Mic, MicOff, Loader2, Trash2, ChevronDown, ChevronUp, Check, FileText, X, Eye, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  creneau: any;
  onChanged?: () => void;
}

export default function SeanceNotes({ creneau, onChanged }: Props) {
  const [open, setOpen] = useState(false);

  // Note de PRÉPARATION (champ sur le créneau)
  const [prep, setPrep] = useState<string>(creneau.notePreparation || "");
  const [prepSaving, setPrepSaving] = useState(false);
  const [prepSaved, setPrepSaved] = useState(false);

  // Notes de FIN DE SÉANCE (journal notes-seance)
  const [journal, setJournal] = useState<any[]>([]);
  const [fin, setFin] = useState("");
  const [finSaving, setFinSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // Plan de séance (fichier joint sur le créneau)
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const planUrl: string | null = creneau.planSeanceUrl || null;
  const planType: string = creneau.planSeanceType || "";
  const planIsPdf = /pdf/i.test(planType) || /\.pdf($|\?)/i.test(planUrl || "");

  useEffect(() => { setPrep(creneau.notePreparation || ""); }, [creneau.id, creneau.notePreparation]);

  useEffect(() => { if (lightbox) setZoom(1); }, [lightbox]);

  const loadJournal = () => {
    getDocs(query(collection(db, "notes-seance"), where("creneauId", "==", creneau.id)))
      .then(s => {
        const items = s.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setJournal(items);
      })
      .catch(() => setJournal([]));
  };
  // Charge le journal seulement quand on ouvre le panneau
  useEffect(() => { if (open) loadJournal(); /* eslint-disable-next-line */ }, [open, creneau.id]);

  const savePrep = async () => {
    setPrepSaving(true);
    try {
      await updateDoc(doc(db, "creneaux", creneau.id), {
        notePreparation: prep.trim() || null,
        notePreparationUpdatedAt: new Date().toISOString(),
      });
      setPrepSaved(true); setTimeout(() => setPrepSaved(false), 2000);
      onChanged?.();
    } catch (e) { console.error("savePrep:", e); alert("Erreur lors de l'enregistrement de la préparation."); }
    setPrepSaving(false);
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        const file = new File([blob], "note.webm", { type: blob.type });
        setTranscribing(true);
        try {
          const fd = new FormData(); fd.append("audio", file);
          const res = await authFetch("/api/whisper", { method: "POST", body: fd });
          const data = await res.json();
          if (data.success) setFin(prev => (prev ? prev.trim() + " " : "") + data.text);
          else alert("Erreur transcription : " + (data.error || "inconnue"));
        } catch (e: any) { alert("Erreur transcription : " + e.message); }
        setTranscribing(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) { alert("Micro indisponible : " + e.message); }
  };
  const stopRec = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setRecording(false);
  };

  const saveFin = async () => {
    const texte = fin.trim();
    if (!texte) return;
    setFinSaving(true);
    try {
      await addDoc(collection(db, "notes-seance"), {
        creneauId: creneau.id,
        texte,
        planSeanceUrl: creneau.planSeanceUrl || null,
        planSeancePath: creneau.planSeancePath || null,
        planSeanceType: creneau.planSeanceType || null,
        createdAt: serverTimestamp(),
        createdByEmail: auth.currentUser?.email || null,
        createdByName: auth.currentUser?.displayName || null,
        creneauDate: creneau.date,
        creneauActivityTitle: creneau.activityTitle,
        creneauMonitor: creneau.monitor,
      });
      setFin("");
      loadJournal();
      onChanged?.();
    } catch (e) { console.error("saveFin:", e); alert("Erreur lors de l'enregistrement de la note."); }
    setFinSaving(false);
  };

  const deleteJournal = async (id: string) => {
    if (!confirm("Supprimer cette note de fin de séance ?")) return;
    try { await deleteDoc(doc(db, "notes-seance", id)); loadJournal(); onChanged?.(); }
    catch (e) { console.error("deleteJournal:", e); alert("Erreur lors de la suppression."); }
  };

  const fmtDate = (ts: any) => {
    if (!ts?.seconds) return "";
    return new Date(ts.seconds * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const prepPreview = (creneau.notePreparation || "").trim();

  return (
    <div className="mb-4 print:bg-transparent">
      {/* En-tête repliable + accès rapide au plan */}
      <div className="flex items-center gap-2 bg-blue-50/60 border-l-4 border-blue-300 rounded-r-lg px-3 py-2">
        <button onClick={() => setOpen(o => !o)}
          className="flex-1 min-w-0 bg-transparent border-none cursor-pointer text-left p-0">
          <div className="font-body text-[10px] font-semibold text-blue-600 uppercase tracking-wider">📝 Notes de séance</div>
          {creneau.themeStage && (
            <div className="font-body text-xs font-semibold text-teal-700 mb-0.5">🎯 Thème : {creneau.themeStage}</div>
          )}
          {!open && prepPreview ? (
            <p className="font-body text-sm text-slate-700 truncate">{prepPreview}</p>
          ) : !open ? (
            <p className="font-body text-xs text-slate-400 italic">Préparation, fin de séance, dictée…</p>
          ) : null}
        </button>
        {planUrl && (
          planIsPdf
            ? <a href={planUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 font-body text-xs font-semibold text-purple-600 bg-purple-50 px-2.5 py-1.5 rounded-lg no-underline hover:bg-purple-100 flex-shrink-0">
                <FileText size={13} /> Plan (PDF)
              </a>
            : <button onClick={() => setLightbox(true)}
                className="flex items-center gap-1 font-body text-xs font-semibold text-purple-600 bg-purple-50 px-2.5 py-1.5 rounded-lg border-none cursor-pointer hover:bg-purple-100 flex-shrink-0">
                <Eye size={13} /> Plan
              </button>
        )}
        <button onClick={() => setOpen(o => !o)} className="bg-transparent border-none cursor-pointer flex-shrink-0 p-0">
          {open ? <ChevronUp size={16} className="text-blue-500" /> : <ChevronDown size={16} className="text-blue-500" />}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-4 bg-white border border-blue-100 rounded-xl p-3 print:hidden">
          {/* PLAN DE SÉANCE (aperçu mobile) */}
          {planUrl && (
            <div>
              <div className="font-body text-xs font-semibold text-purple-600 mb-1">📄 Plan de séance</div>
              {planIsPdf ? (
                <a href={planUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 font-body text-sm font-semibold text-purple-700 bg-purple-50 px-3 py-2 rounded-lg no-underline hover:bg-purple-100">
                  <FileText size={15} /> Ouvrir le plan (PDF)
                </a>
              ) : (
                <button onClick={() => setLightbox(true)} className="block w-full bg-transparent border border-purple-100 rounded-lg p-0 cursor-pointer overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={planUrl} alt="Plan de séance" className="w-full max-h-64 object-contain bg-slate-50" />
                  <div className="font-body text-[10px] text-purple-500 py-1">Toucher pour agrandir</div>
                </button>
              )}
            </div>
          )}

          {/* PRÉPARATION */}
          <div>
            <div className="font-body text-xs font-semibold text-orange-600 mb-1">📋 Note de préparation</div>
            <textarea value={prep} onChange={e => setPrep(e.target.value)} rows={2}
              placeholder="Ce que tu prévois pour la séance (objectifs, exercices…)"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400 resize-y" />
            <div className="flex items-center gap-2 mt-1">
              <button onClick={savePrep} disabled={prepSaving}
                className="font-body text-xs font-semibold text-white bg-orange-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-orange-400 disabled:opacity-50">
                {prepSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
              {prepSaved && <span className="font-body text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Enregistré</span>}
            </div>
          </div>

          {/* FIN DE SÉANCE + dictée */}
          <div>
            <div className="font-body text-xs font-semibold text-blue-600 mb-1">🏁 Note de fin de séance (globale)</div>
            <textarea value={fin} onChange={e => setFin(e.target.value)} rows={2}
              placeholder="Ressenti, comportement de groupe, exercices à refaire…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400 resize-y" />
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <button onClick={() => recording ? stopRec() : startRec()} disabled={transcribing}
                className={`flex items-center gap-1.5 font-body text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50 ${recording ? "bg-red-500 text-white hover:bg-red-400" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
                {recording ? <><MicOff size={13} /> Arrêter la dictée</> : <><Mic size={13} /> Dicter</>}
              </button>
              {transcribing && <span className="font-body text-xs text-slate-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Transcription…</span>}
              <button onClick={saveFin} disabled={finSaving || !fin.trim()}
                className="font-body text-xs font-semibold text-white bg-blue-600 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-500 disabled:opacity-50">
                {finSaving ? "Enregistrement…" : "Enregistrer la note"}
              </button>
            </div>
          </div>

          {/* Journal des notes de fin de séance */}
          {journal.length > 0 && (
            <div>
              <div className="font-body text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes enregistrées</div>
              <div className="space-y-1.5">
                {journal.map(n => (
                  <div key={n.id} className="flex items-start gap-2 bg-sand rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-slate-700 whitespace-pre-wrap">{n.texte}</p>
                      <span className="font-body text-[10px] text-slate-400">{fmtDate(n.createdAt)}{n.createdByName ? ` · ${n.createdByName}` : ""}</span>
                    </div>
                    <button onClick={() => deleteJournal(n.id)} className="text-slate-300 hover:text-red-500 bg-transparent border-none cursor-pointer flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Plein écran du plan de séance (image) avec zoom */}
      {lightbox && planUrl && !planIsPdf && (
        <div className="fixed inset-0 bg-black/90 z-[60] overflow-auto print:hidden" onClick={() => setLightbox(false)}>
          {/* Barre d'outils */}
          <div className="fixed top-0 left-0 right-0 z-[61] flex items-center justify-between px-3 py-2 bg-black/40" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(z => Math.max(1, +(z - 0.5).toFixed(1)))}
                className="text-white bg-white/15 rounded-lg p-2 border-none cursor-pointer disabled:opacity-40" disabled={zoom <= 1}><ZoomOut size={20} /></button>
              <span className="font-body text-xs text-white w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(5, +(z + 0.5).toFixed(1)))}
                className="text-white bg-white/15 rounded-lg p-2 border-none cursor-pointer disabled:opacity-40" disabled={zoom >= 5}><ZoomIn size={20} /></button>
            </div>
            <button onClick={() => setLightbox(false)} className="text-white bg-white/15 rounded-lg p-2 border-none cursor-pointer"><X size={20} /></button>
          </div>
          {/* Image (toucher = zoom avant/arrière) */}
          <div className="min-h-full min-w-full flex items-center justify-center p-2 pt-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={planUrl} alt="Plan de séance"
              onClick={e => { e.stopPropagation(); setZoom(z => (z >= 3 ? 1 : +(z + 1).toFixed(1))); }}
              style={zoom === 1
                ? { maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", cursor: "zoom-in" }
                : { width: `${zoom * 100}%`, height: "auto", maxWidth: "none", cursor: "zoom-out" }} />
          </div>
        </div>
      )}
    </div>
  );
}
