"use client";

/**
 * src/app/espace-cavalier/inscription-annuelle/EtapeRecapitulatif.tsx
 *
 * Dernière étape : ce que la famille lit juste avant de payer — détail
 * tarifaire, panier de la fratrie, moyen de règlement et échéancier.
 *
 * Sortie de `page.tsx` parce que c'est l'écran le plus sensible du parcours :
 * le montant affiché ici est celui qui sera facturé. Ce qu'il ne faut pas
 * perdre en le modifiant :
 *  - le détail tarifaire vient de `calcul.detailLignes`, produit par le calcul
 *    centralisé partagé avec l'admin. Il n'est jamais recomposé ici : le récap
 *    AFFICHE le prix, il ne le calcule pas ;
 *  - le sous-total panier et l'inscription en cours sont deux blocs distincts.
 *    Le bouton de paiement porte `totalAPayer` (panier + inscription en cours),
 *    alors que le « Total TTC » du bloc ne concerne que l'enfant en cours ;
 *  - l'échéancier n'apparaît qu'au-delà de 100 € et son libellé change selon le
 *    moyen de paiement (« Nombre de chèques » plutôt qu'« Échéancier ») ;
 *  - en chèque ou espèces, l'avertissement « place réservée provisoirement »
 *    doit rester visible avant la validation, pas seulement après.
 */

import { Card, Badge } from "@/components/ui";
import { Check, CreditCard, Loader2, Plus } from "lucide-react";
import type { CalculForfaitResult } from "@/lib/forfait-pricing";
import type { MoyenPaiement, PanierItem, PaymentPlan, WeeklySlot } from "./types";

