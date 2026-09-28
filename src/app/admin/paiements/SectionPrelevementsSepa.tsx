"use client";
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { Loader2 } from "lucide-react";
import { grouperPrelevementsSepa, type PrelevementSepa } from "./prelevements-sepa-utils";
import { todayIso } from "./echeances-utils";

const dateFr = (iso?: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR") : "—");

/**
 * Prélèvements SEPA à venir, dans l'onglet Échéances. En lecture : ils se
 * règlent par la remise bancaire, depuis Prélèvements SEPA.
 */
export function SectionPrelevementsSepa({ search }: { search: string }) {
  const [echeances, setEcheances] = useState<PrelevementSepa[] | null>(null);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let annule = false;
    getDocs(collection(db, "echeances-sepa"))
      .then(snap => { if (!annule) setEcheances(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PrelevementSepa)); })
      .catch(e => { console.warn("[échéances] prélèvements SEPA:", e); if (!annule) setEcheances([]); });
    return () => { annule = true; };
  }, []);

  const { familles, stats } = useMemo(
    () => grouperPrelevementsSepa(echeances || [], { search, today: todayIso() }),
    [echeances, search],
  );

  if (echeances === null) {
    return <div className="text-center py-6"><Loader2 className="w-5 h-5 animate-spin text-sky-500 mx-auto" /></div>;
  }
  if (stats.nbFamilles === 0) return null;

  const basculer = (cle: string) => setOuvertes(prev => {
    const n = new Set(prev);
    n.has(cle) ? n.delete(cle) : n.add(cle);
    return n;
  });

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h3 className="font-display text-base font-bold text-sky-900">🏦 Prélèvements SEPA à venir</h3>
        <a href="/admin/sepa?tab=echeancier"
          className="font-body text-xs font-semibold text-sky-800 bg-white hover:bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200 no-underline">
          Gérer dans Prélèvements SEPA →
        </a>
      </div>
      <Card padding="md" className="mb-3 !bg-sky-50/60 !border-sky-200">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Ce mois</div>
            <div className="font-display text-xl font-bold text-sky-700">{stats.totalCeMois.toFixed(2)}€</div>
            <div className="font-body text-[11px] text-slate-500">{stats.countCeMois} prélèvement{stats.countCeMois > 1 ? "s" : ""}</div>
          </div>
          <div>
            <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Date passée, pas en remise</div>
            <div className={`font-display text-xl font-bold ${stats.countNonRemis > 0 ? "text-red-500" : "text-slate-300"}`}>{stats.totalNonRemis.toFixed(2)}€</div>
            <div className="font-body text-[11px] text-slate-500">{stats.countNonRemis} prélèvement{stats.countNonRemis > 1 ? "s" : ""}</div>
          </div>
          <div>
            <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Total à venir</div>
            <div className="font-display text-xl font-bold text-blue-800">{stats.total.toFixed(2)}€</div>
          </div>
          <div>
            <div className="font-body text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Familles</div>
            <div className="font-display text-xl font-bold text-blue-800">{stats.nbFamilles}</div>
          </div>
        </div>
        <p className="font-body text-[11px] text-slate-500 mt-3">
          Rien à encaisser ici : ces montants sont prélevés par la remise bancaire, à créer dans Prélèvements SEPA.
        </p>
      </Card>

      {familles.length === 0 ? (
        <p className="font-body text-sm text-slate-500 text-center py-4">Aucun prélèvement SEPA pour cette recherche.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {familles.map(f => {
            const cle = f.familyId || f.familyName;
            const ouverte = ouvertes.has(cle);
            return (
              <Card key={cle} padding="sm" className="!border-sky-100">
                <button type="button" onClick={() => basculer(cle)}
                  className="w-full flex items-center justify-between gap-3 bg-transparent border-none cursor-pointer p-0 text-left">
                  <div className="min-w-0 font-body text-sm">
                    <span className="font-semibold text-blue-800">{f.familyName}</span>
                    <span className="text-slate-500"> · {f.lignes.length} prélèvement{f.lignes.length > 1 ? "s" : ""} · {f.total.toFixed(2)}€ · prochain le {dateFr(f.prochaineDate)}</span>
                    {f.mandats.length > 1 && <span className="text-slate-500"> · {f.mandats.length} mandats</span>}
                    {f.nbNonRemis > 0 && <span className="text-red-600 font-semibold"> · ⚠️ {f.nbNonRemis} date passée, pas en remise</span>}
                  </div>
                  <span className="font-body text-xs text-slate-400 shrink-0">{ouverte ? "▲" : "▼"}</span>
                </button>
                {ouverte && (
                  <div className="mt-2 flex flex-col gap-1">
                    {f.lignes.map(l => (
                      <div key={l.id} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg font-body text-xs ${l.nonRemis ? "bg-red-50" : "bg-sky-50/60"}`}>
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-700">{dateFr(l.dateEcheance)}</span>
                          <span className="text-slate-500"> · {l.description || (l.echeancesTotal ? `Échéance ${l.echeance}/${l.echeancesTotal}` : "Prélèvement")}</span>
                          {l.mandatId && <span className="text-slate-400"> · {l.mandatId}</span>}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className={`text-[10px] font-semibold ${l.nonRemis ? "text-red-600" : l.status === "remis" ? "text-green-600" : "text-slate-400"}`}>
                            {l.nonRemis ? "Pas en remise" : l.status === "remis" ? "En remise" : "Programmé"}
                          </span>
                          <span className="font-semibold text-blue-800">{(Number(l.montant) || 0).toFixed(2)}€</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
