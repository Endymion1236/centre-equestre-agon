"use client";
import React from "react";
import { Trash2, X } from "lucide-react";
import { enregistrerModificationCommande } from "./commande-edition";

/**
 * src/app/admin/paiements/ModaleEditionCommande.tsx
 *
 * « Modifier la commande » : corriger des lignes, appliquer une remise
 * globale, retirer une prestation après coup.
 *
 * Deux bandeaux de cet écran ne sont pas décoratifs, ils portent une règle :
 *  - facture définitive émise → TOUS les champs sont verrouillés. Une facture
 *    numérotée ne se modifie pas (article L123-14 du Code de commerce) : il
 *    faut passer par un avoir puis une nouvelle commande. Le bandeau rouge
 *    explique la manœuvre, sinon l'admin croit à un bug.
 *  - trop-perçu → on annonce AVANT d'enregistrer qu'un avoir du montant en
 *    trop va être créé, parce que le bouton d'enregistrement le fera
 *    réellement, sans autre confirmation.
 *
 * L'écriture elle-même (recalcul des rangs, désinscriptions, avoir) est dans
 * commande-edition.ts : cet écran ne fait que saisir et rendre compte.
 */

interface ModaleEditionCommandeProps {
  editPayment: any;
  setEditPayment: (val: any) => void;
  editItems: any[];
  setEditItems: React.Dispatch<React.SetStateAction<any[]>>;
  editRemisePct: string;
  setEditRemisePct: (val: string) => void;
  editRemiseEuros: string;
  setEditRemiseEuros: (val: string) => void;
  editSaving: boolean;
  setEditSaving: (val: boolean) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export function ModaleEditionCommande({
  editPayment, setEditPayment, editItems, setEditItems,
  editRemisePct, setEditRemisePct, editRemiseEuros, setEditRemiseEuros,
  editSaving, setEditSaving, setPayments, toast,
}: ModaleEditionCommandeProps) {
  const isInvoiced = !!editPayment.invoiceNumber;
  const newTotalLive = Math.round(editItems.reduce((s, i) => s + (i.priceTTC || 0), 0) * 100) / 100;
  const paidAmount = editPayment.paidAmount || 0;
  const tropPercu = Math.round((paidAmount - newTotalLive) * 100) / 100;
  return (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
    onClick={() => !editSaving && setEditPayment(null)}>
    <div className="bg-white rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-blue-800">Modifier la commande</h2>
          <p className="font-body text-xs text-slate-500">{editPayment.familyName}</p>
        </div>
        <button onClick={() => setEditPayment(null)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
      </div>

      {/* Bandeau de blocage si facture définitive émise */}
      {isInvoiced && (
        <div className="mx-5 mt-5 p-4 rounded-xl bg-red-50 border border-red-200">
          <div className="font-body text-sm font-semibold text-red-700 mb-1">
            🔒 Modification impossible — facture {editPayment.invoiceNumber} émise
          </div>
          <div className="font-body text-xs text-red-600 leading-relaxed">
            Cette commande a déjà fait l'objet d'une facture définitive numérotée.
            Pour des raisons de conformité comptable (article L123-14 du Code de commerce),
            une facture émise ne peut pas être modifiée.
            <br /><br />
            Pour corriger le montant, vous devez : <strong>annuler la facture via un avoir</strong>,
            puis créer une nouvelle commande avec le bon montant.
          </div>
        </div>
      )}

      {/* Alerte trop-perçu */}
      {!isInvoiced && tropPercu > 0 && (
        <div className="mx-5 mt-5 p-4 rounded-xl bg-orange-50 border border-orange-300">
          <div className="font-body text-sm font-semibold text-orange-700 mb-1">
            ⚠️ Attention — trop-perçu de {tropPercu.toFixed(2)}€
          </div>
          <div className="font-body text-xs text-orange-700 leading-relaxed">
            La famille a déjà payé <strong>{paidAmount.toFixed(2)}€</strong> mais le nouveau total ne sera que de <strong>{newTotalLive.toFixed(2)}€</strong>.
            À l'enregistrement, un <strong>avoir de {tropPercu.toFixed(2)}€</strong> sera automatiquement créé au nom de {editPayment.familyName}, utilisable sur une prochaine commande ou remboursable.
          </div>
        </div>
      )}

      <div className="p-5 flex flex-col gap-4">
        {/* Items modifiables */}
        <div>
          <div className="font-body text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Lignes de la commande</div>
          <div className="flex flex-col gap-2">
            {editItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-body text-xs text-blue-800 truncate">{item.activityTitle}</div>
                  {item.childName && <div className="font-body text-[10px] text-slate-400">{item.childName}</div>}
                </div>
                <input
                  type="number" step="0.01" min="0"
                  value={item.priceTTC}
                  disabled={isInvoiced}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0;
                    setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, priceTTC: v, priceHT: Math.round(v / (1 + (it.tva || 5.5) / 100) * 100) / 100 } : it));
                  }}
                  className={`w-20 px-2 py-1.5 rounded-lg border border-gray-200 font-body text-sm text-right focus:outline-none focus:border-blue-500 ${isInvoiced ? "opacity-50 cursor-not-allowed bg-gray-100" : ""}`}
                />
                <span className="font-body text-xs text-slate-400">€</span>
                <button onClick={() => !isInvoiced && setEditItems(prev => prev.filter((_, i) => i !== idx))}
                  disabled={isInvoiced}
                  className={`text-red-400 hover:text-red-600 bg-transparent border-none p-1 ${isInvoiced ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                  <Trash2 size={14}/>
                </button>
              </div>
            ))}
          </div>

          {/* Ajouter une ligne libre */}
          <button onClick={() => setEditItems(prev => [...prev, { activityTitle: "Remise / Ajustement", priceTTC: 0, priceHT: 0, tva: 5.5, childName: "" }])}
            className="mt-2 font-body text-xs text-blue-500 bg-transparent border-none cursor-pointer hover:underline">
            + Ajouter une ligne
          </button>
        </div>

        {/* Remise globale */}
        <div className="border border-orange-200 rounded-xl p-4 bg-orange-50">
          <div className="font-body text-xs font-semibold text-orange-700 mb-3">🎁 Appliquer une remise globale</div>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label className="font-body text-[10px] text-slate-500 block mb-1">En %</label>
              <input type="number" min="0" max="100" step="1" value={editRemisePct}
                onChange={e => { setEditRemisePct(e.target.value); setEditRemiseEuros(""); }}
                placeholder="ex: 10"
                className="w-full px-3 py-2 rounded-lg border border-orange-200 font-body text-sm bg-white focus:outline-none focus:border-orange-400" />
            </div>
            <div className="font-body text-slate-400 pt-4">ou</div>
            <div className="flex-1">
              <label className="font-body text-[10px] text-slate-500 block mb-1">En €</label>
              <input type="number" min="0" step="0.01" value={editRemiseEuros}
                onChange={e => { setEditRemiseEuros(e.target.value); setEditRemisePct(""); }}
                placeholder="ex: 50"
                className="w-full px-3 py-2 rounded-lg border border-orange-200 font-body text-sm bg-white focus:outline-none focus:border-orange-400" />
            </div>
            <button
              onClick={() => {
                const total = editItems.reduce((s, i) => s + (i.priceTTC || 0), 0);
                const remise = editRemisePct
                  ? Math.round(total * parseFloat(editRemisePct) / 100 * 100) / 100
                  : parseFloat(editRemiseEuros) || 0;
                if (remise <= 0) return;
                // Répartir la remise proportionnellement sur tous les items
                setEditItems(prev => prev.map(it => {
                  const part = total > 0 ? (it.priceTTC || 0) / total : 0;
                  const newPrice = Math.max(0, Math.round((it.priceTTC - remise * part) * 100) / 100);
                  return { ...it, priceTTC: newPrice, priceHT: Math.round(newPrice / (1 + (it.tva || 5.5) / 100) * 100) / 100 };
                }));
                setEditRemisePct(""); setEditRemiseEuros("");
              }}
              className="mt-4 px-4 py-2 rounded-lg font-body text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 border-none cursor-pointer whitespace-nowrap">
              Appliquer
            </button>
          </div>
        </div>

        {/* Récap */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <div className="font-body text-xs text-slate-500">Ancien total</div>
            <div className="font-body text-sm text-slate-400 line-through">{(editPayment.totalTTC || 0).toFixed(2)}€</div>
          </div>
          <div className="text-right">
            <div className="font-body text-xs text-slate-500">Nouveau total</div>
            <div className="font-body text-xl font-bold text-blue-500">
              {editItems.reduce((s, i) => s + (i.priceTTC || 0), 0).toFixed(2)}€
            </div>
          </div>
        </div>

        {/* Boutons */}
        <div className="flex gap-3">
          <button onClick={() => setEditPayment(null)}
            className="px-5 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
            {isInvoiced ? "Fermer" : "Annuler"}
          </button>
          {!isInvoiced && (
          <button
            disabled={editSaving}
            onClick={async () => {
              setEditSaving(true);
              try {
                const { newTotal, newPaid, newStatus, avoirMsg, priceRecalcMsg } =
                  await enregistrerModificationCommande(editPayment, editItems, toast);

                // Mettre à jour la liste locale
                setPayments(prev => prev.map(p => p.id === editPayment.id
                  ? { ...p, items: editItems, totalTTC: newTotal, paidAmount: newPaid, status: newStatus }
                  : p
                ));
                toast(`✅ Commande mise à jour — ${newTotal.toFixed(2)}€${avoirMsg}${priceRecalcMsg}`, "success");
                setEditPayment(null);
              } catch (e) { console.error(e); toast("Erreur lors de la sauvegarde", "error"); }
              setEditSaving(false);
            }}
            className={`flex-1 py-2.5 rounded-xl font-body text-sm font-semibold border-none cursor-pointer ${editSaving ? "bg-gray-200 text-slate-400" : "bg-blue-500 text-white hover:bg-blue-600"}`}>
            {editSaving ? "Sauvegarde..." : tropPercu > 0 ? `Enregistrer + créer avoir ${tropPercu.toFixed(2)}€` : "Enregistrer les modifications"}
          </button>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
