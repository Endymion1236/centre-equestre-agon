"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  ventiler, NON_VENTILE,
  groupesNonVentiles, PLAN_COMPTABLE,
  type LigneFacture, type ReglesVentilation,
} from "@/lib/ventilation-comptable";
import {
  MOIS_EXPORT_CA as MOIS,
  aplatirLignesFactures,
  filtrerFacturesExport,
  libellePeriodeExport,
  resumerExportCa,
} from "./export-ca-utils";

/**
 * Les lignes restées « à ventiler », par libellé : un compte à choisir, et la
 * règle vaut pour toutes les lignes de ce libellé, passées et futures (export,
 * FEC, envoi mensuel au cabinet). Les factures elles-mêmes ne sont pas
 * modifiées : c'est leur classement comptable qui est précisé.
 */
function VentilerLignes({ groupes, onChoisir }: {
  groupes: { cle: string; libelle: string; nb: number; ttc: number; taux: number[] }[];
  onChoisir: (cle: string, code: string) => Promise<void>;
}) {
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  if (!groupes.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {groupes.map(g => {
        // Les comptes au même taux de TVA d'abord : le bon choix est presque toujours parmi eux.
        const memeTaux = PLAN_COMPTABLE.filter(c => g.taux.includes(c.tva));
        const autres = PLAN_COMPTABLE.filter(c => !g.taux.includes(c.tva));
        return (
          <div key={g.cle} className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2 font-body text-xs">
            <div className="flex-1 min-w-[180px]">
              <div className="font-semibold text-slate-800">{g.libelle}</div>
              <div className="text-slate-500">{g.nb} ligne{g.nb > 1 ? "s" : ""} · {g.ttc.toFixed(2)} € TTC · TVA {g.taux.map(t => `${String(t).replace(".", ",")} %`).join(", ")}</div>
            </div>
            <select value={choix[g.cle] || ""} onChange={e => setChoix(prev => ({ ...prev, [g.cle]: e.target.value }))}
              className="px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs max-w-full">
              <option value="">Choisir le compte…</option>
              <optgroup label="Même taux de TVA">
                {memeTaux.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </optgroup>
              {autres.length > 0 && (
                <optgroup label="Autres comptes">
                  {autres.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label} ({String(c.tva).replace(".", ",")} %)</option>)}
                </optgroup>
              )}
            </select>
            <button type="button" disabled={!choix[g.cle] || enCours === g.cle}
              onClick={async () => { setEnCours(g.cle); try { await onChoisir(g.cle, choix[g.cle]); } finally { setEnCours(null); } }}
              className="px-3 py-1.5 rounded-lg font-semibold text-white bg-amber-600 hover:bg-amber-700 border-none cursor-pointer disabled:opacity-50">
              {enCours === g.cle ? "…" : "Ventiler"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ventilation des ventes : chiffre d'affaires par compte comptable, et
 * classement des lignes restées « à ventiler » (le FEC du mois en hérite).
 * Base retenue : les factures émises sur la période, annulées exclues.
 */
export default function ExportCaPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [mois, setMois] = useState<number | "all">("all");
  const [inclureNonReglees, setInclureNonReglees] = useState(true);

  // Règles de ventilation posées ici (settings/ventilationVentes), partagées
  // avec le FEC et l'envoi mensuel au cabinet.
  const [regles, setRegles] = useState<ReglesVentilation>({});
  const [erreurRegle, setErreurRegle] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [snap, reglesSnap] = await Promise.all([
          getDocs(collection(db, "payments")),
          getDoc(doc(db, "settings", "ventilationVentes")).catch(() => null),
        ]);
        setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        const r = reglesSnap?.exists() ? (reglesSnap.data() as any)?.regles : null;
        if (r && typeof r === "object") setRegles(r);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const enregistrerRegle = async (cle: string, code: string) => {
    setErreurRegle(null);
    try {
      await setDoc(doc(db, "settings", "ventilationVentes"), { regles: { [cle]: code }, updatedAt: serverTimestamp() }, { merge: true });
      setRegles(prev => ({ ...prev, [cle]: code }));
    } catch (e: any) {
      setErreurRegle(`Règle non enregistrée : ${e?.message || e}`);
    }
  };

  const factures = useMemo(
    () => filtrerFacturesExport(payments, annee, mois, inclureNonReglees),
    [payments, annee, mois, inclureNonReglees],
  );

  const lignes: (LigneFacture & { facture: any })[] = useMemo(
    () => aplatirLignesFactures(factures),
    [factures],
  );

  const ventilation = useMemo(() => ventiler(lignes, regles), [lignes, regles]);
  const aVentiler = useMemo(() => groupesNonVentiles(lignes, regles), [lignes, regles]);
  const {
    totalTTC,
    totalHT,
    totalNonVentile,
    totalFactures,
    ecart,
  } = useMemo(
    () => resumerExportCa(factures, ventilation, NON_VENTILE),
    [factures, ventilation],
  );

  const periode = libellePeriodeExport(annee, mois);

  const champ = "px-3 py-2 rounded-lg border border-gray-200 font-body text-sm bg-white";

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-blue-800">Ventilation des ventes</h1>
        <p className="font-body text-sm text-slate-500 mt-1">
          Chiffre d&apos;affaires par compte comptable et par taux de TVA. Les ventes restées « à ventiler »
          se classent ici ; le classement part avec le FEC du mois (Clôture du mois et envoi comptable).
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

        </div>
        <p className="font-body text-[11px] text-slate-500 mt-3">
          Base : <strong>factures émises</strong> sur la période, annulées exclues. Aucun fichier à envoyer d&apos;ici :
          le cabinet reçoit le FEC et les exports du mois par <Link href="/admin/comptabilite/cloture-mois" className="underline">Clôture du mois et envoi comptable</Link>.
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
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm font-bold text-amber-900">
                    {totalNonVentile.toFixed(2)}€ non ventilés
                  </div>
                  <p className="font-body text-xs text-amber-800 mt-0.5">
                    Ces lignes n&apos;ont ni compte, ni catégorie, ni libellé reconnaissable — elles sont
                    laissées à part plutôt que rangées au hasard. Choisissez le compte de chaque libellé
                    ci-dessous : le choix vaut pour toutes ses lignes, dans cet export, le FEC et l&apos;envoi
                    mensuel au cabinet. Les factures elles-mêmes ne changent pas.
                  </p>
                  {erreurRegle && <p className="font-body text-xs text-red-700 mt-1">{erreurRegle}</p>}
                  <VentilerLignes groupes={aVentiler} onChoisir={enregistrerRegle} />
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
              balade…) ; à défaut le compte que vous avez choisi pour ce libellé ; à défaut des mots-clés du libellé
              (licence, adhésion, pension, forfait…) ; sinon la ligne est laissée « à ventiler ».
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
