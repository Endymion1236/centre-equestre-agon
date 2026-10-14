"use client";
import { useState } from "react";
import { estPromenadeADefinir, niveauDuCreneau, NIVEAUX_PROMENADE, LIBELLE_NIVEAU, resumeNiveau, type NiveauPromenade } from "@/lib/promenade-niveau";

/**
 * Promenade « niveau à définir », dans le panneau d'inscription : le niveau
 * retenu, et le moyen de le fixer quand le club inscrit lui-même (en ligne,
 * c'est la première famille qui le choisit). Rien pour un autre créneau.
 */
export function ChoixNiveauPromenade({ creneau, onFixer }: {
  creneau: any;
  onFixer: (niveau: NiveauPromenade | null) => Promise<void>;
}) {
  const [enCours, setEnCours] = useState(false);
  const [modifier, setModifier] = useState(false);
  if (!estPromenadeADefinir(creneau)) return null;
  const niveau = niveauDuCreneau(creneau);
  const nbInscrits = (creneau.enrolled || []).length;
  const agir = async (n: NiveauPromenade | null) => { setEnCours(true); try { await onFixer(n); setModifier(false); } finally { setEnCours(false); } };

  if (niveau && !modifier) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="font-body text-sm text-amber-900">
          Niveau de la promenade : <strong>{LIBELLE_NIVEAU[niveau]}</strong>
          <span className="block text-[11px] text-amber-700">{creneau.niveauFixePar === "club" ? "fixé par le club" : creneau.niveauFixePar ? `choisi à l'inscription de ${creneau.niveauFixePar}` : ""}</span>
        </div>
        <button type="button" disabled={enCours} onClick={() => setModifier(true)}
          className="font-body text-xs text-amber-800 underline bg-transparent border-none cursor-pointer disabled:opacity-50">
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="font-body text-xs font-semibold text-amber-900 uppercase tracking-wider">Promenade : quel niveau ?</div>
      {nbInscrits > 0 && !niveau && (
        <div className="font-body text-[11px] text-red-700">
          {nbInscrits} cavalier{nbInscrits > 1 ? "s" : ""} inscrit{nbInscrits > 1 ? "s" : ""} sans niveau fixé : en ligne, les familles peuvent encore choisir n&apos;importe quel niveau.
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {NIVEAUX_PROMENADE.map((n) => (
          <button key={n} type="button" disabled={enCours} onClick={() => agir(n)} title={resumeNiveau(n)}
            className={`p-2 rounded-lg border-2 bg-white text-center cursor-pointer hover:border-amber-400 disabled:opacity-50 font-body text-sm font-semibold text-amber-900 ${niveau === n ? "border-amber-500" : "border-amber-200"}`}>
            {LIBELLE_NIVEAU[n]}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="font-body text-[11px] text-amber-700">Le titre en ligne devient « {creneau.activityTitle} — niveau choisi », et seules les familles de ce niveau peuvent réserver.</div>
        {niveau && (
          <button type="button" disabled={enCours} onClick={() => agir(null)}
            className="font-body text-[11px] text-amber-800 underline bg-transparent border-none cursor-pointer whitespace-nowrap disabled:opacity-50">
            Remettre à définir
          </button>
        )}
      </div>
    </div>
  );
}
