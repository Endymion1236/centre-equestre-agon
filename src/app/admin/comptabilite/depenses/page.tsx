"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { DEVISES_PIECES, type PieceExtraite } from "@/lib/justificatifs";
import { verifierAssociationTableau, verifierEcheance } from "@/lib/tableau-depenses";
import ReinitialiserPieces from "./ReinitialiserPieces";
import SupprimerPieces from "./SupprimerPieces";
import { posteCommissionCarte, POSTES_DEPENSES } from "@/lib/postes-depenses";
import { CATEGORIE_IMMOBILISATION, CATEGORIE_EMPRUNTS, CATEGORIE_COMPTE_FFE, SEUIL_ALERTE_IMMOBILISATION_TTC } from "@/lib/tableau-depenses";
import { completudeJustificatifs, bilanTvaMois, construireExportTva, construireExportJustificatifs } from "@/lib/bilan-justificatifs";
import { bilanVentilationAchats, comptesProposes, construireExportVentilationAchats } from "@/lib/ventilation-achats";
import { etatPiece, resteAFaire, sansTvaParNature } from "@/lib/piece-attendue";
import { COMPTES_BANQUE_DEPENSE } from "@/lib/banque-depense";
import { motifControleTva, type LigneMois } from "@/lib/bilan-justificatifs";
import { LIBELLE_JUSTIFICATION } from "@/lib/justification-paie";
import VueParPoste from "./VueParPoste";
import PiecesSansLigne from "./PiecesSansLigne";
import ImportMouvementsBancaires from "./ImportMouvementsBancaires";
type Piece = { id: string; nom: string; retire: boolean; depenseId: string | null; extraction: PieceExtraite | null; depenseAssociee?: { fournisseur?: string; montant?: number; dateOperation?: string }; modeRattachement?: string; paiementsAssocies?: { id: string; montant: number }[] };
type Ligne = { origineBancaire?: string; dernierReleveBancaire?: { nom: string }; id: string; dateOperation?: string; fournisseur: string; montant: number; poste: string; compte?: string; compteBanqueConfirme?: string | null; note?: string; source: string; suivie: boolean; rapprochementExclu?: boolean; statutTVA?: string; justificatifReleve?: boolean; referenceJustificatifReleve?: string | null; piecePerdue?: { motif: string; declareeLe?: string } | null; depensePersonnelle?: boolean; immobilisation?: boolean; avanceFfe?: boolean; justifieeVia?: { type: string; detail: string } | null; doublonProbable?: boolean; piece: Piece | null };
/** Catégories de services : jamais un bien durable, l'alerte immobilisation n'y a pas de sens. */
const POSTES_SANS_IMMOBILISATION = new Set(["Assurances", "Locations & loyers", "Eau & électricité", "Carburants", "Aliments, litières, paille", "Maréchalerie & travail des chevaux", "Vétérinaire & santé des chevaux", "Honoraires & gestion (compta, juridique, GHN)", "Frais bancaires & commissions (CB, Stripe)", "Publicité & communication", "Engagements de concours", "Retraite / PER — à vérifier"]);
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
  /**
   * Rapprochement automatique du mois : aperçu d'abord, écriture seulement
   * après confirmation, rapport ensuite. Les pièces non associées sont
   * expliquées une à une plutôt que comptées en bloc.
   */
  async function rapprocherAuto() {
    setBusy(true); setMessage("");
    try {
      const apercu = await (await authFetch("/api/admin/justificatifs/rapprochement-auto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mois }) })).json();
      if (apercu.error) throw new Error(apercu.error);
      const nb = apercu.associations?.length || 0;
      // Cent trois motifs en vrac ne disent rien. On donne d'abord le compte
      // par famille — combien attendent un clic, combien ne sont pas des
      // achats, combien sont d'un autre mois — puis le détail des pièces qui
      // appellent vraiment un geste.
      const restantes: { nom?: string; motif: string }[] = apercu.ignorees || [];
      const resume: { libelle: string; nb: number }[] = apercu.resume || [];
      const detail = [
        resume.map(f => `  ${f.nb} — ${f.libelle}`).join("\n"),
        ...restantes.slice(0, 12).map(i => `• ${i.nom || "pièce"} : ${i.motif}`),
        restantes.length > 12 ? `… et ${restantes.length - 12} autre(s)` : "",
      ].filter(Boolean).join("\n");
      // Associations où tout concorde sauf le nom : beaucoup d'enseignes se
      // débitent sous celui de leur société d'exploitation (Resterdis pour un
      // Super U, Constellacom pour Printoclock). Les poser seul serait
      // imprudent ; les taire oblige à tout refaire à la main. On les propose
      // donc en lot, et chaque confirmation apprend la correspondance.
      const probables: { pieceId: string; nom?: string; fournisseur?: string; montant: number; dateOperation?: string }[] = apercu.probables || [];
      // Une par une, jamais en bloc : deux montants identiques le même jour
      // peuvent être une coïncidence (une facture Céléris de 107,98 € et un
      // débit U Express du même montant), et un bouton unique ferait valider
      // l'erreur avec le reste. Chaque cas se juge d'un coup d'œil.
      const proposerProbables = async () => {
        if (!probables.length) return false;
        const retenus: string[] = [];
        for (const [i, a] of probables.slice(0, 25).entries()) {
          const ok = window.confirm(`Correspondance ${i + 1} / ${Math.min(probables.length, 25)} — montant et date concordent, le nom diffère.\n\nPièce : ${a.nom || "sans nom"}\nDébit : ${a.fournisseur} · ${euros(a.montant)}${a.dateOperation ? ` du ${a.dateOperation}` : ""}\n\nBeaucoup d'enseignes se débitent sous le nom de leur société d'exploitation. Est-ce bien le même fournisseur ?\n\nOK pour rattacher, Annuler pour passer.`);
          if (ok) retenus.push(a.pieceId);
        }
        if (!retenus.length) return false;
        const rc = await (await authFetch("/api/admin/justificatifs/rapprochement-auto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mois, apply: true, confirmer: retenus }) })).json();
        if (rc.error) throw new Error(rc.error);
        await charger();
        setMessage(`${rc.associations.length} justificatif(s) rattaché(s). Les correspondances de noms confirmées sont mémorisées : les factures des mois suivants se rattacheront seules.${detail ? `\n${detail}` : ""}`);
        return true;
      };

      if (!nb) {
        if (await proposerProbables()) return;
        setMessage(`Aucune association certaine sur ${mois}.${apercu.nbIgnorees ? ` ${apercu.nbIgnorees} pièce(s) restent à associer à la main.` : ""}${probables.length ? `\n${probables.length} association(s) probable(s) non confirmée(s).` : ""}${detail ? `\n${detail}` : ""}`);
        return;
      }
      const liste = apercu.associations.slice(0, 10).map((a: { nom?: string; fournisseur?: string; montant: number; dateOperation?: string }) => `• ${a.nom || "pièce"} → ${a.fournisseur} ${euros(a.montant)} du ${a.dateOperation}`).join("\n");
      if (!window.confirm(`${nb} justificatif(s) correspondent à un seul débit, au centime et à la date près :\n\n${liste}${nb > 10 ? `\n… et ${nb - 10} autre(s)` : ""}\n\nLes associer ? Chacune reste défaisable ensuite.`)) return;
      const r = await (await authFetch("/api/admin/justificatifs/rapprochement-auto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mois, apply: true }) })).json();
      if (r.error) throw new Error(r.error);
      await charger();
      const refus = (r.refusees || []).length;
      setMessage(`${r.associations.length} justificatif(s) rattaché(s) automatiquement.${refus ? ` ${refus} refusé(s) au dernier contrôle.` : ""}${r.nbIgnorees ? ` ${r.nbIgnorees} pièce(s) restent à associer à la main.` : ""}${detail ? `\n${detail}` : ""}`);
      await proposerProbables();
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }

  /**
   * Diagnostic d'une seule ligne : le rapport global part des pièces et ne
   * répond pas à la question qu'on se pose devant une opération précise —
   * « le justificatif est là, pourquoi ne s'est-il pas rattaché ? »
   */
  async function diagnostiquer(l: LigneMois) {
    setBusy(true); setMessage("");
    try {
      const r = await authFetch("/api/admin/justificatifs/rapprochement-auto", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depenseId: l.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Diagnostic refusé (HTTP ${r.status}).`);
      const lignes = (d.candidats || []).map((c: { nom?: string; verdict: string; ecartMontant: number | null; jours: number | null }) =>
        `• ${c.nom || "pièce"} : ${c.verdict}`);
      setMessage([`${l.fournisseur} — ${euros(l.montant)} du ${l.dateOperation || "date inconnue"}`, d.verdictGeneral, ...lignes].filter(Boolean).join("\n"));
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }

  /**
   * Compléter les dates d'opération manquantes sans ressaisir le relevé.
   *
   * Les dates inscrites par la banque dans le libellé (« CB U EXPRESS AGON
   * 28/07 ») sont appliquées d'office : ce n'est pas une interprétation. Les
   * lignes muettes — commissions bancaires, prélèvements — sont proposées
   * séparément au dernier jour de leur mois, la convention du relevé qui les
   * justifie, et restent marquées comme estimées.
   */
  async function completerDates() {
    setBusy(true); setMessage("");
    try {
      const url = `/api/admin/depenses/dates-libelles?mois=${mois}`;
      const a = await (await authFetch(url)).json();
      if (a.error) throw new Error(a.error);
      if (!a.lues && !a.finDeMois) { setMessage(`Toutes les opérations de ${mois} ont déjà une date.`); return; }
      if (a.lues) {
        const ex = (a.exemplesLus || []).slice(0, 6).map((x: { fournisseur?: string; date: string }) => `• ${x.fournisseur || "opération"} → ${x.date}`).join("\n");
        if (window.confirm(`${a.lues} date(s) sont écrites par la banque dans le libellé de l'opération :\n\n${ex}\n\nLes reprendre ? Ce n'est pas une estimation : c'est la date que porte votre relevé.`)) {
          const r = await (await authFetch("/api/admin/depenses/dates-libelles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mois, appliquer: "lues" }) })).json();
          if (r.error) throw new Error(r.error);
          await charger();
          setMessage(`${r.ecrites} date(s) reprises du relevé.${r.restantes ? ` ${r.restantes} opération(s) sans date lisible.` : ""}`);
        }
      }
      if (a.finDeMois && window.confirm(`${a.finDeMois} opération(s) ne portent aucune date dans leur libellé — commissions bancaires, prélèvements.\n\nLes dater au dernier jour du mois (${mois}) ? C'est la convention du relevé qui les justifie ; elles resteront marquées comme dates estimées, corrigibles une à une.`)) {
        const r = await (await authFetch("/api/admin/depenses/dates-libelles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mois, appliquer: "toutes" }) })).json();
        if (r.error) throw new Error(r.error);
        await charger();
        setMessage(`${r.ecrites} date(s) complétées, dont ${r.finDeMois} au dernier jour du mois.${r.restantes ? ` ${r.restantes} restante(s).` : ""}`);
      }
    } catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  }

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
  const visibles = lignes.filter(l => (filtre === "exclues" ? l.rapprochementExclu : !l.rapprochementExclu && (filtre !== "manquantes" || etatPiece(l) === "facture-a-obtenir") && (filtre !== "sans-tva" || l.statutTVA === "sans-tva") && (filtre !== "a-ventiler" || comptesProposes(l).aVentiler)) && `${l.fournisseur} ${l.poste} ${l.montant} ${l.compte} ${comptesProposes(l).imputation.compte}`.toLowerCase().includes(recherche.toLowerCase())).sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || ""));
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
        <label className="block">Type de rattachement <select className="border rounded p-2" disabled={busy} value={mode} onChange={e => { setMode(e.target.value); setCorrection(null); }}><option value="normal">Facture ou bulletin — paiement unique</option><option value="echeance">Échéance d’une facture</option><option value="per">Attestation PER — contrôle fiscal</option><option value="ffe">Relevé du compte FFE — avance licences / engagements</option></select></label>
        {mode === "echeance" && <p>Choisissez la facture complète, même d’un exercice précédent. Seuls les paiements associés ici sont totalisés ; les échéances antérieures non importées ne sont pas présumées réglées. Ce lien ne crée pas de nouvelle charge et ne corrige pas le rattachement à l’exercice.</p>}
        {mode === "ffe" && <p>Choisissez d’abord la catégorie « {CATEGORIE_COMPTE_FFE} » sur la ligne. Joignez le relevé du compte FFE (ffe.com) couvrant la période : il justifie le versement. Le versement n’est pas une charge ; les engagements de concours se saisissent à part d’après ce relevé, les licences refacturées aux cavaliers ne sont pas des charges.</p>}
        {mode === "per" && <p>Choisissez d’abord la catégorie Retraite / PER — à vérifier sur la ligne. Joignez l’attestation correspondant au contrat et à la période. Ce lien documentaire ne valide aucune déduction fiscale et ne calcule aucun plafond.</p>}
        <select aria-label="Pièce existante" className="min-w-0 w-full max-w-full border rounded p-2" value={choix?.id || ""} disabled={busy} onChange={e => { setChoix(pieces.find(p => p.id === e.target.value) || null); setCorrection(null); }}><option value="">Choisir une pièce déjà importée</option>{choix && !pieces.some(p => p.id === choix.id && !p.retire && (!p.depenseId || p.depenseId === ligne.id || p.modeRattachement === mode && !!p.paiementsAssocies?.length)) && <option value={choix.id}>{choix.nom} — pièce ouverte</option>}{pieces.filter(p => !p.retire && (!p.depenseId || p.depenseId === ligne.id || p.modeRattachement === mode && !!p.paiementsAssocies?.length)).map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
        {choix && <><p>{choix.nom}</p>
          {choix.depenseId && <div className="border border-amber-300 rounded p-3"><p>Cette pièce est déjà associée {choix.depenseId === ligne.id ? "à cette dépense" : "à un autre paiement"}. Pour modifier sa lecture, dissociez d’abord le lien.</p>{choix.depenseAssociee && <p>{choix.depenseAssociee.fournisseur} · {choix.depenseAssociee.dateOperation || "date inconnue"} · {typeof choix.depenseAssociee.montant === "number" ? euros(choix.depenseAssociee.montant) : "montant non disponible"}</p>}{choix.paiementsAssocies?.length ? choix.paiementsAssocies.map(a => <button key={a.id} disabled={busy} className="block underline" onClick={() => void delierPourCorriger(choix, a.id)}>Dissocier le paiement {a.id} · {euros(a.montant)}</button>) : <button disabled={busy} className="underline" onClick={() => void delierPourCorriger(choix)}>Dissocier pour corriger</button>}</div>}
          {mode !== "normal" && !choix.retire && <button disabled={busy || !!correction || !!blocage || (mode === "echeance" && !extraction)} className="bg-blue-900 text-white rounded p-3 disabled:opacity-50 disabled:cursor-not-allowed" onClick={async () => {
            if (!window.confirm(mode === "ffe" ? `Confirmer que ce relevé du compte FFE couvre le versement de ${euros(ligne.montant)} ?` : mode === "per" ? "Confirmer que cette attestation concerne ce versement PER ? Le traitement fiscal reste à vérifier." : `Rattacher uniquement ce paiement de ${euros(ligne.montant)} à la facture complète de ${montantPiece} ${extraction?.devise || ""} ?`)) return;
            if (await agir(endpoint, { action: "rattacher", id: ligne.id, pieceId: choix.id, mode, confirme: true, montantEUR: ligne.montant, montantPiece: montantPiece ?? null, devise: extraction?.devise || null })) { setCible(null); setChoix(null); }
          }}>{mode === "ffe" ? "Joindre le relevé FFE à ce versement" : mode === "per" ? "Joindre l’attestation à ce versement" : "Rattacher cette échéance"}</button>}
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
  return <main className="depenses-page min-w-0 w-full space-y-5">
    <style>{`.depenses-page input:not([type=checkbox]), .depenses-page select, .depenses-page textarea { min-width: 0; max-width: 100%; box-sizing: border-box; } .depense-operation { overflow-wrap: anywhere; } .depense-operation select { width: 100%; }`}</style>
    <h1 className="font-bold text-2xl">Dépenses et justificatifs</h1>
    <ImportMouvementsBancaires onImported={m => {
      // Les débits viennent d'entrer : la suite du travail, ce sont leurs
      // justificatifs. On y amène directement plutôt que de laisser chercher.
      setVue("tableau"); setMois(m); setFiltre("manquantes"); setCible(null); setChoix(null);
      setMessage("Débits importés. Voici les lignes sans justificatif : importez le dossier Drive du mois, puis lancez le rapprochement automatique.");
      if (m === mois) void charger().catch(e => setMessage(e.message));
    }} />
    <nav className="flex flex-wrap gap-3">{[["tableau", "Tableau des opérations"], ["synthese", "Synthèse par catégorie"]].map(([v, label]) => <button key={v} disabled={busy} className={`rounded border px-4 py-2 ${vue === v ? "bg-blue-900 text-white" : "bg-white"}`} onClick={() => { setVue(v); setMessage(""); }}>{label}</button>)}</nav>
    {vue === "pieces" ? <><p>Documents en attente et archives. Pour associer un paiement, revenez au tableau des opérations.</p><PiecesSansLigne /></> : vue === "synthese" ? <VueParPoste /> : <>
      <p>Choisissez une ligne, vérifiez sa catégorie et ajoutez le justificatif correspondant. Une pièce manquante reste à compléter, même pour une opération sans TVA. Exclure du rapprochement conserve le montant, la catégorie et le traitement TVA.</p>
      <p className="text-sm text-slate-600">« Sans TVA » indique une opération sans taxe ; « TVA non récupérée » conserve une taxe qui ne sera pas demandée en déduction. Ces indications préparent le contrôle comptable et ne génèrent ni écriture ni déclaration de TVA.</p>
      <div className="flex flex-wrap gap-3"><label>Mois <input type="month" className="border rounded p-2" disabled={busy} value={mois} onChange={e => { if(e.target.value) { setMois(e.target.value); setCible(null); setChoix(null); } }} /></label>
        <select className="border rounded p-2" aria-label="État" value={filtre} onChange={e => setFiltre(e.target.value)}><option value="actives">Toutes les lignes actives</option><option value="manquantes">Factures à obtenir</option><option value="sans-tva">Sans TVA</option><option value="a-ventiler">Comptes à ventiler</option><option value="exclues">Exclues du rapprochement</option></select>
        <input className="border rounded p-2" aria-label="Rechercher" placeholder="Fournisseur, montant, catégorie, compte…" value={recherche} onChange={e => setRecherche(e.target.value)} />
        <button disabled={busy} className="underline" onClick={() => { setBusy(true); void charger().catch(e => setMessage(e.message)).finally(() => setBusy(false)); }}>Actualiser</button>
        <button disabled={busy} className="underline" onClick={() => void rapprocherAuto()}>Rapprocher automatiquement les pièces</button><button disabled={busy} className="underline" onClick={() => void completerDates()}>Compléter les dates manquantes</button>
        <button disabled={busy} className="underline" onClick={() => setVue("pieces")}>Importer un dossier Drive</button></div>
      {(() => { const comp = completudeJustificatifs(lignes); const tva = bilanTvaMois(lignes); const ventilation = bilanVentilationAchats(lignes); const reste = resteAFaire(lignes); return <div className="rounded-lg border bg-white p-3 space-y-1 text-sm">
        <p className={reste.factures ? "text-amber-900" : "text-green-800"}><b>{reste.factures}</b> facture{reste.factures > 1 ? "s" : ""} à obtenir{reste.factures ? ` (${eurosCourt(reste.montantFactures)})` : ""}{reste.releves ? <> · <b>{reste.releves}</b> ligne{reste.releves > 1 ? "s" : ""} que le relevé suffit à justifier ({eurosCourt(reste.montantReleves)}), en un clic depuis la ligne</> : null}. Commissions bancaires, échéances de prêt, salaires et versements au compte FFE n’attendent aucune facture.</p>
        <p><b>{comp.justifies} / {comp.total}</b> dépenses justifiées ({comp.pourcent} %) · <b className={comp.sansPiece ? "text-amber-800" : "text-green-800"}>{eurosCourt(comp.montantSansPiece)}</b> sans justificatif sur {comp.sansPiece} ligne{comp.sansPiece > 1 ? "s" : ""}. Un débit classé dans une catégorie de charge entre dans la synthèse des charges, justifié ou non ; salaires, virements internes, emprunts et immobilisations restent hors synthèse.</p>
        <p>TVA du mois : <b>{eurosCourt(tva.deductibleJustifiee)}</b> documentée sur {tva.nbJustifiees} paiement{tva.nbJustifiees > 1 ? "s" : ""} · {tva.aVerifier.nb} ligne{tva.aVerifier.nb > 1 ? "s" : ""} à vérifier ({eurosCourt(tva.aVerifier.ttc)} TTC){tva.pieceSansTva.nb ? ` · ${tva.pieceSansTva.nb} pièce(s) sans TVA lue` : ""} · {tva.sansTva.nb} sans TVA · {tva.nonRecuperee.nb} non récupérée{tva.nonRecuperee.nb > 1 ? "s" : ""}.
          {" "}<button className="underline" onClick={() => telechargerTexte(`tva_${mois}.csv`, construireExportTva(lignes))}>CSV TVA</button> · <button className="underline" onClick={() => telechargerTexte(`justificatifs_${mois}.csv`, construireExportJustificatifs(lignes))}>CSV justificatifs</button></p>
        <p>Comptes proposés : {ventilation.total} opérations · <b>{ventilation.aVentiler} à ventiler</b> ({eurosCourt(ventilation.montantAVentiler)}). Les propositions sont à valider par la comptable. <button className="underline" onClick={() => telechargerTexte(`ventilation_achats_${mois}.csv`, construireExportVentilationAchats(lignes))}>CSV ventilation comptable</button></p>
        <p className="text-slate-600">La TVA des échéances et des factures partagées reste à vérifier, hors total automatique. La TVA totale de chaque facture reste visible dans le CSV ; elle ne se cumule pas entre paiements.</p>
      </div>; })()}
      <p role="status" className="whitespace-pre-line text-blue-900">{busy ? "Traitement… " : ""}{message}</p>
      <div className="space-y-4" aria-label="Opérations du mois">{visibles.map(l => { const attente = etatPiece(l); return <article key={l.id} className={`depense-operation min-w-0 rounded-2xl border p-4 shadow-sm sm:p-5 ${
        attente === "facture-a-obtenir" ? "border-amber-400 border-l-4 bg-amber-50/60" : "border-slate-100 bg-slate-50/70"}`}>
        <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="min-w-0 flex-1 break-words"><p>{l.fournisseur}{attente === "facture-a-obtenir"
            ? <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 align-middle text-xs font-bold text-amber-900">Facture à obtenir</span>
            : null}</p>{l.doublonProbable && <p className="text-xs text-amber-800">Doublon probable : même montant et même libellé ce mois-ci. <Link className="underline" href="/admin/comptabilite/depenses/doublons">Contrôler les doublons</Link></p>}<p className="text-xs">Compte du relevé : {l.compte || "non conservé lors de l’import"}</p><details className="text-xs"><summary>Source</summary>{l.note}<p>{l.id}</p></details><div className="mt-1 text-xs text-slate-500">{l.dateOperation || "Non renseignée"}</div></div>
          <div className="max-w-full text-right font-semibold text-blue-950">{euros(l.montant)}{l.source !== "releve-bancaire" && <p className="text-xs">Saisie manuelle</p>}{l.montant >= SEUIL_ALERTE_IMMOBILISATION_TTC && POSTES_CHARGES.has(l.poste) && !POSTES_SANS_IMMOBILISATION.has(l.poste) && <p className="text-xs text-amber-800 whitespace-normal max-w-40">Plus de 500 € HT : bien durable (cheval, matériel, clôture) ? Classez-le en « {CATEGORIE_IMMOBILISATION} ».</p>}</div>
        </header>
        <div className="grid min-w-0 grid-cols-1 gap-5 pt-4 lg:grid-cols-2">
          <section className="min-w-0 space-y-2"><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Catégorie et compte</h2><select aria-label={`Catégorie ${l.fournisseur}`} className="min-w-0 w-full max-w-full border rounded p-2" disabled={busy} value={l.poste} onChange={e => { const poste = e.target.value; if (poste === "Personnel — hors charges" && !window.confirm("Confirmer le caractère personnel ? La ligne sortira des totaux de dépenses professionnelles et restera visible dans le tableau bancaire.")) return; void agir(endpoint, { action: "categorie", id: l.id, poste }); }}>{[...new Set([l.poste, ...categories])].map(c => <option key={c} value={c}>{c === "hors-depenses" ? "Autre débit — à classer" : c}</option>)}</select>{(() => { const p = comptesProposes(l); return <div className="mt-2 min-w-0 space-y-2 text-xs">
            <p className={p.imputation.compte ? "text-slate-700" : "text-amber-800"}>{p.imputation.compte ? `Compte de la dépense proposé : ${p.imputation.compte} · ${p.imputation.libelle}` : "Compte de la dépense à ventiler"}</p>
            {p.controles.map(texte => <p key={texte} className="text-amber-800">{texte}</p>)}
            {p.banque.compte && <p>Banque du prélèvement : {p.banque.libelle} · {p.banque.compte}{p.banque.origine === "confirmee" ? " (choix confirmé)" : p.banque.origine === "reference-releve" ? " (d’après la référence du relevé)" : ""}</p>}
            {l.source === "releve-bancaire" && <label className="block">Compte de prélèvement
              <select aria-label={`Compte de prélèvement ${l.fournisseur}`} className="mt-1 min-w-0 w-full max-w-full border rounded p-2" disabled={busy} value={l.compteBanqueConfirme || ""} onChange={e => void agir(endpoint, { action: "compte-banque", id: l.id, avantCompteBanque: l.compteBanqueConfirme || null, compteBanqueConfirme: e.target.value || null })}>
                <option value="">{p.banque.compte && p.banque.origine !== "confirmee" ? `Reconnu : ${p.banque.libelle}` : "Utiliser le compte du relevé si identifiable"}</option>
                {COMPTES_BANQUE_DEPENSE.map(c => <option key={c.compte} value={c.compte}>{c.libelle} · {c.compte}</option>)}
              </select>
            </label>}
          </div>; })()}{!l.suivie && <p className="text-xs">Hors synthèse des charges. Une catégorie de charge l’y ajoute, avec ou sans justificatif.</p>}{l.immobilisation && <p className="text-xs text-blue-900">Immobilisation : hors charges, amortie par la comptable sur plusieurs années.</p>}{l.avanceFfe && <p className="text-xs text-blue-900">Avance sur le compte FFE : hors charges. Pièce = relevé du compte FFE (Choisir une pièce existante → Relevé du compte FFE). Les engagements se saisissent d’après ce relevé.</p>}</section>
          <section className="min-w-0 space-y-2 break-words"><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Justificatif</h2>{l.origineBancaire === "csv" && <p className="text-xs text-blue-900">{l.dernierReleveBancaire ? `CSV rapproché avec ${l.dernierReleveBancaire.nom}` : "CSV importé · relevé PDF à rapprocher en fin de mois"}</p>}{l.depensePersonnelle ? <p>Personnel : justificatif professionnel non demandé.{l.piece && <button className="underline block" onClick={() => void original(l.piece!)}>Voir la pièce conservée</button>}</p> : l.piece ? <><button className="underline block" onClick={() => void original(l.piece!)}>{l.piece.nom}</button><button className="underline" disabled={busy} onClick={() => void (l.piece!.paiementsAssocies?.length ? agir(endpoint, { action: "detacher", id: l.id, pieceId: l.piece!.id }) : agir(justifs, { action: "dissocier", id: l.piece!.id }))}>Dissocier ce paiement</button>{!!l.piece.paiementsAssocies?.length && <p className="text-xs">{l.piece.modeRattachement === "ffe" ? "Relevé du compte FFE joint · avance, pas une charge" : l.piece.modeRattachement === "per" ? "Attestation PER · fiscalité à vérifier" : `Échéances : ${euros(l.piece.paiementsAssocies.reduce((s, a) => s + a.montant, 0))} associés sur ${euros(l.piece.extraction?.ttc || 0)}`}</p>}</> : <>{l.justifieeVia && !l.justificatifReleve && <p className="text-green-800">{LIBELLE_JUSTIFICATION[l.justifieeVia.type as keyof typeof LIBELLE_JUSTIFICATION] || "Justifiée"} : {l.justifieeVia.detail}. <span className="text-slate-600">{l.justifieeVia.type === "masse-salariale" ? "Le bulletin ou l’appel de cotisations est la pièce ; pas de facture à attendre." : "La banque n’émet pas de facture pour cette ligne ; conservez le relevé pour la comptable."}</span></p>}{l.justificatifReleve ? <><p className="text-green-800">Relevé bancaire déclaré comme justificatif</p><button disabled={busy} className="underline" onClick={() => void agir(endpoint, { action: "justifier-releve", id: l.id, confirme: false })}>Annuler cette indication</button></> : <>{!l.justifieeVia && (l.piecePerdue ? <><p className="text-orange-800 font-medium">Pièce perdue, relevé conservé{l.piecePerdue.declareeLe ? ` (déclarée le ${l.piecePerdue.declareeLe.split("-").reverse().join("/")})` : ""} : {l.piecePerdue.motif}</p><p className="text-xs text-slate-600">Sortie des « manquants ». La comptable lit ce motif dans le colis ; aucune TVA n’est déduite sans facture. Un duplicata importé plus tard remplace cette déclaration.</p><button disabled={busy} className="underline" onClick={() => void agir(endpoint, { action: "piece-perdue", id: l.id, confirme: false })}>Annuler cette déclaration</button></> : <>{etatPiece(l) === "facture-a-obtenir" ? <p className="text-amber-800 font-medium">Facture à obtenir</p>
              : etatPiece(l) === "releve-suffit" ? <p className="text-slate-600">{posteCommissionCarte(l.fournisseur) ? "Commission ou frais bancaires : le relevé du mois en tient lieu. Rien à réclamer ; l’indication se pose d’elle-même une fois le relevé du mois rapproché." : l.poste === CATEGORIE_EMPRUNTS ? "Échéance de prêt : le relevé et le tableau d’amortissement en tiennent lieu." : "Versement au compte FFE : le relevé du compte FFE en tient lieu."}</p>
              : <p className="text-slate-500">Rien à fournir pour cette ligne.</p>}<button disabled={busy || !!l.rapprochementExclu} className="underline" onClick={() => { const motif = window.prompt(`Pièce perdue pour ${l.fournisseur} (${euros(l.montant)}) : indiquez le motif pour la comptable (ticket perdu, facture jamais reçue, fournisseur injoignable…). Le relevé bancaire reste la seule preuve ; la TVA passe en « non récupérée ».`); if (motif && motif.trim().length >= 3) void agir(endpoint, { action: "piece-perdue", id: l.id, confirme: true, motif: motif.trim() }); else if (motif !== null) setMessage("Motif trop court : trois caractères au moins."); }}>Déclarer la pièce perdue (relevé conservé)</button></>)}{(posteCommissionCarte(l.fournisseur) || l.poste === CATEGORIE_EMPRUNTS) && l.source === "releve-bancaire" && (l.origineBancaire !== "csv" || !!l.dernierReleveBancaire) && !l.justifieeVia && <button disabled={busy || !!l.rapprochementExclu} className="underline" onClick={() => { if(window.confirm(l.poste === CATEGORIE_EMPRUNTS
  ? `Je confirme que cette échéance de ${euros(l.montant)} figure sur le relevé et que je conserve le tableau d'amortissement du prêt pour la comptable, qui ventilera capital et intérêts.`
  : `Je confirme que la commission de ${euros(l.montant)} figure sur le relevé ${l.note ? "indiqué" : `du compte ${l.compte || "bancaire"} de ce mois`} et que je conserve ce relevé original pour le comptable. Ce choix ne valide aucune TVA déductible.`)) void agir(endpoint, { action: "justifier-releve", id: l.id, confirme: true }); }}>{l.poste === CATEGORIE_EMPRUNTS ? "Échéance de prêt : relevé + tableau d'amortissement" : "Utiliser le relevé comme justificatif"}</button>}{l.poste === CATEGORIE_EMPRUNTS && <p className="text-xs">Échéance de prêt : capital hors charges, intérêts en charges financières. La comptable ventile d'après le tableau d'amortissement.</p>}</>}<label className="block underline cursor-pointer">Importer une pièce<input aria-label={`Importer un justificatif pour ${l.fournisseur}`} className="block min-w-0 w-full max-w-full" type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy || !!l.rapprochementExclu || l.source !== "releve-bancaire"} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importer(l, f); }} /></label><button disabled={busy || !!l.rapprochementExclu || l.source !== "releve-bancaire"} className="underline" onClick={() => { setMessage(""); setMode("normal"); setCible(l.id); setChoix(null); setCorrection(null); }}>Choisir une pièce existante</button><button disabled={busy} className="block underline text-left" onClick={() => void diagnostiquer(l)}>Pourquoi le rapprochement automatique ne l&apos;a pas trouvée ?</button></>}</section>
        </div>
        {cible === l.id && <div className="min-w-0 border-t border-slate-100 mt-4 pt-4">{panneau}</div>}
        <details className="min-w-0 border-t border-slate-100 mt-4 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-blue-900">TVA et rapprochement · {l.statutTVA === "sans-tva" ? "Sans TVA" : l.statutTVA === "non-recuperee" ? "TVA non récupérée" : sansTvaParNature(l) ? "Sans TVA (par nature)" : "TVA à vérifier"}{l.rapprochementExclu ? " · Opération exclue" : ""}</summary>
          <div className="grid min-w-0 grid-cols-1 gap-4 pt-3 sm:grid-cols-2"><section className="min-w-0 space-y-2">{l.depensePersonnelle ? <p>Hors TVA professionnelle</p> : <><select aria-label={`TVA ${l.fournisseur}`} className="border rounded p-2" disabled={busy} value={l.statutTVA || "a-verifier"} onChange={e => void agir(endpoint, { action: "tva", id: l.id, statutTVA: e.target.value })}><option value="a-verifier">TVA à vérifier</option><option value="sans-tva">Sans TVA</option><option value="non-recuperee">TVA non récupérée</option></select>{sansTvaParNature(l) && l.statutTVA !== "sans-tva" && <p className="mt-2 max-w-60 text-xs text-slate-600">Opération sans TVA par nature (intérêts et frais bancaires exonérés, salaires et cotisations hors champ) : rien à vérifier ici.</p>}{motifControleTva(l) && <p className="mt-2 max-w-60 text-xs text-amber-800">{motifControleTva(l)}</p>}{!l.piece && l.statutTVA !== "sans-tva" && <p className="text-xs text-amber-800">TVA non justifiée : à contrôler avant toute déduction.</p>}{l.statutTVA === "sans-tva" && !!l.piece?.extraction?.tva && <p className="text-xs text-amber-800">La pièce indique de la TVA : vérifiez ce choix.</p>}</>}</section><section className="min-w-0 space-y-2"><p>{l.rapprochementExclu ? "Exclue" : l.depensePersonnelle ? "Personnel — hors charges" : l.piece ? "Associée" : l.justificatifReleve ? "Justifiée par relevé" : l.justifieeVia ? (l.justifieeVia.type === "releve-bancaire" ? "Justifiée par relevé" : "Justifiée (masse salariale)") : l.piecePerdue ? "Pièce perdue déclarée, relevé conservé" : "À compléter"}</p><button disabled={busy} className="underline" onClick={() => void agir(endpoint, { action: "exclure", id: l.id, exclue: !l.rapprochementExclu })}>{l.rapprochementExclu ? "Réactiver" : "Exclure du rapprochement"}</button></section></div>
        </details>
      </article>; })}</div>
      {!visibles.length && <p>Aucune opération affichée pour cette sélection.</p>}

      <details><summary>Autres outils</summary><div className="flex flex-wrap gap-4 p-3"><button disabled={busy} className="underline" onClick={() => setVue("pieces")}>Documents en attente et archives</button><Link className="underline" href="/admin/comptabilite/tresorerie">Comptes et relevés</Link><Link className="underline" href="/admin/comptabilite/depenses/doublons">Contrôler les doublons</Link><Link className="underline" href="/admin/comptabilite/cloture-mois">Boucler le mois</Link><Link className="underline" href="/admin/comptabilite/documents">Documents comptables</Link><Link className="underline" href="/admin/comptabilite/celeris">Historique Céleris</Link></div><ReinitialiserPieces termine={charger} verrouiller={setBusy} /><SupprimerPieces termine={charger} verrouiller={setBusy} /></details>
    </>}
  </main>;
}
