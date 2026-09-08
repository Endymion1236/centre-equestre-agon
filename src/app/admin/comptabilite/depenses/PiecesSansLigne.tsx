"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { alertesPiece, deviseEtrangere, DEVISES_PIECES, type PieceExtraite, type DepenseCandidate } from "@/lib/justificatifs";
import ChoixDebitDevise from "../justificatifs/ChoixDebitDevise";

type Piece = { id: string; nom: string; retire: boolean; extraction: PieceExtraite | null; depenseId: string | null; paieValidee: boolean;
  associationMode: string; depenseAssociee: DepenseCandidate | null;
  associationDevise?: { deviseFacture: string; montantFacture: number; montantDebiteEUR: number } | null;
  propositions: (DepenseCandidate & { score: number; raisons: string[]; dejaAssociee?: boolean })[] };
const endpoint = "/api/admin/justificatifs";
const numeriques = ["ht", "tva", "ttc", "brut", "netAPayer", "cotisationsSalariales", "cotisationsPatronales", "prelevementSource"];
const libellesFacture = { fournisseur: "Fournisseur", numero: "Numéro de facture", date: "Date de facture", debutPeriode: "Début de prestation", finPeriode: "Fin de prestation", ht: "HT", tva: "TVA", ttc: "TTC" };
const libellesPaie = { salarie: "Salarié", employeur: "Employeur", moisPaie: "Mois de paie", date: "Date du bulletin", brut: "Salaire brut", netAPayer: "Net à payer après prélèvement à la source", cotisationsSalariales: "Cotisations salariales", cotisationsPatronales: "Cotisations patronales", prelevementSource: "Prélèvement à la source" };
const statut = (p: Piece) => p.retire ? "Exclue" : p.depenseId ? "Associée" : p.paieValidee ? "Bulletin classé" : !p.extraction ? "À lire" : "À vérifier";
export default function JustificatifsPage() {
  const { user, isAdmin } = useAuth();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [suivant, setSuivant] = useState<string | null>(null), [limite, setLimite] = useState(false);
  const [filtre, setFiltre] = useState("actives"), [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState(false), [champs, setChamps] = useState<Record<string, string>>({});
  const load = useCallback(async (apres?: string, focus?: string): Promise<Piece[]> => {
    const r = await authFetch(endpoint + (focus ? `?piece=${focus}` : apres ? `?apres=${apres}` : ""));
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    setPieces(prev => focus ? [...d.pieces, ...prev.filter(p => !d.pieces.some((x: Piece) => x.id === p.id))] : apres ? [...prev, ...d.pieces.filter((p: Piece) => !prev.some(x => x.id === p.id))] : d.pieces);
    if (!focus) setSuivant(d.suivant); setLimite(d.limiteDepenses);
    return d.pieces;
  }, []);
  useEffect(() => { if (user && isAdmin) void load().catch(e => setMessage(e.message)); }, [user, isAdmin, load]);
  async function envoyer(body: object) {
    const r = await authFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error); return d;
  }
  async function action(body: object) {
    setBusy(true); setMessage("");
    try {
      await envoyer(body); setEdition(false);
      const id = (body as { id: string }).id; await load(undefined, id);
      setMessage("Enregistré.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Opération impossible"); }
    finally { setBusy(false); }
  }
  async function depot(fichier: File) {
    setBusy(true); setMessage("Envoi du document…"); setEdition(false);
    try {
      const form = new FormData(); form.append("fichier", fichier);
      const r = await authFetch(endpoint, { method: "POST", body: form }); const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSelection(d.id);
      const [p] = await load(undefined, d.id);
      if (!p) throw new Error("Document conservé, mais affichage indisponible. Actualisez la liste.");
      if (p.retire) { setMessage("Ce document est déjà exclu. Vous pouvez le restaurer ci-dessous."); return; }
      if (p.extraction) { setMessage("Document déjà importé : vérifiez la pièce existante ci-dessous."); return; }
      setMessage("Lecture de ce document…");
      await envoyer({ action: "analyser", id: d.id });
      await load(undefined, d.id); setMessage("Lecture terminée. Vérifiez la pièce, puis associez-la, classez-la ou excluez-la.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Lecture impossible. Le document envoyé reste disponible."); }
    finally { setBusy(false); }
  }
  async function telecharger(p: Piece) {
    try {
      const r = await authFetch(`${endpoint}?id=${p.id}`); if (!r.ok) throw new Error("Téléchargement impossible");
      const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = p.nom; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
  }
  const [drive, setDrive] = useState<{ dossier: string; googleConnecte: boolean; compteGoogle?: string | null; base?: string } | null>(null);
  useEffect(() => { if (user && isAdmin) void authFetch(`${endpoint}/import-drive`).then(r => r.json()).then(d => setDrive({ dossier: d.dossier || "", googleConnecte: !!d.googleConnecte, compteGoogle: d.compteGoogle || null, base: d.base || "" })).catch(() => setDrive({ dossier: "", googleConnecte: false })); }, [user, isAdmin]);
  async function importerDrive() {
    if (!drive?.dossier.trim()) { setMessage("Collez le lien du dossier Drive à importer."); return; }
    setBusy(true); setEdition(false);
    const nouveaux: string[] = []; let doublons = 0, ignores: string[] = [], total = 0, tours = 0, dejaImportes = 0;
    try {
      let restants = 1;
      while (restants > 0 && tours < 40) {
        tours++;
        setMessage(`Import depuis Drive… ${nouveaux.length} pièce(s) importée(s)${restants > 1 ? `, ${restants} restante(s)` : ""}`);
        const r = await authFetch(`${endpoint}/import-drive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dossier: drive.dossier }) });
        // Une panne de plateforme ne renvoie pas de JSON : sans ce filet,
        // l'écran affichait l'erreur de lecture au lieu du code HTTP.
        const d = await r.json().catch(() => ({ error: `Réponse illisible du serveur (HTTP ${r.status}). Réessayez ; les pièces déjà importées sont conservées.` }));
        if (!r.ok) throw new Error(d.error || `Import refusé (HTTP ${r.status}).`);
        nouveaux.push(...d.importes); doublons += d.doublons.length; ignores = [...ignores, ...d.ignores]; total = d.total; restants = d.restants;
        dejaImportes = d.dejaImportes ?? 0;
      }
      await load();
      let lues = 0, echecs = 0;
      for (const id of nouveaux) {
        setMessage(`${nouveaux.length} pièce(s) importée(s) sur ${total} fichier(s) du dossier. Lecture ${lues + echecs + 1} / ${nouveaux.length}…`);
        try { await envoyer({ action: "analyser", id }); lues++; } catch { echecs++; }
      }
      await load();
      // « 0 importée, 0 déjà connue » sur un dossier de quinze fichiers
      // ressemblait à une panne : c'était simplement un dossier déjà importé
      // en entier. On le dit, et on rappelle où les pièces sont parties.
      const dejaTotal = dejaImportes + doublons;
      setMessage([`Dossier Drive : ${total} fichier(s) PDF/JPEG/PNG.`,
        nouveaux.length ? `${nouveaux.length} nouvelle(s) pièce(s) importée(s)${dejaTotal ? `, ${dejaTotal} déjà présente(s)` : ""}.` : "",
        !nouveaux.length && dejaTotal ? `Rien de nouveau : les ${dejaTotal} fichier(s) sont déjà dans les pièces à rattacher.` : "",
        !nouveaux.length && !dejaTotal && total ? "Aucun fichier n'a pu être importé — voir les motifs ci-dessous." : "",
        nouveaux.length ? `${lues} lue(s) par l'IA${echecs ? `, ${echecs} à relire à la main` : ""}.` : "", ...ignores.map(i => `Ignoré : ${i}`)].filter(Boolean).join("\n"));
    } catch (e) { setMessage(e instanceof Error ? e.message : "Import Drive impossible"); }
    finally { setBusy(false); }
  }
  const p = pieces.find(x => x.id === selection);
  const e = p?.extraction;
  const liste = pieces.filter(x => (filtre === "exclues" ? x.retire : !x.retire && (filtre !== "paie" || x.extraction?.typeDocument === "paie")) && x.nom.toLowerCase().includes(recherche.toLowerCase()));
  if (!isAdmin) return <p className="p-6">Accès administrateur requis.</p>;
  return <main className="mx-auto max-w-5xl p-6 space-y-5">
    <Link href="/admin/comptabilite/depenses" className="underline">← Dépenses</Link>
    <h1 className="text-2xl font-bold">Justificatifs — une pièce à la fois</h1>
    <p>1. Importez un document. 2. Vérifiez sa lecture. 3. Associez la facture, classez le bulletin de paie ou excluez le document.</p>
    <section className="rounded-xl border bg-blue-50 p-5 space-y-2">
      <label htmlFor="piece" className="block font-semibold">Importer une facture, un ticket ou un bulletin de paie</label>
      <input id="piece" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={ev => { const f = ev.target.files?.[0]; ev.target.value = ""; if (f) void depot(f); }} />
      <p className="text-sm">Un document par fichier, PDF ou photo, 4 Mo maximum. Plusieurs pages sont possibles pour une même pièce. La lecture IA concerne uniquement le document choisi. Les pièces restent privées.</p>
    </section>
    <section className="rounded-xl border bg-white p-5 space-y-2">
      <label htmlFor="drive" className="block font-semibold">Importer un dossier Google Drive</label>
      <div className="flex flex-wrap gap-2">
        <input id="drive" className="flex-1 min-w-64 border rounded p-2" placeholder="Lien du dossier Drive (…/folders/…) ou identifiant" value={drive?.dossier || ""} disabled={busy || !drive} onChange={e => setDrive(d => ({ dossier: e.target.value, googleConnecte: d?.googleConnecte ?? false, compteGoogle: d?.compteGoogle ?? null, base: d?.base }))} />
        <button disabled={busy || !drive} className="rounded bg-slate-900 text-white px-4 py-2 disabled:opacity-50" onClick={() => void importerDrive()}>Importer les nouveaux fichiers</button>
      </div>
      {drive?.compteGoogle
        ? <p className="text-sm text-blue-900">Compte Google utilisé pour lire Drive : <b>{drive.compteGoogle}</b>{drive.base ? <> · base <b>{drive.base}</b></> : null}. Le dossier doit appartenir à ce compte, ou lui être partagé en lecture. La connexion Google appartient à cette base : se connecter en production ne connecte pas la préversion.</p>
        : drive && <p className="text-sm text-amber-800">Aucun compte Google connecté sur cette base{drive.base ? <> (<b>{drive.base}</b>)</> : null}. Connectez-le depuis l’Assistant boîte mail de <em>cette</em> préversion : la connexion faite en production n’y donne pas accès.</p>}
      <p className="text-sm">Seuls les fichiers pas encore importés sont récupérés (PDF, JPEG, PNG, 10 Mo maximum), puis lus par l’IA. Le dossier Drive n’est ni modifié ni vidé : les pièces sont copiées dans le coffre privé de l’application, qui reste la référence.{drive && !drive.googleConnecte ? " Compte Google non connecté : connectez-le d’abord dans l’Assistant boîte mail." : ""}</p>
    </section>
    <p role="status" className="whitespace-pre-line rounded bg-slate-50 p-3">{message || "Choisissez un fichier ou ouvrez une pièce déjà importée."}</p>
    {p && <article className="rounded-xl border p-5 space-y-4">
      <div className="flex justify-between gap-3"><h2 className="font-semibold break-all">{p.nom} · {statut(p)}</h2><button disabled={busy} className="underline" onClick={() => { setSelection(null); setEdition(false); }}>Fermer</button></div>
      <div className="flex flex-wrap gap-4"><button className="underline" disabled={busy} onClick={() => void telecharger(p)}>Télécharger l’original</button>
        <button className="underline text-red-800" disabled={busy || !!p.depenseId} onClick={() => void action({ action: p.retire ? "restaurer" : "retirer", id: p.id })}>{p.retire ? "Restaurer la pièce" : "Exclure ce document"}</button>
        {!p.retire && !p.depenseId && e && <button className="underline" disabled={busy} onClick={() => { if (window.confirm("Relire uniquement ce document ? Ses informations extraites et corrigées seront remplacées, avec conservation de l’historique.")) void action({ action: "relire", id: p.id }); }}>Relire ce document</button>}
      </div>
      {p.retire ? <p>Document exclu du travail, original conservé et récupérable.</p> : !e ? <><p>La pièce est conservée. Vous pouvez relancer sa lecture ou l’exclure si elle n’est pas pertinente.</p><button className="rounded bg-blue-900 text-white px-4 py-2" disabled={busy} onClick={() => void action({ action: "analyser", id: p.id })}>Lire ce document</button></> : <>
        {e.typeDocument === "paie" ? <div className="rounded bg-blue-50 p-4 space-y-2"><h3 className="font-bold">Bulletin de paie</h3><p>{e.salarie || "Salarié à compléter"} · {e.moisPaie || "Mois à compléter"} · {e.employeur}</p>
          <p>Brut : {e.brut ?? "non lu"} · Net à payer : {e.netAPayer ?? "non lu"} {e.devise || "(devise à vérifier)"}</p><p>Cotisations salariales : {e.cotisationsSalariales ?? "non lues"} · Patronales : {e.cotisationsPatronales ?? "non lues"} · Prélèvement à la source : {e.prelevementSource ?? "non lu"}</p>
          <p className="text-sm">Le classement conserve le bulletin pour la préparation comptable. Il ne confirme pas le virement du salaire et ne crée aucune charge supplémentaire.</p></div>
          : e.typeDocument === "autre" ? <p>Ce document ne semble être ni une facture ni un bulletin de paie. Vous pouvez l’exclure, ou corriger sa nature si la lecture est incorrecte.</p>
          : <><p>{e.fournisseur || "Fournisseur à vérifier"} · facture {e.numero || "sans numéro"} · {e.date || "date inconnue"}</p><p>TTC : {e.ttc ?? "non lu"} {e.devise || "(devise à vérifier)"} · HT : {e.ht ?? "non lu"} · TVA : {e.tva ?? "non lue"}</p><p>Période : {e.debutPeriode || "non précisée"} → {e.finPeriode || "non précisée"}</p></>}
        {alertesPiece(e).map(a => <p key={a} className="text-amber-800">{a}</p>)}
        {!p.depenseId && <button className="underline" disabled={busy} onClick={() => { setEdition(true); setChamps(Object.fromEntries(Object.entries(e).map(([k,v]) => [k, v == null ? "" : String(v)]))); }}>Vérifier / corriger</button>}
        {edition && <form className="grid gap-3 sm:grid-cols-2" onSubmit={ev => { ev.preventDefault(); const extraction: Record<string, unknown> = { ...champs }; for (const k of numeriques) extraction[k] = champs[k]?.trim() ? Number(champs[k].replace(",", ".")) : null; void action({ action: "corriger", id: p.id, extraction }); }}>
          <label>Nature<select className="block w-full border rounded p-2" value={champs.typeDocument || "inconnu"} onChange={ev => setChamps({ ...champs, typeDocument: ev.target.value })}><option value="inconnu">À vérifier</option><option value="achat">Facture fournisseur / ticket</option><option value="paie">Bulletin de paie</option><option value="vente">Facture client</option><option value="autre">Autre document</option></select></label>
          <label>Devise<select className="block w-full border rounded p-2" value={champs.devise || ""} onChange={ev => setChamps({ ...champs, devise: ev.target.value })}><option value="">À vérifier</option>{DEVISES_PIECES.map(d => <option key={d}>{d}</option>)}</select></label>
          {Object.entries(champs.typeDocument === "paie" ? libellesPaie : libellesFacture).map(([k,label]) => <label key={k}>{label}<input className="block w-full border rounded p-2" value={champs[k] || ""} type={k === "moisPaie" ? "month" : ["date", "debutPeriode", "finPeriode"].includes(k) ? "date" : numeriques.includes(k) ? "number" : "text"} step={numeriques.includes(k) ? "0.01" : undefined} onChange={ev => setChamps({ ...champs, [k]: ev.target.value })} /></label>)}
          <button className="rounded bg-blue-900 text-white p-2" disabled={busy}>Enregistrer les corrections</button><button type="button" className="underline" disabled={busy} onClick={() => setEdition(false)}>Annuler les corrections</button>
        </form>}
        {p.depenseId ? <div className="rounded bg-green-50 p-4"><p>Associée au paiement {p.depenseAssociee?.fournisseur || p.depenseId} · {p.depenseAssociee?.dateOperation || "date inconnue"} · {p.depenseAssociee?.montant ?? "montant non affiché"} EUR.</p>
          {p.associationDevise && <p>Facture : {p.associationDevise.montantFacture} {p.associationDevise.deviseFacture} · débit : {p.associationDevise.montantDebiteEUR} EUR.</p>}<button className="underline" disabled={busy} onClick={() => void action({ action: "dissocier", id: p.id })}>Annuler l’association</button></div>
          : e.typeDocument === "paie" ? p.paieValidee ? <p className="rounded bg-green-50 p-3">Bulletin vérifié et classé.</p> : <button className="rounded bg-blue-900 text-white px-4 py-2" disabled={busy || edition} onClick={() => void action({ action: "classer-paie", id: p.id })}>Confirmer et classer ce bulletin</button>
          : ["vente", "autre"].includes(e.typeDocument || "") ? <p>Cette pièce n’est pas proposée pour le rapprochement des dépenses fournisseurs.</p>
          : deviseEtrangere(e) ? <ChoixDebitDevise pieceId={p.id} piece={e} busy={busy || edition} confirmer={action} />
          : <section className="space-y-3"><h3 className="font-bold">Choisir le paiement correspondant</h3>
            {limite && <p>Recherche limitée à 2 000 dépenses. Une opération peut ne pas être affichée.</p>}
            {!e.devise ? <p>Indiquez la devise dans « Vérifier / corriger » pour rechercher le paiement.</p> : !p.propositions.length && <p>Aucun débit du même montant trouvé dans les dépenses importées. Vérifiez le relevé et le montant payé ; vous pouvez laisser cette pièce en attente.</p>}
            {p.propositions.map(d => <div className="rounded border p-3" key={d.id}><p>{d.fournisseur} · {d.dateOperation || "date inconnue"} · {d.montant.toFixed(2)} EUR</p><p className="text-sm">Compte : {d.compte || "non renseigné"} · {d.note}</p>
              {d.dejaAssociee ? <p>Paiement déjà associé à une autre pièce.</p> : <button className="underline" disabled={busy || edition} onClick={() => { if (window.confirm(`Associer cette facture à ce paiement de ${d.montant.toFixed(2)} EUR ?`)) void action({ action: "associer", id: p.id, depenseId: d.id }); }}>Confirmer cette association</button>}</div>)}
          </section>}
      </>}
      <button className="underline" disabled={busy} onClick={() => { setSelection(null); setEdition(false); setMessage("Vous pouvez importer la pièce suivante ou en ouvrir une autre ci-dessous."); }}>Passer à une autre pièce</button>
    </article>}
    <section className="space-y-3"><h2 className="text-xl font-bold">Pièces déjà importées</h2>
      <div className="flex gap-3 flex-wrap"><label>Afficher <select className="border rounded p-2" value={filtre} onChange={ev => setFiltre(ev.target.value)}><option value="actives">Pièces conservées</option><option value="paie">Bulletins de paie</option><option value="exclues">Pièces exclues</option></select></label><input className="border rounded p-2" aria-label="Rechercher un fichier" placeholder="Rechercher un fichier" value={recherche} onChange={ev => setRecherche(ev.target.value)} /></div>
      {liste.map(x => <button key={x.id} disabled={busy} className="block w-full text-left border rounded p-3" onClick={() => { setSelection(x.id); setEdition(false); setMessage(""); }}>{x.nom} — {statut(x)}</button>)}
      {!liste.length && <p>Aucune pièce dans cette liste.</p>}
      {suivant && <button className="underline" disabled={busy} onClick={() => { setBusy(true); void load(suivant).catch(err => setMessage(err.message)).finally(() => setBusy(false)); }}>Charger les pièces suivantes</button>}
    </section>
    <details><summary className="cursor-pointer">Outils complémentaires</summary><div className="flex flex-wrap gap-4 p-3"><Link className="underline" href="/admin/comptabilite/tresorerie">Importer un relevé bancaire</Link><Link className="underline" href="/admin/comptabilite/depenses/doublons">Contrôler les doublons de dépenses</Link></div></details>
  </main>;
}
