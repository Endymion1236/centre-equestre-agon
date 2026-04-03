"use client";
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Search } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface Props {
  targetFamilyId: string;
  families: any[];
  onClose: () => void;
  onDone: () => void;
}

export default function LinkChildrenModal({ targetFamilyId, families, onClose, onDone }: Props) {
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const { toast } = useToast();

  const targetFamily = families.find(f => f.firestoreId === targetFamilyId);
  if (!targetFamily) return null;

  const alreadyLinked: string[] = [
    ...(targetFamily.children || []).map((c: any) => c.id),
    ...((targetFamily.linkedChildren || []).map((c: any) => c.childId)),
  ];

  const q = linkSearch.toLowerCase();
  const filteredFamilies = families
    .filter(f => f.firestoreId !== targetFamilyId)
    .filter(f => !q || f.parentName.toLowerCase().includes(q) ||
      (f.children || []).some((c: any) => c.firstName.toLowerCase().includes(q)));

  const handleLink = async (child: any, sourceFamilyId: string, sourceFamilyName: string) => {
    setLinkSaving(true);
    try {
      const newLink = {
        childId: child.id, childName: child.firstName,
        birthDate: child.birthDate || "", galopLevel: child.galopLevel || "—",
        sourceFamilyId, sourceFamilyName, linkedAt: new Date().toISOString(),
      };
      const existing = targetFamily.linkedChildren || [];
      await updateDoc(doc(db, "families", targetFamilyId), { linkedChildren: [...existing, newLink] });
      await onDone();
      toast(`${child.firstName} lié(e) à ${targetFamily.parentName}`, "success");
    } catch { toast("Erreur", "error"); }
    setLinkSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold text-blue-800">Lier des cavaliers</h2>
            <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>
          <p className="font-body text-xs text-slate-500">
            Choisissez les cavaliers que <strong>{targetFamily.parentName}</strong> pourra voir et réserver.
          </p>
        </div>
        <div className="p-4 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={linkSearch} onChange={e => setLinkSearch(e.target.value)}
              placeholder="Rechercher une famille ou un cavalier..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-400 bg-white"/>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-4 pb-4 flex flex-col gap-3">
          {filteredFamilies.length === 0 && (
            <p className="font-body text-sm text-slate-500 text-center py-4">Aucune famille trouvée.</p>
          )}
          {filteredFamilies.map(f => (
            <div key={f.firestoreId} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 font-body text-xs font-semibold text-slate-600">{f.parentName}</div>
              {(f.children || []).map((child: any) => {
                const isLinked = alreadyLinked.includes(child.id);
                return (
                  <div key={child.id} className="flex items-center justify-between px-3 py-2.5 border-t border-gray-50 first:border-t-0">
                    <div className="flex items-center gap-2">
                      <span className="font-body text-sm font-semibold text-blue-800">{child.firstName}</span>
                      {child.galopLevel && child.galopLevel !== "—" && (
                        <span className="font-body text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">G{child.galopLevel}</span>
                      )}
                      {child.birthDate && (
                        <span className="font-body text-[10px] text-slate-400">
                          {new Date().getFullYear() - new Date(child.birthDate).getFullYear()} ans
                        </span>
                      )}
                    </div>
                    {isLinked ? (
                      <span className="font-body text-[10px] text-green-600 bg-green-50 px-2 py-1 rounded-lg">✓ Lié</span>
                    ) : (
                      <button onClick={() => handleLink(child, f.firestoreId, f.parentName)} disabled={linkSaving}
                        className="font-body text-xs text-teal-600 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-lg border-none cursor-pointer font-semibold disabled:opacity-50">
                        + Lier
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
