"use client";
import { useState } from "react";
import Link from "next/link";
import { COMPTES } from "@/lib/plan-comptable-achats";
import { COMPTES_BANQUE_DEPENSE } from "@/lib/banque-depense";
import type { CorrectionsAchats, JournalAchatsPreparatoire } from "@/lib/journal-achats-preparatoire";

export type ApercuAchats = Omit<JournalAchatsPreparatoire, "ecritures">;
export default function RaccordementAchats({ achats, corrections, onChange, disabled }: { achats: ApercuAchats; corrections: CorrectionsAchats; onChange: (c: CorrectionsAchats) => void; disabled: boolean }) {
  const [filtre, setFiltre] = useState("a-completer");
  const [limite, setLimite] = useState(80);
  const lignes = achats.controles.filter(l => filtre === "tous" || l.etat === filtre);
  const euros = (n: number) => (n / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  return <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-5 space-y-4">
    <h2 className="font-bold text-lg">Raccorder les achats de l’application</h2>
    <p><b>{achats.inclus} dépenses retenues</b> · {euros(achats.montant)} TTC · {achats.bloques} à compléter · {achats.exclus} exclues.</p>
    <p className="text-sm">Les dépenses retenues alimentent les cinq documents. Aucune TVA n’est déduite sans montant confirmé et facture cohérente. Les corrections ci-dessous servent uniquement à ce dossier ; enregistrez votre brouillon pour les conserver.</p>
    {achats.bloques > 0 && <p className="rounded bg-amber-50 p-3 text-amber-900">Complétez les dépenses en attente ou excluez-les avec un motif avant de télécharger. Elles ne seront pas omises silencieusement.</p>}
    <label className="block">Afficher<select className="block w-full rounded border p-2" value={filtre} onChange={e => setFiltre(e.target.value)}><option value="a-completer">À compléter</option><option value="inclus">Retenues — comptes et TVA à vérifier</option><option value="exclu">Exclues</option><option value="tous">Toutes les opérations</option></select></label>
    <div className="space-y-3 max-h-[36rem] overflow-y-auto">
      {lignes.slice(0, limite).map(l => {
        const correction = corrections[l.id] || {};
        const modifier = (key: string, value: string | boolean) => onChange({ ...corrections, [l.id]: { ...correction, [key]: value } });
        return <article className="min-w-0 rounded-lg border p-3 space-y-3" key={l.id}>
          <div><h3 className="font-semibold break-words">{l.fournisseur} · {euros(l.montant)}</h3><p className="text-sm">Mois : {l.mois} · {l.facture ? `Facture ${l.facture}` : "Numéro de facture non renseigné"}</p></div>
          {l.motifs.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{l.motifs.map(m => <li key={m}>{m}</li>)}</ul>}
          {(l.etat === "inclus" || l.etat === "a-completer" || correction.exclure) && <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="min-w-0 text-sm">Date du règlement<input type="date" className="block w-full min-w-0 rounded border p-2" disabled={disabled} value={correction.date ?? l.date} onChange={e => modifier("date", e.target.value)} /></label>
              <label className="min-w-0 text-sm">Compte d’achat / immobilisation<input className="block w-full min-w-0 rounded border p-2" list="comptes-achats-documents" disabled={disabled} maxLength={15} value={correction.compte ?? l.compte} onChange={e => modifier("compte", e.target.value.toUpperCase())} /></label>
              <label className="min-w-0 text-sm">Banque du règlement<select className="block w-full min-w-0 rounded border p-2" disabled={disabled} value={correction.banque ?? l.banque} onChange={e => modifier("banque", e.target.value)}><option value="">À identifier</option>{COMPTES_BANQUE_DEPENSE.map(c => <option key={c.compte} value={c.compte}>{c.compte} · {c.libelle}</option>)}</select></label>
              <label className="min-w-0 text-sm">TVA déductible confirmée (€)<input inputMode="decimal" className="block w-full min-w-0 rounded border p-2" disabled={disabled} maxLength={20} placeholder="0 — TTC provisoire, sans déduction" value={correction.tva ?? ""} onChange={e => modifier("tva", e.target.value)} /></label>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={!!correction.exclure} onChange={e => modifier("exclure", e.target.checked)} />Exclure cette opération de ce dossier</label>
            {correction.exclure && <label className="block text-sm">Motif obligatoire<input className="block w-full min-w-0 rounded border p-2" maxLength={300} disabled={disabled} value={correction.motif || ""} onChange={e => modifier("motif", e.target.value)} /></label>}
          </>}
          <Link className="underline text-sm" href={`/admin/comptabilite/depenses?mois=${encodeURIComponent(l.mois)}`}>Contrôler la dépense et son justificatif</Link>
          {l.notes.length > 0 && <details><summary className="cursor-pointer text-sm">Points à revoir</summary><ul className="list-disc pl-5 text-sm">{l.notes.map(n => <li key={n}>{n}</li>)}</ul></details>}
        </article>;
      })}
    </div>
    {lignes.length > limite && <button className="underline text-sm" onClick={() => setLimite(limite + 80)}>Afficher davantage d’opérations ({limite} sur {lignes.length} visibles)</button>}
    <datalist id="comptes-achats-documents">{Object.entries(COMPTES).filter(([compte]) => /^[26]/.test(compte)).map(([compte, label]) => <option key={compte} value={compte}>{label}</option>)}</datalist>
    <p className="text-sm">Les factures non réglées et les cas complexes (acomptes, échéances, escomptes, facture d’un autre exercice) nécessitent leurs écritures complètes. L’aperçu conserve chaque exclusion et son motif.</p>
  </section>;
}