export default function EtapeRecapitulatif({
  panier, retirerDuPanier, totalPanier,
  child, mode, forfaitType, calcul, selectedSlotsData, slotsPrices,
  grandTotal, totalAPayer,
  moyenPaiement, setMoyenPaiement, paymentPlan, setPaymentPlan,
  ajouterAuPanier, handleEnrollAll, submitting, slotsComplete, setStep,
}: {
  panier: PanierItem[];
  retirerDuPanier: (childId: string) => void;
  totalPanier: number;
  child: any;
  mode: "annuel" | "ponctuel";
  forfaitType: "1x" | "2x" | "3x";
  calcul: CalculForfaitResult;
  selectedSlotsData: WeeklySlot[];
  slotsPrices: { slot: WeeklySlot; sessions: number; forfaitPrice: number }[];
  grandTotal: number;
  totalAPayer: number;
  moyenPaiement: MoyenPaiement;
  setMoyenPaiement: (m: MoyenPaiement) => void;
  paymentPlan: PaymentPlan;
  setPaymentPlan: (p: PaymentPlan) => void;
  ajouterAuPanier: () => void;
  handleEnrollAll: () => void;
  submitting: boolean;
  slotsComplete: boolean;
  setStep: (n: number) => void;
}) {
  return (
    <Card padding="md">
      <h2 className="font-body text-base font-semibold text-blue-800 mb-4">Récapitulatif</h2>

      {/* Panier : enfants déjà ajoutés (en attente de paiement groupé) */}
      {panier.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200">
          <div className="font-body text-sm font-semibold text-green-800 mb-2">
            👨‍👩‍👧‍👦 Déjà au panier ({panier.length} enfant{panier.length > 1 ? "s" : ""})
          </div>
          {panier.map((p) => (
            <div key={p.childId} className="flex items-center justify-between py-1.5 border-t border-green-200/60 first:border-t-0">
              <div>
                <span className="font-body text-sm font-semibold text-green-900">{p.childName}</span>
                <span className="font-body text-xs text-green-700 ml-2">Forfait {p.frequence}×/sem</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-body text-sm font-semibold text-green-800">{p.totalAnnuel.toFixed(2)}€</span>
                <button onClick={() => retirerDuPanier(p.childId)}
                  className="font-body text-xs text-red-500 bg-white border border-red-200 px-2 py-1 rounded-lg cursor-pointer hover:bg-red-50">
                  Retirer
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-1 border-t border-green-300">
            <span className="font-body text-xs text-green-700">Sous-total panier</span>
            <span className="font-body text-sm font-bold text-green-800">{totalPanier.toFixed(2)}€</span>
          </div>
        </div>
      )}

      {/* Titre de l'inscription en cours (l'enfant qu'on configure là) */}
      {panier.length > 0 && (
        <div className="font-body text-xs text-gray-400 mb-2 uppercase tracking-wide">Inscription en cours</div>
      )}

      <div className="bg-blue-50/50 rounded-xl p-4 mb-5 flex flex-col gap-3">
        {/* Child */}
        <div className="flex justify-between">
          <span className="font-body text-sm text-gray-500">Cavalier</span>
          <span className="font-body text-sm font-semibold text-blue-800">{child ? (child as any).firstName : "—"}</span>
        </div>

        {/* Forfait type */}
        {mode === "annuel" && (
          <div className="flex justify-between">
            <span className="font-body text-sm text-gray-500">Forfait</span>
            <Badge color="blue">{forfaitType === "3x" ? "3 cours/sem" : forfaitType === "2x" ? "2 cours/sem" : "1 cours/sem"}</Badge>
          </div>
        )}

        {/* Détail tarifaire (issu du calcul centralisé = identique admin) */}
        {mode === "annuel" && calcul.detailLignes.map((l, i) => (
          <div key={i} className="flex justify-between">
            <span className="font-body text-sm text-gray-500">{l.label}</span>
            <span className={`font-body text-sm ${l.montantTTC < 0 ? "text-green-600" : "text-blue-500"}`}>
              {l.montantTTC < 0 ? "" : ""}{l.montantTTC.toFixed(2)}€
            </span>
          </div>
        ))}

        {/* Créneaux choisis (informatif) */}
        {mode === "annuel" && selectedSlotsData.map((s, i) => (
          <div key={i} className="flex justify-between items-start pt-2 border-t border-blue-500/8">
            <div>
              <span className="font-body text-sm font-semibold text-blue-800">Créneau {i + 1}</span>
              <div className="font-body text-xs text-gray-400">
                {s.activityTitle} — {s.dayLabel} {s.startTime}–{s.endTime}
              </div>
              <div className="font-body text-xs text-blue-500">{s.totalSessions} séances</div>
            </div>
          </div>
        ))}

        {/* Mode ponctuel : afficher le créneau unique avec son prix */}
        {mode === "ponctuel" && slotsPrices.map((sp, i) => (
          <div key={i} className="flex justify-between items-start pt-2 border-t border-blue-500/8">
            <div>
              <span className="font-body text-sm font-semibold text-blue-800">Séance ponctuelle</span>
              <div className="font-body text-xs text-gray-400">
                {sp.slot.activityTitle} — {sp.slot.dayLabel} {sp.slot.startTime}–{sp.slot.endTime}
              </div>
            </div>
            <span className="font-body text-sm font-semibold text-blue-500">
              {sp.slot.priceTTC.toFixed(2)}€
            </span>
          </div>
        ))}
        {false && slotsPrices.map((sp, i) => (
          <div key={i} className="flex justify-between items-start pt-2 border-t border-blue-500/8">
            <div>
              <span className="font-body text-sm font-semibold text-blue-800">
                {mode === "annuel" ? `Créneau ${i + 1}` : "Séance ponctuelle"}
              </span>
              <div className="font-body text-xs text-gray-400">
                {sp.slot.activityTitle} — {sp.slot.dayLabel} {sp.slot.startTime}–{sp.slot.endTime}
              </div>
              {mode === "annuel" && <div className="font-body text-xs text-blue-500">{sp.sessions} séances</div>}
            </div>
            <span className="font-body text-sm font-semibold text-blue-500">
              {mode === "annuel" ? `${sp.forfaitPrice.toFixed(2)}€` : `${sp.slot.priceTTC.toFixed(2)}€`}
            </span>
          </div>
        ))}

        {/* Total */}
        <div className="flex justify-between pt-3 border-t-2 border-blue-500/8">
          <span className="font-body text-base font-bold text-blue-800">Total TTC</span>
          <span className="font-body text-2xl font-bold text-blue-500">{grandTotal.toFixed(2)}€</span>
        </div>
      </div>

      {/* Moyen de paiement (toujours affiché au récap) */}
      <div className="mb-5">
        <div className="font-body text-sm font-semibold text-blue-800 mb-3">Moyen de paiement</div>
        <div className="flex gap-3">
          {([
            ["cb", "💳", "Carte bancaire", "Paiement en ligne immédiat"],
            ["cheque", "📝", "Chèque", "Réglé au club"],
            ["especes", "💵", "Espèces", "Réglé au club"],
          ] as const).map(([id, icon, label, sub]) => (
            <button key={id} onClick={() => setMoyenPaiement(id)}
              className={`flex-1 py-3 px-2 rounded-xl border font-body text-sm font-medium cursor-pointer text-center transition-all
                ${moyenPaiement === id ? "border-blue-500 bg-blue-50 text-blue-500 font-semibold" : "border-gray-200 bg-white text-gray-500"}`}>
              <span className="block text-lg mb-0.5">{icon}</span>
              {label}
              <span className="block font-body text-xs font-normal text-gray-400 mt-0.5">{sub}</span>
            </button>
          ))}
        </div>
        {moyenPaiement !== "cb" && (
          <p className="font-body text-xs text-amber-600 mt-2">
            ⏳ La place est réservée provisoirement. L&apos;inscription sera confirmée par le centre dès réception de votre règlement en {moyenPaiement === "cheque" ? "chèque" : "espèces"}.
          </p>
        )}
      </div>

      {/* Échéancier (annual only) */}
      {mode === "annuel" && grandTotal > 100 && (
        <div className="mb-5">
          <div className="font-body text-sm font-semibold text-blue-800 mb-3">
            {moyenPaiement === "cheque" ? "Nombre de chèques" : "Échéancier"}
          </div>
          <div className="flex gap-3">
            {([["1x", `${grandTotal.toFixed(0)}€ en 1 fois`], ["3x", `3 × ${(grandTotal / 3).toFixed(0)}€`], ["10x", `10 × ${(grandTotal / 10).toFixed(0)}€`]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setPaymentPlan(id)}
                className={`flex-1 py-3 rounded-xl border font-body text-sm font-medium cursor-pointer text-center
                  ${paymentPlan === id ? "border-blue-500 bg-blue-50 text-blue-500 font-semibold" : "border-gray-200 bg-white text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>
          {paymentPlan !== "1x" && (
            <p className="font-body text-xs text-gray-400 mt-2">
              {moyenPaiement === "cb"
                ? "Prélèvement CB automatique. Sans frais."
                : moyenPaiement === "cheque"
                  ? `${paymentPlan === "3x" ? "3 chèques" : "10 chèques"} encaissés progressivement. Sans frais.`
                  : "Échelonnement à convenir avec le centre. Sans frais."}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {mode === "annuel" && (
          <button onClick={ajouterAuPanier} disabled={submitting || !slotsComplete}
            className="w-full py-3 rounded-xl font-body text-sm font-semibold text-blue-500 bg-blue-50 border border-blue-200 cursor-pointer hover:bg-blue-100 flex items-center justify-center gap-2 disabled:opacity-50">
            <Plus size={16} /> Ajouter un autre enfant
          </button>
        )}
        <div className="flex gap-3">
          <button onClick={() => setStep(mode === "annuel" ? 4 : 2)} className="px-6 py-3 rounded-xl font-body text-sm text-gray-500 bg-white border border-gray-200 cursor-pointer">Retour</button>
          <button onClick={handleEnrollAll} disabled={submitting}
            className="flex-1 py-4 rounded-xl font-body text-base font-semibold text-blue-800 bg-gold-400 border-none cursor-pointer hover:bg-gold-300 flex items-center justify-center gap-2 disabled:opacity-50">
            {submitting ? (
              <><Loader2 size={18} className="animate-spin" /> Inscription en cours...</>
            ) : moyenPaiement === "cb" ? (
              <><CreditCard size={18} /> Payer {totalAPayer.toFixed(2)}€ {paymentPlan !== "1x" && mode === "annuel" ? `en ${paymentPlan}` : ""}</>
            ) : (
              <><Check size={18} /> Valider — règlement par {moyenPaiement === "cheque" ? "chèque" : "espèces"}</>
            )}
          </button>
        </div>
      </div>
    </Card>
  );
}
