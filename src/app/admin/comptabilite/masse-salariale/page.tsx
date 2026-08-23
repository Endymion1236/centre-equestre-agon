"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Users, Loader2, RefreshCw, FileUp, Check, Pencil, Trash2, Plus } from "lucide-react";

/**
 * Masse salariale — le pendant « paie » de l'écran Trésorerie.
 *
 * Une ligne par salarié et par mois (brut, net, coût employeur, heures),
 * alimentée en déposant les fiches de paie : le PDF est lu, les chiffres
 * extraits sont PROPOSÉS, l'admin valide — et le fichier n'est jamais
 * conservé. La lecture se fait par saison (septembre → août), comme la
 * trésorerie : la question est « où en est ma masse salariale par rapport aux
 * autres années ? ».
 */

interface Ligne { id: string; type: "salaire" | "charge"; mois: string; salarie: string; libelle: string; brut: number; net: number | null; coutEmployeur: number | null; heures: number | null; montant: number | null; decaissement: number | null; source: string; }
interface PropositionCharge { mois: string; libelle: string; montant: number | null; decaissement: number | null; partPatronale: number | null; reductionPatronale: number; partOuvriere: number | null; totalAPayer: number | null; fichier: string; }
interface Proposition { salarie: string; mois: string; brut: number | null; net: number | null; coutEmployeur: number | null; heures: number | null; fichier: string; etat?: "ok" | "erreur"; message?: string; }

// L'EXERCICE COMPTABLE du centre court du 1er juillet au 30 juin — c'est lui
// qui structure la lecture, pas la saison scolaire : la masse salariale se
// compare au bilan. (La trésorerie, elle, reste en septembre → août, comme le
// classeur historique du gérant.)
const MOIS_SAISON = ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06"] as const;
const NOMS_MOIS: Record<string, string> = {
  "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
  "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
};
// ── Référence : exercice 2024-25, le dernier validé par le cabinet ──
// Le journal de paie mensuel du bilan donne le PROFIL saisonnier, et les
// 109 330 € de charges de personnel du compte de résultat donnent le NIVEAU
// (le journal seul omet la rémunération du gérant et une partie des
// cotisations) : chaque mois du journal est donc mis à l'échelle pour que
// l'année retombe exactement sur le total du bilan.
const REF_JOURNAL_PAIE: Record<string, number> = {
  "07": 6363.70, "08": 5795.39, "09": 5015.90, "10": 5267.13, "11": 5150.41, "12": 2746.30,
  "01": 2375.88, "02": 4239.69, "03": 2641.46, "04": 3160.75, "05": 4381.50, "06": 5358.43,
};
const REF_CHARGES_PERSONNEL_AN = 109330.29;
const REF_JOURNAL_TOTAL = Object.values(REF_JOURNAL_PAIE).reduce((s, v) => s + v, 0);
const refBilanMois = (mm: string) => (REF_JOURNAL_PAIE[mm] / REF_JOURNAL_TOTAL) * REF_CHARGES_PERSONNEL_AN;

