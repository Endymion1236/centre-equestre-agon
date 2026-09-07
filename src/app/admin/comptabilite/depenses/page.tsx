"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { DEVISES_PIECES, type PieceExtraite } from "@/lib/justificatifs";
import VueParPoste from "./VueParPoste";
import PiecesSansLigne from "./PiecesSansLigne";
type Piece = { id: string; nom: string; retire: boolean; depenseId: string | null; extraction: PieceExtraite | null };
type Ligne = { id: string; dateOperation?: string; fournisseur: string; montant: number; poste: string; compte?: string; note?: string; source: string; suivie: boolean; rapprochementExclu?: boolean; piece: Piece | null };
const endpoint = "/api/admin/depenses/tableau", justifs = "/api/admin/justificatifs";
const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export default function DepensesPage() {
  const { user, isAdmin } = useAuth();
  const [vue, setVue] = useState("tableau"), [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [lignes, setLignes] = useState<Ligne[]>([]), [pieces, setPieces] = useState<Piece[]>([]), [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [filtre, setFiltre] = useState("actives"), [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<string | null>(null), [choix, setChoix] = useState<Piece | null>(null);
  const [correction, setCorrection] = useState<PieceExtraite | null>(null);
  useEffect(() => { if (cible) { const frame = requestAnimationFrame(() => document.getElementById("association-ligne")?.scrollIntoView({ block: "start", behavior: "smooth" })); return () => cancelAnimationFrame(frame); } }, [cible, choix?.id]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("vue") === "pieces") setVue("pieces"); }, []);
  const charger = useCallback(async () => {
    const r = await authFetch(`${endpoint}?mois=${mois}`); const d = await r.json(); if (!r.ok) throw new Error(d.error);
    setLignes(d.lignes); setPieces(d.pieces); setCategories(d.categories);
    if (d.limite) setMessage("Affichage partiel : limite de 2 000 lignes ou pièces atteinte.");
  }, [mois]);
  useEffect(() => { if (user && isAdmin && vue === "tableau") { setBusy(true); void charger().catch(e => setMessage(e.message)).finally(() => setBusy(false)); } }, [user, isAdmin, vue, charger]);
  async function post(url: string, body: object) { const r = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }
  async function agir(url: string, body: object) {
    setBusy(true); setMessage("");
    try { await post(url, body); await charger(); setMessage("Enregistré."); return true; }
    catch (e) { setMessage(e instanceof Error ? e.message : "Opération impossible"); return false; }
    finally { setBusy(false); }
  }
  async function importer(l: Ligne, f: File) {
    setCible(l.id); setChoix(null); setCorrection(null); setBusy(true); setMessage("Import et lecture de cette pièce…");
    try {
      const form = new FormData(); form.append("fichier", f);
      const r = await authFetch(justifs, { method: "POST", body: form }); const d = await r.json(); if (!r.ok) throw new Error(d.error);
      async function lire() { const r = await authFetch(`${justifs}?piece=${d.id}`); const x = await r.json(); if (!r.ok || !x.pieces?.[0]) throw new Error(x.error || "Pièce indisponible"); return x.pieces[0] as Piece; }
      let p = await lire(); setChoix(p);
      if (!p.extraction && !p.retire) { await post(justifs, { action: "analyser", id: d.id }); p = await lire(); }
      setChoix(p); await charger(); setMessage("Vérifiez la pièce et le paiement, puis confirmez l’association.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Lecture impossible : la pièce reste disponible dans Pièces et bulletins."); }
    finally { setBusy(false); }
  }
  async function original(p: Piece) {
    try { const r = await authFetch(`${justifs}?id=${p.id}`); if (!r.ok) throw new Error("Téléchargement impossible"); const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = p.nom; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
  }
  const actives = lignes.filter(l => !l.rapprochementExclu);
  const visibles = lignes.filter(l => (filtre === "exclues" ? l.rapprochementExclu : !l.rapprochementExclu && (filtre !== "manquantes" || !l.piece)) && `${l.fournisseur} ${l.poste} ${l.montant} ${l.compte}`.toLowerCase().includes(recherche.toLowerCase())).sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || ""));
  const ligne = lignes.find(l => l.id === cible), extraction = choix?.extraction;
  const montantPiece = extraction?.typeDocument === "paie" ? extraction.netAPayer : extraction?.ttc;
  if (!isAdmin) return <p className="p-6">Accès administrateur requis.</p>;
  return <main className="max-w-7xl mx-auto p-6 space-y-5">
    <h1 className="font-bold text-2xl">Dépenses et justificatifs</h1>
    <nav className="flex flex-wrap gap-3">{[["tableau", "Tableau des opérations"], ["pieces", "Pièces et bulletins"], ["synthese", "Synthèse par catégorie"]].map(([v, label]) => <button key={v} disabled={busy} className={`rounded border px-4 py-2 ${vue === v ? "bg-blue-900 text-white" : "bg-white"}`} onClick={() => { setVue(v); setMessage(""); }}>{label}</button>)}</nav>
    {vue === "pieces" ? <PiecesSansLigne /> : vue === "synthese" ? <VueParPoste /> : <>
      <p>Choisissez une ligne, vérifiez sa catégorie et ajoutez le justificatif correspondant. Exclure une ligne du rapprochement ne change ni son montant ni les soldes bancaires.</p>
      <div className="flex flex-wrap gap-3"><label>Mois <input type="month" className="border rounded p-2" disabled={busy} value={mois} onChange={e => { if(e.target.value) { setMois(e.target.value); setCible(null); setChoix(null); } }} /></label>
        <select className="border rounded p-2" aria-label="État" value={filtre} onChange={e => setFiltre(e.target.value)}><option value="actives">Toutes les lignes actives</option><option value="manquantes">Sans justificatif</option><option value="exclues">Exclues du rapprochement</option></select>
        <input className="border rounded p-2" aria-label="Rechercher" placeholder="Fournisseur, montant, catégorie…" value={recherche} onChange={e => setRecherche(e.target.value)} />
        <button disabled={busy} className="underline" onClick={() => { setBusy(true); void charger().catch(e => setMessage(e.message)).finally(() => setBusy(false)); }}>Actualiser</button></div>
      <p>{actives.length} lignes actives · {actives.filter(l => !l.piece).length} sans justificatif. Les autres débits conservés pour rapprochement ne sont pas ajoutés à la synthèse des charges.</p>
      <p role="status" className="whitespace-pre-line text-blue-900">{busy ? "Traitement… " : ""}{message}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Date", "Opération / compte bancaire", "Montant", "Catégorie", "Justificatif", "État"].map(t => <th className="p-2" key={t}>{t}</th>)}</tr></thead><tbody>{visibles.map(l => <tr key={l.id} className="border-t align-top">
        <td className="p-2 whitespace-nowrap">{l.dateOperation || "Non renseignée"}</td><td className="p-2"><p>{l.fournisseur}</p><p className="text-xs">{l.compte || "Compte non renseigné"}</p><details className="text-xs"><summary>Source</summary>{l.note}<p>{l.id}</p></details></td>
        <td className="p-2 whitespace-nowrap">{euros(l.montant)}{l.source !== "releve-bancaire" && <p className="text-xs">Saisie manuelle</p>}</td>
        <td className="p-2"><select aria-label={`Catégorie ${l.fournisseur}`} className="max-w-56 border rounded p-2" disabled={busy} value={l.poste} onChange={e => void agir(endpoint, { action: "categorie", id: l.id, poste: e.target.value })}>{[...new Set([l.poste, ...categories])].map(c => <option key={c} value={c}>{c === "hors-depenses" ? "Autre débit — à classer" : c}</option>)}</select>{!l.suivie && <p className="text-xs">Conservé hors synthèse des charges</p>}</td>
        <td className="p-2 space-y-2">{l.piece ? <><button className="underline block" onClick={() => void original(l.piece!)}>{l.piece.nom}</button><button className="underline" disabled={busy} onClick={() => void agir(justifs, { action: "dissocier", id: l.piece!.id })}>Dissocier</button></> : <><label className="block underline cursor-pointer">Importer une pièce<input aria-label={`Importer un justificatif pour ${l.fournisseur}`} className="block max-w-52" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || !!l.rapprochementExclu || l.source !== "releve-bancaire"} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importer(l, f); }} /></label><button disabled={busy || !!l.rapprochementExclu || l.source !== "releve-bancaire"} className="underline" onClick={() => { setCible(l.id); setChoix(null); setCorrection(null); }}>Choisir une pièce existante</button></>}</td>
        <td className="p-2"><p>{l.rapprochementExclu ? "Exclue" : l.piece ? "Associée" : "À compléter"}</p><button disabled={busy} className="underline" onClick={() => void agir(endpoint, { action: "exclure", id: l.id, exclue: !l.rapprochementExclu })}>{l.rapprochementExclu ? "Réactiver" : "Exclure du rapprochement"}</button></td>
      </tr>)}</tbody></table></div>
      {!visibles.length && <p>Aucune opération affichée pour cette sélection.</p>}
      {ligne && <section id="association-ligne" className="rounded border bg-blue-50 p-4 space-y-3">
        <h2 className="font-bold">Associer à {ligne.fournisseur} · {ligne.dateOperation || "date inconnue"} · {euros(ligne.montant)}</h2>
        {message && <p role="status" className="whitespace-pre-line">{message}</p>}
        <select aria-label="Pièce existante" className="border rounded p-2 max-w-full" value={choix?.id || ""} disabled={busy} onChange={e => { setChoix(pieces.find(p => p.id === e.target.value) || null); setCorrection(null); }}><option value="">Choisir une pièce déjà importée</option>{pieces.filter(p => !p.retire && (!p.depenseId || p.depenseId === ligne.id)).map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
        {choix && <><p>{choix.nom}</p><button className="underline" onClick={() => void original(choix)}>Voir l’original</button>
          {choix.retire ? <p>Cette pièce est exclue. Restaurez-la dans Pièces et bulletins.</p> : !extraction ? <button disabled={busy} className="underline" onClick={async () => { await agir(justifs, { action: "analyser", id: choix.id }); const r = await authFetch(`${justifs}?piece=${choix.id}`); if(r.ok) {const d = await r.json(); setChoix(d.pieces[0]);} }}>Lire cette pièce</button> : <>
            <p>{extraction.typeDocument === "paie" ? `${extraction.salarie} · Paie ${extraction.moisPaie} · Net à payer` : `${extraction.fournisseur} · Facture ${extraction.numero} · TTC`} : {montantPiece ?? "non lu"} {extraction.devise || "(devise à vérifier)"}</p>
            <button className="underline" disabled={busy} onClick={() => setCorrection({ ...extraction })}>Corriger la lecture ici</button>
            {correction && <form className="flex flex-wrap gap-3" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await post(justifs, { action: "corriger", id: choix.id, extraction: correction }); setChoix({ ...choix, extraction: correction }); setCorrection(null); await charger(); } catch(err) {setMessage(err instanceof Error ? err.message : "Erreur");} finally {setBusy(false);} }}>
              <label>Nature<select className="block border p-2" value={correction.typeDocument} onChange={e => setCorrection({ ...correction, typeDocument: e.target.value as PieceExtraite["typeDocument"] })}>{["achat", "paie", "vente", "autre", "inconnu"].map(t => <option key={t}>{t}</option>)}</select></label>
              <label>Devise<select className="block border p-2" value={correction.devise || ""} onChange={e => setCorrection({ ...correction, devise: e.target.value })}><option value="">À vérifier</option>{DEVISES_PIECES.map(t => <option key={t}>{t}</option>)}</select></label>
              {(correction.typeDocument === "paie" ? ["salarie", "moisPaie", "netAPayer"] : ["fournisseur", "numero", "date", "ht", "tva", "ttc"]).map(k => <label key={k}>{({ salarie: "Salarié", moisPaie: "Mois de paie", netAPayer: "Net à payer", fournisseur: "Fournisseur", numero: "Numéro", date: "Date", ht: "HT", tva: "TVA", ttc: "TTC" } as Record<string,string>)[k]}<input className="block border p-2" value={String((correction as unknown as Record<string, unknown>)[k] ?? "")} type={k === "date" ? "date" : k === "moisPaie" ? "month" : ["ht","tva","ttc","netAPayer"].includes(k) ? "number" : "text"} step="0.01" onChange={e => setCorrection({ ...correction, [k]: ["ht","tva","ttc","netAPayer"].includes(k) ? e.target.value === "" ? null : Number(e.target.value) : e.target.value })} /></label>)}
              <button disabled={busy} className="rounded border p-2">Enregistrer</button><button type="button" disabled={busy} onClick={() => setCorrection(null)}>Annuler</button>
            </form>}
            <button disabled={busy || !!correction} className="bg-blue-900 text-white rounded p-3" onClick={async () => { if (!window.confirm(`Confirmer la pièce de ${montantPiece} ${extraction.devise || "devise inconnue"} pour le paiement ${ligne.fournisseur} de ${euros(ligne.montant)} ? Vérifiez le bénéficiaire et la période.`)) return; if (await agir(endpoint, { action: "associer", id: ligne.id, pieceId: choix.id, confirme: true, montantPiece, devise: extraction.devise, montantEUR: ligne.montant })) { setCible(null); setChoix(null); } }}>Confirmer l’association à cette ligne</button>
          </>}
          {!choix.depenseId && !choix.retire && <button className="underline text-red-800" disabled={busy} onClick={async () => { if (await agir(justifs, { action: "retirer", id: choix.id })) setChoix(null); }}>Exclure cette pièce</button>}
        </>}
        <button className="block underline" disabled={busy} onClick={() => { setCible(null); setChoix(null); }}>Fermer le choix</button>
      </section>}
      <details><summary>Autres outils</summary><div className="flex flex-wrap gap-4 p-3"><Link className="underline" href="/admin/comptabilite/tresorerie">Comptes et relevés</Link><Link className="underline" href="/admin/comptabilite/depenses/doublons">Contrôler les doublons</Link><Link className="underline" href="/admin/comptabilite/cloture-mois">Boucler le mois</Link><Link className="underline" href="/admin/comptabilite/celeris">Historique Céleris</Link></div></details>
    </>}
  </main>;
}
