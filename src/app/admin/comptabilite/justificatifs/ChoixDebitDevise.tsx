"use client";
import { useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import type { DepenseCandidate, PieceExtraite } from "@/lib/justificatifs";
export default function ChoixDebitDevise({ pieceId, piece, busy, confirmer }: { pieceId: string; piece: PieceExtraite; busy: boolean; confirmer: (body: object) => Promise<void> }) {
  const [ouvert, setOuvert] = useState(false), [chargement, setChargement] = useState(false);
  const [mois, setMois] = useState(piece.date.slice(0, 7));
  const [recherche, setRecherche] = useState("");
  const [depenses, setDepenses] = useState<DepenseCandidate[]>([]);
  const [message, setMessage] = useState("");
  async function charger() {
    setOuvert(true); setChargement(true); setMessage(""); setDepenses([]);
    try {
      const r = await authFetch(`/api/admin/justificatifs?depensesMois=${mois}`); const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDepenses(d.depenses); if (d.limite) setMessage("Liste partielle : certaines dépenses ne sont pas affichées.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Lecture impossible"); }
    finally { setChargement(false); }
  }
  const filtre = recherche.toLocaleLowerCase("fr");
  const visibles = depenses.filter(d => [d.fournisseur, d.dateOperation, String(d.montant), d.compte].join(" ").toLocaleLowerCase("fr").includes(filtre));
  return <section className="border rounded bg-blue-50 p-4 space-y-3">
    <p>Facture : {piece.ttc?.toFixed(2)} {piece.devise}. Sélectionnez le paiement correspondant en euros. Aucun taux de change ni montant de TVA ne sera déduit de cette association.</p>
    <div className="flex gap-3 flex-wrap"><label>Mois du débit <input type="month" className="border rounded p-2" value={mois} disabled={busy || chargement} onChange={e => { setMois(e.target.value); setDepenses([]); }} /></label>
      <button type="button" className="underline" disabled={busy || chargement || !mois} onClick={() => void charger()}>Choisir le débit en euros</button></div>
    {message && <p role="status">{message}</p>}
    {chargement && <p>Chargement…</p>}
    {ouvert && <><label>Rechercher <input className="border rounded p-2" placeholder="Fournisseur, date ou montant" value={recherche} onChange={e => setRecherche(e.target.value)} /></label>
      <p>{visibles.length} débit(s) trouvé(s). Comparez le libellé, la date et le compte au relevé. Ce choix reste entièrement manuel.</p>
      <div className="max-h-80 overflow-auto space-y-2">{visibles.map(d => <div key={d.id} className="border rounded bg-white p-3">
        <p>{d.fournisseur} · {d.dateOperation || "Date inconnue"} · {d.montant.toFixed(2)} EUR</p><p>Compte : {d.compte || "non renseigné"}</p><p className="text-sm">{d.note}</p>
        <button type="button" className="underline" disabled={busy || chargement || d.montant <= 0} onClick={() => {
          if (window.confirm(`Associer la facture ${piece.numero} de ${piece.ttc} ${piece.devise} au débit ${d.fournisseur} de ${d.montant.toFixed(2)} EUR (${d.dateOperation || "date inconnue"}) ? Confirmez qu’il s’agit du paiement complet de cette facture. Les deux montants seront conservés.`))
            void confirmer({ action: "associer-devise", id: pieceId, depenseId: d.id, confirme: true, deviseFacture: piece.devise, montantFacture: piece.ttc, montantEUR: d.montant });
        }}>Associer ce débit en euros</button>
      </div>)}</div>
    </>}
  </section>;
}
