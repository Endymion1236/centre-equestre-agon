"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Landmark, Loader2, RefreshCw, FileUp, Check, Pencil, Settings2, FileText } from "lucide-react";
import ImportMouvementsBancaires from "../depenses/ImportMouvementsBancaires";
import { POSTES_DEPENSES, POSTE_HORS_DEPENSES } from "@/lib/postes-depenses";
import { remplacerPage, regrouperPages, type PageLue, type ResultatPage } from "@/lib/import-releve-pages";
import type { preparerRelevePdf } from "@/lib/releve-pdf-pages";
import {
  MOIS_SAISON,
  NOMS_MOIS_TRESORERIE as NOMS_MOIS,
  calculerTotauxTresorerieParMois,
  indexerRelevesParMoisCompte,
  moisDe,
  normaliserComptesTresorerie,
  saisonDe,
  saisonsDisponiblesTresorerie,
} from "./tresorerie-utils";

/**
 * Trésorerie — le classeur Excel du gérant, intégré.
 *
 * Un chiffre par mois et par compte bancaire : le solde en fin de mois. La
 * lecture se fait comme dans le classeur d'origine : les mois d'une SAISON
 * (septembre → août) en lignes, les saisons en colonnes — c'est la comparaison
 * d'une année sur l'autre qui intéresse, pas le calendrier civil.
 *
 * Ce n'est PAS de la comptabilité : pas de journal, pas de hash, corrigible à
 * tout moment. C'est l'outil de pilotage qui répond à « suis-je au niveau des
 * autres années à la même époque ? ».
 */

interface Releve { id: string; mois: string; compte: string; montant: number; creditsClients?: number | null; note: string; source: string; }

// Un débit lu sur le relevé PDF, avec le poste de dépense proposé.
interface OperationProposee { date: string; mois: string; libelle: string; montant: number; poste: string; garder: boolean; sourceOperation?: string; pageReleve?: number; }
interface PropositionReleve {
  banque: string; compte: string; mois: string;
  soldeFin: number | null; soldeDebut: number | null; dateSoldeFin: string;
  creditsClients: number | null;
  operations: OperationProposee[];
  lectureIncomplete?: boolean;
  /** Virements reçus de plateformes (Stripe…) lus comme débits puis écartés : des encaissements, pas des dépenses. */
  ecartees?: { date: string; libelle: string; montant: number; pageReleve?: number }[];
  fichier: string;
  compteChoisi: string; soldeEdit: string; soldeEnregistre: boolean;
  /** Identifiant local : les débits arrivent dans un second temps. */
  id: string;
  /** Lecture des débits : en cours, faite, ou échouée (le solde reste utilisable). */
  operationsEtat: "lecture" | "ok" | "echec";
  operationsErreur?: string;
  progressionPages?: string;
  pagesManquantes?: number[];
  erreurSolde?: string;
}

const eur = (v: number) =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

// ── Échéancier des emprunts — « Simulation des charges 5 ans » du bilan clos
// le 30/06/2025 (cabinet Pignolet). Annuités = capital + intérêts des 15
// emprunts EXISTANT à cette date : un nouvel emprunt s'y ajouterait. C'est le
// poids qui pèse sur le compte chaque mois — et sa décrue programmée.
const ECHEANCIER_EMPRUNTS: { exercice: string; annuite: number }[] = [
  { exercice: "2024-25", annuite: 36864 },
  { exercice: "2025-26", annuite: 29916 },
  { exercice: "2026-27", annuite: 20413 },
  { exercice: "2027-28", annuite: 14073 },
  { exercice: "2028-29", annuite: 12970 },
];
const EMPRUNTS_RESTE_APRES = 38187; // au-delà de 06/2029, jusqu'à fin 2033

