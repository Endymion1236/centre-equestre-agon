"use client";
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { X, Search, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface Props {
  childId: string;
  childName: string;
  familyId: string;
  familyName: string;
  creneaux: any[];
  onClose: () => void;
  onDone: () => void;
}

export default function EnrollModal({ childId, childName, familyId, familyName, creneaux, onClose, onDone }: Props) {
  const [enrollSearch, setEnrollSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const inputStyle = "w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400";

  const handleEnroll = async (creneauId: string) => {
    setSaving(true);
    try {
      const creneau = creneaux.find(c => c.id === creneauId);
      if (!creneau) return;
      const enrolled = creneau.enrolled || [];
      if (enrolled.some((e: any) => e.childId === childId)) {
        toast("Déjà inscrit", "info");
        setSaving(false);
        return;
      }
      await updateDoc(doc(db, "creneaux", creneauId), {
        enrolled: [...enrolled, { childId, childName, familyId, familyName, enrolledAt: new Date().toISOString() }],
        enrolledCount: enrolled.length + 1,
      });
      toast(`✅ ${childName} inscrit(e)`, "success");
      onDone();
    } catch { toast("Erreur lors de l'inscription", "error"); }
    setSaving(false);
  };

  const filtered = creneaux.filter(c =>
    !enrollSearch || c.activityTitle?.toLowerCase().includes(enrollSearch.toLowerCase())
  ).slice(0, 30);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-12 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 mb-8 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Inscrire {childName}</h2>
            <p className="font-body text-xs text-slate-600">Sélectionnez un créneau à venir</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16}/></button>
        </div>
        <div className="p-5">
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input placeholder="Filtrer par activité..." value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)}
              className={`${inputStyle} !pl-9 !text-xs`}/>
          </div>
          {creneaux.length === 0 ? (
            <p className="font-body text-sm text-slate-600 text-center py-6">Aucun créneau à venir.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
              {filtered.map(c => {
                const alreadyIn = (c.enrolled || []).some((e: any) => e.childId === childId);
                const spots = (c.maxPlaces || 8) - (c.enrolled?.length || 0);
                const d = new Date(c.date);
                return (
                  <div key={c.id} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${alreadyIn ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-white hover:border-blue-200"}`}>
                    <div>
                      <div className="font-body text-sm font-semibold text-blue-800">{c.activityTitle}</div>
                      <div className="font-body text-xs text-slate-600">
                        {d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · {c.startTime}–{c.endTime} · {c.monitor} · {spots} place{spots > 1 ? "s" : ""}
                      </div>
                    </div>
                    {alreadyIn ? (
                      <Badge color="green">Inscrit</Badge>
                    ) : spots <= 0 ? (
                      <Badge color="red">Complet</Badge>
                    ) : (
                      <button onClick={() => handleEnroll(c.id)} disabled={saving}
                        className="font-body text-xs font-semibold text-white bg-blue-500 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                        {saving ? <Loader2 size={12} className="animate-spin"/> : "Inscrire"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
