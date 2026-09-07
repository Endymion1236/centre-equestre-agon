"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import type { EcritureCeleris, ImportCeleris } from "@/lib/import-comptable-celeris";

type Resume = { mois: string; nombre: number; totaux: ImportCeleris["totaux"]; nom?: string };
type Apercu = Resume & { doublon: boolean; conflit: boolean };
const endpoint = "/api/admin/comptabilite/celeris";
const euros = (n: number) => (n / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export default function CelerisPage() {
  const { user, isAdmin } = useAuth();
  const [imports, setImports] = useState<Resume[]>([]);
  const [selection, setSelection] = useState<{ fichier: File; apercu: Apercu } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lignes, setLignes] = useState<EcritureCeleris[]>([]);
  const [mois, setMois] = useState("");
  const [recherche, setRecherche] = useState("");
  const [journal, setJournal] = useState("");
  const [page, setPage] = useState(0);
  const charger = useCallback(async () => {
    const r = await authFetch(endpoint); const d = await r.json();
    if (!r.ok) throw new Error(d.error); setImports(d.imports);
  }, []);
  useEffect(() => { if (user && isAdmin) void charger().catch(e => setMessage(e.message)); }, [user, isAdmin, charger]);
  async function envoyer(fichier: File, action: "apercu" | "importer") {
    const form = new FormData(); form.append("fichier", fichier); form.append("action", action);
    const r = await authFetch(endpoint, { method: "POST", body: form }); const d = await r.json();
    if (!r.ok) throw new Error(d.error); return d;
  }
  async function apercu(fichier?: File) {
    setSelection(null); if (!fichier) return;
    setBusy(true); setMessage("");
    try { setSelection({ fichier, apercu: await envoyer(fichier, "apercu") }); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Analyse impossible"); }
    finally { setBusy(false); }
  }
  async function importer() {
    if (!selection) return; setBusy(true); setMessage("");
    try {
      const d = await envoyer(selection.fichier, "importer");
      setSelection(null); setMessage(d.doublon ? "Ce fichier est déjà importé." : `${d.mois} : ${d.nombre} écritures importées.`);
      await charger();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Import impossible"); }
    finally { setBusy(false); }
  }
  async function ouvrir(m: string) {
    setBusy(true); setMessage("");
    try {
      const r = await authFetch(`${endpoint}?mois=${m}`); const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setLignes(d.lignes); setMois(m); setPage(0); setRecherche(""); setJournal("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Lecture impossible"); }
    finally { setBusy(false); }
  }
  const filtrees = lignes.filter(l => (!journal || l.journal === journal) &&
    [l.compte, l.piece, l.date, l.libelle, l.libelleCompte].join(" ").toLocaleLowerCase("fr").includes(recherche.toLocaleLowerCase("fr")));
  if (!isAdmin) return <p className="p-6">Accès administrateur requis.</p>;
  return <main className="mx-auto max-w-6xl p-6 space-y-6">
    <Link href="/admin/comptabilite" className="underline">← Comptabilité</Link>
    <h1 className="text-2xl font-bold">Historique comptable Céleris</h1>
    <Link href="/admin/comptabilite/documents" className="inline-block underline">Préparer le journal, le grand livre, la balance, le centralisateur et le bilan →</Link>
    <p>Importez un export TXT mensuel complet. Les écritures restent identifiées comme historique Céleris, sans créer de factures, de réservations ou d’encaissements dans la caisse.</p>
    <p className="rounded border bg-blue-50 p-4">Les totaux de ventes suivent les dates d’écriture. Les prestations facturées avant juillet et réalisées pendant l’été nécessitent un examen complémentaire. Cet historique n’est pas encore intégré au résultat ni au rapprochement de « Boucler le mois ».</p>
    <label className="block">Export Céleris (.txt)
      <input className="block mt-2" type="file" accept=".txt,.csv,text/plain" disabled={busy} onChange={e => { void apercu(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
    {busy && <p role="status">Traitement en cours…</p>}
    {message && <p role="status" className="border rounded p-4">{message}</p>}
    {selection && <section className="rounded border p-4 space-y-3">
      <h2 className="font-bold">Aperçu : {selection.fichier.name}</h2>
      <p>{selection.apercu.mois} · {selection.apercu.nombre} écritures équilibrées · HT {euros(selection.apercu.totaux.ht)} · TVA {euros(selection.apercu.totaux.tva)} · TTC {euros(selection.apercu.totaux.ttc)}</p>
      {selection.apercu.doublon ? <p>Déjà importé : aucune nouvelle écriture nécessaire.</p> : selection.apercu.conflit ? <p>Un export différent existe pour ce mois. Import bloqué pour éviter les doublons.</p> :
        <button disabled={busy} onClick={() => void importer()} className="rounded bg-blue-900 text-white px-4 py-2">Importer ce mois</button>}
    </section>}
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Mois importés</h2>
      {!imports.length && <p>Aucun export importé.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{["Mois", "Écritures", "Ventes HT", "TVA ventes", "Facturation TTC", ""].map((h, i) => <th className="p-2" key={i}>{h}</th>)}</tr></thead>
        <tbody>{imports.map(m => <tr key={m.mois} className="border-t"><td className="p-2">{m.mois}</td><td className="p-2">{m.nombre}</td><td className="p-2">{euros(m.totaux.ht)}</td><td className="p-2">{euros(m.totaux.tva)}</td><td className="p-2">{euros(m.totaux.ttc)}</td><td className="p-2"><button disabled={busy} className="underline" onClick={() => void ouvrir(m.mois)}>Voir les écritures</button></td></tr>)}</tbody>
      </table></div>
    </section>
    {mois && <section className="space-y-3">
      <h2 className="text-xl font-bold">Écritures de {mois}</h2>
      <div className="flex flex-wrap gap-4">
        <label>Rechercher <input className="border rounded p-2" placeholder="Nom, pièce, compte ou date" value={recherche} onChange={e => { setRecherche(e.target.value); setPage(0); }} /></label>
        <label>Journal <select className="border rounded p-2" value={journal} onChange={e => { setJournal(e.target.value); setPage(0); }}><option value="">Tous</option>{[...new Set(lignes.map(l => l.journal))].sort().map(j => <option key={j}>{j}</option>)}</select></label>
      </div>
      <p>{filtrees.length} écritures · Montants comptables débit/crédit, à ne pas additionner comme des recettes.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{["Date", "Journal", "Pièce", "Compte", "Libellé", "Débit", "Crédit"].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead>
        <tbody>{filtrees.slice(page * 100, (page + 1) * 100).map((l, i) => <tr key={i} className="border-t"><td className="p-2 whitespace-nowrap">{l.date.split("-").reverse().join("/")}</td><td className="p-2">{l.journal}</td><td className="p-2">{l.piece}</td><td className="p-2" title={l.libelleCompte}>{l.compte}</td><td className="p-2">{l.libelle}</td><td className="p-2 whitespace-nowrap">{euros(l.debit)}</td><td className="p-2 whitespace-nowrap">{euros(l.credit)}</td></tr>)}</tbody>
      </table></div>
      <div className="flex gap-4"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Précédent</button><span>Page {page + 1} / {Math.max(1, Math.ceil(filtrees.length / 100))}</span><button disabled={(page + 1) * 100 >= filtrees.length} onClick={() => setPage(p => p + 1)}>Suivant →</button></div>
    </section>}
  </main>;
}
