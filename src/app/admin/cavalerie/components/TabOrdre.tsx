"use client";
import { useRef, useState } from "react";
import { writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { GripVertical, Loader2 } from "lucide-react";
import type { Equide } from "../types";
import { useToast } from "@/components/ui/Toast";

const STATUS_LABELS: Record<string, string> = {
  actif: "Actif", en_formation: "En formation", indisponible: "Indisponible",
  retraite: "Retraite", sorti: "Sorti", deces: "Décédé",
};
const TYPE_LABELS: Record<string, string> = {
  cheval: "🐎 Cheval", poney: "🐴 Poney", shetland: "🐴 Shetland", ane: "🫏 Âne",
};

interface Props { equides: Equide[]; onRefresh: () => void; }

export default function TabOrdre({ equides, onRefresh }: Props) {
  const { toast } = useToast();
  const [list, setList] = useState<Equide[]>(() =>
    [...equides].sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99))
  );
  const [saving, setSaving] = useState(false);
  const dragIdx = useRef<number | null>(null);

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const updated = [...list];
    const [moved] = updated.splice(dragIdx.current, 1);
    updated.splice(idx, 0, moved);
    dragIdx.current = idx;
    setList(updated);
  };
  const handleDrop = async () => {
    setSaving(true);
    try {
      const batch = writeBatch(db);
      list.forEach((eq, i) => batch.update(doc(db, "equides", eq.id), { ordre: i }));
      await batch.commit();
      toast("✅ Ordre sauvegardé", "success");
      onRefresh();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    dragIdx.current = null;
    setSaving(false);
  };

  const actifs  = list.filter(e => e.status === "actif" || e.status === "en_formation" || e.status === "indisponible");
  const inactifs = list.filter(e => e.status === "sorti" || e.status === "deces" || e.status === "retraite");

  const renderRow = (eq: Equide, idx: number) => (
    <div
      key={eq.id}
      draggable
      onDragStart={() => handleDragStart(list.indexOf(eq))}
      onDragOver={e => handleDragOver(e, list.indexOf(eq))}
      onDrop={handleDrop}
      className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing select-none hover:border-blue-200 hover:shadow-sm transition-all"
      style={{ opacity: dragIdx.current === list.indexOf(eq) ? 0.4 : 1 }}
    >
      <GripVertical size={18} className="text-slate-300 flex-shrink-0" />
      <span className="font-body text-xs text-slate-300 w-5 text-right flex-shrink-0">{list.indexOf(eq) + 1}</span>
      <span className="font-body text-sm font-semibold text-blue-800 flex-1">{eq.name}</span>
      <span className="font-body text-xs text-slate-500">{TYPE_LABELS[eq.type] || eq.type}</span>
      <span className={`font-body text-xs px-2 py-0.5 rounded-full ${
        eq.status === "actif" ? "bg-green-50 text-green-700" :
        eq.status === "indisponible" ? "bg-orange-50 text-orange-600" :
        eq.status === "en_formation" ? "bg-blue-50 text-blue-600" :
        "bg-gray-100 text-gray-400"
      }`}>{STATUS_LABELS[eq.status] || eq.status}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-body text-sm text-slate-600">
            Glissez les équidés pour définir l'ordre d'affichage sur l'écran TV du montoir.
          </p>
          <p className="font-body text-xs text-slate-400 mt-1">
            Chevaux et poneys seront automatiquement séparés sur l'écran.
          </p>
        </div>
        {saving && <Loader2 size={18} className="animate-spin text-blue-400" />}
      </div>

      {/* Aperçu séparation TV */}
      <div className="flex gap-3 mb-5">
        <div className="flex items-center gap-2 font-body text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg font-semibold">
          🐎 {actifs.filter(e => e.type === "cheval").length} cheval{actifs.filter(e => e.type === "cheval").length > 1 ? "x" : ""} → colonne CHEVAUX
        </div>
        <div className="flex items-center gap-2 font-body text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-semibold">
          🐴 {actifs.filter(e => e.type !== "cheval").length} poney{actifs.filter(e => e.type !== "cheval").length > 1 ? "s" : ""} → colonne PONEYS
        </div>
      </div>

      {actifs.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-6">
          <div className="font-body text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <GripVertical size={13} /> Actifs / Indisponibles / En formation
          </div>
          {actifs.map((eq) => renderRow(eq, list.indexOf(eq)))}
        </div>
      )}

      {inactifs.length > 0 && (
        <div className="flex flex-col gap-1.5 opacity-40">
          <div className="font-body text-xs text-slate-400 uppercase tracking-wider mb-2">
            Sortis / Décédés / Retraite (non affichés sur l'écran TV)
          </div>
          {inactifs.map((eq) => renderRow(eq, list.indexOf(eq)))}
        </div>
      )}
    </div>
  );
}
