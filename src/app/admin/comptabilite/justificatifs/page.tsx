"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { alertesPiece, type PieceExtraite, type DepenseCandidate } from "@/lib/justificatifs";
import { traiterSelection } from "@/lib/import-justificatifs";

type Piece = { id: string; nom: string; retire: boolean; extraction: PieceExtraite | null; depenseId: string | null;
  autoBloque: boolean; associationMode: string; depenseAssociee: DepenseCandidate | null;
  propositions: (DepenseCandidate & { score: number; raisons: string[] })[] };
const endpoint = "/api/admin/justificatifs";
export default function JustificatifsPage() {
  const { user, isAdmin } = useAuth();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [limite, setLimite] = useState(false);
  const [suivant, setSuivant] = useState<string | null>(null);
  const [voirRetires, setVoirRetires] = useState(false);
  const [progression, setProgression] = useState("");
  const [edition, setEdition] = useState<string | null>(null);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [automatique, setAutomatique] = useState(true);
  const [aVerifier, setAVerifier] = useState(false);
  const load = useCallback(async (apres?: string) => {
    const r = await authFetch(endpoint + (apres ? `?apres=${apres}` : "")); const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setPieces(prev => apres ? [...prev.filter(p => !d.pieces.some((n: Piece) => n.id === p.id)), ...d.pieces] : d.pieces);
    setSuivant(d.suivant); setLimite(d.limiteDepenses);
  }, []);
  useEffect(() => { if (user && isAdmin) void load().catch(e => setMessage(e.message)); }, [user, isAdmin, load]);
  async function rapprocher() {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = await authFetch(endpoint + "/matching", { method: "POST" }); const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      total += d.associes;
      if (d.limite) return "Validation automatique suspendue : plus de 1 000 pièces ou 2 000 dépenses/liens. Contrôle manuel disponible.";
      if (d.analyseIncomplete) return "Validation automatique suspendue : des documents restent à analyser. Retirez les documents invalides puis relancez le rapprochement.";
      if (!d.reste) return `${total} association(s) validée(s) automatiquement. Les autres pièces restent à vérifier.`;
    }
    return `${total} associations validées. Relancez pour poursuivre.`;
  }
  async function analyserTout() {
    const toutes: Piece[] = []; let apres: string | null = null;
    do {
      const r = await authFetch(endpoint + (apres ? `?apres=${apres}` : "")); const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toutes.push(...d.pieces); apres = d.suivant;
    } while (apres);
    const attente = toutes.filter(p => !p.retire && !p.extraction);
    const erreurs: string[] = [];
    for (let i = 0; i < attente.length; i++) {
      const p = attente[i]; setProgression(`Analyse ${i + 1}/${attente.length} : ${p.nom}`);
      try {
        const r = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyser", id: p.id }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error);
      } catch (e) { erreurs.push(`${p.nom} : ${e instanceof Error ? e.message : "Analyse impossible"}`); }
    }
    setProgression("Rapprochement des dépenses…");
    const bilan = automatique ? await rapprocher() : "Analyse terminée. Mode contrôle manuel : aucune nouvelle association automatique.";
    return [bilan, ...erreurs].join("\n");
  }
  async function lancerLot(lecture: boolean) {
    setBusy(true); setMessage("");
    try { setMessage(lecture ? await analyserTout() : await rapprocher()); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Traitement interrompu ; vous pouvez relancer."); }
    finally { setBusy(false); setProgression(""); }
  }
  async function action(body: object) {
    setBusy(true); setMessage("");
    try {
      const r = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      const suite = automatique && ["analyser", "corriger", "retirer"].includes((body as { action: string }).action) ? await rapprocher() : "";
      setEdition(null); await load(); setMessage(`Enregistré. ${suite}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function depot(files: File[]) {
    setBusy(true); setMessage("");
    const resultats = await traiterSelection(files, async fichier => {
      try {
        const form = new FormData(); form.append("fichier", fichier);
        const r = await authFetch(endpoint, { method: "POST", body: form }); const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return `${fichier.name} : ${d.retire ? "déjà déposé et retiré — disponible dans Documents retirés" : d.doublon ? "déjà déposé" : "conservé"}`;
      } catch (e) { throw new Error(`${fichier.name} : ${e instanceof Error ? e.message : "échec"}`); }
    }, (index, total, fichier) => setProgression(`Fichier ${index} sur ${total} : ${fichier.name}`));
    try { resultats.push(await analyserTout()); await load(); } catch (e) { resultats.push(e instanceof Error ? e.message : "Traitement interrompu ; relancez le lot."); }
    setMessage(`${files.length} fichier(s) traité(s).\n` + resultats.join("\n")); setProgression(""); setBusy(false);
  }
  async function telecharger(id: string) {
    try {
      const r = await authFetch(`${endpoint}?id=${id}`); if (!r.ok) throw new Error("Téléchargement impossible");
      const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a");
      a.href = url; a.download = pieces.find(p => p.id === id)?.nom || "justificatif"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
  }
  if (!isAdmin) return <p className="p-6">Accès administrateur requis.</p>;
  return <main className="mx-auto max-w-5xl p-6 space-y-6">
    <Link href="/admin/comptabilite/depenses" className="underline">← Dépenses</Link>
    <h1 className="text-2xl font-bold">Justificatifs · rapprochement assisté</h1>
    <p>Déposez une facture ou un ticket par fichier. Les propositions utilisent les dépenses importées des relevés, pas un journal bancaire exhaustif. Aucune écriture ni aucun paiement ne sont créés.</p>
    <div className="rounded border bg-blue-50 p-4 text-sm space-y-2">
      <p>1. Dans <Link className="underline" href="/admin/comptabilite/tresorerie">Trésorerie</Link>, déposez le relevé et enregistrez ses dépenses. 2. Déposez ici les factures fournisseurs : le lot est analysé puis rapproché. 3. Contrôlez les cas restants.</p>
      <p>Validation automatique : facture d’achat identifiée, numéro présent, HT + TVA cohérent, TTC identique, nom du fournisseur identique et paiement dans les 7 jours suivant la facture. Les doublons et correspondances concurrentes restent manuels. Cette validation concerne uniquement l’association au paiement.</p>
      <p>Dates inconnues sur un ancien import ? Relisez le relevé dans Trésorerie puis choisissez « Compléter les dates existantes » : ce bouton ne crée aucune dépense. Une date de facture ne remplace jamais une date de paiement.</p>
    </div>
    <div className="rounded-xl border bg-white p-5 space-y-3">
      <label className="block font-semibold" htmlFor="pieces">PDF, JPEG ou PNG · 4 Mo par fichier · toute la sélection sera traitée</label>
      <input id="pieces" type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={busy} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; void depot(files); }} />
      <p className="text-sm text-slate-600">Les fichiers restent privés. Le dépôt lance leur lecture par le service IA déjà utilisé pour les relevés. Une facture fournisseur par fichier ; les factures clients Céleris ne sont pas des dépenses.</p>
      <p className="text-sm text-slate-600">Gardez cette page ouverte pendant l’envoi. Vous pouvez sélectionner à nouveau tout un lot : les fichiers identiques déjà déposés seront ignorés.</p>
    </div>
    <div className="rounded border p-4 space-y-3">
      <label className="block"><input type="checkbox" disabled={busy} checked={automatique} onChange={e => setAutomatique(e.target.checked)} /> Valider automatiquement les correspondances fiables après analyse (décocher pour contrôler chaque proposition)</label>
      <div className="flex flex-wrap gap-4"><button disabled={busy} className="rounded bg-slate-900 text-white px-4 py-2" onClick={() => void lancerLot(true)}>Analyser toutes les pièces en attente</button>
        <button disabled={busy || !automatique} className="rounded border px-4 py-2" onClick={() => void lancerLot(false)}>Relancer le rapprochement automatique</button></div>
      <p className="text-sm">Le lot inclut toutes les pages de documents. Gardez cet écran ouvert. Après l’import d’un nouveau relevé, relancez le rapprochement ici. Une association annulée ne sera pas recréée automatiquement.</p>
    </div>
    <p role="status" className="whitespace-pre-line">{progression || (busy ? "Traitement en cours…" : "")}{"\n"}{message}</p>
    <label className="block"><input type="checkbox" checked={voirRetires} onChange={e => setVoirRetires(e.target.checked)} /> Documents retirés (récupérables)</label>
    <label className="block"><input type="checkbox" checked={aVerifier} onChange={e => setAVerifier(e.target.checked)} /> Afficher uniquement les pièces non associées</label>
    {limite && <p className="rounded border border-amber-400 p-3">Rapprochement limité à 2 000 dépenses. L’absence de proposition ne prouve pas l’absence de paiement.</p>}
    {!pieces.length && <p>Aucun justificatif affiché. Déposez votre première pièce.</p>}
    {pieces.filter(p => p.retire === voirRetires && (!aVerifier || !p.depenseId)).map(p => <article key={p.id} className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="font-semibold break-all">{p.nom}</h2>
      <button className="underline" onClick={() => void telecharger(p.id)}>Télécharger l’original</button>
      <div><button className="underline text-red-800 disabled:opacity-50" disabled={busy || !!p.depenseId} title={p.depenseId ? "Annulez d’abord l’association" : ""} onClick={() => void action({ action: p.retire ? "restaurer" : "retirer", id: p.id })}>{p.retire ? "Restaurer le document" : "Retirer le document"}</button>{p.depenseId && <p className="text-sm">Annulez l’association avant de retirer ce document.</p>}</div>
      {p.retire ? <p>Document retiré de la liste de travail. Son original reste récupérable.</p> : !p.extraction ? <div><button disabled={busy} className="rounded bg-slate-900 text-white px-4 py-2 disabled:opacity-50" onClick={() => void action({ action: "analyser", id: p.id })}>Analyser la pièce</button></div> : <>
        <p>{p.extraction.fournisseur || "Fournisseur à vérifier"} · facture {p.extraction.numero || "sans numéro lu"} · {p.extraction.date || "date inconnue"} · TTC {p.extraction.ttc === null ? "inconnu" : `${p.extraction.ttc.toFixed(2)} €`}</p>
        <p className="text-sm">HT : {p.extraction.ht ?? "non lu"} · TVA : {p.extraction.tva ?? "non lue"} · Période : {p.extraction.debutPeriode || "non précisée"} → {p.extraction.finPeriode || "non précisée"}</p>
        {alertesPiece(p.extraction).map(a => <p key={a} className="text-amber-800">{a}</p>)}
        {p.extraction.typeDocument !== "achat" && <p className="text-amber-800">{p.extraction.typeDocument === "vente" ? "Facture client : exclue du rapprochement automatique des dépenses." : "Nature du document à vérifier : validation automatique désactivée pour cette pièce."}</p>}
        {!p.depenseId && <p>{p.autoBloque ? "Contrôle manuel demandé : aucune association automatique." : <button disabled={busy} className="underline" onClick={() => void action({ action: "manuel", id: p.id })}>J’ai un doute : garder en contrôle manuel</button>}</p>}
        {!p.depenseId && <button disabled={busy} className="underline" onClick={() => { setEdition(p.id); setChamps(Object.fromEntries(Object.entries(p.extraction!).map(([k,v]) => [k, v === null ? "" : String(v)]))); }}>Vérifier / corriger les informations</button>}
        {edition === p.id && <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const extraction = { ...champs } as Record<string, unknown>; for (const k of ["ht", "tva", "ttc"]) extraction[k] = champs[k]?.trim() ? Number(champs[k].replace(",", ".")) : null; void action({ action: "corriger", id: p.id, extraction }); }}>
          <label>Nature du document<select className="block border rounded p-2" value={champs.typeDocument || "inconnu"} onChange={e => setChamps({ ...champs, typeDocument: e.target.value })}><option value="inconnu">À vérifier</option><option value="achat">Facture fournisseur (achat du centre)</option><option value="vente">Facture client (vente du centre)</option></select></label>
          {Object.entries({ fournisseur: "Fournisseur", numero: "Numéro facture", date: "Date facture", debutPeriode: "Début prestation", finPeriode: "Fin prestation", ht: "HT (€)", tva: "TVA (€)", ttc: "TTC (€)" }).map(([k,label]) => <label key={k}>{label}<input className="block w-full border rounded p-2" value={champs[k] || ""} type={["date","debutPeriode","finPeriode"].includes(k) ? "date" : ["ht","tva","ttc"].includes(k) ? "number" : "text"} step="0.01" onChange={e => setChamps({ ...champs, [k]: e.target.value })} /></label>)}
          <button disabled={busy} className="rounded border p-2">Enregistrer les corrections</button>
        </form>}
        {p.depenseId ? <div className="rounded bg-green-50 p-3">{p.associationMode === "automatique" ? "Validé automatiquement" : "Confirmé manuellement"} · dépense {p.depenseId}. <button className="underline" disabled={busy} onClick={() => void action({ action: "dissocier", id: p.id })}>Annuler l’association</button></div>
          : <div className="space-y-2"><h3 className="font-semibold">Propositions à confirmer</h3>
            {p.propositions.length > 1 && <p>Plusieurs correspondances : comparez les dates et le fournisseur.</p>}
            {p.propositions.map(d => <div key={d.id} className="border rounded p-3"><p>{d.fournisseur} · {d.dateOperation || `date inconnue${d.mois ? ` (mois ${d.mois})` : ""}`} · {d.montant.toFixed(2)} €</p><p className="text-sm">Compte : {d.compte || "non renseigné (ancien import)"}</p>{d.note && <p className="text-sm">{d.note}</p>}<p className="text-sm">{d.raisons.join(" · ")}</p><button disabled={busy || edition === p.id} className="underline" onClick={() => { if (window.confirm("Confirmer que cette dépense correspond bien à ce justificatif ?")) void action({ action: "associer", id: p.id, depenseId: d.id }); }}>Confirmer l’association</button></div>)}
            {!p.propositions.length && <p>Aucune correspondance de montant trouvée. Pièce conservée en attente : paiement futur, fractionné, groupé ou opération non importée à vérifier.</p>}
          </div>}
        {p.depenseAssociee && <p className="text-sm">Paiement associé : {p.depenseAssociee.fournisseur} · {p.depenseAssociee.dateOperation || "date inconnue"} · {p.depenseAssociee.montant.toFixed(2)} € · compte {p.depenseAssociee.compte || "non renseigné"}</p>}
      </>}
    </article>)}
    {suivant && <button disabled={busy} className="rounded border p-3" onClick={async () => { setBusy(true); try { await load(suivant); } catch { setMessage("Chargement impossible."); } finally { setBusy(false); } }}>Charger les documents suivants</button>}
  </main>;
}
