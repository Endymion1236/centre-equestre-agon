"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { alertesPiece, type PieceExtraite, type DepenseCandidate } from "@/lib/justificatifs";

type Piece = { id: string; nom: string; extraction: PieceExtraite | null; depenseId: string | null;
  propositions: (DepenseCandidate & { score: number; raisons: string[] })[] };
const endpoint = "/api/admin/justificatifs";
export default function JustificatifsPage() {
  const { user, isAdmin } = useAuth();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [limite, setLimite] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const r = await authFetch(endpoint); const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setPieces(d.pieces); setLimite(d.limitePieces || d.limiteDepenses);
  }, []);
  useEffect(() => { if (user && isAdmin) void load().catch(e => setMessage(e.message)); }, [user, isAdmin, load]);
  async function action(body: object) {
    setBusy(true); setMessage("");
    try {
      const r = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setEdition(null); await load(); setMessage("Enregistré.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function depot(files: File[]) {
    setBusy(true); setMessage(""); const resultats: string[] = [];
    for (const fichier of files.slice(0, 20)) {
      try {
        const form = new FormData(); form.append("fichier", fichier);
        const r = await authFetch(endpoint, { method: "POST", body: form }); const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        resultats.push(`${fichier.name} : ${d.doublon ? "déjà déposé" : "conservé"}`);
      } catch (e) { resultats.push(`${fichier.name} : ${e instanceof Error ? e.message : "échec"}`); }
    }
    if (files.length > 20) resultats.push("Seuls les 20 premiers fichiers ont été traités.");
    try { await load(); } catch { resultats.push("Actualisation impossible."); }
    setMessage(resultats.join("\n")); setBusy(false);
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
    <div className="rounded-xl border bg-white p-5 space-y-3">
      <label className="block font-semibold" htmlFor="pieces">PDF, JPEG ou PNG · 4 Mo par fichier · 20 fichiers par lot</label>
      <input id="pieces" type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={busy} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; void depot(files); }} />
      <p className="text-sm text-slate-600">Les fichiers restent privés. Le bouton « Analyser » transmet la pièce au service de lecture IA déjà utilisé pour les relevés. Vérifiez toujours les valeurs proposées.</p>
    </div>
    <p role="status" className="whitespace-pre-line">{busy ? "Traitement en cours…\n" : ""}{message}</p>
    {limite && <p className="rounded border border-amber-400 p-3">Vue limitée aux 100 dernières pièces et à 2 000 dépenses. L’absence de proposition ne prouve pas l’absence de paiement.</p>}
    {!pieces.length && <p>Aucun justificatif affiché. Déposez votre première pièce.</p>}
    {pieces.map(p => <article key={p.id} className="rounded-xl border bg-white p-5 space-y-3">
      <h2 className="font-semibold break-all">{p.nom}</h2>
      <button className="underline" onClick={() => void telecharger(p.id)}>Télécharger l’original</button>
      {!p.extraction ? <div><button disabled={busy} className="rounded bg-slate-900 text-white px-4 py-2 disabled:opacity-50" onClick={() => void action({ action: "analyser", id: p.id })}>Analyser la pièce</button></div> : <>
        <p>{p.extraction.fournisseur || "Fournisseur à vérifier"} · facture {p.extraction.numero || "sans numéro lu"} · {p.extraction.date || "date inconnue"} · TTC {p.extraction.ttc === null ? "inconnu" : `${p.extraction.ttc.toFixed(2)} €`}</p>
        <p className="text-sm">HT : {p.extraction.ht ?? "non lu"} · TVA : {p.extraction.tva ?? "non lue"} · Période : {p.extraction.debutPeriode || "non précisée"} → {p.extraction.finPeriode || "non précisée"}</p>
        {alertesPiece(p.extraction).map(a => <p key={a} className="text-amber-800">{a}</p>)}
        {!p.depenseId && <button disabled={busy} className="underline" onClick={() => { setEdition(p.id); setChamps(Object.fromEntries(Object.entries(p.extraction!).map(([k,v]) => [k, v === null ? "" : String(v)]))); }}>Vérifier / corriger les informations</button>}
        {edition === p.id && <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); const extraction = { ...champs } as Record<string, unknown>; for (const k of ["ht", "tva", "ttc"]) extraction[k] = champs[k]?.trim() ? Number(champs[k].replace(",", ".")) : null; void action({ action: "corriger", id: p.id, extraction }); }}>
          {Object.entries({ fournisseur: "Fournisseur", numero: "Numéro facture", date: "Date facture", debutPeriode: "Début prestation", finPeriode: "Fin prestation", ht: "HT (€)", tva: "TVA (€)", ttc: "TTC (€)" }).map(([k,label]) => <label key={k}>{label}<input className="block w-full border rounded p-2" value={champs[k] || ""} type={["date","debutPeriode","finPeriode"].includes(k) ? "date" : ["ht","tva","ttc"].includes(k) ? "number" : "text"} step="0.01" onChange={e => setChamps({ ...champs, [k]: e.target.value })} /></label>)}
          <button disabled={busy} className="rounded border p-2">Enregistrer les corrections</button>
        </form>}
        {p.depenseId ? <div className="rounded bg-green-50 p-3">Associé à la dépense {p.depenseId}. <button className="underline" disabled={busy} onClick={() => void action({ action: "dissocier", id: p.id })}>Annuler l’association</button></div>
          : <div className="space-y-2"><h3 className="font-semibold">Propositions à confirmer</h3>
            {p.propositions.length > 1 && <p>Plusieurs correspondances : comparez les dates et le fournisseur.</p>}
            {p.propositions.map(d => <div key={d.id} className="border rounded p-3"><p>{d.fournisseur} · {d.dateOperation || "date inconnue"} · {d.montant.toFixed(2)} €</p><p className="text-sm">{d.raisons.join(" · ")}</p><button disabled={busy || edition === p.id} className="underline" onClick={() => { if (window.confirm("Confirmer que cette dépense correspond bien à ce justificatif ?")) void action({ action: "associer", id: p.id, depenseId: d.id }); }}>Confirmer l’association</button></div>)}
            {!p.propositions.length && <p>Aucune correspondance de montant trouvée. Pièce conservée en attente : paiement futur, fractionné, groupé ou opération non importée à vérifier.</p>}
          </div>}
      </>}
    </article>)}
  </main>;
}
