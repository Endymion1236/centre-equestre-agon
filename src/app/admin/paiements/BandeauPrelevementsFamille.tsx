"use client";
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui";
import { prelevementsDeLaFamille, type EcheanceSepaResume } from "./prelevements-famille-utils";

const dateFr = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR") : "");

/**
 * Impayés filtrés sur une famille : ses commandes réglées par prélèvement SEPA
 * n'y figurent pas (règlement en cours). L'encart dit où elles sont passées
 * et mène à leur échéancier, dans Prélèvements SEPA.
 */
export function BandeauPrelevementsFamille({ familyId, familyName, payments }: {
  familyId: string;
  familyName: string;
  payments: any[];
}) {
  const [echeances, setEcheances] = useState<EcheanceSepaResume[] | null>(null);

  useEffect(() => {
    let annule = false;
    setEcheances(null);
    getDocs(query(collection(db, "echeances-sepa"), where("familyId", "==", familyId)))
      .then(snap => { if (!annule) setEcheances(snap.docs.map(d => ({ id: d.id, ...d.data() }) as EcheanceSepaResume)); })
      .catch(e => { console.warn("[impayés] échéances SEPA:", e); if (!annule) setEcheances([]); });
    return () => { annule = true; };
  }, [familyId, payments]);

  const resume = useMemo(
    () => (echeances ? prelevementsDeLaFamille(familyId, payments, echeances) : null),
    [familyId, payments, echeances],
  );
  if (!resume || (resume.commandes.length === 0 && resume.echeancesSansCommande === 0)) return null;

  const lienEcheancier = `/admin/sepa?tab=echeancier&q=${encodeURIComponent(familyName)}`;

  return (
    <Card padding="sm" className="mb-3 !bg-sky-50/60 !border-sky-200">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="font-body text-xs font-semibold text-sky-900 uppercase tracking-wide">
          🏦 Réglé par prélèvement SEPA — hors impayés
        </div>
        <a href={lienEcheancier}
          className="shrink-0 font-body text-xs font-semibold text-sky-800 bg-white hover:bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-200 no-underline">
          Voir l&apos;échéancier →
        </a>
      </div>
      <div className="flex flex-col gap-1">
        {resume.commandes.map(c => (
          <div key={c.paymentId} className="font-body text-sm text-slate-700">
            <span className="font-semibold">{c.libelle}</span>
            <span className="text-slate-500"> · {c.totalTTC.toFixed(2)}€</span>
            {c.sansEcheance ? (
              <span className="text-red-600 font-semibold"> · ⚠️ marquée SEPA mais aucune échéance à prélever : rien ne sera prélevé. Recréez l&apos;échéancier dans Prélèvements SEPA.</span>
            ) : (
              <span className="text-slate-600">
                {" "}· {c.aVenir} prélèvement{c.aVenir > 1 ? "s" : ""} à venir ({c.montantAVenir.toFixed(2)}€)
                {c.prochaineDate && <> · prochain le {dateFr(c.prochaineDate)}</>}
                {c.mandats.length > 1 && <> · réparti sur {c.mandats.length} mandats</>}
              </span>
            )}
          </div>
        ))}
        {resume.echeancesSansCommande > 0 && (
          <div className="font-body text-xs text-slate-500">
            + {resume.echeancesSansCommande} prélèvement{resume.echeancesSansCommande > 1 ? "s" : ""} à venir sans commande rattachée (échéancier saisi directement dans Prélèvements SEPA).
          </div>
        )}
      </div>
    </Card>
  );
}
