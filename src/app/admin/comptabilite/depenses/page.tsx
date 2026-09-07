"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { DEVISES_PIECES, type PieceExtraite } from "@/lib/justificatifs";
import { verifierAssociationTableau, verifierEcheance } from "@/lib/tableau-depenses";
import ReinitialiserPieces from "./ReinitialiserPieces";
import { posteCommissionCarte, POSTES_DEPENSES } from "@/lib/postes-depenses";
import { CATEGORIE_IMMOBILISATION, CATEGORIE_EMPRUNTS, SEUIL_ALERTE_IMMOBILISATION_TTC } from "@/lib/tableau-depenses";
import { completudeJustificatifs, bilanTvaMois, construireExportTva, construireExportJustificatifs } from "@/lib/bilan-justificatifs";
import VueParPoste from "./VueParPoste";
import PiecesSansLigne from "./PiecesSansLigne";
type Piece = { id: string; nom: string; retire: boolean; depenseId: string | null; extraction: PieceExtraite | null; depenseAssociee?: { fournisseur?: string; montant?: number; dateOperation?: string }; modeRattachement?: string; paiementsAssocies?: { id: string; montant: number }[] };
type Ligne = { id: string; dateOperation?: string; fournisseur: string; montant: number; poste: string; compte?: string; note?: string; source: string; suivie: boolean; rapprochementExclu?: boolean; statutTVA?: string; justificatifReleve?: boolean; referenceJustificatifReleve?: string | null; depensePersonnelle?: boolean; immobilisation?: boolean; justifieeVia?: { type: string; detail: string } | null; piece: Piece | null };
const POSTES_CHARGES = new Set(POSTES_DEPENSES.map(p => p.nom));
const eurosCourt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
function telechargerTexte(nom: string, contenu: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + contenu], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = nom; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const endpoint = "/api/admin/depenses/tableau", justifs = "/api/admin/justificatifs";
const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export default function DepensesPage() {
  const { user, isAdmin } = useAuth();
  const [vue, setVue] = useState("tableau"), [mois, setMois] = useState(new Date().toISOString().slice(0, 7));
  const [lignes, setLignes] = useState<Ligne[]>([]), [pieces, setPieces] = useState<Piece[]>([]), [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [filtre, setFiltre] = useState("actives"), [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<string | null>(null), [choix, setChoix] = useState<Piece | null>(null);
  const [mode, setMode] = useState("normal");
  const [correction, setCorrection] = useState<PieceExtraite | null>(null);
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
    setMode("normal"); setCible(l.id); setChoix(null); setCorrection(null); setBusy(true); setMessage("Import et lecture de cette pièce…");
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
  async function delierPourCorriger(p: Piece, paiementId?: string) {
    const identifiant = paiementId || p.depenseId;
    if (!identifiant || !window.confirm(`Dissocier la pièce ${p.nom} du paiement ${identifiant} pour permettre sa correction ? Le paiement reste conservé ; il faudra ensuite confirmer la bonne association.`)) return;
    setBusy(true); setMessage("");
    try {
      if (p.paiementsAssocies?.length) await post(endpoint, { action: "detacher", id: identifiant, pieceId: p.id });
      else await post(justifs, { action: "dissocier", id: p.id, depenseIdAttendue: identifiant });
      const r = await authFetch(`${justifs}?piece=${p.id}`); const d = await r.json(); if (!r.ok || !d.pieces?.[0]) throw new Error(d.error || "Actualisez la pièce.");
      const actualisee = d.pieces[0] as Piece; setChoix(actualisee);
      if (!actualisee.depenseId) setCorrection(correction || actualisee.extraction);
      await charger(); setMessage(actualisee.depenseId ? "Paiement dissocié. D’autres paiements restent associés à cette pièce." : "Pièce dissociée. Enregistrez les corrections, puis confirmez son association.");
    } catch(e) { setMessage(e instanceof Error ? e.message : "Dissociation impossible"); }
    finally { setBusy(false); }
  }
  async function original(p: Piece) {
    try { const r = await authFetch(`${justifs}?id=${p.id}`); if (!r.ok) throw new Error("Téléchargement impossible"); const u = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = u; a.download = p.nom; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); }
  }
  const actives = lignes.filter(l => !l.rapprochementExclu);
  const visibles = lignes.filter(l => (filtre === "exclues" ? l.rapprochementExclu : !l.rapprochementExclu && (filtre !== "manquantes" || (!l.piece && !l.justificatifReleve && !l.justifieeVia && !l.depensePersonnelle)) && (filtre !== "sans-tva" || l.statutTVA === "sans-tva")) && `${l.fournisseur} ${l.poste} ${l.montant} ${l.compte}`.toLowerCase().includes(recherche.toLowerCase())).sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || ""));
  const ligne = lignes.find(l => l.id === cible), extraction = choix?.extraction;
  const montantPiece = extraction?.typeDocument === "paie" ? extraction.netAPayer : extraction?.ttc;
  const lectureControle = correction || extraction;
  let blocage = "";
  if (ligne && choix && !choix.retire && lectureControle) {
    try {
      if (mode === "normal" && choix.depenseId && choix.depenseId !== ligne.id) throw new Error("Cette pièce est déjà associée à un autre paiement. Vérifiez le lien ci-dessous ; dissociez-le uniquement s’il faut le remplacer.");
      if (mode === "normal" && choix.paiementsAssocies?.length) throw new Error("Cette pièce utilise plusieurs paiements : choisissez le type Échéance ou PER correspondant.");
      if (mode === "normal") verifierAssociationTableau(lectureControle as unknown as Record<string, unknown>, ligne);
      else if (mode === "echeance") verifierEcheance(lectureControle as unknown as Record<string, unknown>, ligne.montant, (choix.paiementsAssocies || []).filter(a => a.id !== ligne.id).reduce((s, a) => s + a.montant, 0));
      else if (ligne.poste !== "Retraite / PER — à vérifier") throw new Error("Choisissez la catégorie Retraite / PER — à vérifier sur cette ligne.");
    } catch(e) { blocage = e instanceof Error ? e.message : "Vérifiez les informations."; }
  }
  const panneau = ligne && <section id="association-ligne" className="rounded border bg-blue-50 p-4 space-y-3">
        <h2 className="font-bold">Associer à {ligne.fournisseur} · {ligne.dateOperation || "date inconnue"} · {euros(ligne.montant)}</h2>
        {message && <p role="alert" className="whitespace-pre-line">{message}</p>}{blocage && <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3">{blocage}</p>}
        <label className="block">Type de rattachement <select className="border rounded p-2" disabled={busy} value={mode} onChange={e => { setMode(e.target.value); setCorrection(null); }}><option value="normal">Facture ou bulletin — paiement unique</option><option value="echeance">Échéance d’une facture</option><option value="per">Attestation PER — contrôle fiscal</option></select></label>
        {mode === "echeance" && <p>Choisissez la facture complète, même d’un exercice précédent. Seuls les paiements associés ici sont totalisés ; les échéances antérieures non importées ne sont pas présumées réglées. Ce lien ne crée pas de nouvelle charge et ne corrige pas le rattachement à l’exercice.</p>}
        {mode === "per" && <p>Choisissez d’abord la catégorie Retraite / PER — à vérifier sur la ligne. Joignez l’attestation correspondant au contrat et à la période. Ce lien documentaire ne valide aucune déduction fiscale et ne calcule aucun plafond.</p>}
        <select aria-label="Pièce existante" className="border rounded p-2 max-w-full" value={choix?.id || ""} disabled={busy} onChange={e => { setChoix(pieces.find(p => p.id === e.target.value) || null); setCorrection(null); }}><option value="">Choisir une pièce déjà importée</option>{choix && !pieces.some(p => p.id === choix.id && !p.retire && (!p.depenseId || p.depenseId === ligne.id || p.modeRattachement === mode && !!p.paiementsAssocies?.length)) && <option value={choix.id}>{choix.nom} — pièce ouverte</option>}{pieces.filter(p => !p.retire && (!p.depenseId || p.depenseId === ligne.id || p.modeRattachement === mode && !!p.paiementsAssocies?.length)).map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
        {choix && <><p>{choix.nom}</p>
          {choix.depenseId && <div className="border border-amber-300 rounded p-3"><p>Cette pièce est déjà associée {choix.depenseId === ligne.id ? "à cette dépense" : "à un autre paiement"}. Pour modifier sa lecture, dissociez d’abord le lien.</p>{choix.depenseAssociee && <p>{choix.depenseAssociee.fournisseur} · {choix.depenseAssociee.dateOperation || "date inconnue"} · {typeof choix.depenseAssociee.montant === "number" ? euros(choix.depenseAssociee.montant) : "montant non disponible"}</p>}{choix.paiementsAssocies?.length ? choix.paiementsAssocies.map(a => <button key={a.id} disabled={busy} className="block underline" onClick={() => void delierPourCorriger(choix, a.id)}>Dissocier le paiement {a.id} · {euros(a.montant)}</button>) : <button disabled={busy} className="underline" onClick={() => void delierPourCorriger(choix)}>Dissocier pour corriger</button>}</div>}
          {mode !== "normal" && !choix.retire && <button disabled={busy || !!correction || !!blocage || (mode === "echeance" && !extraction)} className="bg-blue-900 text-white rounded p-3 disabled:opacity-50 disabled:cursor-not-allowed" onClick={async () => {
            if (!window.confirm(mode === "per" ? "Confirmer que cette attestation concerne ce versement PER ? Le traitement fiscal reste à vérifier." : `Rattacher uniquement ce paiement de ${euros(ligne.montant)} à la facture complète de ${montantPiece} ${extraction?.devise || ""} ?`)) return;
            if (await agir(endpoint, { action: "rattacher", id: ligne.id, pieceId: choix.id, mode, confirme: true, montantEUR: ligne.montant, montantPiece: montantPiece ?? null, devise: extraction?.devise || null })) { setCible(null); setChoix(null); }
          }}>{mode === "per" ? "Joindre l’attestation à ce versement" : "Rattacher cette échéance"}</button>}
          {!!choix.paiementsAssocies?.length && <p>{choix.paiementsAssocies.length} paiement(s) associés · {euros(choix.paiementsAssocies.reduce((s, a) => s + a.montant, 0))}</p>}<button className="underline" onClick={() => void original(choix)}>Voir l’original</button>
          {choix.retire ? <><p>Cette pièce est archivée.</p><button disabled={busy} className="underline" onClick={async () => { if (await agir(justifs, { action: "restaurer", id: choix.id })) setChoix({ ...choix, retire: false }); }}>Restaurer cette pièce pour la réutiliser</button></> : !extraction ? <button disabled={busy} className="underline" onClick={async () => { await agir(justifs, { action: "analyser", id: choix.id }); const r = await authFetch(`${justifs}?piece=${choix.id}`); if(r.ok) {const d = await r.json(); setChoix(d.pieces[0]);} }}>Lire cette pièce</button> : <>
            <p>{extraction.typeDocument === "paie" ? `${extraction.salarie} · Paie ${extraction.moisPaie} · Net à payer` : `${extraction.fournisseur} · Facture ${extraction.numero} · TTC`} : {montantPiece ?? "non lu"} {extraction.devise || "(devise à vérifier)"}</p>
            <button className="underline" disabled={busy || !!choix.depenseId} onClick={() => setCorrection({ ...extraction })}>Corriger la lecture ici</button>
            {correction && !choix.depenseId && <form className="flex flex-wrap gap-3" onInvalidCapture={e => { const input = e.target as HTMLInputElement; setMessage(`Correction non enregistrée : vérifiez le champ ${input.name || "signalé"}. ${input.validationMessage}`); }} onSubmit={async e => { e.preventDefault(); setBusy(true); setMessage("Enregistrement des corrections…"); try { const d = await post(justifs, { action: "corriger", id: choix.id, extraction: correction }); if (!d.extraction) throw new Error("Réponse incomplète : actualisez pour vérifier l’enregistrement."); setChoix({ ...choix, extraction: d.extraction }); setCorrection(null); setMessage("Corrections enregistrées. Vous pouvez confirmer l’association si les montants correspondent."); try { await charger(); } catch { setMessage("Corrections enregistrées. Le tableau n’a pas pu être actualisé ; réessayez Actualiser."); } } catch(err) {setMessage(err instanceof Error ? err.message : "Enregistrement impossible"); try { const r = await authFetch(`${justifs}?piece=${choix.id}`); if (r.ok) { const d = await r.json(); if (d.pieces?.[0]) setChoix(d.pieces[0]); } } catch {} } finally {setBusy(false);} }}>
              <label>Nature<select className="block border p-2" value={correction.typeDocument} onChange={e => setCorrection({ ...correction, typeDocument: e.target.value as PieceExtraite["typeDocument"] })}>{["achat", "paie", "vente", "autre", "inconnu"].map(t => <option key={t}>{t}</option>)}</select></label>
              <label>Devise<select className="block border p-2" value={correction.devise || ""} onChange={e => setCorrection({ ...correction, devise: e.target.value })}><option value="">À vérifier</option>{DEVISES_PIECES.map(t => <option key={t}>{t}</option>)}</select></label>
              {(correction.typeDocument === "paie" ? ["salarie", "moisPaie", "netAPayer"] : ["fournisseur", "numero", "date", "ht", "tva", "ttc"]).map(k => <label key={k}>{({ salarie: "Salarié", moisPaie: "Mois de paie", netAPayer: "Net à payer", fournisseur: "Fournisseur", numero: "Numéro", date: "Date", ht: "HT", tva: "TVA", ttc: "TTC" } as Record<string,string>)[k]}<input className="block border p-2" value={String((correction as unknown as Record<string, unknown>)[k] ?? "")} type={k === "date" ? "date" : k === "moisPaie" ? "month" : ["ht","tva","ttc","netAPayer"].includes(k) ? "number" : "text"} name={k} step={["ht","tva","ttc","netAPayer"].includes(k) ? "0.01" : undefined} onChange={e => setCorrection({ ...correction, [k]: ["ht","tva","ttc","netAPayer"].includes(k) ? e.target.value === "" ? null : Number(e.target.value) : e.target.value })} /></label>)}
              <button type="submit" disabled={busy} className="rounded border p-2 disabled:opacity-50">Enregistrer les corrections</button><button type="button" disabled={busy} onClick={() => setCorrection(null)}>Annuler</button>
            </form>}
            {correction && <p className="text-sm">Enregistrez les corrections avant de confirmer l’association.</p>}
            <button hidden={mode !== "normal"} disabled={busy || !!correction || !!blocage} className="bg-blue-900 text-white rounded p-3 disabled:opacity-50 disabled:cursor-not-allowed" onClick={async () => { if (!window.confirm(`Confirmer la pièce de ${montantPiece} ${extraction.devise || "devise inconnue"} pour le paiement ${ligne.fournisseur} de ${euros(ligne.montant)} ? Vérifiez le bénéficiaire et la période.`)) return; if (await agir(endpoint, { action: "associer", id: ligne.id, pieceId: choix.id, confirme: true, montantPiece, devise: extraction.devise, montantEUR: ligne.montant })) { setCible(null); setChoix(null); } }}>Confirmer l’association à cette ligne</button>
          </>}
          {!choix.depenseId && !choix.retire && <button className="underline text-red-800" disabled={busy} onClick={async () => { if (await agir(justifs, { action: "retirer", id: choix.id })) setChoix(null); }}>Exclure cette pièce</button>}
        </>}
        <button className="block underline" disabled={busy} onClick={() => { setCible(null); setChoix(null); }}>Fermer le choix</button>
      </section>;
  if (!isAdmin) return <p className="p-6">Accès administrateur requis.</p>;
  return <main className="max-w-7xl mx-auto p-6 space-y-5">
    <h1 className="font-bold text-2xl">Dépenses et justificatifs</h1>
    <nav className="flex flex-wrap gap-3">{[["tableau", "Tableau des opérations"], ["synthese", "Synthèse par catégorie"]].map(([v, label]) => <button key={v} disabled={busy} className={`rounded border px-4 py-2 ${vue === v ? "bg-blue-900 text-white" : "bg-white"}`} onClick={() => { setVue(v); setMessage(""); }}>{label}</button>)}</nav>
    {vue === "pieces" ? <><p>Documents en attente et archives. Pour associer un paiement, revenez au tableau des opérations.</p><PiecesSansLigne /></> : vue === "synthese" ? <VueParPoste /> : <>
      <p>Choisissez une ligne, vérifiez sa catégorie et ajoutez le justificatif correspondant. Une pièce manquante reste à compléter, même pour une opération sans TVA. Exclure du rapprochement conserve le montant, la catégorie et le traitement TVA.</p>
      <p className="text-sm text-slate-600">« Sans TVA » indique une opération sans taxe ; « TVA non récupérée » conserve une taxe qui ne sera pas demandée en déduction. Ces indications préparent le contrôle comptable et ne génèrent ni écriture ni déclaration de TVA.</p>
      <div className="flex flex-wrap gap-3"><label>Mois <input type="month" className="border rounded p-2" disabled={busy} value={mois} onChange={e => { if(e.target.value) { setMois(e.target.value); setCible(null); setChoix(null); } }} /></label>
        <select className="border rounded p-2" aria-label="État" value={filtre} onChange={e => setFiltre(e.target.value)}><option value="actives">Toutes les lignes actives</option><option value="manquantes">Justificatifs manquants</option><option value="sans-tva">Sans TVA</option><option value="exclues">Exclues du rapprochement</option></select>
        <input className="border rounded p-2" aria-label="Rechercher" placeholder="Fournisseur, montant, catégorie…" value={recherche} onChange={e => setRecherche(e.target.value)} />
        <button disabled={busy} className="underline" onClick={() => { setBusy(true); void charger().catch(e => setMessage(e.message)).finally(() => setBusy(false)); }}>Actualiser</button></div>
      {(() => { const comp = completudeJustificatifs(lignes); const tva = bilanTvaMois(lignes); return <div className="rounded-lg border bg-white p-3 space-y-1 text-sm">
        <p><b>{comp.justifies} / {comp.total}</b> dépenses justifiées ({comp.pourcent} %) · <b className={comp.sansPiece ? "text-amber-800" : "text-green-800"}>{eurosCourt(comp.montantSansPiece)}</b> sans justificatif sur {comp.sansPiece} ligne{comp.sansPiece > 1 ? "s" : ""}. Un débit classé dans une catégorie de charge entre dans la synthèse des charges, justifié ou non ; salaires, virements internes, emprunts et immobilisations restent hors synthèse.</p>
        <p>TVA du mois : <b>{eurosCourt(tva.deductibleJustifiee)}</b> déductible justifiée par {tva.nbJustifiees} pièce{tva.nbJustifiees > 1 ? "s" : ""} · {tva.aVerifier.nb} ligne{tva.aVerifier.nb > 1 ? "s" : ""} à vérifier ({eurosCourt(tva.aVerifier.ttc)} TTC){tva.pieceSansTva.nb ? ` · ${tva.pieceSansTva.nb} pièce(s) sans TVA lue` : ""} · {tva.sansTva.nb} sans TVA · {tva.nonRecuperee.nb} non récupérée{tva.nonRecuperee.nb > 1 ? "s" : ""}.
          {" "}<button className="underline" onClick={() => telechargerTexte(`tva_${mois}.csv`, construireExportTva(lignes))}>CSV TVA</button> · <button className="underline" onClick={() => telechargerTexte(`justificatifs_${mois}.csv`, construireExportJustificatifs(lignes))}>CSV justificatifs</button></p>
      </div>; })()}
      <p role="status" className="whitespace-pre-line text-blue-900">{busy ? "Traitement… " : ""}{message}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Date", "Opération / compte bancaire", "Montant", "Catégorie", "Justificatif", "TVA", "Rapprochement"].map(t => <th className="p-2" key={t}>{t}</th>)}</tr></thead><tbody>{visibles.map(l => <Fragment key={l.id}><tr className="border-t align-top">
        <td className="p-2 whitespace-nowrap">{l.dateOperation || "Non renseignée"}</td><td className="p-2"><p>{l.fournisseur}</p><p className="text-xs">{l.compte || "Compte non renseigné"}</p><details className="text-xs"><summary>Source</summary>{l.note}<p>{l.id}</p></details></td>
        <td className="p-2 whitespace-nowrap">{euros(l.montant)}{l.source !== "releve-bancaire" && <p className="text-xs">Saisie manuelle</p>}{l.montant >= SEUIL_ALERTE_IMMOBILISATION_TTC && POSTES_CHARGES.has(l.poste) && <p className="text-xs text-amber-800 whitespace-normal max-w-40">Plus de 500 € HT : bien durable (cheval, matériel, clôture) ? Classez-le en « {CATEGORIE_IMMOBILISATION} ».</p>}</td>
        <td className="p-2"><select aria-label={`Catégorie ${l.fournisseur}`} className="max-w-56 border rounded p-2" disabled={busy} value={l.poste} onChange={e => { const poste = e.target.value; if (poste === "Personnel — hors charges" && !window.confirm("Confirmer le caractère personnel ? La ligne sortira des totaux de dépenses professionnelles et restera visible dans le tableau bancaire.")) return; void agir(endpoint, { action: "categorie", id: l.id, poste }); }}>{[...new Set([l.poste, ...categories])].map(c => <option key={c} value={c}>{c === "hors-depenses" ? "Autre débit — à classer" : c}</option>)}</select>{!l.suivie && <p className="text-xs">Hors synthèse des charges. Une catégorie de charge l’y ajoute, avec ou sans justificatif.</p>}{l.immobilisation && <p className="text-xs text-blue-900">Immobilisation : hors charges, amortie par la comptable sur plusieurs années.</p>}</td>
        <td className="p-2 space-y-2">{l.depensePersonnelle ? <p>Personnel : justificatif professionnel non demandé.{l.piece && <button className="underline block" onClick={() => void original(l.piece!)}>Voir la pièce conservée</button>}</p> : l.piece ? <><button className="underline block" onClick={() => void original(l.piece!)}>{l.piece.nom}</button><button className="underline" disabled={busy} onClick={() => void (l.piece!.paiementsAssocies?.length ? agir(endpoint, { action: "detacher", id: l.id, pieceId: l.piece!.id }) : agir(justifs, { action: "dissocier", id: l.piece!.id }))}>Dissocier ce paiement</button>{!!l.piece.paiementsAssocies?.length && <p className="text-xs">{l.piece.modeRattachement === "per" ? "Attestation PER · fiscalité à vérifier" : `Échéances : ${euros(l.piece.paiementsAssocies.reduce((s, a) => s + a.montant, 0))} associés sur ${euros(l.piece.extraction?.ttc || 0)}`}</p>}</> : <>{l.justifieeVia && !l.justificatifReleve && <p className="text-green-800">Justifiée par Masse salariale : {l.justifieeVia.detail}. <span className="text-slate-600">Le bulletin ou l’appel de cotisations est la pièce ; pas de facture à attendre.</span></p>}{l.justificatifReleve ? <><p className="text-green-800">Relevé bancaire déclaré comme justificatif</p><button disabled={busy} className="underline" onClick={() => void agir(endpoint, { action: "justifier-releve", id: l.id, confirme: false })}>Annuler cette indication</button></> : <>{!l.justifieeVia && <p className="text-amber-800 font-medium">Justificatif manquant</p>}{(posteCommissionCarte(l.fournisseur) || l.poste === CATEGORIE_EMPRUNTS) && l.source === "releve-bancaire" && <button disabled={busy || !!l.rapprochementExclu} className="underline" onClick={() => { if(window.confirm(l.poste === CATEGORIE_EMPRUNTS
  ? `Je confirme que cette échéance de ${euros(l.montant)} figure sur le relevé et que je conserve le tableau d'amortissement du prêt pour la comptable, qui ventilera capital et intérêts.`
  : `Je confirme que la commission de ${euros(l.montant)} figure sur le relevé ${l.note ? "indiqué" : `du compte ${l.compte || "bancaire"} de ce mois`} et que je conserve ce relevé original pour le comptable. Ce choix ne valide aucune TVA déductible.`)) void agir(endpoint, { action: "justifier-releve", id: l.id, confirme: true }); }}>{l.poste === CATEGORIE_EMPRUNTS ? "Échéance de prêt : relevé + tableau d'amortissement" : "Utiliser le relevé comme justificatif"}</button>}{l.poste === CATEGORIE_EMPRUNTS && <p className="text-xs">Échéance de prêt : capital hors charges, intérêts en charges financières. La comptable ventile d'après le tableau d'amortissement.</p>}</>}<label className="block underline cursor-pointer">Importer une pièce<input aria-label={`Importer un justificatif pour ${l.fournisseur}`} className="block max-w-52" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || !!l.rapprochementExclu || l.source !== "releve-bancaire"} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importer(l, f); }} /></label><button disabled={busy || !!l.rapprochementExclu || l.source !== "releve-bancaire"} className="underline" onClick={() => { setMessage(""); setMode("normal"); setCible(l.id); setChoix(null); setCorrection(null); }}>Choisir une pièce existante</button></>}</td>
        <td className="p-2">{l.depensePersonnelle ? <p>Hors TVA professionnelle</p> : <><select aria-label={`TVA ${l.fournisseur}`} className="border rounded p-2" disabled={busy} value={l.statutTVA || "a-verifier"} onChange={e => void agir(endpoint, { action: "tva", id: l.id, statutTVA: e.target.value })}><option value="a-verifier">TVA à vérifier</option><option value="sans-tva">Sans TVA</option><option value="non-recuperee">TVA non récupérée</option></select>{!l.piece && l.statutTVA !== "sans-tva" && <p className="text-xs text-amber-800">TVA non justifiée : à contrôler avant toute déduction.</p>}{l.statutTVA === "sans-tva" && !!l.piece?.extraction?.tva && <p className="text-xs text-amber-800">La pièce indique de la TVA : vérifiez ce choix.</p>}</>}</td>
        <td className="p-2"><p>{l.rapprochementExclu ? "Exclue" : l.depensePersonnelle ? "Personnel — hors charges" : l.piece ? "Associée" : l.justificatifReleve ? "Justifiée par relevé" : l.justifieeVia ? "Justifiée (masse salariale)" : "À compléter"}</p><button disabled={busy} className="underline" onClick={() => void agir(endpoint, { action: "exclure", id: l.id, exclue: !l.rapprochementExclu })}>{l.rapprochementExclu ? "Réactiver" : "Exclure du rapprochement"}</button></td>
      </tr>{cible === l.id && <tr><td colSpan={7} className="p-2">{panneau}</td></tr>}</Fragment>)}</tbody></table></div>
      {!visibles.length && <p>Aucune opération affichée pour cette sélection.</p>}

      <details><summary>Autres outils</summary><div className="flex flex-wrap gap-4 p-3"><button disabled={busy} className="underline" onClick={() => setVue("pieces")}>Documents en attente et archives</button><Link className="underline" href="/admin/comptabilite/tresorerie">Comptes et relevés</Link><Link className="underline" href="/admin/comptabilite/depenses/doublons">Contrôler les doublons</Link><Link className="underline" href="/admin/comptabilite/cloture-mois">Boucler le mois</Link><Link className="underline" href="/admin/comptabilite/celeris">Historique Céleris</Link></div><ReinitialiserPieces termine={charger} verrouiller={setBusy} /></details>
    </>}
  </main>;
}
