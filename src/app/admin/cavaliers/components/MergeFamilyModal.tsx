"use client";
import { useState } from "react";
import { Loader2, GitMerge, X } from "lucide-react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/Toast";

interface Family { firestoreId: string; parentName: string; children?: any[]; }

interface Props {
  sourceFamilyId: string;
  families: Family[];
  onClose: () => void;
  onDone: () => void;
}

export default function MergeFamilyModal({ sourceFamilyId, families, onClose, onDone }: Props) {
  const [mergeTarget, setMergeTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const source = families.find(f => f.firestoreId === sourceFamilyId);
  const target = families.find(f => f.firestoreId === mergeTarget);

  const handleMerge = async () => {
    if (!source || !target || !mergeTarget) return;
    setSaving(true);
    try {
      const existingNames = (target.children || []).map((c: any) => c.firstName?.toLowerCase());
      const newOnes = (source.children || []).filter((c: any) => !existingNames.includes(c.firstName?.toLowerCase()));
      await updateDoc(doc(db, "families", mergeTarget), {
        children: [...(target.children || []), ...newOnes],
      });
      await deleteDoc(doc(db, "families", sourceFamilyId));
      toast(`✅ Familles fusionnées`, "success");
      onDone();
      onClose();
    } catch {
      toast("Erreur lors de la fusion", "error");
    }
    setSaving(false);
  };

  const inputStyle = "w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Fusionner des familles</h2>
            <p className="font-body text-xs text-slate-600">Les cavaliers seront regroupés dans la famille cible</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Famille à supprimer (source)</label>
            <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 font-body text-sm text-red-700">
              {source?.parentName || "?"} — {(source?.children || []).length} cavalier(s)
            </div>
          </div>
          <div className="text-center font-body text-xs text-slate-600">↓ ses cavaliers seront ajoutés à ↓</div>
          <div>
            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Famille à conserver (cible)</label>
            <select className={inputStyle} value={mergeTarget} onChange={e => setMergeTarget(e.target.value)}>
              <option value="">— Sélectionner la famille cible —</option>
              {families.filter(f => f.firestoreId !== sourceFamilyId).map(f => (
                <option key={f.firestoreId} value={f.firestoreId}>
                  {f.parentName} ({(f.children || []).length} cavalier{(f.children || []).length > 1 ? "s" : ""}) — {(f as any).parentEmail || "pas d'email"}
                </option>
              ))}
            </select>
          </div>
          {mergeTarget && source && target && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="font-body text-xs font-semibold text-blue-800 mb-1">Résultat après fusion :</div>
              <div className="font-body text-xs text-gray-600">
                {(() => {
                  const existingNames = (target.children || []).map((c: any) => c.firstName?.toLowerCase());
                  const newOnes = (source.children || []).filter((c: any) => !existingNames.includes(c.firstName?.toLowerCase()));
                  const dupes = (source.children || []).length - newOnes.length;
                  return `${target.parentName} aura ${(target.children || []).length + newOnes.length} cavalier(s) (${newOnes.length} ajouté(s)${dupes > 0 ? `, ${dupes} doublon(s) ignoré(s)` : ""})`;
                })()}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button onClick={handleMerge} disabled={saving || !mergeTarget}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-purple-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-purple-600 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin"/> : <GitMerge size={16}/>} Fusionner
          </button>
        </div>
      </div>
    </div>
  );
}
