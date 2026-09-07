"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { COMPTES_BANQUE_DEPENSE } from "@/lib/banque-depense";
import { compteBanque } from "@/lib/plan-comptable-achats";
import { CATEGORIES_IMPORT, type OperationImport, type DecisionsImport, type DecisionImport } from "@/lib/import-bancaire";
import type { ApercuImport } from "@/lib/import-bancaire-ecritures";

export type ReleveAComparer = { empreinte: string; nom: string; compte: string; mois: string; operations: OperationImport[] };
const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const categories = CATEGORIES_IMPORT.map(c => ({ value: c, label: c === "hors-depenses" ? "À classer / hors dépenses" : c }));
const etats = { nouveau: "Nouveau débit", rapproche: "Correspondance trouvée", deja: "Déjà traité", ambigu: "À vérifier", ignore: "À ignorer", archive: "Déjà exclu ou archivé" };
const champ = "w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2";
async function appel(body: Record<string, unknown>) {
  const res = await authFetch("/api/admin/depenses/import-bancaire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error || "Import indisponible."); return data;
}
export default function ImportMouvementsBancaires({ pdf, onImported }: { pdf?: ReleveAComparer; onImported?: (mois: string) => void }) {
  const [compte, setCompte] = useState(pdf ? compteBanque(pdf.compte).compte : "");
  const [texte, setTexte] = useState(""), [nom, setNom] = useState("");
  const [debut, setDebut] = useState(""), [fin, setFin] = useState("");
  const [resultat, setResultat] = useState<ApercuImport | null>(null), [decisions, setDecisions] = useState<DecisionsImport>({});
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [erreur, setErreur] = useState(""), [info, setInfo] = useState("");
  const [filtre, setFiltre] = useState("a-traiter"), [page, setPage] = useState(0);
  const signaturePdf = JSON.stringify(pdf);
  useEffect(() => {
    if (pdf) {
      setCompte(compteBanque(pdf.compte).compte);
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(pdf.mois)) {
        setDebut(pdf.mois + "-01");
        const d = new Date(pdf.mois + "-01T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); setFin(d.toISOString().slice(0, 10));
      }
    }
    setResultat(null); setDecisions({}); setInfo(""); setDirty(false); setPage(0);
    // La signature inclut les corrections apportées à la lecture du PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signaturePdf]);
  const invalider = () => { setResultat(null); setDecisions({}); setInfo(""); setPage(0); };
  const source = () => pdf ? { format: "pdf", empreinte: pdf.empreinte, compte, nom: pdf.nom, debut, fin, operations: pdf.operations }
    : { format: "csv", compte, nom, texte };
  const comparer = async () => {
    setBusy(true); setErreur(""); setInfo("");
    try { const r = await appel({ action: "apercu", source: source(), decisions }); setResultat(r); setDirty(false); setPage(0); }
    catch (e) { setErreur((e as Error).message); setDirty(true); }
    finally { setBusy(false); }
  };
  const choisir = (ref: string, d: DecisionImport) => { setDecisions(prev => ({ ...prev, [ref]: { ...prev[ref], ...d } })); setDirty(true); setInfo(""); };
  const enregistrer = async () => {
    if (!resultat || dirty || resultat.plan.ambigus || busy) return;
    setBusy(true); setErreur(""); let effectuees = 0;
    try {
      let courant = resultat;
      const choixAttendus = new Map(resultat.plan.lignes.map(l => [l.operation.ref, JSON.stringify([l.etat, l.cible, l.operation.poste])]));
      // Le fichier entier est rapproché avant de découper les écritures, y compris les doublons entre lots.
      for (let lot = 0; courant.plan.aEnregistrer.length && lot < 12; lot++) {
        if (courant.plan.ambigus) throw new Error("De nouvelles correspondances sont à vérifier. Les lots précédents sont conservés.");
        const r = await appel({ action: "enregistrer", source: source(), decisions, version: courant.version, selection: courant.plan.aEnregistrer.slice(0, 200) });
        effectuees += r.enregistrees;
        setInfo(`${effectuees} opération(s) traitée(s)…`);
        courant = await appel({ action: "apercu", source: source(), decisions });
        setResultat(courant);
        if (courant.plan.lignes.some(l => courant.plan.aEnregistrer.includes(l.operation.ref) && choixAttendus.get(l.operation.ref) !== JSON.stringify([l.etat, l.cible, l.operation.poste])))
          throw new Error("Le rapprochement des opérations restantes a changé. Vérifiez le nouvel aperçu avant de confirmer la suite.");
      }
      if (courant.plan.aEnregistrer.length) throw new Error("Import interrompu. Relancez le rapprochement pour traiter la suite.");
      setInfo(`${effectuees} opération(s) traitée(s). Les catégories et justificatifs existants sont conservés.${courant.plan.nonRetrouves.length ? ` ${courant.plan.nonRetrouves.length} débit(s) CSV restent à vérifier ci-dessous.` : ""}`);
      onImported?.(courant.source.fin.slice(0, 7));
    } catch (e) { setErreur(`${(e as Error).message}${effectuees ? ` ${effectuees} opération(s) ont déjà été traitées. Relancer ne les recréera pas.` : ""}`); setDirty(true); if (effectuees) onImported?.(resultat.source.fin.slice(0, 7)); }
    finally { setBusy(false); }
  };
  const lignes = resultat?.plan.lignes.filter(l => filtre === "tout" ? true : filtre === "ambigus" ? l.etat === "ambigu" : l.etat !== "deja") || [];
  const contenu = <div className="min-w-0 space-y-4 pt-3 text-sm">
    <p>{pdf ? "Rapprochez tous les débits lus avec les opérations déjà importées en CSV ou saisies. Les correspondances conservent leurs catégories et justificatifs."
      : "Importez les mouvements pendant le mois. Les débits déjà présents sont reconnus ; les nouveaux restent à catégoriser et à justifier."}</p>
    <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-70">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0">Compte bancaire du fichier
          <select className={champ} value={compte} onChange={e => { setCompte(e.target.value); invalider(); }}>
            <option value="">Choisir le compte bancaire</option>{COMPTES_BANQUE_DEPENSE.map(c => <option key={c.compte} value={c.compte}>{c.libelle} · {c.compte}</option>)}
          </select>
        </label>
        {!pdf && <label className="min-w-0">Export des mouvements (.csv ou .tsv)
          <input className={champ} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={async e => {
            const f = e.target.files?.[0]; invalider(); setTexte(""); setNom(""); setErreur(""); if (!f) return;
            if (f.size > 2_000_000) { setErreur("CSV de 2 Mo maximum."); return; }
            setBusy(true);
            try { const bytes = await f.arrayBuffer(); let raw: string; try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { raw = new TextDecoder("windows-1252").decode(bytes); }
              setTexte(raw); setNom(f.name);
            } catch { setErreur("Impossible de lire ce fichier."); } finally { setBusy(false); }
          }} />
        </label>}
      </div>
      {pdf && <div className="space-y-2"><p>Vérifiez la période imprimée sur le relevé. Elle sert à repérer les débits CSV manquants.</p>
        <div className="grid gap-3 sm:grid-cols-2"><label>Début du relevé<input type="date" className={champ} value={debut} onChange={e => { setDebut(e.target.value); invalider(); }} /></label>
          <label>Fin du relevé<input type="date" className={champ} value={fin} onChange={e => { setFin(e.target.value); invalider(); }} /></label></div>
      </div>}
      {!pdf && <p className="text-slate-600">Colonnes acceptées : Date, Libellé et Débit/Crédit, ou Montant signé. Les encaissements continuent de s’importer dans leur écran habituel. En fin de mois : <Link className="underline" href="/admin/comptabilite/tresorerie">importer le PDF dans Trésorerie</Link>.</p>}
      <button type="button" disabled={!compte || (!pdf && !texte) || !!pdf && (!debut || !fin)} onClick={() => void comparer()} className="rounded bg-blue-900 px-4 py-2 text-white disabled:opacity-50">
        {busy ? "Traitement en cours…" : resultat ? "Actualiser le rapprochement" : pdf ? "Rapprocher les débits du PDF" : "Lire le CSV et comparer"}
      </button>
      {resultat && <div className="space-y-4">
        <div className="rounded border bg-slate-50 p-3">
          <p><b>{resultat.source.operations.length} débits · {euros(resultat.source.operations.reduce((n, o) => n + o.centimes, 0) / 100)}</b> · du {resultat.source.debut} au {resultat.source.fin}</p>
          <p>{resultat.plan.nouveaux} nouveaux · {resultat.plan.rapproches} à rapprocher · {resultat.plan.deja} déjà traités · <b>{resultat.plan.ambigus} à vérifier</b></p>
          {resultat.source.credits > 0 && <p>{resultat.source.credits} encaissement(s), soit {euros(resultat.source.creditsCentimes / 100)}, laissés hors de cet import de dépenses.</p>}
        </div>
        <label className="block">Afficher <select className={champ} value={filtre} onChange={e => { setFiltre(e.target.value); setPage(0); }}><option value="a-traiter">Opérations à traiter</option><option value="ambigus">Correspondances à vérifier</option><option value="tout">Toutes les opérations</option></select></label>
        <div className="space-y-3">{lignes.slice(page * 25, (page + 1) * 25).map(l => {
          const o = l.operation, choix = decisions[o.ref] || {}, verrouille = !!l.cible && l.etat === "deja" || l.etat === "archive";
          return <article key={o.ref} className={`min-w-0 rounded-lg border p-3 space-y-2 ${l.etat === "ambigu" ? "border-amber-400 bg-amber-50" : "bg-white"}`}>
            <div className="flex flex-wrap justify-between gap-2"><b className="min-w-0 break-words">{o.date} · {o.libelle}</b><b>{euros(o.centimes / 100)}</b></div>
            <p><b>{etats[l.etat]}</b> — {l.motif}</p>
            {l.cible && <p className="text-slate-600">Catégorie conservée : {l.candidats.find(c => c.id === l.cible)?.poste || "voir la dépense existante"}</p>}
            {!verrouille && <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <label>Action<select className={champ} value={choix.mode === "lier" ? `lier:${choix.cible}` : choix.mode || "auto"} onChange={e => {
                const v = e.target.value; choisir(o.ref, v.startsWith("lier:") ? { mode: "lier", cible: v.slice(5) } : { mode: v === "auto" ? undefined : v as DecisionImport["mode"], cible: undefined });
              }}><option value="auto">Utiliser la proposition</option>
                {l.candidats.filter(c => !c.archive && !c.rapprochementExclu && Math.round(c.montant * 100) === o.centimes).map(c => <option key={c.id} value={`lier:${c.id}`}>Lier à {c.dateOperation || c.mois} · {c.fournisseur} · {euros(c.montant)} · {c.poste}</option>)}
                <option value="nouveau">Créer un paiement distinct</option><option value="ignorer">Ignorer ce débit</option>
              </select></label>
              {(l.etat === "nouveau" || choix.mode === "nouveau") && <label>Catégorie proposée<select className={champ} value={choix.poste || o.poste} onChange={e => choisir(o.ref, { poste: e.target.value })}>{categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>}
              {["nouveau", "ignorer"].includes(choix.mode || "") && <label className="md:col-span-2">Motif de ce choix<input className={champ} maxLength={300} value={choix.motif || ""} onChange={e => choisir(o.ref, { motif: e.target.value })} placeholder="Ex. deux paiements distincts visibles sur le relevé" /></label>}
            </div>}
            {l.etat === "ambigu" && l.candidats.length > 0 && <ul className="text-xs text-slate-700 space-y-1">{l.candidats.map(c => <li key={c.id}>{c.dateOperation || `${c.mois} (date absente)`} · {c.fournisseur} · {euros(c.montant)} · {c.poste}{c.archive || c.rapprochementExclu ? " · exclu / archivé" : ""}</li>)}</ul>}
          </article>;
        })}</div>
        {lignes.length > 25 && <div className="flex flex-wrap gap-4 items-center"><button type="button" className="underline disabled:opacity-40" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédent</button><span>Page {page + 1} / {Math.ceil(lignes.length / 25)}</span><button type="button" className="underline disabled:opacity-40" disabled={(page + 1) * 25 >= lignes.length} onClick={() => setPage(p => p + 1)}>Suivant</button></div>}
        {dirty && <p className="text-amber-800">Actualisez le rapprochement pour vérifier vos choix avant de les enregistrer.</p>}
        <button type="button" className="rounded bg-green-800 px-4 py-2 text-white disabled:opacity-50" disabled={dirty || !!resultat.plan.ambigus || !resultat.plan.aEnregistrer.length} onClick={() => void enregistrer()}>Confirmer et enregistrer ({resultat.plan.aEnregistrer.length})</button>
        {pdf && <div className="rounded border p-3 space-y-2"><b>Débits CSV non retrouvés sur ce relevé : {resultat.plan.nonRetrouves.length}</b>
          {resultat.plan.nonRetrouves.length ? <><p>Vérifiez la période, la lecture du PDF et les opérations ci-dessous. Elles restent conservées ; aucun montant n’est supprimé ni corrigé automatiquement.</p><ul className="space-y-1">{resultat.plan.nonRetrouves.map(c => <li key={c.id}>{c.dateOperation} · {c.fournisseur} · {euros(c.montant)}</li>)}</ul></> : <p>Tous les débits CSV de cette période et de ce compte ont une correspondance dans les débits lus, ou aucun débit CSV n’a encore été importé.</p>}
          <p className="text-slate-600">Ce contrôle porte sur les débits lus. Vérifiez aussi les pages du PDF et le solde du relevé.</p>
        </div>}
      </div>}
    </fieldset>
    {erreur && <p role="alert" className="text-red-700">{erreur}</p>}{info && <p role="status" className="text-green-800">{info}</p>}
  </div>;
  return pdf ? <section className="rounded-lg border border-blue-200 bg-white p-4"><h3 className="font-semibold">Rapprocher le relevé de fin de mois</h3>{contenu}</section>
    : <details className="rounded-lg border bg-white p-4"><summary className="cursor-pointer font-semibold">Importer des mouvements bancaires CSV</summary>{contenu}</details>;
}
