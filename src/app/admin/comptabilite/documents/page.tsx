"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { DOCUMENTS_COMPTABLES, ENTETE_JOURNAL, MAX_LIGNES_DOCUMENTS, type TypeDocumentComptable } from "@/lib/documents-comptables";

type Apercu = { nombre: number; comptes: number; totalDebit: number; totalCredit: number; resultat: number; empreinte: string; sources: string[]; avertissements: string[]; moisPresents: string[] };
const descriptions: Record<TypeDocumentComptable, string> = {
  journal: "Toutes les écritures, par date, journal et pièce.",
  "grand-livre": "Le détail de chaque compte avec son solde progressif.",
  balance: "Les débits, crédits et soldes de tous les comptes.",
  centralisateur: "Les totaux de chaque journal, mois par mois.",
  bilan: "La situation nette des comptes et le résultat de la période, à compléter pour la clôture.",
};
const euros = (n: number) => (n / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
function sauver(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function DocumentsComptablesPage() {
  const { isAdmin } = useAuth();
  const [debut, setDebut] = useState(() => { const d = new Date(); return `${d.getFullYear() - (d.getMonth() < 6 ? 1 : 0)}-07-01`; });
  const [fin, setFin] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("celeris"), [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  function invalider() { setApercu(null); setMessage(""); }
  async function generer(format: "apercu" | "zip" | TypeDocumentComptable) {
    setBusy(true); setMessage(format === "apercu" ? "Vérification de toutes les écritures de la période…" : format === "zip" ? "Génération des cinq documents complets. Les journaux volumineux peuvent prendre un peu de temps…" : "Génération du document complet…");
    if (format === "apercu") setApercu(null);
    try {
      const form = new FormData();
      form.append("debut", debut); form.append("fin", fin); form.append("source", source); form.append("format", format);
      if (source === "fichier" && fichier) form.append("fichier", fichier);
      if (apercu && format !== "apercu") form.append("empreinte", apercu.empreinte);
      const r = await authFetch("/api/admin/comptabilite/documents", { method: "POST", body: form });
      if (!r.ok) { if (r.status === 409) setApercu(null); const d = await r.json(); throw new Error(d.error || "Génération impossible."); }
      if (format === "apercu") { setApercu(await r.json()); setMessage("Vérification terminée. Vous pouvez télécharger les documents ci-dessous."); }
      else {
        sauver(await r.blob(), `${format === "zip" ? "documents_comptables" : format}_${debut}_${fin}_preparatoire.${format === "zip" ? "zip" : "pdf"}`);
        setMessage("Téléchargement prêt.");
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Génération impossible."); }
    finally { setBusy(false); }
  }
  if (!isAdmin) return <p>Accès administrateur requis.</p>;
  return <main className="min-w-0 w-full space-y-5">
    <Link href="/admin/comptabilite" className="underline">← Comptabilité</Link>
    <h1 className="text-2xl font-bold">Documents comptables</h1>
    <p>Préparez les cinq états à partir d’un même journal comptable. Chaque PDF indique sa source, sa période et les contrôles restant à effectuer.</p>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
      <p className="font-semibold">Des documents préparatoires, à faire valider pour la clôture.</p>
      <p>Les dépenses, justificatifs et comptes proposés dans l’application ne constituent pas encore un journal complet. Cette première version utilise l’historique Céleris ou un fichier d’écritures fourni par la comptable. Un export de ventes seul donne une vision partielle.</p>
    </div>
    <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-5 space-y-4" aria-labelledby="periode-documents">
      <h2 id="periode-documents" className="font-bold text-lg">1. Choisir le périmètre</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="min-w-0">Début de période / ouverture de l’exercice<input type="date" className="block w-full min-w-0 max-w-full rounded border p-2" value={debut} disabled={busy} onChange={e => { setDebut(e.target.value); invalider(); }} /></label>
        <label className="min-w-0">Fin de période<input type="date" className="block w-full min-w-0 max-w-full rounded border p-2" value={fin} disabled={busy} onChange={e => { setFin(e.target.value); invalider(); }} /></label>
      </div>
      <p className="text-sm text-slate-600">Pour le bilan de fin d’exercice, choisissez la date d’ouverture et incluez les à-nouveaux et les écritures de clôture. Les dates restent modifiables.</p>
      <label className="block min-w-0">Source des écritures<select className="block w-full min-w-0 max-w-full rounded border p-2" value={source} disabled={busy} onChange={e => { setSource(e.target.value); invalider(); }}><option value="celeris">Historique Céleris déjà importé</option><option value="fichier">Fichier d’écritures de la comptable</option></select></label>
      {source === "celeris" ? <p className="text-sm">Les mois de la période seront réunis. <Link href="/admin/comptabilite/celeris" className="underline">Consulter ou importer l’historique Céleris</Link>.</p> : <div className="space-y-2 min-w-0">
        <label className="block">Journal TXT ou CSV (4 Mo maximum)<input className="block w-full min-w-0 max-w-full" type="file" accept=".txt,.csv,text/plain,text/csv" disabled={busy} onChange={e => { setFichier(e.target.files?.[0] || null); invalider(); }} /></label>
        <p className="text-sm">Un seul fichier complet, jusqu’à {MAX_LIGNES_DOCUMENTS.toLocaleString("fr-FR")} lignes, avec les débits et crédits de chaque pièce. Dates AAAA-MM-JJ ou JJ-MM-AAAA ; montants en euros. Le fichier sert à cette génération et n’est pas enregistré dans l’historique.</p>
        <button className="underline text-sm" disabled={busy} onClick={() => sauver(new Blob(["\uFEFF" + ENTETE_JOURNAL + "\r\n"], { type: "text/csv;charset=utf-8" }), "modele_journal_comptable.csv")}>Télécharger les colonnes du modèle CSV</button>
      </div>}
      <button className="rounded bg-blue-900 text-white px-4 py-3 disabled:opacity-50" disabled={busy || !debut || !fin || source === "fichier" && !fichier} onClick={() => void generer("apercu")}>Vérifier les écritures</button>
    </section>
    <p role="status" className="break-words whitespace-pre-line rounded-lg bg-blue-50 p-4">{busy ? "Préparation en cours… " : ""}{message}</p>
    {apercu && <section className="space-y-4 min-w-0" aria-labelledby="telecharger-documents">
      <h2 id="telecharger-documents" className="font-bold text-lg">2. Télécharger les documents préparatoires</h2>
      <div className="rounded-xl border bg-white p-4 space-y-2 break-words">
        <p><b>{apercu.nombre} lignes</b> · {apercu.comptes} comptes · {apercu.moisPresents.length} mois avec écritures.</p>
        <p>Débits : <b>{euros(apercu.totalDebit)}</b> · Crédits : <b>{euros(apercu.totalCredit)}</b>. Totaux équilibrés.</p>
        <p className="text-sm">Ces totaux sont des mouvements comptables, pas le chiffre d’affaires.</p>
        <details><summary className="cursor-pointer font-medium">Source et contrôles à lire</summary><p className="mt-2 text-sm">{apercu.sources.join(" · ")}</p><ul className="list-disc pl-5 mt-3 space-y-2 text-sm">{apercu.avertissements.map(a => <li key={a}>{a}</li>)}</ul></details>
      </div>
      <button className="rounded bg-blue-900 text-white px-4 py-3 disabled:opacity-50" disabled={busy} onClick={() => void generer("zip")}>Télécharger les 5 PDF en ZIP</button>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(Object.entries(DOCUMENTS_COMPTABLES) as [TypeDocumentComptable, string][]).map(([type, titre]) => <article key={type} className="min-w-0 rounded-xl border bg-white p-4 flex flex-col gap-3">
          <h3 className="font-bold">{titre}</h3><p className="text-sm flex-1">{descriptions[type]}</p><button className="underline text-left disabled:opacity-50" disabled={busy} onClick={() => void generer(type)}>Télécharger le PDF</button>
        </article>)}
      </div>
    </section>}
  </main>;
}
