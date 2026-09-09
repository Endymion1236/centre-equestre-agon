"use client";
import Link from "next/link";
import { Card } from "@/components/ui";
import { calculerTvaAPayer, type EntreeTvaAPayer } from "@/lib/tva-a-payer";

/**
 * La TVA du mois d'un coup d'œil : collectée − déductible justifiée = à payer.
 * Même calcul sur la page Clôture du mois et dans Comptabilité → TVA
 * (lib/tva-a-payer).
 */
export default function EncartTvaAPayer({ mois, entree, indisponible }: { mois: string; entree: EntreeTvaAPayer | null; indisponible?: string }) {
  const eur = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  if (!entree) {
    return <Card padding="md" className="mb-4"><div className="font-body text-sm font-semibold text-slate-800">TVA du mois</div><p className="font-body text-xs text-slate-500 mt-1">{indisponible || "Chiffres indisponibles pour ce mois."}</p></Card>;
  }
  const r = calculerTvaAPayer(entree);
  return (
    <Card padding="md" className="mb-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="font-body text-sm font-semibold text-slate-800">TVA du mois, d&apos;un coup d&apos;œil</div>
        <div className="font-body text-[11px] text-slate-400">estimation de préparation — la déclaration reste établie par la comptable</div>
      </div>
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
          <div className={`font-body text-[10px] font-semibold uppercase tracking-wide ${r.credit > 0 ? "text-blue-700" : "text-slate-300"}`}>{r.credit > 0 ? "Crédit de TVA" : "À payer"}</div>
          <div className={`font-display text-xl font-bold ${r.credit > 0 ? "text-blue-700" : "text-white"}`}>{eur(r.credit > 0 ? r.credit : r.aPayer)}</div>
        </div>
      </div>
      {r.aVerifierNb > 0 && (
        <p className="font-body text-xs text-amber-800 mt-3">
          ⚠️ {r.aVerifierNb} dépense{r.aVerifierNb > 1 ? "s" : ""} ({eur(r.aVerifierTtc)} TTC) sans TVA vérifiée : rien n&apos;en est déduit pour l&apos;instant.
          Avec une facture à 20 %, ce serait jusqu&apos;à {eur(r.deductiblePotentielle)} de moins à payer.
          {" "}<Link href="/admin/comptabilite/depenses" className="underline">Voir ces lignes</Link>
        </p>
      )}
      <p className="font-body text-[11px] text-slate-400 mt-2">
        Collectée : ventes du mois, comme l&apos;onglet Comptabilité → TVA. Déductible : uniquement la TVA prouvée par une pièce associée sur la page Dépenses.
      </p>
    </Card>
  );
}
