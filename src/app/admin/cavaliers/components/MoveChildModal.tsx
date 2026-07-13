"use client";
import { useState } from "react";
import { X, Search, ArrowRight } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/components/ui/Toast";

interface Props {
  child: any; // { id, firstName, lastName, ... }
  fromFamilyId: string;
  fromFamilyName: string;
  families: any[];
  onClose: () => void;
  onDone: () => void;
}

export default function MoveChildModal({ child, fromFamilyId, fromFamilyName, families, onClose, onDone }: Props) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const q = search.toLowerCase();
  const candidates = families
    .filter((f) => f.firestoreId !== fromFamilyId)
    .filter((f) => !(f.children || []).some((c: any) => c.id === child.id))
    .filter(
      (f) =>
        !q ||
        (f.parentName || "").toLowerCase().includes(q) ||
        (f.children || []).some((c: any) => (c.firstName || "").toLowerCase().includes(q))
    )
    .sort((a, b) => (a.parentName || "").localeCompare(b.parentName || ""));

  const handleMove = async (target: any) => {
    if (
      !confirm(
        `Déplacer ${child.firstName} de « ${fromFamilyName} » vers « ${target.parentName} » ?\n\n` +
          `Les réservations et inscriptions suivront. Les paiements/factures déjà émis ` +
          `restent sous l'ancienne famille (obligation NF525).`
      )
    )
      return;
    setSaving(true);
    try {
      const res = await authFetch("/api/admin/move-child", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: child.id,
          fromFamilyId,
          toFamilyId: target.firestoreId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Échec du déplacement", "error");
        setSaving(false);
        return;
      }
      const parts = [
        `${data.movedReservations} résa`,
        `${data.movedEnrollments} inscription(s)`,
      ];
      if (data.updatedLinks > 0) parts.push(`${data.updatedLinks} lien(s)`);
      let msg = `${data.childName} déplacé(e) vers ${data.toName} — ${parts.join(", ")}.`;
      if (data.paymentsUntouched > 0) {
        msg += ` ⚠️ ${data.paymentsUntouched} paiement(s) conservé(s) sous ${data.fromName} (à traiter en compta si besoin).`;
      }
      toast(msg, "success");
      await onDone();
      onClose();
    } catch {
      toast("Erreur réseau", "error");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display text-lg font-bold text-blue-800">Déplacer un cavalier</h2>
            <button onClick={onClose} className="text-slate-400 bg-transparent border-none cursor-pointer">
              <X size={20} />
            </button>
          </div>
          <p className="font-body text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
            <strong className="text-slate-700">{child.firstName}</strong>
            <span className="text-slate-400">·</span>
            <span>{fromFamilyName}</span>
            <ArrowRight size={12} className="text-blue-400" />
            <span className="text-blue-600">famille cible ?</span>
          </p>
          <p className="font-body text-[11px] text-slate-400 mt-1.5">
            Le cavalier garde son identifiant : factures et historique restent cohérents.
          </p>
        </div>

        <div className="p-4 flex-shrink-0 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une famille…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {candidates.length === 0 && (
            <p className="font-body text-xs text-slate-400 text-center py-6">Aucune famille correspondante.</p>
          )}
          {candidates.map((f) => (
            <button
              key={f.firestoreId}
              disabled={saving}
              onClick={() => handleMove(f)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 border-none bg-transparent cursor-pointer flex items-center justify-between gap-2 disabled:opacity-50"
            >
              <div>
                <div className="font-body text-sm font-semibold text-slate-700">{f.parentName}</div>
                <div className="font-body text-[11px] text-slate-400">
                  {(f.children || []).length} cavalier(s)
                  {(f.children || []).length > 0
                    ? ` : ${(f.children || []).map((c: any) => c.firstName).join(", ")}`
                    : ""}
                </div>
              </div>
              <ArrowRight size={16} className="text-blue-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
