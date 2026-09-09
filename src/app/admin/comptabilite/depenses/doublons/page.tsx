"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { doublonPossible, type PropositionDoublon } from "@/lib/doublons-depenses";
import type { DepenseCandidate } from "@/lib/justificatifs";
const endpoint = "/api/admin/depenses/doublons";
type Lot = { empreinte: string; propositions: PropositionDoublon[]; groupesManuels: number; restants: number; montantCentimes: number };
export default function DoublonsPage() {
  const { user, isAdmin } = useAuth();
  const [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [groupes, setGroupes] = useState<DepenseCandidate[][]>([]);
  const [archives, setArchives] = useState<DepenseCandidate[]>([]);
  const [garder, setGarder] = useState<Record<number, string>>({});
  const [lot, setLot] = useState<Lot | null>(null);
  const [erreurLot, setErreurLot] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const charger = useCallback(async () => {
    setLot(null); setErreurLot("");
    const r = await authFetch(`${endpoint}?mois=${mois}`); const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setGroupes(d.groupes); setArchives(d.archives); setGarder({});
    if (d.limite) setMessage("Liste limitée à 2 001 lignes : examen partiel du mois.");
    try {
      const rLot = await authFetch(`${endpoint}/lot?mois=${mois}`); const l = await rLot.json();
      if (!rLot.ok) throw new Error(l.error);
      setLot(l);
    } catch (e) { setErreurLot(e instanceof Error ? e.message : "Aperçu du lot indisponible"); }
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
  /**
   * Écarter d'un coup toutes les autres lignes du groupe.
   *
   * L'action n'existait que sous forme d'un lien discret placé sous CHAQUE
   * ligne à écarter, et seulement une fois un choix fait : on cochait « je
   * garde celle-ci » et rien ne semblait se passer, faute de voir où
   * confirmer. Le geste est le même, mais il est désormais là où on le
   * cherche — au bas du groupe, une fois le choix exprimé.
   */
  async function ecarterAutres(groupe: DepenseCandidate[], conserveId: string) {
    const autres = groupe.filter(d => d.id !== conserveId && doublonPossible(d, groupe.find(x => x.id === conserveId)!));
    if (!autres.length) return;
    if (!window.confirm(`Confirmez sur le relevé qu'il s'agit d'un seul paiement.\n\nConserver « ${groupe.find(x => x.id === conserveId)?.fournisseur} » et écarter ${autres.length} ligne(s) en double ?\n\nL'action est réversible : les lignes écartées restent récupérables plus bas.`)) return;
    setBusy(true); setMessage("");
    try {
      for (const d of autres) {
        const r = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id, action: "archiver", conserveId }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error);
      }
      await charger();
      setMessage(`${autres.length} doublon(s) écarté(s). Original conservé dans les archives ci-dessous.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Opération impossible"); }
    finally { setBusy(false); }
  }

  async function validerLot() {
    if (!lot) return;
    setBusy(true); setMessage("");
    try {
      const r = await authFetch(endpoint + "/lot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mois, empreinte: lot.empreinte }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      await charger(); setMessage(`${d.ecartees} doublon(s) ${d.dejaTraite ? "déjà écarté(s) : aucun nouveau retrait" : "écarté(s) du calcul, récupérables ci-dessous"}.`);
    } catch (e) { setLot(null); setMessage(e instanceof Error ? e.message : "Opération non confirmée : actualisez."); }
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
    <button disabled={busy} className="underline" onClick={() => { setBusy(true); void charger().catch(e => setMessage(e.message)).finally(() => setBusy(false)); }}>Actualiser l’aperçu</button>
    {erreurLot && <p>{erreurLot}</p>}
    {lot && <section className="rounded border bg-blue-50 p-4 space-y-3">
      <h2 className="text-xl font-bold">Nettoyage proposé en une validation</h2>
      <p>{lot.propositions.length} lignes à écarter · diminution du total des dépenses : {(lot.montantCentimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}.</p>
      <p>La ligne datée est conservée face à une copie sans date du même relevé. Les lignes associées à un justificatif sont protégées. Vérifiez les paires ci-dessous : aucun retrait n’a encore eu lieu.</p>
      <p>{lot.groupesManuels} groupe(s) restent à examiner individuellement.{lot.restants > 0 && ` ${lot.restants} autres paires seront proposées après ce lot (150 maximum par validation).`}</p>
      {lot.propositions.length > 0 && <>
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Conserver</th><th className="p-2">Écarter</th></tr></thead><tbody>{lot.propositions.map(p => <tr key={p.ecarter.id} className="border-t"><td className="p-2 align-top">{detail(p.conserver)}</td><td className="p-2 align-top">{detail(p.ecarter)}</td></tr>)}</tbody></table></div>
        <button disabled={busy} className="rounded bg-blue-900 text-white px-4 py-2" onClick={() => void validerLot()}>Valider le retrait des {lot.propositions.length} doublons affichés</button>
        <p className="text-sm">Si une paire vous semble douteuse, utilisez le contrôle individuel ci-dessous. Le lot entier sera revérifié avant tout retrait.</p>
      </>}
    </section>}
    {!busy && !groupes.length && <p>Aucun doublon probable détecté pour ce mois.</p>}
    {groupes.map((g, i) => <section key={i} className="border rounded p-4 space-y-3">
      <h2 className="font-bold">{g[0].fournisseur} · {g[0].montant.toFixed(2)} € · {g.length} lignes à comparer</h2>
      {g.map(d => <div key={d.id} className="border rounded p-3 space-y-2">{detail(d)}
        <label className="block"><input type="radio" name={`groupe-${i}`} disabled={busy} checked={garder[i] === d.id} onChange={() => setGarder({ ...garder, [i]: d.id })} /> Conserver cette ligne</label>
      </div>)}
      {garder[i]
        ? <button disabled={busy} className="rounded bg-blue-900 px-4 py-2 text-white disabled:opacity-40" onClick={() => void ecarterAutres(g, garder[i])}>
            Conserver la ligne choisie et écarter {g.filter(d => d.id !== garder[i]).length} doublon(s)
          </button>
        : <p className="text-sm text-slate-600">Choisissez la ligne à conserver ci-dessus : le bouton pour écarter l&apos;autre apparaîtra ici.</p>}
    </section>)}
    <h2 className="text-xl font-bold">Lignes écartées — récupérables</h2>
    {archives.map(d => <div key={d.id} className="border rounded p-3">{detail(d)}{(d as { motif?: string }).motif && <p className="text-sm text-amber-800">Retirée : {(d as { motif?: string }).motif}</p>}<button disabled={busy} className="underline" onClick={() => void action(d.id, "restaurer")}>Restaurer cette dépense</button></div>)}
  </main>;
}
