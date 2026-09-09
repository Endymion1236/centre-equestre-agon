"use client";
import Link from "next/link";
import { Card } from "@/components/ui";
import { calculerTvaTrimestre, type EntreeTvaAPayer } from "@/lib/tva-a-payer";

/**
 * La TVA du trimestre d'un coup d'œil : collectée − déductible justifiée =
 * à payer, trimestre civil (déclaration trimestrielle), avec le détail mois
 * par mois. Même calcul sur la page Clôture du mois et dans Comptabilité →
 * TVA (lib/tva-a-payer).
 */
export default function EncartTvaAPayer({ moisReference, parMois, chargement }: {
  moisReference: string;
  /** Chiffres de chaque mois du trimestre ; absent ou null = pas encore lu. */
  parMois: Record<string, EntreeTvaAPayer | null | undefined>;
  chargement?: boolean;
}) {
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const nomMois = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long" });
  const r = calculerTvaTrimestre(moisReference, parMois);
  const total = r.parMois.every((d) => !d.resultat);
  return (
    <Card padding="md" className="mb-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="font-body text-sm font-semibold text-slate-800">TVA du trimestre {r.trimestre.libelle} <span className="font-normal text-slate-500">({r.trimestre.periode})</span></div>
        <div className="font-body text-[11px] text-slate-400">estimation de préparation — la déclaration reste établie par la comptable</div>
      </div>
      {chargement && total ? (
        <p className="font-body text-xs text-slate-500 mt-2">Lecture des dépenses des trois mois…</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
              <div className="font-body text-[10px] font-semibold uppercase tracking-wide text-orange-700">Collectée sur les ventes</div>
              <div className="font-display text-xl font-bold text-orange-600">{eur(r.collectee)}</div>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2">
              <div className="font-body text-[10px] font-semibold uppercase tracking-wide text-green-700">Déductible, facture à l&apos;appui</div>
              <div className="font-display text-xl font-bold text-green-700">− {eur(r.deductible)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 border ${r.credit > 0 ? "bg-blue-50 border-blue-100" : "bg-slate-800 border-slate-800"}`}>
              <div className={`font-body text-[10px] font-semibold uppercase tracking-wide ${r.credit > 0 ? "text-blue-700" : "text-slate-300"}`}>{r.credit > 0 ? "Crédit de TVA" : "À payer"}{r.moisManquants.length ? " (partiel)" : ""}</div>
              <div className={`font-display text-xl font-bold ${r.credit > 0 ? "text-blue-700" : "text-white"}`}>{eur(r.credit > 0 ? r.credit : r.aPayer)}</div>
            </div>
          </div>
          <table className="mt-3 w-full font-body text-xs">
            <thead><tr className="text-slate-400"><th className="text-left font-semibold py-1">Mois</th><th className="text-right font-semibold">Collectée</th><th className="text-right font-semibold">Déductible</th><th className="text-right font-semibold">Solde</th><th className="text-right font-semibold">À vérifier</th></tr></thead>
            <tbody>
              {r.parMois.map((d) => (
                <tr key={d.mois} className={`border-t border-gray-100 ${d.mois === moisReference ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                  <td className="py-1 capitalize">{nomMois(d.mois)}</td>
                  {d.resultat ? (
                    <>
                      <td className="text-right">{eur(d.resultat.collectee)}</td>
                      <td className="text-right">− {eur(d.resultat.deductible)}</td>
                      <td className="text-right">{d.resultat.credit > 0 ? `crédit ${eur(d.resultat.credit)}` : eur(d.resultat.aPayer)}</td>
                      <td className="text-right text-amber-700">{d.resultat.aVerifierNb ? `${d.resultat.aVerifierNb} ligne${d.resultat.aVerifierNb > 1 ? "s" : ""} · ${eur(d.resultat.aVerifierTtc)}` : "—"}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="text-right text-slate-400 italic">pas encore de chiffres{chargement ? " (lecture en cours…)" : ""}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {r.aVerifierNb > 0 && (
            <p className="font-body text-xs text-amber-800 mt-3">
              ⚠️ {r.aVerifierNb} dépense{r.aVerifierNb > 1 ? "s" : ""} ({eur(r.aVerifierTtc)} TTC) sans TVA vérifiée sur le trimestre : rien n&apos;en est déduit pour l&apos;instant.
              Avec des factures à 20 %, ce serait jusqu&apos;à {eur(r.deductiblePotentielle)} de moins à payer.
              {" "}<Link href="/admin/comptabilite/depenses" className="underline">Voir les dépenses</Link>
            </p>
          )}
          <p className="font-body text-[11px] text-slate-400 mt-2">
            Collectée : ventes du mois, comme l&apos;onglet Comptabilité → TVA. Déductible : uniquement la TVA prouvée par une pièce associée sur la page Dépenses.
          </p>
        </>
      )}
    </Card>
  );
}
