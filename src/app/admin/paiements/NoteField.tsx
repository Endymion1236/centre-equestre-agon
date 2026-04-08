"use client";
import { useState } from "react";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function NoteField({ paymentId, initialNote, onSave }: {
  paymentId: string;
  initialNote: string;
  onSave: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initialNote);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await updateDoc(doc(db, "payments", paymentId), { note: val, updatedAt: serverTimestamp() });
    onSave(val);
    setSaving(false);
    setEditing(false);
  };

  if (!editing && !val) return (
    <button onClick={() => setEditing(true)}
      className="font-body text-[10px] text-slate-400 bg-transparent border-none cursor-pointer hover:text-blue-500 flex items-center gap-1 py-0.5">
      + Ajouter un commentaire
    </button>
  );

  if (!editing) return (
    <div className="flex items-start gap-2 group">
      <span className="font-body text-xs text-slate-500 italic flex-1">📝 {val}</span>
      <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 font-body text-[10px] text-blue-400 bg-transparent border-none cursor-pointer">Modifier</button>
    </div>
  );

  return (
    <div className="flex gap-2 items-end">
      <textarea value={val} onChange={e => setVal(e.target.value)} rows={2} autoFocus
        placeholder="Commentaire interne, conditions particulières..."
        className="flex-1 px-3 py-2 rounded-lg border border-blue-300 font-body text-xs bg-white focus:outline-none resize-none" />
      <div className="flex flex-col gap-1">
        <button onClick={save} disabled={saving}
          className="px-3 py-1.5 rounded-lg font-body text-xs font-semibold text-white bg-blue-500 border-none cursor-pointer disabled:opacity-50">
          {saving ? "..." : "✓"}
        </button>
        <button onClick={() => { setVal(initialNote); setEditing(false); }}
          className="px-3 py-1.5 rounded-lg font-body text-xs text-slate-500 bg-gray-100 border-none cursor-pointer">
          ✕
        </button>
      </div>
    </div>
  );
}
