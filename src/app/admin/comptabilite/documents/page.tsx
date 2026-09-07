"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { DOCUMENTS_COMPTABLES, ENTETE_JOURNAL, MAX_LIGNES_DOCUMENTS, type TypeDocumentComptable } from "@/lib/documents-comptables";

import { ENTETE_BALANCE, verifierAffectations, type AffectationsAnnuelles } from "@/lib/etats-annuels";
import { brouillonFiscalVide, verifierBrouillonFiscal, type PreparationFiscale } from "@/lib/preparation-fiscale";
import RaccordementAchats, { type ApercuAchats } from "./raccordement-achats";
import type { CorrectionsAchats } from "@/lib/journal-achats-preparatoire";
import PreparationAnnuelle from "./preparation-annuelle";

type Apercu = { raccordement: ApercuAchats | null; nombre: number; comptes: number; totalDebit: number; totalCredit: number; resultat: number; empreinte: string; sources: string[]; avertissements: string[]; moisPresents: string[]; achats: number; comptesAchats: number; charges: number; comptesCharges: number; fiscal: PreparationFiscale;
  annuel: { brut: number; amortissements: number; net: number; precedent: { periode: { debut: string; fin: string }; net: number; resultat: number; source: string } | null; ventilation: { compte: string; libelle: string; code: string; amortissement: boolean }[] } };
