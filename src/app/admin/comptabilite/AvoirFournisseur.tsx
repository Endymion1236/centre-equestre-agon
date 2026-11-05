"use client";
/**
 * Joindre l'avoir d'un fournisseur à un remboursement reçu (Rapprochement).
 *
 * Sur un crédit classé « Remboursement fournisseur » : déposer le PDF ou la
 * photo de l'avoir, vérifier ce qui a été lu (montant, TVA, numéro, date),
 * choisir la catégorie de l'achat annulé. Le FEC passe alors l'avoir au
 * journal des achats et la TVA déductible du mois baisse d'autant
 * (lib/avoir-fournisseur). La pièce rejoint les justificatifs ; détacher ne
 * l'efface jamais.
 */
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { cleCreditReleve } from "@/lib/avoir-fournisseur";

const API = "/api/admin/justificatifs";
const eur = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2).replace(".", ",")} €` : "—");

type Extraction = { fournisseur?: string; numero?: string; date?: string; ttc?: number | null; tva?: number | null; [k: string]: unknown };
type Etat = { avoir: { id: string; nom: string; extraction: Extraction | null; poste: string } | null; posteSuggere: string | null; categories: string[] };

async function appel(init: RequestInit & { query?: string } = {}) {
  const r = await authFetch(`${API}${init.query || ""}`, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erreur ${r.status}`);
  return d;
}
const poster = (body: unknown) => appel({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function BoutonAvoirFournisseur({ ligne, mois }: { ligne: { date: string; label: string; amount: number }; mois: string }) {
  const cle = cleCreditReleve(ligne);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Pièce en cours de vérification, avant rattachement.
  const [piece, setPiece] = useState<{ id: string; extraction: Extraction } | null>(null);
  const [poste, setPoste] = useState("");

  const charger = async () => {
    try {
      const d: Etat = await appel({ query: `?avoirCle=${encodeURIComponent(cle)}` });
      setEtat(d);
      setPoste((p) => p || d.avoir?.poste || d.posteSuggere || "");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Lecture impossible"); }
  };
  useEffect(() => { void charger(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cle]);

  async function deposer(fichier: File) {
    setBusy(true); setMessage("Envoi de l'avoir…");
    try {
      const form = new FormData(); form.append("fichier", fichier);
      const d = await appel({ method: "POST", body: form });
      const lire = async () => (await appel({ query: `?piece=${d.id}` })).pieces?.[0];
      let p = await lire();
      if (p?.retire) throw new Error("Ce document est archivé dans les justificatifs : restaurez-le d'abord.");
      if (!p?.extraction) {
        setMessage("Lecture de l'avoir…");
        await poster({ action: "analyser", id: d.id });
        p = await lire();
      }
      setPiece({ id: d.id, extraction: { ...(p?.extraction || {}), ttc: p?.extraction?.ttc != null ? Math.abs(p.extraction.ttc) : null, tva: p?.extraction?.tva != null ? Math.abs(p.extraction.tva) : null } });
      setMessage("Vérifiez ce qui a été lu, choisissez la catégorie de l'achat annulé, puis enregistrez.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Dépôt impossible. Le document envoyé reste conservé."); }
    finally { setBusy(false); }
  }

  async function enregistrer() {
    if (!piece) return;
    setBusy(true); setMessage("");
    try {
      // La lecture corrigée d'abord (montant, TVA, numéro, date), puis le rattachement.
      await poster({ action: "corriger", id: piece.id, extraction: { ...piece.extraction, typeDocument: "achat", devise: piece.extraction.devise || "EUR" } });
      await poster({ action: "avoir-fournisseur", id: piece.id, mois, cle, poste });
      setPiece(null); setOuvert(false);
      await charger();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Enregistrement impossible"); }
    finally { setBusy(false); }
  }

  async function detacher() {
    if (!etat?.avoir || !window.confirm("Détacher cet avoir du remboursement ? La pièce reste dans les justificatifs ; le FEC reviendra à « avoir à transmettre ».")) return;
    setBusy(true);
    try { await poster({ action: "detacher-avoir", id: etat.avoir.id }); await charger(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Impossible"); }
    finally { setBusy(false); }
  }

  async function voir() {
    if (!etat?.avoir) return;
    try {
      const r = await authFetch(`${API}?id=${etat.avoir.id}`); if (!r.ok) throw new Error("Téléchargement impossible");
      const url = URL.createObjectURL(await r.blob()); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
  }

  if (!etat) return null;
  const champ = "block w-full rounded border border-gray-200 p-1.5 font-body text-xs";
  const maj = (k: keyof Extraction, v: unknown) => setPiece((p) => (p ? { ...p, extraction: { ...p.extraction, [k]: v } } : p));
  const nombre = (s: string) => (s.trim() === "" ? null : Math.abs(Number(s.replace(",", "."))));

  return (
    <div className="mt-1">
      {etat.avoir ? (
        <div className="flex flex-wrap items-center gap-1 font-body text-[10px] text-green-700">
          <span>📎 Avoir {etat.avoir.extraction?.numero ? `n° ${etat.avoir.extraction.numero}` : "joint"} · {eur(etat.avoir.extraction?.ttc)} · TVA {eur(etat.avoir.extraction?.tva)}</span>
          <button type="button" onClick={voir} className="text-blue-600 bg-transparent border-none cursor-pointer underline">Voir</button>
          <button type="button" onClick={detacher} disabled={busy} className="text-slate-500 bg-transparent border-none cursor-pointer underline">Détacher</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOuvert(true)}
          className="font-body text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded border-none cursor-pointer hover:bg-amber-100"
          title="Joindre l'avoir du fournisseur : l'achat et sa TVA seront annulés pour sa part dans le FEC">
          📎 Joindre l&apos;avoir
        </button>
      )}
      {message && !ouvert && <div className="font-body text-[10px] text-red-600 mt-1">{message}</div>}

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOuvert(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="font-body text-sm font-semibold text-blue-800">Avoir du fournisseur</div>
            <div className="font-body text-xs text-slate-500 mb-3">{ligne.date} · {ligne.label} · {eur(ligne.amount)}</div>
            {!piece ? (
              <label className="block font-body text-xs text-slate-700">
                PDF ou photo de l&apos;avoir (4 Mo au plus)
                <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} className="block mt-1"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void deposer(f); }} />
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2 font-body text-xs">
                <label className="col-span-2">Fournisseur<input className={champ} value={String(piece.extraction.fournisseur || "")} onChange={(e) => maj("fournisseur", e.target.value)} /></label>
                <label>N° de l&apos;avoir<input className={champ} value={String(piece.extraction.numero || "")} onChange={(e) => maj("numero", e.target.value)} /></label>
                <label>Date<input type="date" className={champ} value={String(piece.extraction.date || "")} onChange={(e) => maj("date", e.target.value)} /></label>
                <label>Montant TTC (€)<input inputMode="decimal" className={champ} value={piece.extraction.ttc ?? ""} onChange={(e) => maj("ttc", nombre(e.target.value))} /></label>
                <label>dont TVA (€)<input inputMode="decimal" className={champ} value={piece.extraction.tva ?? ""} onChange={(e) => maj("tva", nombre(e.target.value))} /></label>
                <label className="col-span-2">Catégorie de l&apos;achat annulé
                  <select className={champ} value={poste} onChange={(e) => setPoste(e.target.value)}>
                    <option value="">— choisir —</option>
                    {etat.categories.filter((c) => c !== "hors-depenses").map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {etat.posteSuggere && poste === etat.posteSuggere && <span className="text-slate-400">Proposée : catégorie du dernier achat chez ce fournisseur.</span>}
                </label>
              </div>
            )}
            {message && <div className="font-body text-xs text-slate-600 mt-3">{message}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" disabled={busy} onClick={() => { setOuvert(false); setPiece(null); setMessage(""); }}
                className="font-body text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white cursor-pointer">Fermer</button>
              {piece && (
                <button type="button" disabled={busy || !poste || !piece.extraction.ttc} onClick={() => void enregistrer()}
                  className="font-body text-xs font-semibold px-3 py-1.5 rounded-lg border-none bg-blue-600 text-white cursor-pointer disabled:opacity-50">
                  {busy ? "…" : "Enregistrer l'avoir"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
