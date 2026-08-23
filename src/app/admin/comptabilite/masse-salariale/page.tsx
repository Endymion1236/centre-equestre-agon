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

interface Ligne { id: string; mois: string; salarie: string; brut: number; net: number | null; coutEmployeur: number | null; heures: number | null; source: string; }
interface Proposition { salarie: string; mois: string; brut: number | null; net: number | null; coutEmployeur: number | null; heures: number | null; fichier: string; etat?: "ok" | "erreur"; message?: string; }

const MOIS_SAISON = ["09", "10", "11", "12", "01", "02", "03", "04", "05", "06", "07", "08"] as const;
const NOMS_MOIS: Record<string, string> = {
  "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
  "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
};
function saisonDe(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m >= 9 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}
function moisDe(saison: string, mm: string): string {
  const [a1, a2] = saison.split("-");
  return `${Number(mm) >= 9 ? a1 : a2}-${mm}`;
}
const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const moisCourant = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function MasseSalarialePage() {
  const { isAdmin, user } = useAuth();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moisDetail, setMoisDetail] = useState(moisCourant());
  const [propositions, setPropositions] = useState<Proposition[]>([]);
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

  const totalParMois = useMemo(() => {
    const m = new Map<string, number>();
    lignes.forEach(l => m.set(l.mois, (m.get(l.mois) || 0) + l.brut));
    return m;
  }, [lignes]);
  const saisons = useMemo(() => {
    const s = new Set(lignes.map(l => saisonDe(l.mois)));
    s.add(saisonDe(moisCourant()));
    return [...s].sort();
  }, [lignes]);
  const saisonCourante = saisons[saisons.length - 1];
  const saisonPrec = saisons[saisons.length - 2];
  const lignesDuMois = useMemo(
    () => lignes.filter(l => l.mois === moisDetail).sort((a, b) => a.salarie.localeCompare(b.salarie, "fr")),
    [lignes, moisDetail],
  );

  // ── Dépôt de fiches de paie ──
  const lireFiches = async (fichiers: FileList) => {
    setError("");
    for (const f of Array.from(fichiers)) {
      setLecture(n => n + 1);
      try {
        const b64 = btoa(new Uint8Array(await f.arrayBuffer()).reduce((s, b) => s + String.fromCharCode(b), ""));
        const d = await api({ action: "extraire", pdfBase64: b64, filename: f.name });
        setPropositions(prev => [...prev, { ...d.proposition, etat: "ok" }]);
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
    const vals = [...totalParMois.values()];
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
              Brut mensuel par salarié, saison par saison — dépose les fiches de paie, valide, c&apos;est tout.
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
                <span className="flex items-center gap-1.5 text-slate-400"><span className="inline-block w-4 rounded bg-slate-300" style={{ height: 2 }} /> saisons précédentes</span>
              </div>
              <svg viewBox={`0 0 ${graphe.W} ${graphe.H}`} className="w-full" role="img" aria-label="Masse salariale brute mensuelle par saison">
                {graphe.grads.map(v => (
                  <g key={v}>
                    <line x1={graphe.PAD.l} x2={graphe.W - graphe.PAD.r} y1={graphe.y(v)} y2={graphe.y(v)} stroke="#e2e8f0" strokeWidth="1" />
                    <text x={graphe.PAD.l - 6} y={graphe.y(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="sans-serif">{(v / 1000).toFixed(0)} k</text>
                  </g>
                ))}
                {MOIS_SAISON.map((mm, i) => (
                  <text key={mm} x={graphe.x(i)} y={graphe.H - 6} textAnchor="middle" fontSize="8.5" fill="#94a3b8" fontFamily="sans-serif">{NOMS_MOIS[mm].slice(0, 3)}</text>
                ))}
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
                              <title>{`${NOMS_MOIS[MOIS_SAISON[p.i]]} ${s} : ${eur(p.v)} brut`}</title>
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

          {/* ── Matrice mois × saisons (brut total) ── */}
          <Card padding="sm" className="overflow-x-auto !p-0 mb-4">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-600">Mois (brut total)</th>
                  {saisons.map(s => (
                    <th key={s} className={`px-3 py-2.5 text-right font-semibold text-[11px] tracking-wider ${s === saisonCourante ? "text-purple-700" : "text-slate-600"}`}>{s}</th>
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
                      return (
                        <td key={s} onClick={() => setMoisDetail(mois)}
                          title="Voir le détail du mois"
                          className={`px-3 py-2 text-right cursor-pointer ${mois === moisDetail ? "bg-purple-50 rounded" : ""} ${s === saisonCourante ? "font-semibold text-purple-800" : "text-slate-600"}`}>
                          {total !== undefined ? eur(total) : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
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
                      <td className="px-2 py-1.5 text-right text-slate-600">{l.heures != null ? `${l.heures} h` : "—"}</td>
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
                    <td className="px-2 py-2 text-right">{lignesDuMois.some(l => l.heures != null) ? `${lignesDuMois.reduce((s, l) => s + (l.heures || 0), 0)} h` : "—"}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="font-body text-[11px] text-slate-400 mt-3">
              La matrice et le graphique portent sur le <strong>brut</strong>, toujours présent sur les bulletins.
              Outil de pilotage : les lignes se corrigent librement, aucune fiche de paie n&apos;est conservée.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
