"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { Loader2 } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { euroDeclaration, type BaseTva, type ResultatDeclarationTva } from "@/lib/declaration-tva";
import { trimestreDe } from "@/lib/tva-a-payer";

/**
 * Préparer la déclaration de TVA (CA3) : les chiffres case par case, à
 * recopier sur impots.gouv.fr. Calcul serveur (api/admin/tva/declaration →
 * lib/declaration-tva), sur les encaissements et sur les factures, pour voir
 * l'écart tant que le cabinet n'a pas tranché la base.
 */
/** Cases où l'on saisit une base hors taxe (les autres : un montant de taxe). */
const CASES_EN_BASE = new Set(["A1", "E2", "08", "9B", "09"]);

export default function PreparationDeclarationTva({ moisReference }: { moisReference: string }) {
  const [periode, setPeriode] = useState<"trimestre" | "mois">("trimestre");
  const [base, setBase] = useState<BaseTva>("encaissements");
  const [credit, setCredit] = useState("");
  const [donnees, setDonnees] = useState<{ cle: string; encaissements: ResultatDeclarationTva; factures: ResultatDeclarationTva } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = `${moisReference}|${periode}|${credit}`;

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(moisReference)) return;
    let actif = true;
    setErreur(null);
    // Petit délai : la saisie du crédit ne relance pas un calcul à chaque chiffre.
    const minuterie = setTimeout(() => {
      authFetch(`/api/admin/tva/declaration?mois=${moisReference}&periode=${periode}&credit=${encodeURIComponent(credit)}`)
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!actif) return;
          if (!res.ok || !data?.encaissements) { setErreur(data?.error || `erreur ${res.status}`); return; }
          setDonnees({ cle, encaissements: data.encaissements, factures: data.factures });
        })
        .catch((e) => { if (actif) setErreur(e?.message || "erreur réseau"); });
    }, 400);
    return () => { actif = false; clearTimeout(minuterie); };
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps

  const eur = (n: number | undefined) => n === undefined ? "" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const entier = (n: number | undefined) => n === undefined ? "" : euroDeclaration(n).toLocaleString("fr-FR");
  const nomMois = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const libellePeriode = periode === "trimestre" ? `${trimestreDe(moisReference).libelle} (${trimestreDe(moisReference).periode})` : nomMois(moisReference);
  const pret = donnees && donnees.cle === cle;
  const r = pret ? donnees[base] : null;
  const autre = pret ? donnees[base === "encaissements" ? "factures" : "encaissements"] : null;
  const aPayer = (x: ResultatDeclarationTva) => x.netteDue - x.credit;
  const ecart = r && autre ? Math.round((aPayer(r) - aPayer(autre)) * 100) / 100 : 0;

  const bouton = (actif: boolean) => `font-body text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer ${actif ? "bg-blue-500 text-white border-blue-500" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"}`;

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h3 className="font-body text-base font-semibold text-blue-800">Préparer ma déclaration de TVA (CA3)</h3>
        <div className="font-body text-[11px] text-slate-400">à recopier sur impots.gouv.fr → Espace professionnel → Déclarer → TVA</div>
      </div>
      <p className="font-body text-xs text-slate-500 mt-1">
        Période : <strong className="text-slate-700">{libellePeriode}</strong>. Les montants à saisir sont en euros entiers.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" className={bouton(periode === "trimestre")} onClick={() => setPeriode("trimestre")}>Trimestre</button>
        <button type="button" className={bouton(periode === "mois")} onClick={() => setPeriode("mois")}>Mois</button>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" className={bouton(base === "encaissements")} onClick={() => setBase("encaissements")}>Sur les encaissements</button>
        <button type="button" className={bouton(base === "factures")} onClick={() => setBase("factures")}>Sur les factures</button>
        <label className="font-body text-xs text-slate-600 flex items-center gap-1.5 ml-auto">
          Crédit reporté (ligne 22)
          <input value={credit} onChange={(e) => setCredit(e.target.value)} inputMode="decimal" placeholder="0"
            className="w-20 px-2 py-1 rounded-lg border border-slate-200 font-body text-xs text-right" />
        </label>
      </div>

      {erreur ? (
        <p className="font-body text-xs text-red-600 mt-3">Préparation indisponible : {erreur}</p>
      ) : !r || !autre ? (
        <p className="font-body text-xs text-slate-500 mt-3 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Calcul des ventes, encaissements et achats…</p>
      ) : (
        <>
          <p className="font-body text-xs text-slate-600 mt-3 leading-relaxed">
            {base === "encaissements"
              ? "Base « encaissements » : la TVA des sommes reçues dans la période (règle des prestations de services). Un acompte porte sa part de TVA, un remboursement la réduit."
              : "Base « factures » : la TVA des factures émises dans la période, même non payées (option pour les débits)."}
            {" "}À valider avec la comptable avant la première déclaration.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full font-body text-xs min-w-[480px]">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="font-semibold py-1 w-12">Case</th>
                  <th className="font-semibold">Libellé</th>
                  <th className="font-semibold text-right">Base HT</th>
                  <th className="font-semibold text-right">TVA</th>
                  <th className="font-semibold text-right pl-3">À saisir</th>
                </tr>
              </thead>
              <tbody>
                {r.cases.map((c, i) => {
                  const total = c.code === "28" || c.code === "25";
                  return (
                    <tr key={`${c.code}-${i}`} className={`border-t border-gray-100 ${total ? "font-semibold text-slate-900 bg-slate-50" : "text-slate-700"}`}>
                      <td className={`py-1.5 font-semibold ${c.code === "?" ? "text-amber-600" : "text-blue-700"}`}>{c.code}</td>
                      <td>{c.libelle}</td>
                      <td className="text-right text-slate-500">{eur(c.base)}</td>
                      <td className="text-right">{eur(c.tva)}</td>
                      <td className="text-right pl-3 font-semibold text-blue-800">{c.code === "?" ? "—" : entier(CASES_EN_BASE.has(c.code) ? c.base : c.tva)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="font-body text-[11px] text-slate-400 mt-1">
            Cases A1, E2, 08, 9B et 09 : on saisit la base hors taxe ; pour 08, 9B et 09 le site calcule la taxe, à comparer à la colonne TVA.
            Les lignes 16 à 28 se saisissent en montant de taxe.
          </p>

          <div className={`mt-3 rounded-lg px-3 py-2 border font-body text-xs ${Math.abs(ecart) >= 1 ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
            {base === "encaissements" ? "Sur les factures" : "Sur les encaissements"}, le même calcul donnerait{" "}
            <strong>{autre.credit > 0 ? `un crédit de ${eur(autre.credit)}` : `${eur(autre.netteDue)} à payer`}</strong>
            {Math.abs(ecart) >= 0.01 ? <> — écart de <strong>{eur(Math.abs(ecart))}</strong>{ecart > 0 ? " de plus avec la base choisie" : " de moins avec la base choisie"}.</> : " — aucun écart."}
          </div>

          {r.sources.some((s) => s.source === "celeris") && (
            <p className="font-body text-[11px] text-slate-500 mt-2">
              Ventes reprises de Céleris pour : {r.sources.filter((s) => s.source === "celeris").map((s) => nomMois(s.mois)).join(", ")}.
            </p>
          )}

          {r.ecartes.length > 0 && (
            <div className="mt-3">
              <div className="font-body text-xs font-semibold text-slate-700 mb-1">Encaissements laissés de côté</div>
              <ul className="font-body text-xs text-slate-600 list-disc pl-5">
                {r.ecartes.map((e) => <li key={e.raison}>{e.raison} : {e.nb} · {eur(e.montant)}</li>)}
              </ul>
            </div>
          )}
          {r.anomalies.length > 0 && (
            <div className="mt-3">
              <div className="font-body text-xs font-semibold text-amber-800 mb-1">À vérifier avant de déclarer</div>
              <ul className="font-body text-xs text-amber-900 list-disc pl-5">
                {r.anomalies.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