export default function TresoreriePage() {
  const { isAdmin, user } = useAuth();
  const [comptes, setComptes] = useState<string[]>([]);
  // Comptes suivis mais NON comptés dans le total (épargne bloquée « coup dur »).
  const [horsTotal, setHorsTotal] = useState<string[]>([]);
  const [releves, setReleves] = useState<Releve[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [importing, setImporting] = useState(false);
  // Cellule en cours d'édition : `${saison}|${mm}|${compte}`
  const [edit, setEdit] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);
  // Réglage des comptes bancaires suivis : nom + compte-t-il dans le total ?
  const [comptesEdit, setComptesEdit] = useState<{ nom: string; compte: boolean }[] | null>(null);
  // Saisie d'un mois quand il y a PLUSIEURS comptes : un panneau, un champ par compte.
  const [cellEdit, setCellEdit] = useState<{ saison: string; mm: string } | null>(null);
  const [cellVals, setCellVals] = useState<Record<string, string>>({});
  // Comptes dont le solde du mois est REPORTÉ du mois précédent : la banque
  // n'édite pas de relevé quand un compte n'a pas bougé (le second compte en
  // août 2026), et « Boucler le mois » réclamait pourtant son solde. Le report
  // s'enregistre avec la note qui le dit et zéro encaissement client.
  const [cellReports, setCellReports] = useState<Set<string>>(new Set());
  // Relevés PDF déposés, en cours de lecture / de validation.
  const [lectureReleve, setLectureReleve] = useState(0);
  const [soldeUniquement, setSoldeUniquement] = useState(false);
  const [propositions, setPropositions] = useState<PropositionReleve[]>([]);
  const lectures = useRef(new Map<string, { pdf: Awaited<ReturnType<typeof preparerRelevePdf>>; pages: PageLue[]; mois: string }>());

  const api = useCallback(async (init?: RequestInit) => {
    const token = await user!.getIdToken();
    const res = await fetch("/api/admin/tresorerie", {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    // Quand une fonction dépasse le temps accordé par Vercel, la réponse n'est
    // pas du JSON mais une page « An error occurred… » en 504 : on le dit en
    // clair plutôt que « Unexpected token 'A' ».
    const texte = await res.text();
    let d: any = null;
    try { d = JSON.parse(texte); } catch { d = null; }
    if (!res.ok) {
      if (d?.error) throw new Error(d.error);
      if (res.status === 504) throw new Error("Le serveur a mis trop de temps à répondre (délai dépassé) — réessaie, ou avec un relevé plus court");
      throw new Error(`Réponse inattendue du serveur (HTTP ${res.status})`);
    }
    if (!d) throw new Error("Réponse illisible du serveur");
    return d;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const d = await api();
      setComptes(d.comptes || []);
      setHorsTotal(d.horsTotal || []);
      setReleves(d.releves || []);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [user, api]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  // ── Totaux par mois (tous comptes) et index par (mois, compte) ──
  const parMoisCompte = useMemo(() => indexerRelevesParMoisCompte(releves), [releves]);
  // Total par mois = les comptes qui COMPTENT. L'épargne bloquée est suivie
  // à part : la mélanger ferait croire à 30 000 € de disponible qui n'en est pas.
  const totalParMois = useMemo(
    () => calculerTotauxTresorerieParMois(releves, horsTotal),
    [releves, horsTotal],
  );
  // Les mois où SEULS des comptes « hors total » ont un relevé. Sans ça, un
  // compte principal décoché par mégarde faisait disparaître tout l'historique
  // du tableau — la base l'avait toujours, mais l'écran montrait un crayon
  // vide, et Nicolas a cru avoir tout perdu (04/09/2026). On l'affiche en gris.
  const totalHorsParMois = useMemo(() => {
    const comptesComptes = comptes.filter(c => !horsTotal.includes(c));
    return calculerTotauxTresorerieParMois(releves, comptesComptes);
  }, [releves, comptes, horsTotal]);

  const saisons = useMemo(() => saisonsDisponiblesTresorerie(releves), [releves]);
  const saisonCourante = saisons[saisons.length - 1];
  const saisonPrec = saisons[saisons.length - 2];

  const enregistrer = async (saison: string, mm: string, compte: string) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const mois = moisDe(saison, mm);
      await api({ method: "POST", body: JSON.stringify({ action: "saisir", compte, mois, montant: editVal.trim() === "" ? null : editVal }) });
      setEdit(null);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const enregistrerComptes = async () => {
    if (comptesEdit === null || saving) return;
    const { comptes: lignes, erreur } = normaliserComptesTresorerie(comptesEdit);
    if (erreur) { setError(erreur); return; }
    setSaving(true); setError("");
    try {
      await api({ method: "POST", body: JSON.stringify({
        action: "comptes",
        comptes: lignes.map(c => c.nom),
        horsTotal: lignes.filter(c => !c.compte).map(c => c.nom),
      }) });
      setComptesEdit(null);
      setInfo("Liste des comptes enregistrée.");
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  // ── Saisie multi-comptes d'un mois (panneau) ──
  const ouvrirCellule = (saison: string, mm: string) => {
    const mois = moisDe(saison, mm);
    const vals: Record<string, string> = {};
    comptes.forEach(c => {
      const r = parMoisCompte.get(`${mois}|${c}`);
      vals[c] = r ? String(r.montant) : "";
    });
    setCellVals(vals);
    setCellReports(new Set());
    setCellEdit({ saison, mm });
  };

  /** Mois précédent au format AAAA-MM. */
  const moisPrecedent = (mois: string) => {
    const [a, m] = mois.split("-").map(Number);
    const d = new Date(a, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const enregistrerCellule = async () => {
    if (!cellEdit || saving) return;
    setSaving(true); setError("");
    try {
      const mois = moisDe(cellEdit.saison, cellEdit.mm);
      for (const c of comptes) {
        const brut = (cellVals[c] ?? "").trim();
        const existant = parMoisCompte.get(`${mois}|${c}`);
        // On n'écrit que ce qui change : un champ resté vide sans relevé
        // existant n'a rien à dire, un champ vidé efface le relevé.
        if (brut === "" && !existant) continue;
        if (existant && brut === String(existant.montant)) continue;
        const report = cellReports.has(c) && brut !== "";
        await api({ method: "POST", body: JSON.stringify({
          action: "saisir", compte: c, mois, montant: brut === "" ? null : brut,
          ...(report ? {
            creditsClients: 0,
            note: `Aucun mouvement — pas de relevé édité par la banque, solde reporté de ${moisPrecedent(mois).split("-").reverse().join("/")}`,
          } : {}),
        }) });
      }
      setCellEdit(null);
      setCellReports(new Set());
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const lirePages = async (id: string, indices: number[]) => {
    const session = lectures.current.get(id);
    if (!session) return;
    const erreurs: string[] = [];
    setPropositions(prev => prev.map(p => p.id === id ? { ...p, operationsEtat: "lecture", operationsErreur: "" } : p));
    for (const index of indices) {
      setPropositions(prev => prev.map(p => p.id === id ? { ...p, progressionPages: `Lecture de la page ${index + 1} / ${session.pdf.nombrePages}` } : p));
      try {
        const resultat = await api({ method: "POST", body: JSON.stringify({ action: "extraire-page", pdfBase64: await session.pdf.page(index), moisContexte: session.mois }) }) as ResultatPage;
        session.pages = remplacerPage(session.pages, index, resultat);
      } catch (e: any) { erreurs.push(`Page ${index + 1} : ${e?.message || "lecture impossible"}`); }
    }
    const total = regrouperPages(session.pages, session.pdf.nombrePages, session.pdf.empreinte);
    setPropositions(prev => prev.map(p => p.id === id ? {
      ...p, operationsEtat: total.manquantes.length ? "echec" : "ok", lectureIncomplete: total.manquantes.length > 0,
      progressionPages: `${session.pdf.nombrePages - total.manquantes.length} / ${session.pdf.nombrePages} pages lues`,
      pagesManquantes: total.manquantes, operationsErreur: erreurs.join(" · "), creditsClients: total.creditsClients, ecartees: total.ecartees,
      soldeEnregistre: false,
      operations: total.operations.map(o => {
        const existante = p.operations.find(x => x.sourceOperation === o.sourceOperation);
        return existante || { ...o, garder: o.poste !== POSTE_HORS_DEPENSES };
      }),
    } : p));
  };

  // ── Dépôt d'un relevé : copie sans recouvrement, une page par requête ──
  const lireReleve = async (fichiers: FileList) => {
    setError("");
    for (const f of Array.from(fichiers)) {
      setLectureReleve(n => n + 1);
      try {
        const { preparerRelevePdf } = await import("@/lib/releve-pdf-pages");
        const pdf = await preparerRelevePdf(new Uint8Array(await f.arrayBuffer()));
        let p: any = { banque: "", compte: "", mois: "", soldeFin: null, soldeDebut: null, dateSoldeFin: "", creditsClients: null, fichier: f.name };
        let erreurSolde = "";
        try {
          const d = await api({ method: "POST", body: JSON.stringify({ action: "extraire-solde", pdfBase64: await pdf.resume(), filename: f.name }) });
          p = d.propositionReleve;
        } catch (e: any) {
          if (/s[ée]parer.*comptes?/i.test(String(e?.message))) throw e;
          erreurSolde = `Solde non lu : ${e?.message || "erreur"}. Renseignez le mois et le solde depuis le PDF. Les mouvements peuvent être lus indépendamment.`;
        }
        const compteChoisi = comptes.find(c => c.toLowerCase() === String(p.compte).toLowerCase()) || "";
        const id = crypto.randomUUID();
        lectures.current.set(id, { pdf, pages: [], mois: p.mois });
        setPropositions(prev => [...prev, {
          ...p,
          id, erreurSolde,
          operations: [],
          operationsEtat: soldeUniquement ? "ok" : "lecture",
          compteChoisi,
          soldeEdit: p.soldeFin != null ? String(p.soldeFin) : "",
          soldeEnregistre: false,
        }]);
        if (soldeUniquement) continue;
        await lirePages(id, Array.from({ length: pdf.nombrePages }, (_, i) => i));
      } catch (e: any) {
        setError(`${f.name} : ${e?.message || String(e)}`);
      } finally {
        setLectureReleve(n => n - 1);
      }
    }
  };

  const enregistrerSoldeReleve = async (idx: number) => {
    const p = propositions[idx];
    if (!p || saving || !p.compteChoisi || p.operationsEtat === "lecture" || p.soldeEdit.trim() === "" || !/^\d{4}-\d{2}$/.test(p.mois)) return;
    setSaving(true); setError("");
    try {
      await api({ method: "POST", body: JSON.stringify({ action: "saisir", compte: p.compteChoisi, mois: p.mois, montant: p.soldeEdit, ...(p.creditsClients != null ? { creditsClients: p.creditsClients } : {}) }) });
      setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, soldeEnregistre: true } : x));
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const completerDatesReleve = async (idx: number) => {
    const p = propositions[idx];
    const lignes = (p?.operations || []).filter(o => o.poste !== POSTE_HORS_DEPENSES);
    if (!p || saving || !p.compteChoisi || p.operationsEtat !== "ok" || !lignes.length) return;
    if (lignes.length > 200) { setError("La reprise des anciennes dates accepte au maximum 200 lignes à la fois. Utilisez le rapprochement du relevé pour les autres opérations."); return; }
    setSaving(true); setError(""); setInfo("");
    try {
      const token = await user!.getIdToken();
      const res = await fetch("/api/admin/depenses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({
        action: "completer-dates", compte: p.compteChoisi,
        factures: lignes.map(o => ({ date: o.date, mois: o.date.slice(0, 7), poste: o.poste, fournisseur: o.libelle, montant: o.montant, sourceOperation: o.sourceOperation, pageReleve: o.pageReleve, note: `Relevé ${p.fichier}` })),
      }) });
      const d = await res.json(); if (!res.ok) throw new Error(d.error || "Reprise des dates impossible");
      setInfo(`${d.completees} date(s) complétée(s), ${d.dejaDatees} déjà datée(s), ${d.ambigues} ambiguë(s), ${d.absentes} sans correspondance. Aucune dépense créée. Actualisez le rapprochement du relevé.`);
    } catch (e: any) { setError(e?.message || String(e)); } finally { setSaving(false); }
  };

  const importer = async (fichier: File) => {
    setImporting(true); setError(""); setInfo("");
    try {
      const data = JSON.parse(await fichier.text());
      const compte = String(data.compte || comptes[0] || "Compte courant");
      const d = await api({ method: "POST", body: JSON.stringify({ action: "importer", compte, releves: data.releves }) });
      setInfo(`Historique repris : ${d.importes} relevé(s) importé(s), ${d.ignores} déjà saisi(s) conservé(s).`);
      await load();
    } catch (e: any) { setError("Import impossible : " + (e?.message || String(e))); }
    finally { setImporting(false); }
  };

  // ── Graphique : la saison courante en couleur, les autres en contexte ──
  // Forme « emphase » : 8 saisons en 8 couleurs seraient illisibles ; ce qu'on
  // regarde, c'est CETTE saison contre le faisceau des précédentes.
  const graphe = useMemo(() => {
    const W = 640, H = 240, PAD = { l: 54, r: 76, t: 14, b: 22 };
    const vals = releves.map(r => totalParMois.get(r.mois) || 0);
    if (vals.length === 0) return null;
    const maxV = Math.max(...vals) * 1.05;
    // Aucun total positif (tous les comptes décochés, ou soldes à zéro) : les
    // divisions par maxV donnaient des NaN et le navigateur criait sur chaque
    // <line>. Pas de courbe plutôt qu'une courbe cassée.
    if (!Number.isFinite(maxV) || maxV <= 0) return null;
    const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / 11;
    const y = (v: number) => H - PAD.b - (v / maxV) * (H - PAD.t - PAD.b);
    const ligne = (saison: string) => {
      const pts: { i: number; v: number }[] = [];
      MOIS_SAISON.forEach((mm, i) => {
        const v = totalParMois.get(moisDe(saison, mm));
        if (v !== undefined) pts.push({ i, v });
      });
      return pts;
    };
    const graduations = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((maxV * f) / 5000) * 5000)
      .filter((v, i, a) => a.indexOf(v) === i && v <= maxV);
    return { W, H, PAD, x, y, ligne, graduations };
  }, [releves, totalParMois]);

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Landmark size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Trésorerie</h1>
            <p className="font-body text-sm text-slate-500">
              Solde bancaire en fin de mois, saison par saison — clique une case pour saisir.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/comptabilite"
            className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            ← Comptabilité
          </Link>
          <label className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg cursor-pointer"
            title="Le solde de fin de mois est lu sur le relevé et proposé ; les débits sont catégorisés en dépenses. Le PDF n'est pas conservé.">
            {lectureReleve > 0 ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {lectureReleve > 0 ? `Lecture (${lectureReleve})…` : "Déposer le relevé (PDF)"}
            <input type="file" accept=".pdf,application/pdf" multiple className="hidden" disabled={lectureReleve > 0}
              onChange={e => { if (e.target.files?.length) lireReleve(e.target.files); e.target.value = ""; }} />
          </label>
          <p className="w-full text-xs text-slate-600">Lecture des mouvements page par page. Gardez cette page ouverte ; les pages en échec peuvent être relancées. Un PDF doit concerner un seul compte.</p>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={soldeUniquement} disabled={lectureReleve > 0} onChange={e => setSoldeUniquement(e.target.checked)} />
            Solde uniquement (sans mouvements)
          </label>
          <button type="button" onClick={() => setComptesEdit(comptesEdit === null ? comptes.map(c => ({ nom: c, compte: !horsTotal.includes(c) })) : null)}
            title="Régler la liste des comptes bancaires suivis"
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50">
            <Settings2 size={14} /> Comptes
          </button>
          <label className="flex items-center gap-1.5 font-body text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-2 rounded-lg cursor-pointer">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
            Reprendre l&apos;historique (JSON)
            <input type="file" accept=".json,application/json" className="hidden" disabled={importing}
              onChange={e => { const f = e.target.files?.[0]; if (f) importer(f); e.target.value = ""; }} />
          </label>
          <button type="button" onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}
      {info && <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-body text-sm text-green-700 flex items-center gap-2"><Check size={15} />{info}</div>}

      {/* ── Relevés lus, en attente de validation ── */}
      {propositions.map((p, idx) => (
        <Card key={`${p.fichier}-${idx}`} padding="md" className="mb-4 border-blue-200">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="font-body text-sm font-semibold text-blue-900 flex items-center gap-2">
              <FileText size={15} /> {p.fichier}
              <span className="font-normal text-slate-500 text-xs">
                {p.banque}{p.compte ? ` — ${p.compte}` : ""}
                {p.soldeDebut != null ? ` · ancien solde ${eur(p.soldeDebut)}` : ""}
                {p.dateSoldeFin ? ` · arrêté au ${p.dateSoldeFin.split("-").reverse().join("/")}` : ""}
                {p.creditsClients != null ? ` · encaissements clients lus : ${eur(p.creditsClients)} (enregistrés avec le solde, pour le rapprochement)` : ""}
              </span>
            </div>
            <button type="button" disabled={p.operationsEtat === "lecture"} onClick={() => { lectures.current.delete(p.id); setPropositions(prev => prev.filter((_, i) => i !== idx)); }}
              className="font-body text-xs text-slate-500 bg-white border border-gray-200 px-2 py-1 rounded-lg cursor-pointer">✕ retirer</button>
          </div>
          {p.erreurSolde && <p className="mb-2 text-sm text-amber-800">{p.erreurSolde}</p>}
          {p.progressionPages && <p role="status" className="mb-2 text-sm text-blue-800">{p.progressionPages}</p>}
          {p.lectureIncomplete && (
            <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-body text-[11px] text-amber-800">
              ⚠ Lecture incomplète : certaines pages n’ont pas été validées. Des opérations
              peuvent manquer dans la liste ci-dessous. L’import des dépenses reste bloqué jusqu’à la lecture complète. Vérifie également le solde sur le PDF avant de l’enregistrer.
            </div>
          )}

          {!!p.ecartees?.length && (
            <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 font-body text-[11px] text-blue-900">
              ↩ {p.ecartees.length} virement{p.ecartees.length > 1 ? "s" : ""} reçu{p.ecartees.length > 1 ? "s" : ""} de plateforme d’encaissement
              (Stripe, CAWL, SumUp…) écarté{p.ecartees.length > 1 ? "s" : ""} des débits, total {p.ecartees.reduce((s, o) => s + o.montant, 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} :
              c’est de l’argent qui arrive, net des commissions, à retrouver dans les encaissements clients, pas dans les dépenses.
              {" "}{p.ecartees.slice(0, 6).map(o => `${o.date.slice(8, 10)}/${o.date.slice(5, 7)} ${o.libelle} ${o.montant.toFixed(2)} €`).join(" · ")}{p.ecartees.length > 6 ? " · …" : ""}
            </div>
          )}

          {/* Le solde de fin de mois → trésorerie */}
          <div className="flex flex-wrap items-center gap-2 font-body text-xs rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 mb-2">
            <span className="font-semibold text-blue-900">Solde de fin de mois</span>
            <select value={p.compteChoisi} disabled={saving} onChange={e => setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, compteChoisi: e.target.value, soldeEnregistre: false } : x))}
              className="border border-gray-200 rounded px-2 py-1 bg-white">
              <option value="">Choisir le compte destinataire</option>
              {(comptes.length ? comptes : ["Compte courant"]).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={p.mois} onChange={e => setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, mois: e.target.value } : x))}
              className="border border-gray-200 rounded px-2 py-1 w-20" placeholder="AAAA-MM" />
            <input value={p.soldeEdit} inputMode="decimal"
              onChange={e => setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, soldeEdit: e.target.value } : x))}
              className="border border-gray-200 rounded px-2 py-1 w-28 text-right font-semibold" />
            {p.soldeEnregistre ? (
              <span className="flex items-center gap-1 text-green-700 font-semibold"><Check size={13} /> enregistré</span>
            ) : (
              <button type="button" onClick={() => enregistrerSoldeReleve(idx)}
                disabled={saving || !p.compteChoisi || p.operationsEtat === "lecture" || p.soldeEdit.trim() === "" || !/^\d{4}-\d{2}$/.test(p.mois)}
                className="font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                Enregistrer le solde
              </button>
            )}
          </div>

          {/* Les débits catégorisés → dépenses par poste */}
          {p.operationsEtat === "lecture" && (
            <div className="flex items-center gap-2 font-body text-[11px] text-slate-500 px-1 py-1">
              <Loader2 size={12} className="animate-spin" /> Lecture des débits page par page… attendez la fin avant d’enregistrer.
            </div>
          )}
          {p.operationsEtat === "echec" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-body text-[11px] text-amber-800">
              ⚠ Certaines pages n&apos;ont pas pu être lues : {p.operationsErreur || "erreur"}. Les pages déjà lues sont conservées.
              <button type="button" disabled={lectureReleve > 0 || saving} className="block underline mt-2" onClick={async () => {
                const session = lectures.current.get(p.id);
                if (!session) return;
                session.mois = p.mois;
                setLectureReleve(n => n + 1);
                try { await lirePages(p.id, p.pagesManquantes || []); } finally { setLectureReleve(n => n - 1); }
              }}>Relancer les pages manquantes{p.pagesManquantes?.length ? ` (${p.pagesManquantes.map(i => i + 1).join(", ")})` : ""}</button>
            </div>
          )}
          {p.operationsEtat === "ok" && p.operations.length === 0 && (
            <div className="font-body text-[11px] text-slate-500 px-1 py-1">Aucun débit lu sur ce relevé.</div>
          )}
          {p.operations.length > 0 && p.operationsEtat === "ok" && <div className="space-y-3">
            <details className="rounded-lg border bg-white p-3">
              <summary className="cursor-pointer font-semibold text-sm">Vérifier ou corriger les débits lus ({p.operations.length})</summary>
              <p className="text-xs text-slate-600 my-2">Contrôlez la lecture avant de rapprocher. Pour une opération déjà saisie, choisissez sa correspondance dans l’aperçu ci-dessous.</p>
              <div className="space-y-2">{p.operations.map((o, oi) => {
                const corriger = (patch: Partial<OperationProposee>) => setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, operations: x.operations.map((y, yi) => yi === oi ? { ...y, ...patch } : y) } : x));
                return <div key={o.sourceOperation || oi} className="grid min-w-0 gap-2 rounded border p-2 sm:grid-cols-2">
                  <label className="text-xs">Date<input type="date" className="block min-w-0 w-full rounded border p-2" value={o.date} onChange={e => corriger({ date: e.target.value, mois: e.target.value.slice(0, 7) })} /></label>
                  <label className="text-xs">Montant débité (€)<input type="number" min="0.01" step="0.01" className="block min-w-0 w-full rounded border p-2" value={o.montant} onChange={e => corriger({ montant: Number(e.target.value) })} /></label>
                  <label className="text-xs">Libellé<input className="block min-w-0 w-full rounded border p-2" value={o.libelle} maxLength={500} onChange={e => corriger({ libelle: e.target.value })} /></label>
                  <label className="text-xs">Catégorie<select className="block min-w-0 w-full rounded border p-2" value={o.poste} onChange={e => corriger({ poste: e.target.value })}>
                    {POSTES_DEPENSES.map(ps => <option key={ps.nom} value={ps.nom}>{ps.nom}</option>)}<option value={POSTE_HORS_DEPENSES}>À classer / hors dépenses</option>
                  </select></label>
                </div>;
              })}</div>
              <button type="button" onClick={() => void completerDatesReleve(idx)} disabled={saving || !p.compteChoisi} className="underline mt-3 text-sm">Compléter les anciennes dates sans créer de dépenses</button>
            </details>
            <ImportMouvementsBancaires pdf={{ empreinte: lectures.current.get(p.id)?.pdf.empreinte || "", nom: p.fichier, compte: p.compteChoisi, mois: p.mois,
              operations: p.operations.map(o => ({ ref: o.sourceOperation || "", date: o.date, libelle: o.libelle, centimes: Math.round(o.montant * 100), poste: o.poste }))
            }} onImported={() => setInfo("Rapprochement enregistré. Les dépenses et leurs justificatifs restent accessibles dans Dépenses et justificatifs.")} />
          </div>}

        </Card>
      ))}

      {comptesEdit !== null && (
        <Card padding="md" className="mb-4">
          <div className="font-body text-sm font-semibold text-slate-800 mb-1">Comptes bancaires suivis</div>
          <p className="font-body text-xs text-slate-500 mb-2">
            Décoche « compté » pour un compte d&apos;épargne bloquée (coup dur) : il reste suivi,
            mais n&apos;entre ni dans le total du tableau ni dans la courbe — ce n&apos;est pas du disponible.
            Renommer un compte ne déplace pas ses relevés déjà saisis — garde le même nom si possible.
          </p>
          <div className="flex flex-col gap-1.5 max-w-lg">
            {comptesEdit.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={c.nom} onChange={e => setComptesEdit(prev => prev!.map((x, xi) => xi === i ? { ...x, nom: e.target.value } : x))}
                  placeholder="Nom du compte (ex. Compte courant CA)"
                  className="flex-1 font-body text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
                <label className="flex items-center gap-1.5 font-body text-xs text-slate-600 whitespace-nowrap">
                  <input type="checkbox" checked={c.compte}
                    onChange={e => setComptesEdit(prev => prev!.map((x, xi) => xi === i ? { ...x, compte: e.target.checked } : x))}
                    className="accent-blue-500 w-4 h-4" />
                  compté dans le total
                </label>
                <button type="button" onClick={() => setComptesEdit(prev => prev!.filter((_, xi) => xi !== i))}
                  title="Retirer de la liste (les relevés déjà saisis restent en base)"
                  className="text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer px-1">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setComptesEdit(prev => [...(prev || []), { nom: "", compte: true }])}
              className="font-body text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-blue-100">
              + Ajouter un compte
            </button>
            <button type="button" onClick={enregistrerComptes} disabled={saving}
              className="font-body text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
              Enregistrer
            </button>
            <button type="button" onClick={() => setComptesEdit(null)}
              className="font-body text-xs text-slate-500 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer">Annuler</button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          {/* ── Graphique de saisons ── */}
          {graphe && saisons.length > 0 && (
            <Card padding="md" className="mb-4">
              <div className="flex items-center gap-4 mb-2 font-body text-xs">
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 rounded bg-blue-600" style={{ height: 3 }} /> <strong className="text-slate-700">{saisonCourante}</strong></span>
                {saisonPrec && <span className="flex items-center gap-1.5 text-slate-500"><span className="inline-block w-4 rounded bg-slate-500" style={{ height: 2 }} /> {saisonPrec}</span>}
                <span className="flex items-center gap-1.5 text-slate-400"><span className="inline-block w-4 rounded bg-slate-300" style={{ height: 2 }} /> saisons précédentes</span>
              </div>
              <svg viewBox={`0 0 ${graphe.W} ${graphe.H}`} className="w-full" role="img" aria-label="Trésorerie de fin de mois par saison">
                {graphe.graduations.map(v => (
                  <g key={v}>
                    <line x1={graphe.PAD.l} x2={graphe.W - graphe.PAD.r} y1={graphe.y(v)} y2={graphe.y(v)} stroke="#e2e8f0" strokeWidth="1" />
                    <text x={graphe.PAD.l - 6} y={graphe.y(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="sans-serif">{(v / 1000).toFixed(0)} k</text>
                  </g>
                ))}
                {MOIS_SAISON.map((mm, i) => (
                  <text key={mm} x={graphe.x(i)} y={graphe.H - 6} textAnchor="middle" fontSize="8.5" fill="#94a3b8" fontFamily="sans-serif">
                    {NOMS_MOIS[mm].slice(0, 3)}
                  </text>
                ))}
                {saisons.map(s => {
                  const pts = graphe.ligne(s);
                  if (pts.length < 2) return null;
                  const estCourante = s === saisonCourante;
                  const estPrec = s === saisonPrec;
                  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${graphe.x(p.i).toFixed(1)},${graphe.y(p.v).toFixed(1)}`).join(" ");
                  const fin = pts[pts.length - 1];
                  return (
                    <g key={s}>
                      <path d={d} fill="none"
                        stroke={estCourante ? "#2563eb" : estPrec ? "#64748b" : "#cbd5e1"}
                        strokeWidth={estCourante ? 2.5 : estPrec ? 1.8 : 1.2} strokeLinejoin="round" strokeLinecap="round" />
                      {(estCourante || estPrec) && (
                        <>
                          {pts.map(p => (
                            <circle key={p.i} cx={graphe.x(p.i)} cy={graphe.y(p.v)} r={estCourante ? 3 : 2.2}
                              fill={estCourante ? "#2563eb" : "#64748b"}>
                              <title>{`${NOMS_MOIS[MOIS_SAISON[p.i]]} ${s} : ${eur(p.v)}`}</title>
                            </circle>
                          ))}
                          <text x={graphe.x(fin.i) + 7} y={graphe.y(fin.v) + 3} fontSize="9.5" fontWeight="700"
                            fill={estCourante ? "#1e40af" : "#64748b"} fontFamily="sans-serif">{s}</text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </Card>
          )}

          {/* ── Saisie d'un mois, un champ par compte ── */}
          {cellEdit && (
            <Card padding="md" className="mb-4 border-blue-200">
              <div className="font-body text-sm font-semibold text-blue-900 mb-2">
                Soldes de fin {NOMS_MOIS[cellEdit.mm].toLowerCase()} {moisDe(cellEdit.saison, cellEdit.mm).slice(0, 4)}
              </div>
              <div className="flex flex-col gap-1.5 max-w-md">
                {comptes.map(c => {
                  const mois = moisDe(cellEdit.saison, cellEdit.mm);
                  const precedent = parMoisCompte.get(`${moisPrecedent(mois)}|${c}`);
                  const sansReleve = !parMoisCompte.get(`${mois}|${c}`);
                  const reporte = cellReports.has(c);
                  return (
                    <div key={c} className="flex flex-col gap-0.5">
                      <label className="flex items-center justify-between gap-2 font-body text-xs text-slate-600">
                        <span>{c}{horsTotal.includes(c) && <span className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">hors total</span>}</span>
                        <input value={cellVals[c] ?? ""} inputMode="decimal"
                          onChange={e => { setCellVals(prev => ({ ...prev, [c]: e.target.value })); setCellReports(prev => { const n = new Set(prev); n.delete(c); return n; }); }}
                          onKeyDown={e => { if (e.key === "Enter") enregistrerCellule(); if (e.key === "Escape") setCellEdit(null); }}
                          className={`w-32 font-body text-sm text-right border rounded-lg px-2 py-1.5 ${reporte ? "border-amber-300 bg-amber-50" : "border-gray-200"}`} />
                      </label>
                      {/* Pas de relevé ce mois-ci mais un solde le mois d'avant :
                          proposer le report (compte sans mouvement). */}
                      {sansReleve && precedent && !reporte && (
                        <button type="button"
                          onClick={() => {
                            setCellVals(prev => ({ ...prev, [c]: String(precedent.montant) }));
                            setCellReports(prev => new Set(prev).add(c));
                          }}
                          className="self-end font-body text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg cursor-pointer hover:bg-amber-100">
                          Aucun mouvement : reporter {eur(precedent.montant)} de {NOMS_MOIS[moisPrecedent(mois).slice(5)].toLowerCase()}
                        </button>
                      )}
                      {reporte && (
                        <span className="self-end font-body text-[11px] text-amber-700">
                          Solde reporté du mois précédent — sera noté « aucun mouvement, pas de relevé ».
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-2 items-center">
                <button type="button" onClick={enregistrerCellule} disabled={saving}
                  className="font-body text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
                  {saving ? "…" : "Enregistrer"}
                </button>
                <button type="button" onClick={() => setCellEdit(null)}
                  className="font-body text-xs text-slate-500 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer">Annuler</button>
                <span className="font-body text-[11px] text-slate-400">Un champ vidé efface le relevé du compte.</span>
              </div>
            </Card>
          )}

          {/* ── Matrice mois × saisons, comme le classeur ── */}
          <Card padding="sm" className="overflow-x-auto !p-0">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Mois</th>
                  {saisons.map(s => (
                    <th key={s} className={`px-3 py-2.5 text-right font-semibold text-[11px] tracking-wider ${s === saisonCourante ? "text-blue-700" : "text-slate-600"}`}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOIS_SAISON.map(mm => (
                  <tr key={mm} className="border-b border-gray-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-700 font-medium">{NOMS_MOIS[mm]}</td>
                    {saisons.map(s => {
                      const mois = moisDe(s, mm);
                      const total = totalParMois.get(mois);
                      const compteEdit = comptes[0] || "Compte courant";
                      const k = `${s}|${mm}|${compteEdit}`;
                      const releve = parMoisCompte.get(`${mois}|${compteEdit}`);
                      if (comptes.length <= 1 && edit === k) {
                        return (
                          <td key={s} className="px-2 py-1 text-right">
                            <input autoFocus value={editVal} inputMode="decimal"
                              onChange={e => setEditVal(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") enregistrer(s, mm, compteEdit); if (e.key === "Escape") setEdit(null); }}
                              onBlur={() => enregistrer(s, mm, compteEdit)}
                              className="w-24 font-body text-sm text-right border border-blue-400 rounded-lg px-2 py-1 focus:outline-none bg-white" />
                          </td>
                        );
                      }
                      // Info-bulle : le détail compte par compte, épargne bloquée signalée.
                      const detail = comptes.map(c => {
                        const r = parMoisCompte.get(`${mois}|${c}`);
                        return `${c} : ${r ? eur(r.montant) : "—"}${horsTotal.includes(c) ? " (hors total)" : ""}`;
                      }).join("\n");
                      const estCellEdit = cellEdit && cellEdit.saison === s && cellEdit.mm === mm;
                      return (
                        <td key={s}
                          onClick={() => comptes.length > 1 ? ouvrirCellule(s, mm) : (setEdit(k), setEditVal(releve ? String(releve.montant) : ""))}
                          title={comptes.length > 1 ? `${detail}\nCliquer pour saisir les soldes du mois` : "Cliquer pour saisir"}
                          className={`px-3 py-2 text-right cursor-pointer ${estCellEdit ? "bg-blue-100/70 rounded" : ""} ${s === saisonCourante ? "font-semibold text-blue-800" : "text-slate-600"}`}>
                          {total !== undefined
                            ? eur(total)
                            : totalHorsParMois.get(mois) !== undefined
                              ? <span className="text-slate-400 italic font-normal" title="Relevé présent, mais sur un compte non compté dans le total">{eur(totalHorsParMois.get(mois)!)}<span className="text-[9px] ml-1 not-italic">hors total</span></span>
                              : <Pencil size={11} className="inline text-slate-300" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {horsTotal.length > 0 && [...totalHorsParMois.keys()].filter(m => totalParMois.get(m) === undefined).length > 3 && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-body text-xs text-red-800">
              <strong>Historique masqué :</strong> {[...totalHorsParMois.keys()].filter(m => totalParMois.get(m) === undefined).length} mois n&apos;ont de relevé
              que sur un compte <em>non compté dans le total</em>. Si c&apos;est ton compte principal, ouvre les réglages des comptes
              et recoche « compté dans le total » : rien n&apos;est perdu, les relevés sont toujours en base.
            </div>
          )}
          {horsTotal.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 font-body text-xs text-amber-800">
              <strong>Non compté dans le total</strong> (épargne bloquée, réserve coup dur) :{" "}
              {horsTotal.map((c, i) => {
                const dernier = releves.filter(r => r.compte === c).sort((a, b) => b.mois.localeCompare(a.mois))[0];
                return (
                  <span key={c}>
                    {i > 0 ? " · " : ""}{c} — {dernier ? `${eur(dernier.montant)} (${dernier.mois.split("-").reverse().join("/")})` : "aucun relevé saisi"}
                  </span>
                );
              })}
            </div>
          )}
          {/* Ce que le serveur a renvoyé, compte par compte : quand une case reste
              vide alors que la colonne de la saison existe, c'est ici qu'on voit
              sous quel nom de compte les relevés sont rangés (un compte renommé
              garde ses relevés sous l'ancien nom) et s'ils comptent dans le total. */}
          {releves.length > 0 && (() => {
            const parCompte = new Map<string, { n: number; min: string; max: string }>();
            for (const r of releves) {
              const c = parCompte.get(r.compte) || { n: 0, min: r.mois, max: r.mois };
              c.n++; if (r.mois < c.min) c.min = r.mois; if (r.mois > c.max) c.max = r.mois;
              parCompte.set(r.compte, c);
            }
            const fr = (m: string) => m.split("-").reverse().join("/");
            return (
              <p className="font-body text-[11px] text-slate-500 mt-3">
                <strong>Relevés reçus : {releves.length}</strong>
                {[...parCompte.entries()].map(([c, v]) => (
                  <span key={c}> · {c} : {v.n} ({fr(v.min)} → {fr(v.max)})
                    {!comptes.includes(c) ? <span className="text-red-600"> — nom absent de la liste des comptes</span> : horsTotal.includes(c) ? <span className="text-amber-600"> — hors total</span> : ""}
                  </span>
                ))}
              </p>
            );
          })()}
          <p className="font-body text-[11px] text-slate-400 mt-3">
            Un relevé de trésorerie n&apos;est pas une écriture comptable : il se corrige librement,
            comme dans le classeur. Un import d&apos;historique ne remplace jamais une valeur saisie à la main.
          </p>

          {/* ── Le poids des emprunts sur le compte — et sa décrue programmée ── */}
          <Card padding="md" className="mt-4">
            <div className="font-body text-sm font-semibold text-slate-800 mb-1">
              Annuités d&apos;emprunts — échéancier du bilan 2024-25
            </div>
            <p className="font-body text-xs text-slate-500 mb-3">
              Capital + intérêts des 15 emprunts en cours au 30/06/2025 (simulation du cabinet).
              C&apos;est ce qui sort du compte chaque année en remboursements — et la décrue est déjà
              écrite : <strong>l&apos;étau se desserre nettement à partir de l&apos;exercice 2026-27</strong>,
              sauf nouvel emprunt d&apos;ici là.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ECHEANCIER_EMPRUNTS.map((e, i) => {
                const estCourant = e.exercice === "2025-26";
                const premier = ECHEANCIER_EMPRUNTS[0].annuite;
                return (
                  <div key={e.exercice}
                    className={`rounded-lg border px-3 py-2 ${estCourant ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-slate-50/60"}`}>
                    <div className={`font-body text-[11px] font-semibold ${estCourant ? "text-blue-700" : "text-slate-500"}`}>
                      {e.exercice}{estCourant ? " (en cours)" : i === 0 ? " (clos)" : ""}
                    </div>
                    <div className={`font-display text-lg font-bold ${estCourant ? "text-blue-800" : "text-slate-700"}`}>{eur(e.annuite)}</div>
                    <div className="font-body text-[11px] text-slate-400">
                      ≈ {eur(Math.round(e.annuite / 12))}/mois{i > 0 ? ` · −${Math.round((1 - e.annuite / premier) * 100)} % vs 24-25` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="font-body text-[11px] text-slate-400 mt-2">
              Au-delà de juin 2029, il ne reste que {eur(EMPRUNTS_RESTE_APRES)} à étaler jusqu&apos;à fin 2033
              (les deux emprunts de décembre 2023). Chiffres à rafraîchir au prochain bilan.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
