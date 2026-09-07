"use client";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
type Apercu = { id: string; nom: string; version: number; liee: boolean };
export default function ReinitialiserPieces({ termine, verrouiller }: { termine: () => Promise<void>; verrouiller: (v: boolean) => void }) {
  const [pieces, setPieces] = useState<Apercu[] | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const url = "/api/admin/justificatifs/reinitialiser";
  async function preparer() {
    setBusy(true); verrouiller(true); setMessage(""); setPieces(null);
    try { const r = await authFetch(url); const d = await r.json(); if (!r.ok) throw new Error(d.error); setPieces(d.pieces); }
    catch(e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
    finally {setBusy(false); verrouiller(false);}
  }
  async function archiver() {
    if (!pieces || !window.confirm(`Archiver les ${pieces.length} pièces actives, TOUS MOIS CONFONDUS, et retirer leurs associations ? Les opérations, catégories et montants sont conservés. Les fichiers resteront restaurables, mais les associations devront être refaites.`)) return;
    setBusy(true); verrouiller(true); let n = 0;
    try {
      for (const p of pieces) {
        const r = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, version: p.version, confirme: true }) }); const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        n++; setMessage(`${n} / ${pieces.length} pièces archivées…`);
      }
      setMessage(`${n} pièces archivées. Vous pouvez réimporter vos documents ou restaurer une pièce archivée.`);
    } catch(e) {setMessage(`${n} pièces archivées. Arrêt : ${e instanceof Error ? e.message : "Erreur"}. Relancez l’aperçu pour reprendre.`);}
    finally {setPieces(null); try { await termine(); } catch {setMessage(m => m + " Actualisez le tableau.");} setBusy(false); verrouiller(false);}
  }
  return <details className="border rounded p-3"><summary>Repartir avec une liste de pièces vide</summary><p>Archive toutes les pièces actives, tous mois confondus, et retire leurs associations. Les opérations bancaires et leurs catégories restent conservées. Les fichiers et leur lecture restent restaurables depuis les documents archivés ; les associations ne sont pas restaurées automatiquement.</p><button disabled={busy} className="underline" onClick={() => void preparer()}>Prévisualiser l’archivage</button>{pieces && <><p>{pieces.length} pièces, dont {pieces.filter(p => p.liee).length} avec paiement associé.</p><details><summary>Voir les documents concernés</summary><ul>{pieces.map(p => <li key={p.id}>{p.nom}</li>)}</ul></details><button disabled={busy || !pieces.length} className="border rounded p-2 text-red-800" onClick={() => void archiver()}>Archiver ces pièces et retirer leurs associations</button></>}<p role="status">{message}</p></details>;
}
