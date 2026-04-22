"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, Badge } from "@/components/ui";
import { ArrowLeft, Search } from "lucide-react";

interface EncDiag {
  id: string;
  date: Date | null;
  montant: number;
  mode: string;
  modeLabel?: string;
  familyName?: string;
  activityTitle?: string;
  remiseId?: string;
  paymentId?: string;
  raison?: string;
  correctionDe?: string;
  isAvoir?: boolean;
  avoirRef?: string;
  isReversalRaw?: string;
}

interface RemiseDiag {
  id: string;
  date?: any;
  total?: number;
  paymentMode?: string;
  encaissementIds?: string[];
  paymentIds?: string[];
  status?: string;
}

export default function DiagEspecesPage() {
  const [encs, setEncs] = useState<EncDiag[]>([]);
  const [remises, setRemises] = useState<RemiseDiag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [encSnap, remSnap] = await Promise.all([
        getDocs(query(collection(db, "encaissements"), where("mode", "==", "especes"))),
        getDocs(collection(db, "remises")),
      ]);

      const allEncs: EncDiag[] = encSnap.docs.map(d => {
        const x = d.data() as any;
        const rawDate = x.date || x.createdAt;
        const dt = rawDate?.seconds
          ? new Date(rawDate.seconds * 1000)
          : rawDate?.toDate
            ? rawDate.toDate()
            : null;
        return {
          id: d.id,
          date: dt,
          montant: Number(x.montant || 0),
          mode: x.mode || "?",
          modeLabel: x.modeLabel,
          familyName: x.familyName || "—",
          activityTitle: x.activityTitle || "",
          remiseId: x.remiseId,
          paymentId: x.paymentId,
          raison: x.raison,
          correctionDe: x.correctionDe,
          isAvoir: !!x.isAvoir,
          avoirRef: x.avoirRef,
          isReversalRaw: x.montant < 0 ? "négatif" : undefined,
        };
      }).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

      setEncs(allEncs);
      setRemises(remSnap.docs.map(d => ({ id: d.id, ...d.data() } as RemiseDiag)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Calculs
  const totalBrut = encs.reduce((s, e) => s + e.montant, 0);
  const totalPositif = encs.filter(e => e.montant > 0).reduce((s, e) => s + e.montant, 0);
  const totalNegatif = encs.filter(e => e.montant < 0).reduce((s, e) => s + e.montant, 0);

  const avecRemise = encs.filter(e => e.remiseId);
  const totalRemis = avecRemise.reduce((s, e) => s + e.montant, 0);

  const sansRemise = encs.filter(e => !e.remiseId);
  const totalSansRemise = sansRemise.reduce((s, e) => s + e.montant, 0);

  // Remises espèces (celles qui touchent au moins 1 encaissement espèces)
  const encIds = new Set(encs.map(e => e.id));
  const remisesEspeces = remises.filter(r =>
    (r.encaissementIds || []).some(id => encIds.has(id)) ||
    r.paymentMode === "especes"
  );

  // Encaissements remis selon les remises
  const allRemisIds = new Set(
    remisesEspeces.flatMap(r => r.encaissementIds || [])
  );
  const encsVusDansRemises = encs.filter(e => allRemisIds.has(e.id));
  const encsVusMaisSansRemiseId = encsVusDansRemises.filter(e => !e.remiseId);

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Search size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-amber-800">Diagnostic espèces</h1>
            <p className="font-body text-sm text-slate-500">Détail ligne-à-ligne de tous les encaissements espèces et de leur statut de remise.</p>
          </div>
        </div>
        <Link href="/admin/comptabilite"
          className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50 flex items-center gap-1.5">
          <ArrowLeft size={12} /> Comptabilité
        </Link>
      </div>

      {loading ? (
        <Card padding="md"><p className="text-slate-400 italic text-center py-6">Chargement...</p></Card>
      ) : (
        <>
          {/* Stats globales */}
          <Card padding="md" className="mb-4">
            <h2 className="font-display text-base font-bold text-blue-800 mb-3">Synthèse</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="font-body text-[10px] uppercase text-blue-600 mb-1">Total brut</div>
                <div className="font-display text-xl font-bold text-blue-800">{totalBrut.toFixed(2)}€</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{encs.length} ligne{encs.length > 1 ? "s" : ""}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="font-body text-[10px] uppercase text-green-600 mb-1">Entrées (+)</div>
                <div className="font-display text-xl font-bold text-green-800">+{totalPositif.toFixed(2)}€</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="font-body text-[10px] uppercase text-red-600 mb-1">Sorties (-)</div>
                <div className="font-display text-xl font-bold text-red-800">{totalNegatif.toFixed(2)}€</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="font-body text-[10px] uppercase text-amber-600 mb-1">Déjà remis</div>
                <div className="font-display text-xl font-bold text-amber-800">{totalRemis.toFixed(2)}€</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{avecRemise.length} ligne{avecRemise.length > 1 ? "s" : ""}</div>
              </div>
            </div>
            <div className="mt-3 p-3 bg-slate-50 rounded-lg">
              <div className="font-body text-sm text-slate-700">
                <strong>Encaissements sans remise : {totalSansRemise.toFixed(2)}€</strong> ({sansRemise.length} ligne{sansRemise.length > 1 ? "s" : ""})
              </div>
              <div className="font-body text-xs text-slate-500 mt-1">
                C'est la valeur qui doit apparaître dans le bordereau "À remettre" pour le mode Espèces.
              </div>
            </div>
          </Card>

          {/* Remises espèces */}
          <Card padding="md" className="mb-4">
            <h2 className="font-display text-base font-bold text-blue-800 mb-3">Remises espèces ({remisesEspeces.length})</h2>
            {remisesEspeces.length === 0 ? (
              <p className="font-body text-sm text-slate-400 italic">Aucune remise espèces enregistrée.</p>
            ) : (
              <div className="space-y-2">
                {remisesEspeces.map(r => (
                  <div key={r.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-body text-sm font-semibold text-blue-800">
                          {r.date?.seconds ? new Date(r.date.seconds * 1000).toLocaleDateString("fr-FR") : "—"}
                        </div>
                        <div className="font-body text-xs text-slate-500">
                          {r.encaissementIds?.length || 0} encaissements · {r.paymentMode}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 mt-1">{r.id}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-lg font-bold text-blue-800">{(r.total || 0).toFixed(2)}€</div>
                        <Badge color={r.status === "pointed" ? "green" : "orange"}>{r.status || "?"}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Liste complète */}
          <Card padding="md">
            <h2 className="font-display text-base font-bold text-blue-800 mb-3">Tous les encaissements espèces ({encs.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-body text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-200">
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase">Date</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase">Famille</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase">Libellé</th>
                    <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase">Montant</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase">Statut</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase">Remarques</th>
                  </tr>
                </thead>
                <tbody>
                  {encs.map(e => (
                    <tr key={e.id} className={`border-b border-gray-100 ${e.montant < 0 ? "bg-red-50/30" : ""}`}>
                      <td className="px-2 py-2 text-xs">
                        {e.date ? e.date.toLocaleDateString("fr-FR") : <span className="text-red-500 italic">pas de date</span>}
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-700">{e.familyName}</td>
                      <td className="px-2 py-2 text-xs text-slate-600 max-w-xs truncate">{e.activityTitle}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${e.montant < 0 ? "text-red-600" : "text-blue-800"}`}>
                        {e.montant >= 0 ? "+" : ""}{e.montant.toFixed(2)}€
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {e.remiseId ? (
                          <Badge color="green">Remis</Badge>
                        ) : e.isAvoir ? (
                          <Badge color="purple">Avoir</Badge>
                        ) : e.correctionDe ? (
                          <Badge color="orange">Contre-pass.</Badge>
                        ) : e.montant > 0 ? (
                          <Badge color="orange">À remettre</Badge>
                        ) : (
                          <Badge color="gray">—</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-slate-500">
                        {e.raison && <div className="italic text-red-600">{e.raison}</div>}
                        {e.correctionDe && <div>corrige: {e.correctionDe.slice(0, 8)}…</div>}
                        {e.avoirRef && <div>avoir: {e.avoirRef}</div>}
                        {e.remiseId && <div>remise: {e.remiseId.slice(0, 8)}…</div>}
                        {e.modeLabel && e.modeLabel !== "Espèces" && <div className="text-amber-600">label: {e.modeLabel}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {encsVusMaisSansRemiseId.length > 0 && (
            <Card padding="md" className="mt-4 bg-red-50 border border-red-300">
              <h3 className="font-display text-sm font-bold text-red-800 mb-2">⚠️ Incohérences détectées</h3>
              <p className="font-body text-xs text-red-900">
                {encsVusMaisSansRemiseId.length} encaissement(s) sont référencés dans une remise
                (via <code>encaissementIds</code>) mais n'ont pas de champ <code>remiseId</code>.
                Ces encaissements apparaîtront à tort dans les "à remettre".
              </p>
              <ul className="mt-2 text-xs text-red-700 list-disc pl-5">
                {encsVusMaisSansRemiseId.map(e => (
                  <li key={e.id} className="font-mono">{e.id.slice(0, 12)}… — {e.familyName} — {e.montant.toFixed(2)}€</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
