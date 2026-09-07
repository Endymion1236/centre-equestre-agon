"use client";
import { useState } from "react";
import { ACTIF, PASSIF, type AffectationsAnnuelles } from "@/lib/etats-annuels";
import type { BrouillonFiscal, PreparationFiscale } from "@/lib/preparation-fiscale";

type Ventilation = { compte: string; libelle: string; code: string; amortissement: boolean };
export default function PreparationAnnuelle({ fiscal, brouillon, onBrouillon, ventilation, affectations, onAffectations, disabled }: {
  fiscal: PreparationFiscale; brouillon: BrouillonFiscal; onBrouillon: (b: BrouillonFiscal) => void;
  ventilation: Ventilation[]; affectations: AffectationsAnnuelles; onAffectations: (a: AffectationsAnnuelles) => void; disabled: boolean;
}) {
  const [recherche, setRecherche] = useState("");
  const [limite, setLimite] = useState(80);
  const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-5 space-y-4">
    <h2 className="font-bold text-lg">2. Compléter les comptes annuels</h2>
    <p className="text-sm">Les calculs et contrôles ci-dessous correspondent à la dernière vérification. Après une modification, cliquez sur « Vérifier les écritures et les tableaux » pour les actualiser et autoriser les téléchargements.</p>
    <details className="rounded-lg border p-3">
      <summary className="font-semibold cursor-pointer">Vérifier le rattachement des comptes au bilan</summary>
      <p className="text-sm my-3">Les rubriques sont proposées d’après les numéros de comptes. Vérifiez en particulier les animaux, les stocks et les comptes spécifiques de l’exploitation. Une correction s’applique aussi à N-1.</p>
      <label className="block text-sm">Rechercher un compte<input className="block w-full min-w-0 rounded border p-2" value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Numéro ou libellé" /></label>
      <div className="space-y-3 mt-3 max-h-96 overflow-y-auto">
        {ventilation.filter(v => `${v.compte} ${v.libelle}`.toLocaleLowerCase("fr").includes(recherche.toLocaleLowerCase("fr"))).slice(0, limite).map(v => <label key={v.compte} className="block min-w-0 border-b pb-3 text-sm">
          <span className="break-words">{v.compte} · {v.libelle}{v.amortissement ? " — amortissement / dépréciation" : ""}</span>
          <select className="block w-full min-w-0 max-w-full rounded border p-2 mt-1" disabled={disabled} value={affectations[v.compte] || v.code} onChange={e => onAffectations({ ...affectations, [v.compte]: e.target.value })}>
            <optgroup label="Actif">{ACTIF.map(([code, label]) => <option value={code} key={code}>{code} · {label}</option>)}</optgroup>
            {!v.amortissement && <optgroup label="Passif">{PASSIF.map(([code, label]) => <option value={code} key={code}>{code} · {label}</option>)}</optgroup>}
          </select>
        </label>)}
      </div>
      {ventilation.length > limite && <button className="underline text-sm mt-2" onClick={() => setLimite(limite + 80)}>Afficher davantage de comptes (ou préciser la recherche)</button>}
    </details>
    <p className="text-sm"><b>15 tableaux fiscaux de préparation</b> · {fiscal.manquants} cases à compléter lors du dernier contrôle. Les informations ne sont pas enregistrées automatiquement : utilisez « Enregistrer mon brouillon » pour les retrouver.</p>
    {fiscal.controles.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{fiscal.controles.map(c => <li key={c}>{c}</li>)}</ul>}
    {fiscal.tableaux.map(t => <details className="min-w-0 rounded-lg border p-3" key={t.id}>
      <summary className="cursor-pointer font-semibold break-words">{t.id} · {t.titre} <span className="font-normal text-sm">— {t.manquants} à compléter{t.controles.length ? `, ${t.controles.length} écart(s)` : ""}</span></summary>
      <p className="text-sm mt-3">{t.aide}</p>
      {t.controles.length > 0 && <ul className="list-disc pl-5 text-sm text-red-800 mt-3">{t.controles.map(c => <li key={c}>{c}</li>)}</ul>}
      {t.lignes.some(l => l.cellules.some(c => c.saisie && c.valeur === null)) && <button type="button" disabled={disabled} className="underline text-sm my-3 disabled:opacity-50" onClick={() => {
        const valeurs = { ...brouillon.valeurs };
        for (const l of t.lignes) for (const c of l.cellules) if (c.saisie && c.valeur === null && !valeurs[c.cle]?.trim()) valeurs[c.cle] = c.type === "montant" ? "0" : "Néant";
        onBrouillon({ ...brouillon, valeurs, revues: brouillon.revues.filter(id => id !== t.id) });
      }}>J’ai vérifié : renseigner zéro / néant dans les cases encore vides de ce tableau</button>}
      <div className="space-y-4 mt-3">
        {t.lignes.map(l => <fieldset key={l.id} className="min-w-0 rounded border p-3">
          <legend className="px-1 text-sm font-semibold break-words">{l.libelle}</legend>
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            {l.cellules.map(c => <label key={c.cle} className={`block min-w-0 text-sm ${c.type === "texte" ? "lg:col-span-2" : ""}`}>
              {c.libelle}
              {c.saisie ? c.type === "texte" ? <textarea className="block w-full min-w-0 rounded border p-2" rows={2} maxLength={500} disabled={disabled} value={brouillon.valeurs[c.cle] ?? (typeof c.valeur === "string" ? c.valeur : "")} placeholder="À compléter" onChange={e => onBrouillon({ ...brouillon, valeurs: { ...brouillon.valeurs, [c.cle]: e.target.value }, revues: brouillon.revues.filter(id => id !== t.id) })} /> :
                <input className="block w-full min-w-0 rounded border p-2" inputMode="decimal" maxLength={20} disabled={disabled} value={brouillon.valeurs[c.cle] ?? (typeof c.valeur === "number" ? (c.valeur / 100).toFixed(2).replace(".", ",") : "")} placeholder="À compléter, en euros" onChange={e => onBrouillon({ ...brouillon, valeurs: { ...brouillon.valeurs, [c.cle]: e.target.value }, revues: brouillon.revues.filter(id => id !== t.id) })} /> :
                <span className="block rounded bg-slate-50 p-2 break-words">{c.valeur === null ? "Calcul en attente" : typeof c.valeur === "number" ? `${euros(c.valeur)} €` : c.valeur} <span className="text-xs text-slate-600">· calculé</span></span>}
            </label>)}
          </div>
        </fieldset>)}
      </div>
      <label className="flex items-start gap-2 text-sm mt-4"><input type="checkbox" disabled={disabled} checked={brouillon.revues.includes(t.id)} onChange={e => onBrouillon({ ...brouillon, revues: e.target.checked ? [...brouillon.revues.filter(id => id !== t.id), t.id] : brouillon.revues.filter(id => id !== t.id) })} />J’ai relu les informations de ce tableau. La validation par la comptable reste à effectuer.</label>
    </details>)}
  </section>;
}
