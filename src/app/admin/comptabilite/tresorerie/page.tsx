"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Landmark, Loader2, RefreshCw, FileUp, Check, Pencil, Settings2 } from "lucide-react";

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

interface Releve { id: string; mois: string; compte: string; montant: number; note: string; source: string; }

const MOIS_SAISON = ["09", "10", "11", "12", "01", "02", "03", "04", "05", "06", "07", "08"] as const;
const NOMS_MOIS: Record<string, string> = {
  "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
  "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
};

/** "2026-03" → "2025-2026" (une saison court de septembre à août). */
function saisonDe(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m >= 9 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}
/** ("2025-2026", "03") → "2026-03". */
function moisDe(saison: string, mm: string): string {
  const [a1, a2] = saison.split("-");
  return `${Number(mm) >= 9 ? a1 : a2}-${mm}`;
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
  const [releves, setReleves] = useState<Releve[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [importing, setImporting] = useState(false);
  // Cellule en cours d'édition : `${saison}|${mm}|${compte}`
  const [edit, setEdit] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);
  // Réglage de la liste des comptes bancaires suivis (un par ligne).
  const [comptesEdit, setComptesEdit] = useState<string | null>(null);

  const api = useCallback(async (init?: RequestInit) => {
    const token = await user!.getIdToken();
    const res = await fetch("/api/admin/tresorerie", {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error || "Erreur");
    return d;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const d = await api();
      setComptes(d.comptes || []);
      setReleves(d.releves || []);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [user, api]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  // ── Totaux par mois (tous comptes) et index par (mois, compte) ──
  const parMoisCompte = useMemo(() => {
    const m = new Map<string, Releve>();
    releves.forEach(r => m.set(`${r.mois}|${r.compte}`, r));
    return m;
  }, [releves]);
  const totalParMois = useMemo(() => {
    const m = new Map<string, number>();
    releves.forEach(r => m.set(r.mois, (m.get(r.mois) || 0) + r.montant));
    return m;
  }, [releves]);

  const saisons = useMemo(() => {
    const s = new Set(releves.map(r => saisonDe(r.mois)));
    const now = new Date();
    s.add(saisonDe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`));
    return [...s].sort();
  }, [releves]);
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
    const liste = comptesEdit.split("\n").map(c => c.trim()).filter(Boolean);
    if (liste.length === 0) { setError("Au moins un compte"); return; }
    setSaving(true); setError("");
    try {
      await api({ method: "POST", body: JSON.stringify({ action: "comptes", comptes: liste }) });
      setComptesEdit(null);
      setInfo("Liste des comptes enregistrée.");
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
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
          <button onClick={() => setComptesEdit(comptesEdit === null ? comptes.join("\n") : null)}
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
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}
      {info && <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-body text-sm text-green-700 flex items-center gap-2"><Check size={15} />{info}</div>}

      {comptesEdit !== null && (
        <Card padding="md" className="mb-4">
          <div className="font-body text-sm font-semibold text-slate-800 mb-1">Comptes bancaires suivis</div>
          <p className="font-body text-xs text-slate-500 mb-2">
            Un compte par ligne (ex. « Crédit Agricole — courant », « Excédent Pro »). Le tableau
            additionne tous les comptes ; la saisie au clic remplit le premier de la liste.
            Renommer un compte ne déplace pas ses relevés déjà saisis — garde le même nom si possible.
          </p>
          <textarea value={comptesEdit} onChange={e => setComptesEdit(e.target.value)} rows={Math.max(3, comptesEdit.split("\n").length + 1)}
            className="w-full max-w-md font-body text-sm border border-gray-200 rounded-lg px-3 py-2" />
          <div className="flex gap-2 mt-2">
            <button onClick={enregistrerComptes} disabled={saving}
              className="font-body text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg border-none cursor-pointer disabled:opacity-50">
              Enregistrer
            </button>
            <button onClick={() => setComptesEdit(null)}
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
                      if (edit === k) {
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
                      return (
                        <td key={s} onClick={() => { setEdit(k); setEditVal(releve ? String(releve.montant) : ""); }}
                          title={comptes.length > 1 && total !== undefined ? "Total des comptes — clique pour modifier le premier compte" : "Cliquer pour saisir"}
                          className={`px-3 py-2 text-right cursor-pointer ${s === saisonCourante ? "font-semibold text-blue-800" : "text-slate-600"}`}>
                          {total !== undefined ? eur(total) : <Pencil size={11} className="inline text-slate-300" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

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
