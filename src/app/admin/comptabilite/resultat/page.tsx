"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { TrendingUp, Loader2, RefreshCw } from "lucide-react";
import {
  NOMS_MOIS,
  REF_BILAN,
  construireLignesResultat,
  exerciceDe,
  exercicesDisponibles,
  formaterEuros as eur,
  moisCourant,
  resultatMensuel,
  resumerResultat,
  type MoisResultat,
} from "./resultat-utils";

/**
 * Résultat en continu — le chaînon entre la caisse et le bilan.
 * CA encaissé (TTC) − masse salariale − dépenses saisies = indicateur de tendance.
 */
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

  const courant = moisCourant();
  const exercices = useMemo(() => exercicesDisponibles(donnees, courant), [donnees, courant]);
  const lignes = useMemo(
    () => construireLignesResultat(donnees, exercice, courant),
    [donnees, exercice, courant],
  );
  const { cumul, reste, pctMasse } = useMemo(() => resumerResultat(lignes), [lignes]);

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
          <button type="button" onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {exercices.map(ex => (
          <button type="button" key={ex} onClick={() => setExercice(ex)}
            className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border cursor-pointer ${exercice === ex ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-gray-200 hover:bg-emerald-50"}`}>
            Exercice {ex}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" /></div>
      ) : (
        <>
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
                  const { reste: resteMois, pctMasse: pct } = resultatMensuel(l);
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
                          <td className={`px-3 py-2 text-right font-bold ${resteMois >= 0 ? "text-emerald-700" : "text-red-600"}`}>{eur(resteMois)}</td>
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