function saisonDe(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}
function moisDe(saison: string, mm: string): string {
  const [a1, a2] = saison.split("-");
  return `${Number(mm) >= 7 ? a1 : a2}-${mm}`;
}
const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
// Les heures s'additionnent en flottants (152.92 + …) : sans arrondi, le total
// affiche des queues du genre « 891.5099999999999 h ».
const hrs = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " h";
const moisCourant = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function MasseSalarialePage() {
  const { isAdmin, user } = useAuth();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moisDetail, setMoisDetail] = useState(moisCourant());
  // Lecture en brut, ou en coût total entreprise (brut + charges patronales).
  // Quand une ligne n'a pas de coût employeur sur son bulletin, on retombe sur
  // son brut et on le SIGNALE : un total silencieusement incomplet serait pire.
  const [mode, setMode] = useState<"brut" | "cout">("brut");
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [propositionsCharge, setPropositionsCharge] = useState<PropositionCharge[]>([]);
  const [formCharge, setFormCharge] = useState<{ libelle: string; montant: string; decaissement: string } | null>(null);
  const [lecture, setLecture] = useState(0); // nb de PDF en cours de lecture
  const [saving, setSaving] = useState(false);
  // Saisie / correction manuelle d'une ligne
  const [form, setForm] = useState<{ salarie: string; brut: string; net: string; coutEmployeur: string; heures: string } | null>(null);

  const api = useCallback(async (body?: any) => {
    const token = await user!.getIdToken();
    const res = await fetch("/api/admin/masse-salariale", {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error || "Erreur");
    return d;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try { setLignes((await api()).lignes || []); }
    catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [user, api]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const salaires = useMemo(() => lignes.filter(l => l.type !== "charge"), [lignes]);
  const charges = useMemo(() => lignes.filter(l => l.type === "charge"), [lignes]);

  // En mode coût : salaires (coût employeur, sinon brut) + charges versées à
  // part (MSA/TESA des saisonniers). En mode brut : les salaires seuls — une
  // charge patronale n'est pas du brut.
  const valeurDe = useCallback(
    (l: Ligne) => (mode === "cout" ? (l.coutEmployeur ?? l.brut) : l.brut),
    [mode],
  );
  const totalParMois = useMemo(() => {
    const m = new Map<string, number>();
    salaires.forEach(l => m.set(l.mois, (m.get(l.mois) || 0) + valeurDe(l)));
    if (mode === "cout") charges.forEach(c => m.set(c.mois, (m.get(c.mois) || 0) + (c.montant || 0)));
    return m;
  }, [salaires, charges, valeurDe, mode]);
  // Mois dont le coût est partiellement estimé (lignes sans coût employeur).
  const moisPartiels = useMemo(() => {
    const m = new Set<string>();
    if (mode === "cout") salaires.forEach(l => { if (l.coutEmployeur == null) m.add(l.mois); });
    return m;
  }, [salaires, mode]);
  const saisons = useMemo(() => {
    const s = new Set(lignes.map(l => saisonDe(l.mois)));
    s.add(saisonDe(moisCourant()));
    return [...s].sort();
  }, [lignes]);
  const saisonCourante = saisons[saisons.length - 1];
  const saisonPrec = saisons[saisons.length - 2];
  const lignesDuMois = useMemo(
    () => salaires.filter(l => l.mois === moisDetail).sort((a, b) => a.salarie.localeCompare(b.salarie, "fr")),
    [salaires, moisDetail],
  );
  const chargesDuMois = useMemo(
    () => charges.filter(c => c.mois === moisDetail).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")),
    [charges, moisDetail],
  );

  // ── Dépôt de fiches de paie ──
  const lireFiches = async (fichiers: FileList) => {
    setError("");
    for (const f of Array.from(fichiers)) {
      setLecture(n => n + 1);
      try {
        const b64 = btoa(new Uint8Array(await f.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), ""));
        const d = await api({ action: "extraire", pdfBase64: b64, filename: f.name });
        if (d.propositionCharge) setPropositionsCharge(prev => [...prev, d.propositionCharge]);
        else setPropositions(prev => [...prev, { ...d.proposition, etat: "ok" }]);
      } catch (e: any) {
        setPropositions(prev => [...prev, { salarie: "", mois: "", brut: null, net: null, coutEmployeur: null, heures: null, fichier: f.name, etat: "erreur", message: e?.message || String(e) }]);
      } finally {
        setLecture(n => n - 1);
      }
    }
  };

  const enregistrerProposition = async (p: Proposition, idx: number) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await api({ action: "enregistrer", mois: p.mois, salarie: p.salarie, brut: p.brut, net: p.net, coutEmployeur: p.coutEmployeur, heures: p.heures, source: "fiche-paie" });
      setPropositions(prev => prev.filter((_, i) => i !== idx));
      if (p.mois) setMoisDetail(p.mois);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const enregistrerPropositionCharge = async (p: PropositionCharge, idx: number) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await api({ action: "enregistrer-charge", mois: p.mois, libelle: p.libelle, montant: p.montant, decaissement: p.decaissement, source: "fiche-paie" });
      setPropositionsCharge(prev => prev.filter((_, i) => i !== idx));
      if (p.mois) setMoisDetail(p.mois);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const enregistrerFormCharge = async () => {
    if (!formCharge || saving) return;
    setSaving(true); setError("");
    try {
      await api({ action: "enregistrer-charge", mois: moisDetail, libelle: formCharge.libelle, montant: formCharge.montant || null, decaissement: formCharge.decaissement || null });
      setFormCharge(null);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const supprimerCharge = async (c: Ligne) => {
    if (!confirm(`Retirer « ${c.libelle} » de ${NOMS_MOIS[c.mois.slice(5)]} ?`)) return;
    try { await api({ action: "supprimer-charge", mois: c.mois, libelle: c.libelle }); await load(); }
    catch (e: any) { setError(e?.message || String(e)); }
  };

  const enregistrerForm = async () => {
    if (!form || saving) return;
    setSaving(true); setError("");
    try {
      await api({ action: "enregistrer", mois: moisDetail, ...form });
      setForm(null);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const supprimer = async (l: Ligne) => {
    if (!confirm(`Retirer la ligne de ${l.salarie} pour ${NOMS_MOIS[l.mois.slice(5)]} ?`)) return;
    try { await api({ action: "supprimer", mois: l.mois, salarie: l.salarie }); await load(); }
    catch (e: any) { setError(e?.message || String(e)); }
  };

  // ── Graphique — emphase : saison courante en couleur, le reste en contexte ──
  const graphe = useMemo(() => {
    const vals = [...totalParMois.values(), ...MOIS_SAISON.map(refBilanMois)];
    if (vals.length === 0) return null;
    const W = 640, H = 220, PAD = { l: 54, r: 76, t: 14, b: 22 };
    const maxV = Math.max(...vals) * 1.08;
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
    const grads = [0.25, 0.5, 0.75, 1].map(f => Math.round((maxV * f) / 2000) * 2000)
      .filter((v, i, a) => a.indexOf(v) === i && v > 0 && v <= maxV);
    return { W, H, PAD, x, y, ligne, grads };
  }, [totalParMois]);

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <Users size={20} className="text-purple-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Masse salariale</h1>
            <p className="font-body text-sm text-slate-500">
              Brut et coût entreprise par salarié, exercice par exercice (juillet → juin, comme le bilan) —
              dépose les fiches de paie, valide, c&apos;est tout.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/comptabilite"
            className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            ← Comptabilité
          </Link>
          <Link href="/admin/management/registre-personnel"
            className="font-body text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg no-underline hover:bg-purple-100">
            📋 Registre du personnel
          </Link>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}

      {/* ── Dépôt des fiches de paie ── */}
      <Card padding="md" className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-body text-sm font-semibold text-slate-800 flex items-center gap-2">
              <FileUp size={15} className="text-purple-600" /> Déposer des fiches de paie (PDF)
            </div>
            <p className="font-body text-xs text-slate-500 mt-0.5">
              Chaque bulletin est lu, ses chiffres te sont proposés, tu valides.
              <strong> Le fichier n&apos;est pas conservé</strong> — seuls le brut, le net, le coût et les heures entrent au tableau.
            </p>
          </div>
          <label className="flex items-center gap-1.5 font-body text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg cursor-pointer">
            {lecture > 0 ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
            {lecture > 0 ? `Lecture (${lecture})…` : "Choisir les PDF"}
            <input type="file" accept=".pdf,application/pdf" multiple className="hidden"
              onChange={e => { if (e.target.files?.length) lireFiches(e.target.files); e.target.value = ""; }} />
          </label>
        </div>

        {propositionsCharge.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {propositionsCharge.map((p, idx) => (
              <div key={idx} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <div className="font-body text-[11px] text-amber-900 mb-1.5">
                  <strong>{p.fichier}</strong> — récapitulatif de cotisations reconnu.
                  {p.partPatronale != null ? ` Part patronale ${eur(p.partPatronale)}` : " Le document ne sépare pas part patronale et part ouvrière"}
                  {p.reductionPatronale > 0 ? ` − réductions ${eur(p.reductionPatronale)}` : ""}
                  {p.partOuvriere != null ? ` · part ouvrière ${eur(p.partOuvriere)} (déjà dans les bruts, non comptée)` : ""}
                  {p.totalAPayer != null ? ` · à payer ${eur(p.totalAPayer)}` : ""}
                </div>
                <div className="flex flex-wrap items-center gap-2 font-body text-xs">
                  <input value={p.libelle} onChange={e => setPropositionsCharge(prev => prev.map((x, i) => i === idx ? { ...x, libelle: e.target.value } : x))}
                    className="font-semibold border border-gray-200 rounded px-2 py-1 w-56" placeholder="Libellé" />
                  <input value={p.mois} onChange={e => setPropositionsCharge(prev => prev.map((x, i) => i === idx ? { ...x, mois: e.target.value } : x))}
                    className="border border-gray-200 rounded px-2 py-1 w-20" placeholder="AAAA-MM" />
                  <label className="flex items-center gap-1 text-slate-600" title="Part patronale nette des réductions — ce que la charge coûte vraiment à l'entreprise">Coût employeur
                    <input value={p.montant ?? ""} inputMode="decimal"
                      onChange={e => setPropositionsCharge(prev => prev.map((x, i) => i === idx ? { ...x, montant: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) || 0 } : x))}
                      className="border border-gray-200 rounded px-2 py-1 w-24 text-right font-semibold" />
                  </label>
                  <label className="flex items-center gap-1 text-slate-600" title="Le virement réellement fait à l'organisme (« à payer » du document) — c'est lui qui sort du compte">Payé à l&apos;organisme
                    <input value={p.decaissement ?? ""} inputMode="decimal"
                      onChange={e => setPropositionsCharge(prev => prev.map((x, i) => i === idx ? { ...x, decaissement: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) || 0 } : x))}
                      className="border border-gray-200 rounded px-2 py-1 w-24 text-right font-semibold" />
                  </label>
                  <button onClick={() => enregistrerPropositionCharge(p, idx)}
                    disabled={saving || !p.libelle || !/^\d{4}-\d{2}$/.test(p.mois) || (p.montant == null && p.decaissement == null)}
                    className="ml-auto font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    Enregistrer la charge
                  </button>
                  <button onClick={() => setPropositionsCharge(prev => prev.filter((_, i) => i !== idx))}
                    className="text-slate-500 bg-white border border-gray-200 px-2 py-1.5 rounded-lg cursor-pointer">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {propositions.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {propositions.map((p, idx) => p.etat === "erreur" ? (
              <div key={idx} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-body text-xs text-red-700 flex items-center justify-between gap-2">
                <span><strong>{p.fichier}</strong> : {p.message}</span>
                <button onClick={() => setPropositions(prev => prev.filter((_, i) => i !== idx))}
                  className="text-red-500 bg-transparent border-none cursor-pointer font-semibold">retirer</button>
              </div>
            ) : (
              <div key={idx} className="rounded-lg border border-purple-200 bg-purple-50/50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 font-body text-xs">
                  <span className="text-slate-400">{p.fichier}</span>
                  <input value={p.salarie} onChange={e => setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, salarie: e.target.value } : x))}
                    className="font-semibold border border-gray-200 rounded px-2 py-1 w-40" placeholder="Salarié" />
                  <input value={p.mois} onChange={e => setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, mois: e.target.value } : x))}
                    className="border border-gray-200 rounded px-2 py-1 w-20" placeholder="AAAA-MM" />
                  {([["brut", "Brut"], ["net", "Net"], ["coutEmployeur", "Coût empl."], ["heures", "Heures"]] as const).map(([k, lab]) => (
                    <label key={k} className="flex items-center gap-1 text-slate-500">
                      {lab}
                      <input value={p[k] ?? ""} inputMode="decimal"
                        onChange={e => setPropositions(prev => prev.map((x, i) => i === idx ? { ...x, [k]: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) } : x))}
                        className="border border-gray-200 rounded px-2 py-1 w-20 text-right" />
                    </label>
                  ))}
                  <button onClick={() => enregistrerProposition(p, idx)}
                    disabled={saving || !p.salarie || !/^\d{4}-\d{2}$/.test(p.mois) || p.brut == null}
                    className="ml-auto font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                    Enregistrer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" /></div>
      ) : (
        <>
          {/* ── Graphique ── */}
          {graphe && (
            <Card padding="md" className="mb-4">
              <div className="flex items-center gap-4 mb-2 font-body text-xs">
                <span className="flex items-center gap-1.5"><span className="inline-block w-4 rounded bg-purple-600" style={{ height: 3 }} /> <strong className="text-slate-700">{saisonCourante}</strong></span>
                {saisonPrec && <span className="flex items-center gap-1.5 text-slate-500"><span className="inline-block w-4 rounded bg-slate-500" style={{ height: 2 }} /> {saisonPrec}</span>}
                <span className="flex items-center gap-1.5 text-slate-400"><span className="inline-block w-4 rounded bg-slate-300" style={{ height: 2 }} /> exercices précédents</span>
                <span className="flex items-center gap-1.5 text-amber-700">
                  <svg width="16" height="4" aria-hidden="true"><line x1="0" y1="2" x2="16" y2="2" stroke="#d97706" strokeWidth="2" strokeDasharray="4 3" /></svg>
                  réf. bilan 2024-25
                </span>
              </div>
              <svg viewBox={`0 0 ${graphe.W} ${graphe.H}`} className="w-full" role="img"
                aria-label={mode === "cout" ? "Coût total entreprise mensuel par exercice" : "Masse salariale brute mensuelle par exercice"}>
                {graphe.grads.map(v => (
                  <g key={v}>
                    <line x1={graphe.PAD.l} x2={graphe.W - graphe.PAD.r} y1={graphe.y(v)} y2={graphe.y(v)} stroke="#e2e8f0" strokeWidth="1" />
                    <text x={graphe.PAD.l - 6} y={graphe.y(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="sans-serif">{(v / 1000).toFixed(0)} k</text>
                  </g>
                ))}
                {MOIS_SAISON.map((mm, i) => (
                  <text key={mm} x={graphe.x(i)} y={graphe.H - 6} textAnchor="middle" fontSize="8.5" fill="#94a3b8" fontFamily="sans-serif">{NOMS_MOIS[mm].slice(0, 3)}</text>
                ))}
                {(() => {
                  const d = MOIS_SAISON.map((mm, i) => `${i === 0 ? "M" : "L"}${graphe.x(i).toFixed(1)},${graphe.y(refBilanMois(mm)).toFixed(1)}`).join(" ");
                  return (
                    <g>
                      <path d={d} fill="none" stroke="#d97706" strokeWidth="1.5" strokeDasharray="5 4" strokeLinejoin="round" opacity="0.85">
                        <title>Référence bilan 2024-25 : 109 330 € de charges de personnel, répartis selon le journal de paie</title>
                      </path>
                      <text x={graphe.x(11) + 7} y={graphe.y(refBilanMois("06")) + 3} fontSize="9" fontWeight="600" fill="#b45309" fontFamily="sans-serif">réf. 24-25</text>
                    </g>
                  );
                })()}
                {saisons.map(s => {
                  const pts = graphe.ligne(s);
                  if (pts.length < 2) return null;
                  const estC = s === saisonCourante, estP = s === saisonPrec;
                  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${graphe.x(p.i).toFixed(1)},${graphe.y(p.v).toFixed(1)}`).join(" ");
                  const fin = pts[pts.length - 1];
                  return (
                    <g key={s}>
                      <path d={d} fill="none" stroke={estC ? "#9333ea" : estP ? "#64748b" : "#cbd5e1"}
                        strokeWidth={estC ? 2.5 : estP ? 1.8 : 1.2} strokeLinejoin="round" strokeLinecap="round" />
                      {(estC || estP) && (
                        <>
                          {pts.map(p => (
                            <circle key={p.i} cx={graphe.x(p.i)} cy={graphe.y(p.v)} r={estC ? 3 : 2.2} fill={estC ? "#9333ea" : "#64748b"}>
                              <title>{`${NOMS_MOIS[MOIS_SAISON[p.i]]} ${s} : ${eur(p.v)} ${mode === "cout" ? "coût entreprise" : "brut"}`}</title>
                            </circle>
                          ))}
                          <text x={graphe.x(fin.i) + 7} y={graphe.y(fin.v) + 3} fontSize="9.5" fontWeight="700"
                            fill={estC ? "#6b21a8" : "#64748b"} fontFamily="sans-serif">{s}</text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </Card>
          )}

          {/* ── Bascule Brut / Coût entreprise ── */}
          <div className="flex items-center gap-2 mb-2">
            {([["brut", "Brut"], ["cout", "Coût total entreprise"]] as const).map(([id, lab]) => (
              <button key={id} onClick={() => setMode(id)}
                className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border cursor-pointer ${mode === id ? "bg-purple-600 text-white border-purple-600" : "bg-white text-slate-600 border-gray-200 hover:bg-purple-50"}`}>
                {lab}
              </button>
            ))}
            {mode === "cout" && moisPartiels.size > 0 && (
              <span className="font-body text-[11px] text-amber-700">
                * mois incomplets : des bulletins sans coût employeur comptent leur brut
              </span>
            )}
          </div>

          {/* ── Matrice mois × saisons ── */}
          <Card padding="sm" className="overflow-x-auto !p-0 mb-4">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">
                    Mois ({mode === "cout" ? "coût entreprise" : "brut"} total)
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[11px] tracking-wider text-amber-700"
                    title="Charges de personnel du bilan 2024-25 (109 330 €), réparties selon le journal de paie">
                    Réf. bilan 24-25
                  </th>
                  {saisons.map(s => (
                    <th key={s} className={`px-3 py-2.5 text-right font-semibold text-[11px] tracking-wider ${s === saisonCourante ? "text-purple-700" : "text-slate-600"}`}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOIS_SAISON.map(mm => (
                  <tr key={mm} className="border-b border-gray-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-700 font-medium">{NOMS_MOIS[mm]}</td>
                    <td className="px-3 py-2 text-right text-amber-700/80 italic">{eur(refBilanMois(mm))}</td>
                    {saisons.map(s => {
                      const mois = moisDe(s, mm);
                      const total = totalParMois.get(mois);
                      return (
                        <td key={s} onClick={() => setMoisDetail(mois)}
                          title="Voir le détail du mois"
                          className={`px-3 py-2 text-right cursor-pointer ${mois === moisDetail ? "bg-purple-50 rounded" : ""} ${s === saisonCourante ? "font-semibold text-purple-800" : "text-slate-600"}`}>
                          {total !== undefined ? <>{eur(total)}{moisPartiels.has(mois) ? "*" : ""}</> : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-body text-[11px] text-slate-400 px-3 py-2">
              La colonne <span className="text-amber-700">Réf. bilan 24-25</span> est le dernier exercice
              validé par le cabinet : 109 330 € de charges de personnel (rémunération du gérant comprise),
              répartis sur l&apos;année selon le profil du journal de paie. À comparer à la vue
              « coût total entreprise » — durablement au-dessus sans chiffre d&apos;affaires en face, c&apos;est le signal.
            </p>
          </Card>

          {/* ── Détail du mois sélectionné ── */}
          <Card padding="md">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="font-display text-base font-bold text-blue-800">
                Détail — {NOMS_MOIS[moisDetail.slice(5)]} {moisDetail.slice(0, 4)}
              </h2>
              <button onClick={() => setForm({ salarie: "", brut: "", net: "", coutEmployeur: "", heures: "" })}
                className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-purple-100">
                <Plus size={13} /> Ajouter une ligne
              </button>
            </div>

            {form && (
              <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50/50 px-3 py-2 flex flex-wrap items-center gap-2 font-body text-xs">
                <input autoFocus value={form.salarie} onChange={e => setForm({ ...form, salarie: e.target.value })}
                  placeholder="Salarié" className="font-semibold border border-gray-200 rounded px-2 py-1 w-40" />
                {([["brut", "Brut *"], ["net", "Net"], ["coutEmployeur", "Coût empl."], ["heures", "Heures"]] as const).map(([k, lab]) => (
                  <label key={k} className="flex items-center gap-1 text-slate-500">
                    {lab}
                    <input value={form[k]} inputMode="decimal" onChange={e => setForm({ ...form, [k]: e.target.value })}
                      className="border border-gray-200 rounded px-2 py-1 w-20 text-right" />
                  </label>
                ))}
                <button onClick={enregistrerForm} disabled={saving || !form.salarie || !form.brut}
                  className="ml-auto font-semibold text-white bg-purple-600 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">Enregistrer</button>
                <button onClick={() => setForm(null)} className="text-slate-500 bg-white border border-gray-200 px-2 py-1.5 rounded-lg cursor-pointer">✕</button>
              </div>
            )}

            {lignesDuMois.length === 0 ? (
              <p className="font-body text-sm text-slate-400 italic">Aucune ligne ce mois-ci — dépose les fiches de paie ou ajoute à la main.</p>
            ) : (
              <table className="w-full border-collapse font-body text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="text-left px-2 py-1.5">Salarié</th>
                    <th className="text-right px-2 py-1.5">Brut</th>
                    <th className="text-right px-2 py-1.5">Net</th>
                    <th className="text-right px-2 py-1.5">Coût empl.</th>
                    <th className="text-right px-2 py-1.5">Heures</th>
                    <th className="px-2 py-1.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {lignesDuMois.map(l => (
                    <tr key={l.id} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 font-medium text-slate-700">
                        {l.salarie}
                        {l.source === "fiche-paie" && <span title="Issu d'une fiche de paie" className="ml-1.5 text-[10px] text-purple-500">📄</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{eur(l.brut)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-600">{l.net != null ? eur(l.net) : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-slate-600">{l.coutEmployeur != null ? eur(l.coutEmployeur) : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-slate-600">{l.heures != null ? hrs(l.heures) : "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button onClick={() => setForm({ salarie: l.salarie, brut: String(l.brut), net: l.net != null ? String(l.net) : "", coutEmployeur: l.coutEmployeur != null ? String(l.coutEmployeur) : "", heures: l.heures != null ? String(l.heures) : "" })}
                          title="Corriger" className="text-slate-400 hover:text-blue-600 bg-transparent border-none cursor-pointer p-1"><Pencil size={13} /></button>
                        <button onClick={() => supprimer(l)} title="Retirer"
                          className="text-slate-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-purple-50/60 font-semibold text-purple-900">
                    <td className="px-2 py-2">Total du mois</td>
                    <td className="px-2 py-2 text-right">{eur(lignesDuMois.reduce((s, l) => s + l.brut, 0))}</td>
                    <td className="px-2 py-2 text-right">{lignesDuMois.some(l => l.net != null) ? eur(lignesDuMois.reduce((s, l) => s + (l.net || 0), 0)) : "—"}</td>
                    <td className="px-2 py-2 text-right">{lignesDuMois.some(l => l.coutEmployeur != null) ? eur(lignesDuMois.reduce((s, l) => s + (l.coutEmployeur || 0), 0)) : "—"}</td>
                    <td className="px-2 py-2 text-right">{lignesDuMois.some(l => l.heures != null) ? hrs(lignesDuMois.reduce((s, l) => s + (l.heures || 0), 0)) : "—"}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
            {/* ── Charges patronales versées à part (MSA/TESA des saisonniers) ── */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="font-body text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  Charges patronales versées à part (saisonniers TESA, MSA…)
                </div>
                <button onClick={() => setFormCharge({ libelle: "Charges MSA (TESA saisonniers)", montant: "", decaissement: "" })}
                  className="flex items-center gap-1 font-body text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-amber-100">
                  <Plus size={11} /> Ajouter une charge
                </button>
              </div>
              {formCharge && (
                <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 flex flex-wrap items-center gap-2 font-body text-xs">
                  <input autoFocus value={formCharge.libelle} onChange={e => setFormCharge({ ...formCharge, libelle: e.target.value })}
                    className="font-semibold border border-gray-200 rounded px-2 py-1 w-64" placeholder="Libellé (organisme…)" />
                  <label className="flex items-center gap-1 text-slate-500" title="Part patronale nette des réductions — le coût réel pour l'entreprise">Coût empl.
                    <input value={formCharge.montant} inputMode="decimal" onChange={e => setFormCharge({ ...formCharge, montant: e.target.value })}
                      className="border border-gray-200 rounded px-2 py-1 w-24 text-right" />
                  </label>
                  <label className="flex items-center gap-1 text-slate-500" title="Le virement réellement fait à l'organisme — ce qui sort du compte">Payé
                    <input value={formCharge.decaissement} inputMode="decimal" onChange={e => setFormCharge({ ...formCharge, decaissement: e.target.value })}
                      className="border border-gray-200 rounded px-2 py-1 w-24 text-right" />
                  </label>
                  <button onClick={enregistrerFormCharge} disabled={saving || !formCharge.libelle || (!formCharge.montant && !formCharge.decaissement)}
                    className="ml-auto font-semibold text-white bg-amber-600 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">Enregistrer</button>
                  <button onClick={() => setFormCharge(null)} className="text-slate-500 bg-white border border-gray-200 px-2 py-1.5 rounded-lg cursor-pointer">✕</button>
                </div>
              )}
              {chargesDuMois.length === 0 ? (
                <p className="font-body text-xs text-slate-400 italic mb-1">
                  Aucune — dépose le récapitulatif de cotisations (MSA/DSN) dans la zone du haut, il sera reconnu.
                </p>
              ) : (
                <div className="flex flex-col gap-1 mb-1">
                  {chargesDuMois.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50/60 border border-amber-100 px-3 py-1.5 font-body text-sm">
                      <span className="text-slate-700">{c.libelle}{c.source === "fiche-paie" && <span title="Issu d'un récapitulatif de cotisations" className="ml-1.5 text-[10px] text-amber-600">📄</span>}</span>
                      <span className="flex items-center gap-1">
                        <strong className="text-amber-900">{c.montant != null ? eur(c.montant) : "coût ?"}</strong>
                        {c.decaissement != null && (
                          <span className="font-body text-[11px] text-slate-500" title="Le virement fait à l'organisme ce mois-là">· payé {eur(c.decaissement)}</span>
                        )}
                        <button onClick={() => setFormCharge({ libelle: c.libelle, montant: c.montant != null ? String(c.montant) : "", decaissement: c.decaissement != null ? String(c.decaissement) : "" })}
                          title="Corriger" className="text-slate-400 hover:text-blue-600 bg-transparent border-none cursor-pointer p-1"><Pencil size={12} /></button>
                        <button onClick={() => supprimerCharge(c)} title="Retirer"
                          className="text-slate-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><Trash2 size={12} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(lignesDuMois.length > 0 || chargesDuMois.length > 0) && (() => {
              // « Combien d'argent je sors sur un mois » : les virements de
              // salaire (nets) + les virements aux organismes (décaissement des
              // charges — repli sur le coût quand il n'a pas été saisi). C'est
              // du CASH, distinct du coût entreprise comptable juste en dessous.
              const netsAbsents = lignesDuMois.filter(l => l.net == null);
              const sortiSalaires = lignesDuMois.reduce((s, l) => s + (l.net || 0), 0);
              const chargesRepli = chargesDuMois.filter(c => c.decaissement == null);
              const sortiCharges = chargesDuMois.reduce((s, c) => s + (c.decaissement ?? c.montant ?? 0), 0);
              return (
                <>
                  <div className="mt-4 rounded-xl bg-emerald-600 text-white px-4 py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-body text-[11px] uppercase tracking-wider opacity-90">
                          💸 Sorti du compte ce mois — masse salariale
                        </div>
                        <div className="font-body text-xs opacity-90 mt-0.5">
                          {eur(sortiSalaires)} de salaires nets versés + {eur(sortiCharges)} payés aux organismes
                        </div>
                      </div>
                      <div className="font-display text-3xl font-bold">{eur(sortiSalaires + sortiCharges)}</div>
                    </div>
                    {(netsAbsents.length > 0 || chargesRepli.length > 0) && (
                      <div className="font-body text-[11px] bg-emerald-700/60 rounded-lg px-2.5 py-1.5 mt-2">
                        ⚠ Total incomplet :
                        {netsAbsents.length > 0 && <> {netsAbsents.length} salaire(s) sans net ({netsAbsents.map(l => l.salarie).join(", ")}) — non compté(s), corrige la ligne pour l&apos;ajouter.</>}
                        {chargesRepli.length > 0 && <> {chargesRepli.length} charge(s) sans « payé à l&apos;organisme » — comptée(s) à leur coût employeur, saisis le montant réellement viré pour être exact.</>}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 rounded-lg bg-purple-100/60 border border-purple-200 px-3 py-2 flex items-center justify-between font-body text-sm">
                    <span className="font-semibold text-purple-900">Coût total entreprise du mois</span>
                    <span className="font-bold text-purple-900">
                      {eur(
                        lignesDuMois.reduce((s, l) => s + (l.coutEmployeur ?? l.brut), 0)
                        + chargesDuMois.reduce((s, c) => s + (c.montant || 0), 0)
                      )}
                      {lignesDuMois.some(l => l.coutEmployeur == null) && (
                        <span className="font-body text-[11px] font-normal text-amber-700 ml-2">
                          ({lignesDuMois.filter(l => l.coutEmployeur == null).length} salaire(s) compté(s) au brut, coût absent du bulletin)
                        </span>
                      )}
                      {chargesDuMois.some(c => c.montant == null) && (
                        <span className="font-body text-[11px] font-normal text-amber-700 ml-2">
                          ({chargesDuMois.filter(c => c.montant == null).length} charge(s) sans coût employeur connu, non comptée(s) ici)
                        </span>
                      )}
                    </span>
                  </div>
                </>
              );
            })()}
            <p className="font-body text-[11px] text-slate-400 mt-3">
              Le <strong>brut</strong> figure sur tous les bulletins ; le <strong>coût entreprise</strong> (brut +
              charges patronales) seulement sur certains — d&apos;où le repli signalé quand il manque.
              Pour les saisonniers TESA, les charges arrivent à part via le récapitulatif MSA : seule la
              <strong> part patronale nette des réductions</strong> est proposée — la part ouvrière est déjà
              dans les bruts, la compter ici la compterait deux fois.
              L&apos;encart vert, lui, parle <strong>cash</strong> : les nets virés aux salariés + les
              virements réellement faits aux organismes (le « à payer » des récapitulatifs) — c&apos;est
              ce qui sort du compte, pas le coût comptable.
              Outil de pilotage : les lignes se corrigent librement, aucune fiche de paie n&apos;est conservée.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
