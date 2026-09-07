"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { doublonPossible } from "@/lib/doublons-depenses";
import type { DepenseCandidate } from "@/lib/justificatifs";
const endpoint = "/api/admin/depenses/doublons";
export default function DoublonsPage() {
  const { user, isAdmin } = useAuth();
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [groupes, setGroupes] = useState<DepenseCandidate[][]>([]);
  const [archives, setArchives] = useState<DepenseCandidate[]>([]);
  const [garder, setGarder] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const charger = useCallback(async () => {
    const r = await authFetch(`${endpoint}?mois=${mois}`); const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setGroupes(d.groupes); setArchives(d.archives); setGarder({});
    if (d.limite) setMessage("Liste limitée à 2 001 lignes : examen partiel du mois.");
  }, [mois]);
  useEffect(() => { if (!user || !isAdmin) return; setBusy(true); setMessage(""); void charger().catch(e => setMessage(e.message)).finally(() => setBusy(false)); }, [user, isAdmin, charger]);
  async function action(id: string, action: string, conserveId?: string) {
    if (action === "archiver" && !window.confirm("Confirmez sur le relevé qu’il s’agit d’un seul paiement. Écarter cette ligne des dépenses et conserver l’autre ? L’action est réversible.")) return;
    setBusy(true); setMessage("");
    try {
      const r = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, conserveId }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      await charger(); setMessage(action === "archiver" ? "Doublon écarté des dépenses et du rapprochement. Original conservé dans les archives ci-dessous." : "Dépense restaurée.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Opération impossible"); }
    finally { setBusy(false); }
  }
  if (!isAdmin) return <p className="p-6">Accès administrateur requis.</p>;
  const detail = (d: DepenseCandidate) => <><p>{d.fournisseur} · {d.montant.toFixed(2)} € · {d.dateOperation || "Date inconnue"}</p><p>Compte : {d.compte || "non renseigné"}</p><p className="text-sm break-all">{d.note || "Relevé non renseigné"}</p><p className="text-xs">Référence : {d.id}</p></>;
  return <main className="max-w-5xl mx-auto p-6 space-y-5">
    <Link className="underline" href="/admin/comptabilite/justificatifs">← Justificatifs</Link>
    <h1 className="text-2xl font-bold">Contrôler les doublons de dépenses</h1>
    <p>Même fournisseur, montant et mois, avec des dates et comptes compatibles : ce sont des doublons possibles, pas une preuve. Comparez au relevé bancaire avant de retirer une ligne. Conservez de préférence la ligne avec la date et le compte, ou celle déjà associée au bon justificatif.</p>
    <label>Mois <input className="border rounded p-2" type="month" value={mois} disabled={busy} onChange={e => { if (e.target.value) setMois(e.target.value); }} /></label>
    <p role="status">{busy ? "Traitement…" : message}</p>
    {!busy && !groupes.length && <p>Aucun doublon probable détecté pour ce mois.</p>}
    {groupes.map((g, i) => <section key={i} className="border rounded p-4 space-y-3">
      <h2 className="font-bold">{g[0].fournisseur} · {g[0].montant.toFixed(2)} € · {g.length} lignes à comparer</h2>
      {g.map(d => <div key={d.id} className="border rounded p-3 space-y-2">{detail(d)}
        <label className="block"><input type="radio" name={`groupe-${i}`} disabled={busy} checked={garder[i] === d.id} onChange={() => setGarder({ ...garder, [i]: d.id })} /> Conserver cette ligne</label>
        {garder[i] && garder[i] !== d.id && doublonPossible(d, g.find(x => x.id === garder[i])!) && <button disabled={busy} className="underline text-red-800" onClick={() => void action(d.id, "archiver", garder[i])}>Écarter ce doublon</button>}
      </div>)}
    </section>)}
    <h2 className="text-xl font-bold">Lignes écartées — récupérables</h2>
    {archives.map(d => <div key={d.id} className="border rounded p-3">{detail(d)}<button disabled={busy} className="underline" onClick={() => void action(d.id, "restaurer")}>Restaurer cette dépense</button></div>)}
  </main>;
}
