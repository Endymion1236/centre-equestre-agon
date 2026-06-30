"use client";
import { useState } from "react";
import { Loader2, GitMerge, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { authFetch } from "@/lib/auth-fetch";

interface Family { firestoreId: string; parentName: string; parentEmail?: string; children?: any[]; }

interface Props {
  sourceFamilyId: string;   // famille dont on a ouvert la fiche = compte absorbé
  families: Family[];
  onClose: () => void;
  onDone: () => void;
}

export default function MergeFamilyModal({ sourceFamilyId, families, onClose, onDone }: Props) {
  const [keepId, setKeepId] = useState("");   // compte conservé (cible)
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [err, setErr] = useState("");
  const { toast } = useToast();

  const source = families.find(f => f.firestoreId === sourceFamilyId);

  const call = async (dryRun: boolean) => {
    if (!keepId) return;
    setBusy(true); setErr("");
    try {
      const res = await authFetch("/api/admin/doublons-merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeId: sourceFamilyId, dryRun, confirm: !dryRun }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      if (dryRun) setPreview(d.apercu);
      else { toast("✅ Comptes fusionnés", "success"); onDone(); onClose(); }
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };

  const inputStyle = "w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white focus:outline-none focus:border-blue-400";

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 shadow-xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">Fusionner des comptes</h2>
            <p className="font-body text-xs text-slate-600">Les données de la source sont rattachées au compte conservé</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none hover:bg-gray-200"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Compte absorbé (source)</label>
            <div className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 font-body text-sm text-amber-800">
              {source?.parentName || "?"} — {(source?.children || []).length} cavalier(s)
            </div>
          </div>
          <div className="text-center font-body text-xs text-slate-600">↓ ses données seront rattachées à ↓</div>
          <div>
            <label className="font-body text-[10px] font-semibold text-slate-600 uppercase block mb-1">Compte conservé (cible)</label>
            <select className={inputStyle} value={keepId} onChange={e => { setKeepId(e.target.value); setPreview(null); }}>
              <option value="">— Sélectionner le compte à conserver —</option>
              {families.filter(f => f.firestoreId !== sourceFamilyId).map(f => (
                <option key={f.firestoreId} value={f.firestoreId}>
                  {f.parentName} ({(f.children || []).length} cavalier{(f.children || []).length > 1 ? "s" : ""}) — {f.parentEmail || "pas d'email"}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-body text-[11px] text-slate-500">
            Sont déplacés : enfants, forfaits, avoirs, fidélité, devis, réservations, historique de paiement et créneaux. Les encaissements (immuables) ne sont pas modifiés. Le compte source est masqué (réversible).
          </div>

          {preview && (
            <div className="bg-blue-50 rounded-lg p-3 font-body text-xs text-blue-900">
              <div className="font-semibold mb-1">À déplacer vers « {preview.keep.name} » :</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span>{preview.enfantsAjoutes} enfant(s)</span>
                {Object.entries(preview.reassign).map(([k, v]: any) => v > 0 && <span key={k}>{v} {k}</span>)}
                {preview.creneauxTouches > 0 && <span>{preview.creneauxTouches} créneau(x)</span>}
              </div>
            </div>
          )}
          {err && <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 font-body text-xs text-rose-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="font-body text-sm text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button onClick={() => call(true)} disabled={busy || !keepId}
            className="font-body text-sm font-semibold text-slate-700 bg-white border border-slate-300 px-4 py-2.5 rounded-lg cursor-pointer disabled:opacity-50">
            {busy && !preview ? <Loader2 size={16} className="animate-spin"/> : "Prévisualiser"}
          </button>
          <button onClick={() => call(false)} disabled={busy || !preview}
            className="flex items-center gap-2 font-body text-sm font-semibold text-white bg-purple-500 px-5 py-2.5 rounded-lg border-none cursor-pointer hover:bg-purple-600 disabled:opacity-50">
            {busy && preview ? <Loader2 size={16} className="animate-spin"/> : <GitMerge size={16}/>} Fusionner
          </button>
        </div>
      </div>
    </div>
  );
}
