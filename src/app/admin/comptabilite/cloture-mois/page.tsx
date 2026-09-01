"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { ClipboardCheck, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import {
  NOMS_MOIS_CLOTURE as NOMS_MOIS,
  construirePointsCloture,
  moisCourantCloture as moisCourant,
  moisDecale,
  resumerCloture,
  type EtatCloture as Etat,
  type LigneMasseSalarialeCloture as LigneMS,
  type MoisResultatCloture as MoisResultat,
  type ReleveClotureMois as Releve,
} from "./cloture-mois-utils";

/**
 * Boucler le mois — la checklist qui réunit les rituels de fin de mois.
 * Les calculs de complétude et de rapprochement sont isolés dans
 * cloture-mois-utils.ts pour être testés sans React ni appels réseau.
 */
export default function ClotureMoisPage() {
  const { isAdmin, user } = useAuth();
  const [releves, setReleves] = useState<Releve[]>([]);
  const [comptes, setComptes] = useState<string[]>([]);
  const [horsTotal, setHorsTotal] = useState<string[]>([]);
  const [lignesMS, setLignesMS] = useState<LigneMS[]>([]);
  const [resultat, setResultat] = useState<MoisResultat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mois, setMois] = useState(moisDecale(moisCourant(), -1));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const h = { Authorization: `Bearer ${token}` };
      const [tre, ms, res] = await Promise.all([
        fetch("/api/admin/tresorerie", { headers: h }).then(r => r.json()),
        fetch("/api/admin/masse-salariale", { headers: h }).then(r => r.json()),
        fetch("/api/admin/resultat", { headers: h }).then(r => r.json()),
      ]);
      setReleves(tre.releves || []); setComptes(tre.comptes || []); setHorsTotal(tre.horsTotal || []);
      setLignesMS(ms.lignes || []);
      setResultat(res.mois || []);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const points = useMemo(
    () => construirePointsCloture({ mois, releves, comptes, horsTotal, lignesMS, resultat }),
    [mois, releves, comptes, horsTotal, lignesMS, resultat],
  );
  const { bloquants, boucle } = useMemo(() => resumerCloture(points), [points]);

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  const PASTILLES: Record<Etat, { s: string; cls: string }> = {
    ok: { s: "✓", cls: "bg-green-100 text-green-700 border-green-200" },
    manque: { s: "✗", cls: "bg-red-100 text-red-600 border-red-200" },
    info: { s: "!", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    neutre: { s: "—", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <ClipboardCheck size={20} className="text-teal-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Boucler le mois</h1>
            <p className="font-body text-sm text-slate-500">
              Le rituel de fin de mois en une page — tout vert = mois bouclé.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="flex items-center justify-center gap-3 mb-4">
        <button type="button" onClick={() => setMois(m => moisDecale(m, -1))}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-50">
          <ChevronLeft size={15} className="text-slate-500" />
        </button>
        <div className="font-display text-lg font-bold text-blue-800 w-52 text-center">
          {NOMS_MOIS[mois.slice(5)]} {mois.slice(0, 4)}
        </div>
        <button type="button" onClick={() => setMois(m => moisDecale(m, 1))} disabled={mois >= moisCourant()}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-50 disabled:opacity-40">
          <ChevronRight size={15} className="text-slate-500" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto" /></div>
      ) : (
        <>
          <div className={`mb-4 rounded-xl px-4 py-3 font-body text-sm font-semibold ${boucle ? "bg-green-50 border border-green-200 text-green-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
            {boucle ? "✅ Mois bouclé — tout est en place." : `${bloquants} point(s) à régler pour boucler ${NOMS_MOIS[mois.slice(5)].toLowerCase()}.`}
          </div>

          <div className="flex flex-col gap-2">
            {points.map((p, i) => (
              <Card key={i} padding="sm" className="!py-3">
                <div className="flex items-start gap-3">
                  <span className={`w-7 h-7 rounded-full border flex items-center justify-center font-body text-sm font-bold flex-shrink-0 ${PASTILLES[p.etat].cls}`}>
                    {PASTILLES[p.etat].s}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-semibold text-slate-800">{p.titre}</div>
                    <div className="font-body text-xs text-slate-500 mt-0.5">{p.detail}</div>
                  </div>
                  <Link href={p.href}
                    className="font-body text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1.5 rounded-lg no-underline hover:bg-teal-100 whitespace-nowrap">
                    {p.lien} →
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          <p className="font-body text-[11px] text-slate-400 mt-4">
            Le rapprochement compare les <strong>encaissements clients lus sur le relevé</strong> (remises CB,
            chèques, Stripe — hors virements internes et remboursements) au <strong>CA encaissé de la caisse</strong>.
            Un écart de quelques pourcents est normal (remises CB à cheval sur deux mois) ; un gros écart mérite
            un regard. Un email de rappel part automatiquement le 2 de chaque mois avec l&apos;état de cette liste.
          </p>
        </>
      )}
    </div>
  );
}
