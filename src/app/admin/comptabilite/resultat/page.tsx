"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { TrendingUp, Loader2, RefreshCw } from "lucide-react";

/**
 * Résultat en continu — le chaînon entre la caisse et le bilan.
 *
 * Le bilan a montré le piège d'une lecture annuelle : un CA en hausse mangé
 * par des achats qui doublent, découvert dix-huit mois plus tard. Ici, chaque
 * mois de l'exercice (juillet → juin) aligne :
 *   CA encaissé (automatique, caisse NF525) − masse salariale − dépenses
 * = ce qui reste. Comparé aux repères du bilan 2024-25.
 *
 * Honnêteté des chiffres : le CA est TTC et ENCAISSÉ (pas facturé HT comme au
 * bilan), et « dépenses » ne couvre que les factures saisies. Le « reste »
 * n'est donc pas un EBE comptable — c'est un indicateur de tendance, qui
 * suffit largement à voir un mois qui décroche.
 */

interface MoisResultat { mois: string; ca: number; masse: number; depenses: number; }

// Repères du bilan 2024-25 (exercice clos le 30/06/2025, cabinet Pignolet).
const REF_BILAN = { ca: 277163, personnel: 109330, ebe: 35990 };

const MOIS_EXERCICE = ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06"] as const;
const NOMS_MOIS: Record<string, string> = {
  "07": "Juillet", "08": "Août", "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril", "05": "Mai", "06": "Juin",
};
function exerciceDe(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}
function moisDe(exercice: string, mm: string): string {
  const [a1, a2] = exercice.split("-");
  return `${Number(mm) >= 7 ? a1 : a2}-${mm}`;
}
const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const moisCourant = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function ResultatPage() {
  const { isAdmin, user } = useAuth();
  const [donnees, setDonnees] = useState<MoisResultat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exercice, setExercice] = useState(exerciceDe(moisCourant()));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/resultat", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setDonnees(d.mois || []);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const exercices = useMemo(() => {
    const s = new Set(donnees.map(d => exerciceDe(d.mois)));
    s.add(exerciceDe(moisCourant()));
    return [...s].sort();
  }, [donnees]);

  const parMois = useMemo(() => new Map(donnees.map(d => [d.mois, d])), [donnees]);
  const courant = moisCourant();

  // Lignes de l'exercice affiché — seulement jusqu'au mois courant pour
  // l'exercice en cours (les mois à venir n'ont rien à dire).
  const lignes = useMemo(() =>
    MOIS_EXERCICE.map(mm => {
      const mois = moisDe(exercice, mm);
      const d = parMois.get(mois);
      return { mois, mm, futur: mois > courant, ca: d?.ca || 0, masse: d?.masse || 0, depenses: d?.depenses || 0 };
    }), [exercice, parMois, courant]);
  const passees = lignes.filter(l => !l.futur);
  const cumul = passees.reduce((s, l) => ({ ca: s.ca + l.ca, masse: s.masse + l.masse, depenses: s.depenses + l.depenses }),
    { ca: 0, masse: 0, depenses: 0 });
  const reste = cumul.ca - cumul.masse - cumul.depenses;
  const pctMasse = cumul.ca > 0 ? Math.round((cumul.masse / cumul.ca) * 100) : null;

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={20} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Résultat en continu</h1>
            <p className="font-body text-sm text-slate-500">
              CA encaissé (automatique) − masse salariale − dépenses, mois par mois —
              ce que le bilan ne montre qu&apos;une fois par an.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/comptabilite"
            className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            ← Comptabilité
          </Link>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {exercices.map(ex => (
          <button key={ex} onClick={() => setExercice(ex)}
            className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border cursor-pointer ${exercice === ex ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-gray-200 hover:bg-emerald-50"}`}>
            Exercice {ex}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" /></div>
      ) : (
        <>
          {/* ── Tuiles de cumul ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Card padding="sm">
              <div className="font-body text-[11px] uppercase tracking-wider text-slate-500">CA encaissé (cumul)</div>
              <div className="font-display text-xl font-bold text-emerald-700">{eur(cumul.ca)}</div>
              <div className="font-body text-[11px] text-slate-400">bilan 24-25 : {eur(REF_BILAN.ca)} HT/an</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-[11px] uppercase tracking-wider text-slate-500">Masse salariale</div>
              <div className="font-display text-xl font-bold text-purple-700">{eur(cumul.masse)}</div>
              <div className="font-body text-[11px] text-slate-400">
                {pctMasse != null ? `${pctMasse} % du CA — ` : ""}bilan : 39 %
              </div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-[11px] uppercase tracking-wider text-slate-500">Dépenses saisies</div>
              <div className="font-display text-xl font-bold text-orange-700">{eur(cumul.depenses)}</div>
              <div className="font-body text-[11px] text-slate-400">écran Dépenses par poste</div>
            </Card>
            <Card padding="sm">
              <div className="font-body text-[11px] uppercase tracking-wider text-slate-500">Reste (indicateur)</div>
              <div className={`font-display text-xl font-bold ${reste >= 0 ? "text-emerald-700" : "text-red-600"}`}>{eur(reste)}</div>
              <div className="font-body text-[11px] text-slate-400">EBE bilan 24-25 : {eur(REF_BILAN.ebe)}</div>
            </Card>
          </div>

          {/* ── Le tableau mensuel ── */}
          <Card padding="sm" className="overflow-x-auto !p-0">
            <table className="w-full border-collapse font-body text-sm">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200 text-[11px] uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2.5 text-left font-semibold">Mois</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-emerald-700">CA encaissé</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-purple-700">Masse salariale</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-orange-700">Dépenses</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Reste</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-slate-500" title="Part du CA absorbée par la masse salariale (repère bilan : 39 %)">Masse / CA</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(l => {
                  const r = l.ca - l.masse - l.depenses;
                  const pct = !l.futur && l.ca > 0 ? Math.round((l.masse / l.ca) * 100) : null;
                  const vide = !l.futur && l.ca === 0 && l.masse === 0 && l.depenses === 0;
                  return (
                    <tr key={l.mois} className={`border-b border-gray-100 ${l.futur ? "text-slate-300" : "hover:bg-emerald-50/30"}`}>
                      <td className="px-3 py-2 font-medium text-slate-700">{NOMS_MOIS[l.mm]} {l.mois.slice(0, 4)}{l.futur ? " (à venir)" : ""}</td>
                      {l.futur || vide ? (
                        <td colSpan={5} className="px-3 py-2 text-right text-slate-300">—</td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-800">{eur(l.ca)}</td>
                          <td className="px-3 py-2 text-right text-purple-800">{l.masse > 0 ? `− ${eur(l.masse)}` : "—"}</td>
                          <td className="px-3 py-2 text-right text-orange-800">{l.depenses > 0 ? `− ${eur(l.depenses)}` : "—"}</td>
                          <td className={`px-3 py-2 text-right font-bold ${r >= 0 ? "text-emerald-700" : "text-red-600"}`}>{eur(r)}</td>
                          <td className={`px-3 py-2 text-right ${pct != null && pct > 50 ? "text-red-600 font-semibold" : "text-slate-500"}`}>{pct != null ? `${pct} %` : "—"}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
                <tr className="bg-emerald-50/60 font-semibold text-emerald-900">
                  <td className="px-3 py-2.5">Cumul exercice</td>
                  <td className="px-3 py-2.5 text-right">{eur(cumul.ca)}</td>
                  <td className="px-3 py-2.5 text-right text-purple-900">− {eur(cumul.masse)}</td>
                  <td className="px-3 py-2.5 text-right text-orange-900">− {eur(cumul.depenses)}</td>
                  <td className={`px-3 py-2.5 text-right font-bold ${reste >= 0 ? "" : "text-red-700"}`}>{eur(reste)}</td>
                  <td className="px-3 py-2.5 text-right">{pctMasse != null ? `${pctMasse} %` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <p className="font-body text-[11px] text-slate-400 mt-3">
            Le <strong>CA encaissé</strong> vient directement de la caisse (avoirs, apports et versements en
            banque exclus, remboursements déduits) — aucune saisie. Il est <strong>TTC et encaissé</strong>,
            là où le bilan parle HT et facturé : la comparaison aux repères 2024-25 est une tendance, pas une
            équivalence. La <strong>masse salariale</strong> reprend l&apos;écran du même nom (coût employeur +
            charges à part), les <strong>dépenses</strong> tes factures saisies — le « reste » n&apos;est donc
            complet que si les saisies le sont. Repères bilan 24-25 : CA {eur(REF_BILAN.ca)},
            personnel 39 % du CA, EBE {eur(REF_BILAN.ebe)} (13 %).
          </p>
        </>
      )}
    </div>
  );
}
