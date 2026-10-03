"use client";
/**
 * Saisie des formules d'un créneau « sur demande » (anniversaire, cours
 * particulier) : prix, cavaliers de la famille, descriptif. Une formule sans
 * prix n'est pas proposée aux familles. Règles : lib/creneau-sur-demande.
 */
import type { FormuleSurDemande } from "@/lib/creneau-sur-demande";

export default function EditeurFormulesSurDemande({ formules, onChange }: {
  formules: FormuleSurDemande[];
  onChange: (f: FormuleSurDemande[]) => void;
}) {
  const maj = (i: number, patch: Partial<FormuleSurDemande>) => onChange(formules.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const champ = "px-2 py-1.5 rounded-lg border border-purple-200 font-body text-sm bg-white focus:border-purple-500 focus:outline-none";
  return (
    <div className="flex flex-col gap-2">
      {formules.map((f, i) => (
        <div key={f.id} className="rounded-lg border border-purple-100 bg-white p-2.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input value={f.label} onChange={e => maj(i, { label: e.target.value })} className={`${champ} font-semibold flex-1 min-w-[140px]`} />
            <label className="flex items-center gap-1 font-body text-xs text-slate-600">
              Prix TTC
              <input type="number" min={0} step="0.5" value={f.priceTTC || ""} placeholder="0 = non proposé"
                onChange={e => maj(i, { priceTTC: Number(e.target.value) || 0 })} className={`${champ} w-24 text-right`} />
              €{f.forfait ? " le groupe" : " / cavalier"}
            </label>
            <label className="flex items-center gap-1 font-body text-xs text-slate-600" title="Cavaliers de la famille inscrits au plus (les invités d'un anniversaire ne sont pas inscrits)">
              Cavaliers max
              <input type="number" min={1} max={20} value={f.places} onChange={e => maj(i, { places: Math.max(1, Number(e.target.value) || 1) })} className={`${champ} w-16 text-right`} />
            </label>
          </div>
          <input value={f.descriptif || ""} onChange={e => maj(i, { descriptif: e.target.value })} placeholder="Ce que la famille lit avant de choisir (durée, nombre d'invités, goûter…)" className={`${champ} w-full`} />
        </div>
      ))}
      <p className="font-body text-[11px] text-slate-500">Une formule à 0 € n&apos;est pas proposée. Anniversaire : forfait payé une fois par la famille ; cours particulier : prix par cavalier (fratrie possible).</p>
    </div>
  );
}
