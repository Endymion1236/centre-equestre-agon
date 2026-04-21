"use client";
import { Card } from "@/components/ui";

/**
 * Vue tableau charge journalière — 2 colonnes par numéro d'ordre
 * Équidés 1-22 → colonne gauche | 23-46 → colonne droite
 */

interface PoneyChargeViewProps {
  creneaux: any[];
  equides: any[];
  availableHorses: any[];
}

export default function PoneyChargeView({ creneaux, equides, availableHorses }: PoneyChargeViewProps) {
  const toMinutes = (t: string) => { const [h, m] = (t || "00:00").split(":").map(Number); return h * 60 + m; };

  // Calcul charge par poney (avec rotation)
  const chargeMap: Record<string, { heures: number; seances: number; details: string[] }> = {};
  creneaux.forEach(c => {
    const dur = (toMinutes(c.endTime) - toMinutes(c.startTime)) / 60;
    (c.enrolled || []).forEach((e: any) => {
      if (!e.horseName) return;
      if (!chargeMap[e.horseName]) chargeMap[e.horseName] = { heures: 0, seances: 0, details: [] };
      let heuresReelles = dur;
      if (c.rotationPoneys) {
        const simultanes = creneaux.filter(other =>
          other.id !== c.id && other.rotationPoneys &&
          other.startTime < c.endTime && other.endTime > c.startTime &&
          (other.enrolled || []).some((oe: any) => oe.horseName === e.horseName)
        );
        if (simultanes.length > 0) heuresReelles = dur / (simultanes.length + 1);
      }
      chargeMap[e.horseName].seances++;
      chargeMap[e.horseName].heures = Math.round((chargeMap[e.horseName].heures + heuresReelles) * 10) / 10;
      chargeMap[e.horseName].details.push(`${c.activityTitle} ${c.startTime}-${c.endTime}`);
    });
  });

  // Trier les équidés par ordre, fallback alphabétique
  const displayName = (eq: any): string => (eq?.surnom && eq.surnom.trim()) ? eq.surnom : (eq?.name || "");
  const sorted = [...availableHorses].sort((a, b) => {
    const oa = a.ordre ?? 999;
    const ob = b.ordre ?? 999;
    if (oa !== ob) return oa - ob;
    return displayName(a).localeCompare(displayName(b));
  });

  const col1 = sorted.filter(h => (h.ordre ?? 999) <= 22);
  const col2 = sorted.filter(h => (h.ordre ?? 999) >= 23);
  const maxRows = Math.max(col1.length, col2.length);
  if (maxRows === 0) return null;

  const totalAttribues = Object.keys(chargeMap).length;

  const renderRow = (h: any) => {
    const ch = chargeMap[h.name];
    const heures = ch?.heures ?? 0;
    const seances = ch?.seances ?? 0;
    const overload = heures >= 4;
    const warning = heures >= 3;
    const color = overload ? "text-red-600 font-bold" : warning ? "text-orange-500 font-semibold" : heures > 0 ? "text-blue-700 font-semibold" : "text-slate-400";
    return (
      <tr key={h.id} className={`border-b border-gray-100 ${heures > 0 ? "" : "opacity-50"}`}>
        <td className="py-1 px-2 font-body text-[10px] text-slate-400 w-6 text-right">{h.ordre ?? "—"}</td>
        <td className="py-1 px-2 font-body text-xs text-slate-700 truncate max-w-[100px]" title={h.name}>{displayName(h)}</td>
        <td className={`py-1 px-2 font-body text-xs text-right tabular-nums ${color}`}>
          {heures > 0 ? `${heures}h` : "—"}
          {seances > 0 && <span className="ml-1 text-[9px] text-slate-400">({seances}s)</span>}
          {overload && " ⚠️"}
        </td>
      </tr>
    );
  };

  return (
    <Card padding="md" className="print:hidden">
      <div className="font-body text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
        📊 Charge journalière des poneys
        <span className="font-body text-[10px] text-slate-400 font-normal">({totalAttribues} attribué{totalAttribues > 1 ? "s" : ""})</span>
      </div>

      <div className="flex gap-4">
        {/* Colonne gauche — équidés 1 à 22 */}
        <div className="flex-1 min-w-0">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-blue-100">
                <th className="py-1 px-2 font-body text-[9px] font-semibold text-slate-400 uppercase text-right w-6">#</th>
                <th className="py-1 px-2 font-body text-[9px] font-semibold text-slate-400 uppercase text-left">Équidé</th>
                <th className="py-1 px-2 font-body text-[9px] font-semibold text-slate-400 uppercase text-right">Heures</th>
              </tr>
            </thead>
            <tbody>
              {col1.map(renderRow)}
              {col1.length === 0 && (
                <tr><td colSpan={3} className="py-3 text-center font-body text-xs text-slate-400">Aucun équidé (n°1-22)</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Séparateur */}
        <div className="w-px bg-gray-200 flex-shrink-0" />

        {/* Colonne droite — équidés 23 à 46 */}
        <div className="flex-1 min-w-0">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-blue-100">
                <th className="py-1 px-2 font-body text-[9px] font-semibold text-slate-400 uppercase text-right w-6">#</th>
                <th className="py-1 px-2 font-body text-[9px] font-semibold text-slate-400 uppercase text-left">Équidé</th>
                <th className="py-1 px-2 font-body text-[9px] font-semibold text-slate-400 uppercase text-right">Heures</th>
              </tr>
            </thead>
            <tbody>
              {col2.map(renderRow)}
              {col2.length === 0 && (
                <tr><td colSpan={3} className="py-3 text-center font-body text-xs text-slate-400">Aucun équidé (n°23-46)</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-100">
        <span className="font-body text-[10px] text-slate-400">⚠️ = surcharge 4h+</span>
        <span className="font-body text-[10px] text-orange-500">3h+ = attention</span>
      </div>
    </Card>
  );
}
