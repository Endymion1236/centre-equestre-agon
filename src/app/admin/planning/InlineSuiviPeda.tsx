"use client";
import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Save, Check, Loader2, Target, Plus } from "lucide-react";

interface Props {
  childId: string;
  childName: string;
  familyId: string;
  activityTitle: string;
  date: string;
  horseName: string;
  onClose: () => void;
}

interface PedaNote { date: string; text: string; author: string; activity?: string; horse?: string; }
interface PedaObjectif { id: string; label: string; status: "en_cours" | "valide" | "a_revoir"; addedAt: string; }

export default function InlineSuiviPeda({ childId, childName, familyId, activityTitle, date, horseName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [objectifs, setObjectifs] = useState<PedaObjectif[]>([]);
  const [notes, setNotes] = useState<PedaNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [newObjLabel, setNewObjLabel] = useState("");
  const [galopLevel, setGalopLevel] = useState("—");
  const [childData, setChildData] = useState<any>(null);
  const [familyData, setFamilyData] = useState<any>(null);

  // Charger les données du cavalier
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const famDoc = await getDoc(doc(db, "families", familyId));
        if (famDoc.exists()) {
          const fam = { id: famDoc.id, ...famDoc.data() };
          setFamilyData(fam);
          const child = ((fam as any).children || []).find((c: any) => c.id === childId);
          if (child) {
            setChildData(child);
            const peda = child.peda || { objectifs: [], notes: [] };
            setObjectifs(peda.objectifs || []);
            setNotes(peda.notes || []);
            setGalopLevel(child.galopLevel || "—");
          }
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [familyId, childId]);

  const savePeda = async () => {
    if (!familyData) return;
    setSaving(true);
    try {
      // Ajouter la note si remplie
      let updatedNotes = [...notes];
      if (noteText.trim()) {
        const newNote: PedaNote = {
          date: new Date().toISOString(),
          text: noteText.trim(),
          author: "admin",
          activity: activityTitle,
          horse: horseName || undefined,
        };
        updatedNotes = [newNote, ...updatedNotes];
      }

      const updatedChildren = ((familyData as any).children || []).map((c: any) =>
        c.id === childId
          ? { ...c, peda: { objectifs, notes: updatedNotes, updatedAt: new Date().toISOString() } }
          : c
      );
      await updateDoc(doc(db, "families", familyId), { children: updatedChildren, updatedAt: serverTimestamp() });
      setNotes(updatedNotes);
      setNoteText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const toggleObjectif = (id: string) => {
    setObjectifs(prev => prev.map(o => {
      if (o.id !== id) return o;
      const next = o.status === "en_cours" ? "valide" : o.status === "valide" ? "a_revoir" : "en_cours";
      return { ...o, status: next };
    }));
  };

  const addObjectif = () => {
    if (!newObjLabel.trim()) return;
    setObjectifs(prev => [...prev, { id: `obj_${Date.now()}`, label: newObjLabel.trim(), status: "en_cours", addedAt: new Date().toISOString() }]);
    setNewObjLabel("");
  };

  if (loading) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-1 mb-1 flex items-center justify-center gap-2">
        <Loader2 size={14} className="animate-spin text-purple-500" />
        <span className="font-body text-xs text-purple-500">Chargement...</span>
      </div>
    );
  }

  const statusColor = { en_cours: "bg-blue-100 text-blue-700 border-blue-200", valide: "bg-green-100 text-green-700 border-green-200", a_revoir: "bg-orange-100 text-orange-700 border-orange-200" };
  const statusLabel = { en_cours: "En cours", valide: "✓ Validé", a_revoir: "À revoir" };

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-1 mb-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-body text-xs font-bold text-purple-800">📝 Suivi — {childName}</span>
          <span className="font-body text-[10px] text-purple-400">{galopLevel !== "—" ? `Niveau ${galopLevel}` : ""}</span>
        </div>
        <button onClick={onClose} className="text-purple-400 hover:text-purple-600 bg-transparent border-none cursor-pointer p-0">
          <X size={14} />
        </button>
      </div>

      {/* Objectifs */}
      <div className="mb-3">
        <div className="font-body text-[10px] font-semibold text-purple-700 mb-1.5 flex items-center gap-1">
          <Target size={10} /> Objectifs ({objectifs.filter(o => o.status === "valide").length}/{objectifs.length})
        </div>
        {objectifs.length > 0 ? (
          <div className="flex flex-col gap-1">
            {objectifs.map(o => (
              <button key={o.id} onClick={() => toggleObjectif(o.id)}
                className={`flex items-center gap-2 px-2 py-1 rounded text-left font-body text-[10px] border cursor-pointer ${statusColor[o.status]}`}>
                <span className="flex-1">{o.label}</span>
                <span className="font-semibold text-[9px]">{statusLabel[o.status]}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="font-body text-[10px] text-purple-400 italic">Aucun objectif défini</p>
        )}
        <div className="flex gap-1 mt-1.5">
          <input value={newObjLabel} onChange={e => setNewObjLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addObjectif()}
            placeholder="Nouvel objectif..."
            className="flex-1 px-2 py-1 rounded border border-purple-200 font-body text-[10px] bg-white focus:outline-none focus:border-purple-400" />
          <button onClick={addObjectif} disabled={!newObjLabel.trim()}
            className="px-2 py-1 rounded bg-purple-500 text-white font-body text-[10px] border-none cursor-pointer disabled:opacity-40">
            <Plus size={10} />
          </button>
        </div>
      </div>

      {/* Note de séance */}
      <div className="mb-3">
        <div className="font-body text-[10px] font-semibold text-purple-700 mb-1">
          Note de séance — {activityTitle} {horseName ? `sur ${horseName}` : ""}
        </div>
        <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
          placeholder="Points forts, à travailler, comportement..."
          rows={2}
          className="w-full px-2 py-1.5 rounded border border-purple-200 font-body text-[10px] bg-white focus:outline-none focus:border-purple-400 resize-y" />
      </div>

      {/* Notes précédentes (2 dernières) */}
      {notes.length > 0 && (
        <div className="mb-3">
          <div className="font-body text-[9px] font-semibold text-purple-400 mb-1">Notes précédentes</div>
          {notes.slice(0, 2).map((n, i) => (
            <div key={i} className="font-body text-[9px] text-slate-500 bg-white rounded px-2 py-1 mb-0.5 border border-purple-100">
              <span className="text-purple-400">{new Date(n.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
              {n.activity && <span className="text-purple-300"> · {n.activity}</span>}
              {" — "}{n.text}
            </div>
          ))}
        </div>
      )}

      {/* Bouton Enregistrer */}
      <div className="flex gap-2">
        <button onClick={savePeda} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded font-body text-xs font-semibold text-white bg-purple-500 border-none cursor-pointer hover:bg-purple-400 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />}
          {saving ? "Enregistrement..." : saved ? "Enregistré ✓" : "Enregistrer"}
        </button>
        <button onClick={onClose}
          className="px-3 py-1.5 rounded font-body text-xs text-purple-500 bg-white border border-purple-200 cursor-pointer">
          Fermer
        </button>
      </div>
    </div>
  );
}
