"use client";
/**
 * Suppression DÉFINITIVE de tous les justificatifs.
 *
 * À distinguer de « Repartir avec une liste de pièces vide », juste au-dessus,
 * qui archive : là, les documents restent restaurables. Ici, tout part —
 * fichiers, lectures, historiques, associations. On ne propose donc rien tant
 * que l'aperçu n'a pas été demandé, et le bouton n'est actif qu'une fois le
 * mot de confirmation écrit à la main.
 */
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";

type Apercu = { total: number; liees: number; archivees: number; audela: boolean; base: string; production: boolean };

export default function SupprimerPieces({ termine, verrouiller }: { termine: () => Promise<void>; verrouiller: (v: boolean) => void }) {
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [mot, setMot] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const url = "/api/admin/justificatifs/supprimer-tout";
  const pret = mot.trim().toUpperCase() === "SUPPRIMER";

  async function prevoir() {
    setBusy(true); verrouiller(true); setMessage(""); setApercu(null);
    try {
      const r = await authFetch(url);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Aperçu refusé (HTTP ${r.status}).`);
      setApercu(d);
      if (!d.total) setMessage("Aucune pièce en base : il n'y a rien à supprimer.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Aperçu impossible"); }
    finally { setBusy(false); verrouiller(false); }
  }

  async function supprimer() {
    if (!apercu?.total || !pret) return;
    if (!window.confirm(`Supprimer DÉFINITIVEMENT ${apercu.total} pièce(s) : fichiers, lectures et associations.\n\nCette action est irréversible : les fichiers ne seront pas restaurables depuis l'application. Vos opérations bancaires et leurs catégories sont conservées.\n\nContinuer ?`)) return;
    setBusy(true); verrouiller(true);
    let total = 0, tours = 0;
    const echecs: string[] = [];
    try {
      for (;;) {
        tours++;
        if (tours > 100) throw new Error("Trop de passages : relancez l'aperçu pour reprendre.");
        setMessage(`Suppression en cours… ${total} pièce(s) supprimée(s).`);
        const r = await authFetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          // Le compte de l'aperçu n'accompagne que le premier appel : aux
          // tours suivants il en reste forcément moins, et le contrôle
          // rejetterait à tort.
          body: JSON.stringify(tours === 1 ? { confirme: mot.trim(), attendu: apercu.total } : { confirme: mot.trim() }),
        });
        const d = await r.json().catch(() => ({ error: `Réponse illisible du serveur (HTTP ${r.status}).` }));
        if (!r.ok) throw new Error(d.error || `Suppression refusée (HTTP ${r.status}).`);
        total += d.supprimes; echecs.push(...(d.echecs || []));
        if (d.termine) break;
        // Un tour qui n'a rien supprimé et n'a pas fini : on s'arrête plutôt
        // que de tourner en boucle sur des pièces qui résistent.
        if (!d.supprimes) throw new Error("Des pièces résistent à la suppression ; voir les motifs ci-dessous.");
      }
      setMessage(`${total} pièce(s) supprimée(s) définitivement.${echecs.length ? ` ${echecs.length} en échec.` : ""} Vous pouvez réimporter votre dossier Drive : les pièces seront relues à neuf.`);
    } catch (e) {
      setMessage(`${total} pièce(s) supprimée(s). Arrêt : ${e instanceof Error ? e.message : "erreur"}${echecs.length ? `\n${echecs.slice(0, 5).join("\n")}` : ""}`);
    } finally {
      setApercu(null); setMot("");
      try { await termine(); } catch { setMessage(m => m + " Actualisez le tableau."); }
      setBusy(false); verrouiller(false);
    }
  }

  return <details className="rounded border border-red-200 p-3">
    <summary className="cursor-pointer text-red-900">Supprimer définitivement toutes les pièces</summary>
    <p className="mt-2 text-sm">
      Efface les documents, leur lecture, leur historique, leurs associations et les fichiers stockés.
      À la différence de « Repartir avec une liste de pièces vide », <b>rien ne sera restaurable</b> depuis l&apos;application :
      assurez-vous que vos originaux sont bien sur le Drive ou chez vos fournisseurs.
      Vos opérations bancaires, leurs catégories et leurs comptes proposés sont conservés — elles réapparaîtront simplement sans justificatif.
    </p>
    <button disabled={busy} className="mt-2 underline" onClick={() => void prevoir()}>Prévisualiser la suppression</button>
    {apercu && apercu.total > 0 && <div className="mt-3 space-y-2 text-sm">
      <p><b>{apercu.total} pièce(s)</b> seront supprimées, dont {apercu.liees} rattachée(s) à un paiement et {apercu.archivees} déjà archivée(s).
        {apercu.audela ? " (au-delà du plafond d'aperçu : il y en a davantage)" : ""}</p>
      <p>Base concernée : <b>{apercu.base}</b>{apercu.production ? " — attention, c'est la PRODUCTION." : " (préversion de test)."}</p>
      <label className="block">Écrivez <b>SUPPRIMER</b> pour confirmer
        <input className="mt-1 block w-48 rounded border p-2" value={mot} onChange={e => setMot(e.target.value)} aria-label="Mot de confirmation" />
      </label>
      <button disabled={busy || !pret} className="rounded border border-red-300 p-2 text-red-800 disabled:opacity-40" onClick={() => void supprimer()}>
        Supprimer définitivement ces {apercu.total} pièce(s)
      </button>
    </div>}
    <p role="status" className="mt-2 whitespace-pre-line text-sm">{message}</p>
  </details>;
}
