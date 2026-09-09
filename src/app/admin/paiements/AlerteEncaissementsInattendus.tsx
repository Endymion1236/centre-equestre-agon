"use client";
import { useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Encaissements CAWL arrivés alors qu'ils n'auraient pas dû : commande déjà
 * soldée (deux liens réglés), cumul au-delà du total, ou lien annulé mais
 * utilisé avant son expiration. Écrits par lib/cawl-inattendu ; l'argent a
 * bien été débité, il faut rembourser depuis le back-office CAWL puis
 * marquer l'entrée traitée ici.
 */

interface Entree {
  motif: "deja_solde" | "trop_percu" | "lien_annule";
  exces: number;
  montant: number;
  hostedCheckoutId: string;
  merchantRef?: string;
  source: "webhook" | "status";
  recuA: string;
  traite?: boolean;
}

const LIBELLES: Record<Entree["motif"], string> = {
  deja_solde: "commande déjà soldée — second lien réglé",
  trop_percu: "cumul au-delà du total — deux liens partiels réglés",
  lien_annule: "réglé via un lien que vous aviez annulé",
};

const quand = (iso: string) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

export function AlerteEncaissementsInattendus({
  payments, onTraite, toast,
}: {
  payments: any[];
  onTraite: (paymentId: string, restantes: Entree[]) => void;
  toast: (message: string, type?: "success" | "error" | "warning" | "info", duration?: number) => void;
}) {
  const [enCours, setEnCours] = useState("");

  const lignes = payments.flatMap((p: any) =>
    ((p.encaissementsInattendus || []) as Entree[])
      .filter((e) => !e.traite)
      .map((e) => ({ p, e })),
  );
  if (lignes.length === 0) return null;

  const traiter = async (p: any, e: Entree) => {
    const cle = `${p.id}:${e.hostedCheckoutId}:${e.recuA}`;
    setEnCours(cle);
    try {
      const toutes = ((p.encaissementsInattendus || []) as Entree[]);
      const maj = toutes.map((x) => (x.hostedCheckoutId === e.hostedCheckoutId && x.recuA === e.recuA ? { ...x, traite: true, traiteA: new Date().toISOString() } : x));
      const resteAVerifier = maj.some((x) => !x.traite);
      await updateDoc(doc(db, "payments", p.id), {
        encaissementsInattendus: maj,
        ...(resteAVerifier ? {} : { needsReview: deleteField() }),
      });
      onTraite(p.id, maj);
      toast("Marqué traité. Pensez à la contre-passation au journal si vous avez remboursé.", "success", 6000);
    } catch (err: any) {
      toast(err?.message || "Enregistrement impossible", "error");
    }
    setEnCours("");
  };

  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-display text-sm font-bold text-red-700">
            {lignes.length === 1 ? "Un encaissement en ligne à vérifier" : `${lignes.length} encaissements en ligne à vérifier`}
          </div>
          <p className="font-body text-xs text-red-800 mt-0.5">
            La famille a été débitée par CAWL alors que la commande n&apos;attendait pas ce règlement.
            Remboursez la somme en trop depuis le back-office CAWL, puis marquez la ligne traitée.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {lignes.map(({ p, e }) => {
              const cle = `${p.id}:${e.hostedCheckoutId}:${e.recuA}`;
              return (
                <li key={cle} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white border border-red-100 px-3 py-2">
                  <span className="font-body text-sm font-semibold text-slate-800">{p.familyName || "Famille"}</span>
                  <span className="font-body text-xs text-slate-500">{LIBELLES[e.motif] || e.motif} · reçu le {quand(e.recuA)}</span>
                  <span className="font-body text-xs text-slate-600">encaissé {Number(e.montant || 0).toFixed(2)} €</span>
                  {e.exces > 0 ? (
                    <span className="font-body text-xs font-bold text-red-600">à rembourser : {Number(e.exces).toFixed(2)} €</span>
                  ) : (
                    <span className="font-body text-xs text-amber-700">montant dû, crédité — à vérifier seulement</span>
                  )}
                  {e.hostedCheckoutId && (
                    <span className="font-mono text-[10px] text-slate-400" title="Référence CAWL (hostedCheckoutId)">CAWL {e.hostedCheckoutId}</span>
                  )}
                  <button type="button" disabled={enCours === cle} onClick={() => traiter(p, e)}
                    className="ml-auto font-body text-[11px] font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200 cursor-pointer hover:bg-green-100 disabled:opacity-50 flex items-center gap-1">
                    {enCours === cle ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Traité
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
