"use client";
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { Loader2, Download, AlertTriangle, FileSpreadsheet } from "lucide-react";
import {
  ventiler, compteDeLigne, libelleCompte, baseHT, versCsv, NON_VENTILE,
  type LigneFacture,
} from "@/lib/ventilation-comptable";

/**
 * Export du chiffre d'affaires ventilé par compte comptable.
 *
 * Base retenue : les FACTURES ÉMISES sur la période (créances acquises), pas
 * les encaissements — c'est la base du compte de résultat. Les factures
 * annulées sont exclues ; les factures non réglées sont incluses par défaut,
 * et peuvent être écartées pour un comptable qui travaille sur encaissements.
 */

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dateDe(p: any): Date | null {
  const d = p?.date?.seconds ? new Date(p.date.seconds * 1000) : p?.date ? new Date(p.date) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

export default function ExportCaPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [mois, setMois] = useState<number | "all">("all");
  const [inclureNonReglees, setInclureNonReglees] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "payments"));
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const factures = useMemo(() => payments.filter(p => {
    if (p.status === "cancelled") return false;
    if (!inclureNonReglees && (p.paidAmount || 0) <= 0) return false;
    const d = dateDe(p);
    if (!d || d.getFullYear() !== annee) return false;
    return mois === "all" || d.getMonth() === mois;
  }), [payments, annee, mois, inclureNonReglees]);

  // Toutes les lignes des factures retenues, à plat.
  const lignes: (LigneFacture & { facture: any })[] = useMemo(
    () => factures.flatMap(p => (p.items || []).map((i: any) => ({ ...i, facture: p }))),
    [factures],
  );

  const ventilation = useMemo(() => ventiler(lignes), [lignes]);
  const totalTTC = ventilation.reduce((s, l) => s + l.ttc, 0);
  const totalHT = ventilation.reduce((s, l) => s + l.ht, 0);
  const nonVentile = ventilation.filter(l => l.compte === NON_VENTILE);
  const totalNonVentile = nonVentile.reduce((s, l) => s + l.ttc, 0);

  // Écart entre le total des factures et la somme de leurs lignes : une remise
  // posée sur la facture n'apparaît dans aucune ligne. Signalé plutôt que noyé.
  const totalFactures = factures.reduce((s, p) => s + Number(p.totalTTC || 0), 0);
  const ecart = Math.round((totalFactures - totalTTC) * 100) / 100;

  const periode = mois === "all" ? `${annee}` : `${MOIS[mois as number]} ${annee}`;

  const telecharger = (nom: string, contenu: string) => {
    const blob = new Blob([contenu], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportRecap = () => {
    telecharger(
      `CA-ventile-${mois === "all" ? annee : `${annee}-${String((mois as number) + 1).padStart(2, "0")}`}.csv`,
      versCsv(
        ["Compte", "Libellé", "Taux TVA", "Base HT", "TVA", "Total TTC", "Nb lignes"],
        ventilation.map(l => [l.compte, l.libelle, `${l.taux}%`, l.ht, l.tvaMontant, l.ttc, l.nb]),
      ),
    );
  };

  const exportDetail = () => {
    telecharger(
      `CA-detail-${mois === "all" ? annee : `${annee}-${String((mois as number) + 1).padStart(2, "0")}`}.csv`,
      versCsv(
        ["Date", "N° commande", "Client", "Prestation", "Compte", "Libellé compte", "Origine du compte", "Taux TVA", "Base HT", "TVA", "TTC"],
        lignes.filter(l => Number(l.priceTTC || 0) !== 0).map(l => {
          const { code, source } = compteDeLigne(l);
          const ttc = Number(l.priceTTC || 0);
          const taux = Number(l.tva || 0);
          const ht = baseHT(ttc, taux);
          const d = dateDe(l.facture);
          return [
            d ? d.toLocaleDateString("fr-FR") : "",
            l.facture.orderId || l.facture.id,
            l.facture.familyName || "",
            l.activityTitle || "",
            code === NON_VENTILE ? "" : code,
            libelleCompte(code),
            source,
            `${taux}%`,
            ht,
            Math.round((ttc - ht) * 100) / 100,
            ttc,
          ];
        }),
      ),
    );
  };

  const champ = "px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Export CA ventilé</h1>
        <p className="font-body text-sm text-slate-500 mt-1">
          Chiffre d&apos;affaires par compte comptable et par taux de TVA, à transmettre au comptable.
        </p>
      </div>

      <Card padding="md" className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Année</label>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))} className={champ}>
              {[0, 1, 2, 3].map(i => {
                const a = new Date().getFullYear() - i;
                return <option key={a} value={a}>{a}</option>;
              })}
            </select>
          </div>
          <div>
            <label className="block font-body text-xs font-semibold text-slate-700 mb-1">Période</label>
            <select value={String(mois)} onChange={e => setMois(e.target.value === "all" ? "all" : Number(e.target.value))} className={champ}>
              <option value="all">Année entière</option>
              {MOIS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 font-body text-xs text-slate-700 pb-2 cursor-pointer">
            <input type="checkbox" checked={inclureNonReglees} onChange={e => setInclureNonReglees(e.target.checked)} />
            Inclure les factures non réglées
          </label>
          <div className="flex-1" />
          <button onClick={exportRecap} disabled={ventilation.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-600 border-none cursor-pointer hover:bg-blue-700 disabled:opacity-50">
            <FileSpreadsheet size={16} /> Récapitulatif CSV
          </button>
          <button onClick={exportDetail} disabled={lignes.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold text-blue-700 bg-blue-50 border-none cursor-pointer hover:bg-blue-100 disabled:opacity-50">
            <Download size={16} /> Détail ligne à ligne
          </button>
        </div>
        <p className="font-body text-[11px] text-slate-500 mt-3">
          Base : <strong>factures émises</strong> sur la période (créances acquises), annulées exclues.
          Si votre comptable travaille sur les encaissements, décochez les factures non réglées — ou demandez-moi un export sur base encaissements.
        </p>
      </Card>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          {totalNonVentile > 0 && (
            <Card padding="md" className="mb-5 !bg-amber-50 !border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-body text-sm font-bold text-amber-900">
                    {totalNonVentile.toFixed(2)}€ non ventilés
                  </div>
                  <p className="font-body text-xs text-amber-800 mt-0.5">
                    Ces lignes n&apos;ont ni compte, ni catégorie, ni libellé reconnaissable — elles sont
                    laissées à part plutôt que rangées au hasard. Ouvrez le détail ligne à ligne pour les
                    identifier : le plus souvent, il suffit de renseigner la catégorie sur la prestation d&apos;origine.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {Math.abs(ecart) > 0.01 && (
            <Card padding="sm" className="mb-5 !bg-orange-50 !border-orange-200">
              <p className="font-body text-xs text-orange-800">
                <strong>Écart de {ecart.toFixed(2)}€</strong> entre le total des factures ({totalFactures.toFixed(2)}€)
                et la somme de leurs lignes ({totalTTC.toFixed(2)}€). Cause habituelle : une remise posée sur la facture
                entière, qui n&apos;apparaît sur aucune ligne. À signaler au comptable.
              </p>
            </Card>
          )}

          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-body text-sm font-semibold text-blue-800">Ventilation — {periode}</h2>
              <div className="font-body text-xs text-slate-500">{factures.length} facture(s) · {lignes.length} ligne(s)</div>
            </div>
            {ventilation.length === 0 ? (
              <p className="font-body text-sm text-slate-500 text-center py-6">Aucune facture sur cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full font-body text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-gray-100">
                      <th className="py-2 pr-3">Compte</th>
                      <th className="py-2 pr-3">Libellé</th>
                      <th className="py-2 pr-3 text-center">TVA</th>
                      <th className="py-2 pr-3 text-right">Base HT</th>
                      <th className="py-2 pr-3 text-right">TVA</th>
                      <th className="py-2 pr-3 text-right">Total TTC</th>
                      <th className="py-2 text-right">Lignes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventilation.map(l => (
                      <tr key={`${l.compte}-${l.taux}`} className={`border-b border-gray-50 ${l.compte === NON_VENTILE ? "bg-amber-50/60" : ""}`}>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-600">{l.compte === NON_VENTILE ? "—" : l.compte}</td>
                        <td className="py-2 pr-3 text-slate-700">{l.libelle}</td>
                        <td className="py-2 pr-3 text-center text-slate-500">{l.taux}%</td>
                        <td className="py-2 pr-3 text-right text-slate-700">{l.ht.toFixed(2)}€</td>
                        <td className="py-2 pr-3 text-right text-slate-500">{l.tvaMontant.toFixed(2)}€</td>
                        <td className="py-2 pr-3 text-right font-semibold text-blue-800">{l.ttc.toFixed(2)}€</td>
                        <td className="py-2 text-right text-slate-400">{l.nb}</td>
                      </tr>
                    ))}
                    <tr className="font-bold text-blue-800">
                      <td className="py-2.5 pr-3" colSpan={3}>Total</td>
                      <td className="py-2.5 pr-3 text-right">{totalHT.toFixed(2)}€</td>
                      <td className="py-2.5 pr-3 text-right">{(totalTTC - totalHT).toFixed(2)}€</td>
                      <td className="py-2.5 pr-3 text-right">{totalTTC.toFixed(2)}€</td>
                      <td className="py-2.5 text-right">{lignes.length}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card padding="sm" className="mt-4 !bg-slate-50">
            <p className="font-body text-[11px] text-slate-600">
              <strong>Comment le compte est déterminé</strong>, du plus fiable au moins fiable : le compte posé sur la
              ligne (caisse, récurrences) ; à défaut sa catégorie ; à défaut le type d&apos;activité (cours, stage,
              balade…) ; à défaut des mots-clés du libellé (licence, adhésion, pension, forfait…) ; sinon la ligne est
              laissée « à ventiler ». La colonne <em>Origine du compte</em> de l&apos;export détaillé indique la règle
              appliquée à chaque ligne — de quoi faire valider les correspondances par votre comptable.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