const descriptions: Record<TypeDocumentComptable, string> = {
  journal: "Toutes les écritures, par date, journal et pièce.",
  "grand-livre": "Le détail de chaque compte avec son solde progressif.",
  balance: "Les débits, crédits et soldes de tous les comptes.",
  centralisateur: "Les totaux de chaque journal, mois par mois.",
  bilan: "Actif brut/amortissements/net, passif et résultat avec N-1, détail des achats et 15 tableaux fiscaux préparatoires.",
};
const euros = (n: number) => (n / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
function sauver(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function DocumentsComptablesPage() {
  const { isAdmin } = useAuth();
  const [debut, setDebut] = useState(() => { const d = new Date(); return `${d.getFullYear() - (d.getMonth() < 6 ? 1 : 0)}-07-01`; });
  const [fin, setFin] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("celeris-achats"), [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [comparatif, setComparatif] = useState("aucun"), [debutPrecedent, setDebutPrecedent] = useState(""), [finPrecedente, setFinPrecedente] = useState("");
  const [fichierPrecedent, setFichierPrecedent] = useState<File | null>(null);
  const [brouillon, setBrouillon] = useState(() => brouillonFiscalVide(2026));
  const [affectations, setAffectations] = useState<AffectationsAnnuelles>({});
  const [preparation, setPreparation] = useState<Pick<Apercu, "fiscal" | "annuel"> | null>(null);
  const [raccordement, setRaccordement] = useState<ApercuAchats | null>(null);
  const [correctionsAchats, setCorrectionsAchats] = useState<CorrectionsAchats>({});
  function invalider() { setApercu(null); setMessage(""); }
  async function generer(format: "apercu" | "zip" | "fiscal" | TypeDocumentComptable) {
    setBusy(true); setMessage(format === "apercu" ? "Vérification de toutes les écritures de la période…" : format === "zip" ? "Génération des cinq documents complets. Les journaux volumineux peuvent prendre un peu de temps…" : "Génération du document complet…");
    if (format === "apercu") setApercu(null);
    try {
      const form = new FormData();
      form.append("debut", debut); form.append("fin", fin); form.append("source", source); form.append("format", format);
      if (source === "fichier" && fichier) form.append("fichier", fichier);
      form.append("comparatif", comparatif); form.append("debutPrecedent", debutPrecedent); form.append("finPrecedente", finPrecedente);
      if (["balance", "journal"].includes(comparatif) && fichierPrecedent) form.append("fichierPrecedent", fichierPrecedent);
      form.append("correctionsAchats", JSON.stringify(correctionsAchats));
      form.append("fiscal", JSON.stringify(brouillon)); form.append("affectations", JSON.stringify(affectations));
      if (apercu && format !== "apercu") form.append("empreinte", apercu.empreinte);
      const r = await authFetch("/api/admin/comptabilite/documents", { method: "POST", body: form });
      if (!r.ok) { if (r.status === 409) setApercu(null); const d = await r.json(); if (d.raccordement) setRaccordement(d.raccordement); throw new Error(d.error || "Génération impossible."); }
      if (format === "apercu") { const data: Apercu = await r.json(); setApercu(data); setPreparation(data); setRaccordement(data.raccordement); setMessage(data.raccordement?.bloques ? `${data.raccordement.bloques} achats restent à compléter ou à exclure avec un motif avant téléchargement.` : "Vérification terminée. Vous pouvez télécharger les documents ci-dessous."); }
      else {
        sauver(await r.blob(), `${format === "zip" ? "documents_comptables" : format}_${debut}_${fin}_preparatoire.${format === "zip" ? "zip" : "pdf"}`);
        setMessage("Téléchargement prêt.");
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Génération impossible."); }
    finally { setBusy(false); }
  }
  async function chargerBrouillon(f: File | undefined) {
    if (!f) return;
    try {
      if (f.size > 400_000) throw new Error("Brouillon de 400 Ko maximum.");
      const d = JSON.parse(await f.text());
      if (d.version !== 1 || !d.periode || typeof d.periode.debut !== "string" || typeof d.periode.fin !== "string") throw new Error("Brouillon annuel non reconnu.");
      const fiscal = verifierBrouillonFiscal(d.fiscal), ventilation = verifierAffectations(d.affectations);
      if (d.correctionsAchats && (typeof d.correctionsAchats !== "object" || Array.isArray(d.correctionsAchats))) throw new Error("Corrections d’achats invalides.");
      setCorrectionsAchats(d.correctionsAchats || {}); setRaccordement(null);
      setBrouillon(fiscal); setAffectations(ventilation); setDebut(d.periode.debut); setFin(d.periode.fin);
      if (d.precedent && typeof d.precedent.debut === "string" && typeof d.precedent.fin === "string") { setDebutPrecedent(d.precedent.debut); setFinPrecedente(d.precedent.fin); }
      setPreparation(null); invalider(); setMessage("Brouillon chargé. Resélectionnez les sources N et N-1 puis relancez la vérification.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Brouillon illisible."); }
  }
  if (!isAdmin) return <p>Accès administrateur requis.</p>;
  return <main className="min-w-0 w-full space-y-5">
    <Link href="/admin/comptabilite" className="underline">← Comptabilité</Link>
    <h1 className="text-2xl font-bold">Documents comptables</h1>
    <p>Préparez les cinq états à partir d’un même journal comptable. Chaque PDF indique sa source, sa période et les contrôles restant à effectuer.</p>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
      <p className="font-semibold">Des documents préparatoires, à faire valider pour la clôture.</p>
      <p>Les dépenses et justificatifs de l’application ne couvrent pas toutes les écritures de clôture. Vous pouvez compléter l’historique Céleris par les achats réglés de l’application, après contrôle des données manquantes, ou utiliser un journal complet de la comptable. Un export de ventes seul donne une vision partielle.</p>
    </div>
    <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-5 space-y-4" aria-labelledby="periode-documents">
      <h2 id="periode-documents" className="font-bold text-lg">1. Choisir le périmètre</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="min-w-0">Début de période / ouverture de l’exercice<input type="date" className="block w-full min-w-0 max-w-full rounded border p-2" value={debut} disabled={busy} onChange={e => { setDebut(e.target.value); invalider(); }} /></label>
        <label className="min-w-0">Fin de période<input type="date" className="block w-full min-w-0 max-w-full rounded border p-2" value={fin} disabled={busy} onChange={e => { setFin(e.target.value); invalider(); }} /></label>
      </div>
      <p className="text-sm text-slate-600">Pour le bilan de fin d’exercice, choisissez la date d’ouverture et incluez les à-nouveaux et les écritures de clôture. Les dates restent modifiables.</p>
      <label className="block min-w-0">Source des écritures<select className="block w-full min-w-0 max-w-full rounded border p-2" value={source} disabled={busy} onChange={e => { setSource(e.target.value); setRaccordement(null); invalider(); }}><option value="celeris-achats">Historique Céleris + achats réglés de l’application</option><option value="celeris">Historique Céleris seul</option><option value="fichier">Fichier d’écritures de la comptable</option></select></label>
      {source.startsWith("celeris") ? <p className="text-sm">Les mois de la période seront réunis. <Link href="/admin/comptabilite/celeris" className="underline">Consulter ou importer l’historique Céleris</Link>.</p> : <div className="space-y-2 min-w-0">
        <label className="block">Journal TXT ou CSV (4 Mo maximum)<input className="block w-full min-w-0 max-w-full" type="file" accept=".txt,.csv,text/plain,text/csv" disabled={busy} onChange={e => { setFichier(e.target.files?.[0] || null); invalider(); }} /></label>
        <p className="text-sm">Un seul fichier complet, jusqu’à {MAX_LIGNES_DOCUMENTS.toLocaleString("fr-FR")} lignes, avec les débits et crédits de chaque pièce. Dates AAAA-MM-JJ ou JJ-MM-AAAA ; montants en euros. Le fichier sert à cette génération et n’est pas enregistré dans l’historique.</p>
        <button className="underline text-sm" disabled={busy} onClick={() => sauver(new Blob(["\uFEFF" + ENTETE_JOURNAL + "\r\n"], { type: "text/csv;charset=utf-8" }), "modele_journal_comptable.csv")}>Télécharger les colonnes du modèle CSV</button>
      </div>}
      <details className="min-w-0 rounded-lg border p-3 space-y-3">
        <summary className="font-semibold cursor-pointer">Comparatif N-1 et millésime fiscal</summary>
        <label className="block">Source N-1<select className="block w-full min-w-0 rounded border p-2" disabled={busy} value={comparatif} onChange={e => { setComparatif(e.target.value); invalider(); }}><option value="aucun">Non fourni pour le moment</option><option value="balance">Balance complète de la comptable (CSV)</option><option value="journal">Journal complet de la comptable (TXT / CSV)</option><option value="celeris">Historique Céleris importé pour N-1</option></select></label>
        {comparatif !== "aucun" && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>Ouverture N-1<input className="block w-full min-w-0 rounded border p-2" type="date" disabled={busy} value={debutPrecedent} onChange={e => { setDebutPrecedent(e.target.value); invalider(); }} /></label>
            <label>Clôture N-1<input className="block w-full min-w-0 rounded border p-2" type="date" disabled={busy} value={finPrecedente} onChange={e => { setFinPrecedente(e.target.value); invalider(); }} /></label>
          </div>
          {["balance", "journal"].includes(comparatif) && <label className="block">Fichier N-1<input className="block w-full min-w-0 max-w-full" type="file" accept=".csv,.txt" disabled={busy} onChange={e => { setFichierPrecedent(e.target.files?.[0] || null); invalider(); }} /></label>}
          {comparatif === "balance" && <p className="text-sm">Balance complète des classes 1 à 7, avec les débits et crédits cumulés, ou les soldes débiteurs et créditeurs, en euros. <button className="underline" onClick={() => sauver(new Blob(["\uFEFF" + ENTETE_BALANCE + "\r\n"], { type: "text/csv;charset=utf-8" }), "modele_balance_N-1.csv")}>Télécharger le modèle</button>.</p>}
          <p className="text-sm">Les PDF du cabinet servent de référence visuelle. Pour les calculs N-1, charger une balance ou un journal structuré de l’exercice précédent. Fichiers N + N-1 et saisies : 4 Mo maximum au total.</p>
        </>}
        <label className="block">Millésime des tableaux fiscaux<select className="block w-full rounded border p-2" value={brouillon.millesime} disabled={busy} onChange={e => { setBrouillon({ ...brouillon, millesime: Number(e.target.value) as 2025 | 2026, valeurs: Object.fromEntries(Object.entries(brouillon.valeurs).filter(([key]) => !key.startsWith("2146bis.") && key !== "2151.XS.valeur")), revues: [] }); setPreparation(null); invalider(); }}><option value={2025}>2025 — dossier de référence</option><option value={2026}>2026</option></select></label>
        <p className="text-sm">Les tableaux sont destinés au test et à la préparation de la liasse agricole au réel normal. La comptable confirmera le millésime et le régime applicables.</p>
      </details>
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 text-sm">
        <button className="underline text-left" disabled={busy} onClick={() => sauver(new Blob([JSON.stringify({ version: 1, periode: { debut, fin }, precedent: { debut: debutPrecedent, fin: finPrecedente }, fiscal: brouillon, affectations, correctionsAchats }, null, 2)], { type: "application/json" }), `brouillon_annuel_${fin}.json`)}>Enregistrer mon brouillon</button>
        <label className="min-w-0">Reprendre un brouillon<input className="block w-full min-w-0" type="file" accept=".json,application/json" disabled={busy} onChange={e => { void chargerBrouillon(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <button className="underline text-left" disabled={busy} onClick={() => { setBrouillon(brouillonFiscalVide(brouillon.millesime)); setAffectations({}); setCorrectionsAchats({}); setPreparation(null); setRaccordement(null); invalider(); }}>Repartir sans corrections ni saisies fiscales</button>
      </div>
      <button className="rounded bg-blue-900 text-white px-4 py-3 disabled:opacity-50" disabled={busy || !debut || !fin || source === "fichier" && !fichier || comparatif !== "aucun" && (!debutPrecedent || !finPrecedente) || ["balance", "journal"].includes(comparatif) && !fichierPrecedent} onClick={() => void generer("apercu")}>Vérifier les écritures et les tableaux</button>
    </section>
    {raccordement && source === "celeris-achats" && <RaccordementAchats achats={raccordement} corrections={correctionsAchats} onChange={c => { setCorrectionsAchats(c); invalider(); }} disabled={busy} />}
    {preparation && <PreparationAnnuelle fiscal={preparation.fiscal} brouillon={brouillon} onBrouillon={b => { setBrouillon(b); invalider(); }} ventilation={preparation.annuel.ventilation} affectations={affectations} onAffectations={a => { setAffectations(a); setBrouillon({ ...brouillon, revues: [] }); invalider(); }} disabled={busy} />}
    {preparation && <button className="rounded bg-blue-900 text-white px-4 py-3 disabled:opacity-50" disabled={busy} onClick={() => void generer("apercu")}>Vérifier les écritures et les tableaux</button>}
    <p role="status" className="break-words whitespace-pre-line rounded-lg bg-blue-50 p-4">{busy ? "Préparation en cours… " : ""}{message}</p>
    {apercu && <section className="space-y-4 min-w-0" aria-labelledby="telecharger-documents">
      <h2 id="telecharger-documents" className="font-bold text-lg">3. Télécharger les documents préparatoires</h2>
      <div className="rounded-xl border bg-white p-4 space-y-2 break-words">
        <p><b>{apercu.nombre} lignes</b> · {apercu.comptes} comptes · {apercu.moisPresents.length} mois avec écritures.</p>
        <p>Débits : <b>{euros(apercu.totalDebit)}</b> · Crédits : <b>{euros(apercu.totalCredit)}</b>. Totaux équilibrés.</p>
        <div className={`rounded-lg p-3 ${apercu.comptesAchats ? "bg-blue-50" : "bg-amber-50 text-amber-900"}`}>
          <p className="font-semibold">{apercu.comptesAchats ? `Achats et variations de stocks (60) : ${euros(apercu.achats)}` : "Achats absents de cette source"}</p>
          <p className="text-sm">{apercu.comptesAchats ? "Le détail se trouve dans le bilan, section Achats, et dans les comptes 60 de la balance et du grand livre." : source === "celeris-achats" ? "Vérifiez les achats en attente ci-dessus. Seules les lignes suffisamment renseignées peuvent être raccordées." : "Cette source ne reprend pas les dépenses de l’application. Choisissez Céleris + achats ou un journal complet."}</p>
          {!apercu.comptesCharges && <p className="font-semibold mt-2">Aucun compte de charge : le solde de {euros(apercu.resultat)} est partiel et ne représente pas le bénéfice du centre.</p>}
        </div>
        <p>Actif brut : {euros(apercu.annuel.brut)} · Amortissements / dépréciations : {euros(apercu.annuel.amortissements)} · Net : {euros(apercu.annuel.net)}.</p>
        <p>N-1 : {apercu.annuel.precedent ? `${apercu.annuel.precedent.source} — actif net ${euros(apercu.annuel.precedent.net)}` : "non fourni"}.</p>
        <p className="text-sm">Ces totaux sont des mouvements comptables, pas le chiffre d’affaires.</p>
        <details><summary className="cursor-pointer font-medium">Source et contrôles à lire</summary><p className="mt-2 text-sm">{apercu.sources.join(" · ")}</p><ul className="list-disc pl-5 mt-3 space-y-2 text-sm">{apercu.avertissements.map(a => <li key={a}>{a}</li>)}</ul></details>
      </div>
      <button className="rounded bg-blue-900 text-white px-4 py-3 disabled:opacity-50" disabled={busy || !!apercu.raccordement?.bloques} onClick={() => void generer("zip")}>Télécharger les 5 PDF en ZIP</button>
      <p className="text-sm">Le bilan comprend le comparatif, les achats détaillés et les tableaux fiscaux. Les cases manquantes restent signalées dans le PDF.</p>
      <button className="underline block text-left" disabled={busy || !!apercu.raccordement?.bloques} onClick={() => void generer("fiscal")}>Télécharger uniquement les tableaux fiscaux préparatoires</button>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(Object.entries(DOCUMENTS_COMPTABLES) as [TypeDocumentComptable, string][]).map(([type, titre]) => <article key={type} className="min-w-0 rounded-xl border bg-white p-4 flex flex-col gap-3">
          <h3 className="font-bold">{titre}</h3><p className="text-sm flex-1">{descriptions[type]}</p><button className="underline text-left disabled:opacity-50" disabled={busy || !!apercu.raccordement?.bloques} onClick={() => void generer(type)}>Télécharger le PDF</button>
        </article>)}
      </div>
    </section>}
  </main>;
}
