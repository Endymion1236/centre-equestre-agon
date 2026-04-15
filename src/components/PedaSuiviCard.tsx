"use client";
import { useState } from "react";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui";
import { Plus, X, Save, Target, MessageSquare, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface PedaNote {
  date: string;
  text: string;
  author: string;
  type?: string;
  activityTitle?: string;
  rawTranscript?: string;
}
interface PedaObjectif {
  id: string;
  label: string;
  status: "en_cours" | "valide" | "a_revoir";
  addedAt: string;
}

const defaultObjectifs: Record<string, string[]> = {
  "Bronze": ["Monter et descendre seul", "Diriger au pas", "Trot enlevé", "Pansage complet", "Connaître les parties du poney"],
  "Argent": ["Galop à 3 allures", "Trotter sans étriers", "Transition pas-trot-galop", "Aborder un obstacle isolé", "Brider et seller seul"],
  "Or": ["Enchaînement d'obstacles (60cm)", "Galop assis", "Départ au galop à juste", "Travail sur le plat", "Longe et travail en liberté"],
  "G3": ["Incurvation", "Épaule en dedans", "Enchaînement CSO 70cm", "Dressage E2", "Travail aux 3 allures sans étriers"],
  "G4": ["Appuyers", "Changement de pied", "Enchaînement CSO 80cm", "Dressage E3", "Cross obstacles naturels"],
};

interface Props {
  child: any;
  familyId: string;
  onRefresh: () => void;
}

export default function PedaSuiviCard({ child, familyId, onRefresh }: Props) {
  const { user } = useAuth();
  const peda = child.peda || { objectifs: [], notes: [] };

  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingObj, setAddingObj] = useState(false);
  const [newObjLabel, setNewObjLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingNote, setEditingNote] = useState<{ noteIndex: number; text: string } | null>(null);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [openNoteIdx, setOpenNoteIdx] = useState<number | null>(null);

  const updatePeda = async (newPeda: any) => {
    setSaving(true);
    try {
      // Lire les enfants actuels et mettre à jour le bon
      const { doc: docRef } = await import("firebase/firestore");
      const famRef = doc(db, "families", familyId);
      const { getDoc } = await import("firebase/firestore");
      const snap = await getDoc(famRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const updatedChildren = (data.children || []).map((c: any) =>
        c.id === child.id ? { ...c, peda: { ...newPeda, updatedAt: new Date().toISOString() } } : c
      );
      await updateDoc(famRef, { children: updatedChildren, updatedAt: serverTimestamp() });
      onRefresh();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    const authorName = user?.displayName || user?.email?.split("@")[0] || "Admin";
    const newNote: PedaNote = { date: new Date().toISOString(), text: noteText.trim(), author: authorName };
    await updatePeda({ ...peda, notes: [newNote, ...peda.notes] });
    setNoteText("");
    setAddingNote(false);
  };

  const addObjectif = async () => {
    if (!newObjLabel.trim()) return;
    const newObj: PedaObjectif = { id: Date.now().toString(), label: newObjLabel.trim(), status: "en_cours", addedAt: new Date().toISOString() };
    await updatePeda({ ...peda, objectifs: [...peda.objectifs, newObj] });
    setNewObjLabel("");
    setAddingObj(false);
  };

  const toggleObjStatus = async (objId: string) => {
    const updated = (peda.objectifs || []).map((o: PedaObjectif) => {
      if (o.id !== objId) return o;
      const next = o.status === "en_cours" ? "valide" : o.status === "valide" ? "a_revoir" : "en_cours";
      return { ...o, status: next };
    });
    await updatePeda({ ...peda, objectifs: updated });
  };

  const deleteObjectif = async (objId: string) => {
    if (!confirm("Supprimer cet objectif ?")) return;
    await updatePeda({ ...peda, objectifs: (peda.objectifs || []).filter((o: PedaObjectif) => o.id !== objId) });
  };

  const addDefaultObjectifs = async () => {
    const level = child.galopLevel || "Bronze";
    const defaults = defaultObjectifs[level] || defaultObjectifs["Bronze"];
    const existing = (peda.objectifs || []).map((o: PedaObjectif) => o.label);
    const newObjs = defaults.filter(d => !existing.includes(d)).map(label => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
      label, status: "en_cours" as const, addedAt: new Date().toISOString(),
    }));
    if (newObjs.length === 0) return;
    await updatePeda({ ...peda, objectifs: [...(peda.objectifs || []), ...newObjs] });
  };

  const deleteNote = async (noteIndex: number) => {
    if (!confirm("Supprimer cette note ?")) return;
    const newNotes = (peda.notes || []).filter((_: any, i: number) => i !== noteIndex);
    await updatePeda({ ...peda, notes: newNotes });
    setOpenNoteIdx(null);
  };

  const saveEditNote = async () => {
    if (!editingNote || !editingNote.text.trim()) return;
    const newNotes = (peda.notes || []).map((n: PedaNote, i: number) =>
      i === editingNote.noteIndex ? { ...n, text: editingNote.text.trim() } : n
    );
    await updatePeda({ ...peda, notes: newNotes });
    setEditingNote(null);
  };

  const objDone = (peda.objectifs || []).filter((o: PedaObjectif) => o.status === "valide").length;
  const objTotal = (peda.objectifs || []).length;
  const notesToShow = showAllNotes ? (peda.notes || []) : (peda.notes || []).slice(0, 3);

  return (
    <div className="mt-4 pt-4 border-t border-purple-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-body text-xs font-semibold text-purple-600 uppercase tracking-wider">Suivi pédagogique</span>
          {objTotal > 0 && (
            <span className="font-body text-[10px] text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
              {objDone}/{objTotal} validés
            </span>
          )}
        </div>
      </div>

      {/* ── Objectifs ── */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-body text-xs font-semibold text-blue-800 flex items-center gap-1.5">
            <Target size={13} /> Objectifs
          </h4>
          <div className="flex gap-1.5">
            <button onClick={addDefaultObjectifs}
              className="font-body text-[10px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
              + Type {child.galopLevel || "Bronze"}
            </button>
            <button onClick={() => setAddingObj(!addingObj)}
              className="font-body text-[10px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
              <Plus size={10} className="inline" /> Perso
            </button>
          </div>
        </div>

        {addingObj && (
          <div className="flex gap-2 mb-2">
            <input value={newObjLabel} onChange={e => setNewObjLabel(e.target.value)} placeholder="Nouvel objectif..." autoFocus
              className="flex-1 px-3 py-2 rounded-lg border border-blue-500/8 font-body text-xs bg-cream focus:border-blue-500 focus:outline-none" />
            <button onClick={addObjectif} disabled={!newObjLabel.trim() || saving}
              className="px-3 py-2 rounded-lg bg-blue-500 text-white font-body text-[10px] font-semibold border-none cursor-pointer">OK</button>
          </div>
        )}

        {(peda.objectifs || []).length === 0 ? (
          <p className="font-body text-[10px] text-slate-400 italic">Aucun objectif.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {(peda.objectifs || []).map((obj: PedaObjectif) => (
              <div key={obj.id} className="flex items-center justify-between bg-sand rounded-lg px-3 py-2">
                <span className={`font-body text-xs ${obj.status === "valide" ? "text-green-600 line-through" : obj.status === "a_revoir" ? "text-orange-600" : "text-blue-800"}`}>
                  {obj.status === "valide" ? "✓ " : obj.status === "a_revoir" ? "▲ " : "○ "}{obj.label}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleObjStatus(obj.id)}
                    className={`px-2 py-0.5 rounded border-none cursor-pointer font-body text-[9px] font-semibold ${
                      obj.status === "valide" ? "bg-green-100 text-green-600" : obj.status === "a_revoir" ? "bg-orange-100 text-orange-600" : "bg-blue-50 text-blue-500"
                    }`}>
                    {obj.status === "en_cours" ? "Valider" : obj.status === "valide" ? "À revoir" : "Reprendre"}
                  </button>
                  <button onClick={() => deleteObjectif(obj.id)} className="text-red-300 hover:text-red-500 bg-transparent border-none cursor-pointer p-0.5"><X size={10} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Notes de séance ── */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-body text-xs font-semibold text-blue-800 flex items-center gap-1.5">
            <MessageSquare size={13} /> Notes de séance
            {(peda.notes || []).length > 0 && (
              <span className="font-body text-[10px] text-slate-400">({(peda.notes || []).length})</span>
            )}
          </h4>
          <button onClick={() => setAddingNote(!addingNote)}
            className="font-body text-[10px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border-none cursor-pointer hover:bg-blue-100">
            <Plus size={10} className="inline" /> Ajouter
          </button>
        </div>

        {addingNote && (
          <div className="mb-3">
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
              placeholder="Observations, progrès, points à travailler..." autoFocus
              className="w-full px-3 py-2 rounded-lg border border-blue-500/8 font-body text-xs bg-cream focus:border-blue-500 focus:outline-none resize-y" />
            <button onClick={addNote} disabled={!noteText.trim() || saving}
              className="mt-1.5 px-4 py-1.5 rounded-lg bg-blue-500 text-white font-body text-[10px] font-semibold border-none cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 size={10} className="inline animate-spin mr-1" /> : <Save size={10} className="inline mr-1" />}Enregistrer
            </button>
          </div>
        )}

        {(peda.notes || []).length === 0 ? (
          <p className="font-body text-[10px] text-slate-400 italic">Aucune note.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {notesToShow.map((note: PedaNote, i: number) => {
              const isBilanIA = note.type === "bilan_ia";
              const isSeance = note.type === "seance";
              const isOpen = openNoteIdx === i;
              const firstLine = note.text.split("\n")[0].replace(/^[✅🔧🎯]\s*/, "").slice(0, 60);

              return (
                <div key={i} className={`rounded-lg border overflow-hidden ${isBilanIA ? "border-purple-100" : isSeance ? "border-green-100" : "border-gray-100"}`}>
                  {/* Résumé cliquable */}
                  <div
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer ${isBilanIA ? "bg-purple-50 hover:bg-purple-100/60" : isSeance ? "bg-green-50 hover:bg-green-100/60" : "bg-sand hover:bg-gray-100/60"}`}
                    onClick={() => setOpenNoteIdx(isOpen ? null : i)}>
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {isBilanIA && <span className="font-body text-[8px] bg-purple-200 text-purple-800 px-1 py-0.5 rounded flex-shrink-0">✨ IA</span>}
                      {isSeance && <span className="font-body text-[8px] bg-green-200 text-green-800 px-1 py-0.5 rounded flex-shrink-0">Séance</span>}
                      {!isBilanIA && !isSeance && <span className="font-body text-[8px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded flex-shrink-0">Note</span>}
                      {note.activityTitle && <span className="font-body text-[10px] text-blue-500 font-semibold flex-shrink-0 truncate max-w-[90px]">{note.activityTitle}</span>}
                      <span className="font-body text-[11px] text-slate-600 truncate">{firstLine}{note.text.length > 60 ? "…" : ""}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className="font-body text-[9px] text-slate-400">
                        {new Date(note.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </span>
                      {isOpen ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                    </div>
                  </div>

                  {/* Contenu déroulé */}
                  {isOpen && (
                    <div className="px-3 py-2.5 border-t border-gray-100 bg-white">
                      {note.activityTitle && (
                        <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-50">
                          <span className="font-body text-[9px] text-slate-400 uppercase tracking-wider">Séance</span>
                          <span className="font-body text-xs font-semibold text-blue-700">{note.activityTitle}</span>
                          <span className="font-body text-[9px] text-slate-400">
                            {new Date(note.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                          </span>
                        </div>
                      )}

                      {editingNote && editingNote.noteIndex === i ? (
                        <div>
                          <textarea value={editingNote.text} onChange={e => setEditingNote({ ...editingNote, text: e.target.value })} rows={4}
                            className="w-full px-2 py-1.5 rounded-lg border border-blue-500/8 font-body text-xs bg-white focus:border-blue-500 focus:outline-none resize-y" />
                          <div className="flex gap-2 mt-1.5">
                            <button onClick={saveEditNote} className="font-body text-[9px] text-white bg-blue-500 px-3 py-1 rounded border-none cursor-pointer">Enregistrer</button>
                            <button onClick={() => setEditingNote(null)} className="font-body text-[9px] text-slate-600 bg-gray-100 px-3 py-1 rounded border-none cursor-pointer">Annuler</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="font-body text-xs text-gray-700 leading-relaxed whitespace-pre-line">{note.text}</p>
                          {isBilanIA && note.rawTranscript && (
                            <details className="mt-2">
                              <summary className="font-body text-[9px] text-slate-400 cursor-pointer hover:text-purple-500">🎙️ Transcript original</summary>
                              <p className="font-body text-[10px] text-slate-500 italic mt-1 bg-gray-50 rounded px-2 py-1.5">{note.rawTranscript}</p>
                            </details>
                          )}
                          <div className="flex gap-2 mt-2 pt-1.5 border-t border-gray-50">
                            <button onClick={() => setEditingNote({ noteIndex: i, text: note.text })}
                              className="font-body text-[9px] text-blue-500 bg-blue-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-blue-100">
                              ✏️ Modifier
                            </button>
                            <button onClick={() => deleteNote(i)}
                              className="font-body text-[9px] text-red-400 bg-red-50 px-2.5 py-1 rounded border-none cursor-pointer hover:bg-red-100">
                              🗑 Supprimer
                            </button>
                            <span className="font-body text-[9px] text-slate-300 ml-auto">{note.author}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {(peda.notes || []).length > 3 && !showAllNotes && (
              <button onClick={() => setShowAllNotes(true)}
                className="font-body text-[10px] text-blue-500 bg-blue-50 py-1.5 rounded-lg border-none cursor-pointer text-center hover:bg-blue-100">
                ▼ Voir les {(peda.notes || []).length - 3} notes précédentes
              </button>
            )}
            {showAllNotes && (peda.notes || []).length > 3 && (
              <button onClick={() => setShowAllNotes(false)}
                className="font-body text-[10px] text-slate-500 bg-sand py-1.5 rounded-lg border-none cursor-pointer text-center">
                ▲ Réduire
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
