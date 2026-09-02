"use client";

/**
 * src/app/admin/paiements/ModaleModifierCommande.tsx
 *
 * La modification d'une commande : ses lignes, sa remise, son montant.
 *
 * La modale portait quatre états dans l'écran des paiements, et les onglets
 * qui l'ouvrent devaient les amorcer eux-mêmes avant de l'afficher — trois
 * props traversant deux onglets pour recopier ce qui se déduit de la
 * commande. Elle s'amorce désormais toute seule : les onglets n'ont plus
 * qu'à lui passer la commande à modifier.
 *
 * Une commande déjà facturée ne se modifie pas : le numéro est chronologique
 * et inaltérable (CGI art. 242 nonies A). C'est un avoir qu'il faut alors.
 */

import { useState, useEffect } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs,
  query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Trash2, X } from "lucide-react";
import { createEncaissement } from "@/lib/compta-encaissement";
import { fetchDiscountSettings, calculateFamilyDiscount, calculateMultiStageDiscount } from "@/lib/discounts";
import { retraitPointsFidelite } from "@/lib/fidelite-avoir";
import { verrouCommande } from "./commande-verrou";

export interface ModaleModifierCommandeProps {
  /** La commande à modifier ; la modale n'est montée que si elle existe. */
  payment: any;
  onClose: () => void;
  payments: any[];
  encaissements: any[];
  avoirs: any[];
  setPayments: (maj: (prev: any[]) => any[]) => void;
  toast: (message: string, type?: any) => void;
}

export default function ModaleModifierCommande({
  payment, onClose, payments, encaissements, avoirs, setPayments, toast,
}: ModaleModifierCommandeProps) {
  // Les lignes se recopient depuis la commande : on travaille sur une copie
  // tant que l'enregistrement n'a pas eu lieu.
  const [editItems, setEditItems] = useState<any[]>(() => (payment.items || []).map((i: any) => ({ ...i })));
  const [editRemisePct, setEditRemisePct] = useState("");
  const [editRemiseEuros, setEditRemiseEuros] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Rouvrir la modale sur une autre commande repart de ses lignes à elle.
  useEffect(() => {
    setEditItems((payment.items || []).map((i: any) => ({ ...i })));
    setEditRemisePct("");
    setEditRemiseEuros("");
  }, [payment?.id]);

  const editPayment = payment;
  const setEditPayment = (v: any) => { if (!v) onClose(); };

      // Facture émise ou premier règlement encaissé : la commande ne se
      // modifie plus, c'est un avoir qu'il faut. Le nom `isInvoiced` reste
      // pour ne pas toucher aux vingt endroits du formulaire qui le lisent.
      const verrou = verrouCommande(editPayment);
      const isInvoiced = verrou.verrouillee;
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
            <button type="button" onClick={() => setEditPayment(null)} className="text-slate-400 bg-transparent border-none cursor-pointer"><X size={20}/></button>
          </div>

          {/* Bandeau de blocage : facture définitive émise, ou règlement déjà encaissé */}
          {isInvoiced && (
            <div className="mx-5 mt-5 p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="font-body text-sm font-semibold text-red-700 mb-1">
                🔒 {verrou.titre}
              </div>
              <div className="font-body text-xs text-red-600 leading-relaxed">
                {verrou.explication}
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
                    <button type="button" onClick={() => !isInvoiced && setEditItems(prev => prev.filter((_, i) => i !== idx))}
                      disabled={isInvoiced}
                      className={`text-red-400 hover:text-red-600 bg-transparent border-none p-1 ${isInvoiced ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}>
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>

              {/* Ajouter une ligne libre */}
              <button type="button" onClick={() => setEditItems(prev => [...prev, { activityTitle: "Remise / Ajustement", priceTTC: 0, priceHT: 0, tva: 5.5, childName: "" }])}
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
                <button type="button"
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
              <button type="button" onClick={() => setEditPayment(null)}
                className="px-5 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
                {isInvoiced ? "Fermer" : "Annuler"}
              </button>
              {!isInvoiced && (
              <button
                disabled={editSaving}
                onClick={async () => {
                  setEditSaving(true);
                  try {
                    // ─── Recalcul des prix selon nouveaux rangs ─────────
                    // Quand on supprime un enfant d'une commande payée, les autres
                    // enfants 'remontent' en rang. Exemple : Eliot 1er, Ambre 2e,
                    // John 3e. Si Eliot est supprimé : Ambre passe 1er, John 2e.
                    // Les tarifs dégressifs doivent être recalculés en conséquence.
                    const oldItemsForRank = editPayment.items || [];
                    const removedChildIds = new Set(
                      oldItemsForRank
                        .filter((oi: any) =>
                          !editItems.some(ni =>
                            ni.childId === oi.childId &&
                            (ni.creneauId === oi.creneauId || (ni.stageKey && ni.stageKey === oi.stageKey))
                          )
                        )
                        .map((oi: any) => oi.childId)
                    );

                    let priceRecalcMsg = "";
                    // Seulement recalculer si au moins un item supprimé ET il s'agit d'un stage
                    // (la dégressivité famille s'applique uniquement aux stages dans une période vacances)
                    const isStageContext = oldItemsForRank.some((oi: any) =>
                      oi.activityType === "stage" || oi.activityType === "stage_journee" || oi.stageKey
                    );
                    if (removedChildIds.size > 0 && isStageContext) {
                      try {
                        const settings = await fetchDiscountSettings();
                        // Recompose les "existingStages" du point de vue du nouveau rang :
                        // chaque enfant conservé apparaît UNE FOIS dans l'ordre d'origine
                        const orderedChildIds: string[] = [];
                        for (const oi of oldItemsForRank) {
                          if (removedChildIds.has(oi.childId)) continue;
                          if (!orderedChildIds.includes(oi.childId)) {
                            orderedChildIds.push(oi.childId);
                          }
                        }
                        // Pour chaque item conservé : recalcul son prix selon son nouveau rang famille
                        const recalculated = editItems.map((it: any) => {
                          if (!it.childId) return it; // ligne libre (remise/ajustement) -> on touche pas
                          const isStage = (it.activityType === "stage" || it.activityType === "stage_journee" || it.stageKey);
                          if (!isStage) return it; // cours et autres -> pas concerné par dégressivité famille stage
                          // Reconstituer existingStages comme si on inscrivait cet enfant
                          // dans l'ordre orderedChildIds (donc enfants qui le précèdent dans l'ordre)
                          const childIdx = orderedChildIds.indexOf(it.childId);
                          if (childIdx < 0) return it;
                          const previousChildIds = orderedChildIds.slice(0, childIdx);
                          const fakeExistingStages = previousChildIds.map(cid => ({
                            childId: cid,
                            childName: "fake",
                            familyId: editPayment.familyId,
                            stageDate: "2026-01-01",
                            stageTitle: "fake",
                            creneauId: "fake",
                            activityType: "stage" as const,
                            activityTitle: "fake",
                            date: "2026-01-01",
                          } as any));
                          const fd = calculateFamilyDiscount(fakeExistingStages, it.childId, settings.familyDiscount);
                          // Prix de base = priceTTC actuel / (1 - ancien %)
                          // Mais c'est plus simple de retrouver le prix plein depuis stageBasePrice si présent,
                          // sinon estimer en remontant le pourcentage actuel.
                          // Pour simplicité : si l'item a originalPrice, on l'utilise. Sinon on garde tel quel.
                          const originalPrice = it.originalPriceTTC || it.originalPrice || it.priceBase || null;
                          if (!originalPrice) return it; // pas d'info -> on ne touche pas (risque trop élevé)
                          // Multi-stages : recalculer aussi si même enfant a plusieurs stages dans la commande
                          const sameChildStages = editItems.filter((x: any) =>
                            x.childId === it.childId &&
                            (x.activityType === "stage" || x.activityType === "stage_journee" || x.stageKey)
                          );
                          const md = sameChildStages.length > 1
                            ? calculateMultiStageDiscount(fakeExistingStages.filter(s => s.childId === it.childId), it.childId, settings.multiStageDiscount)
                            : { percent: 0, nth: 1 };
                          const totalPct = Math.min(fd.percent + md.percent, 50);
                          let newPrice = Math.round((originalPrice * (100 - totalPct)) / 100 * 100) / 100;
                          // Plancher
                          if (settings.prixPlancherStage && newPrice < settings.prixPlancherStage) {
                            newPrice = settings.prixPlancherStage;
                          }
                          // Mise à jour titre pour refléter la nouvelle réduction
                          const baseTitle = (it.activityTitle || "").replace(/\s*\(-[\d.]+€\)$/, "").replace(/\s*—\s*\d+\.?\d*€$/, "");
                          const remise = Math.round((originalPrice - newPrice) * 100) / 100;
                          const newTitle = remise > 0 ? `${baseTitle} (-${remise.toFixed(2)}€)` : baseTitle;
                          return {
                            ...it,
                            priceTTC: newPrice,
                            priceHT: Math.round((newPrice / (1 + (it.tva || 5.5) / 100)) * 100) / 100,
                            activityTitle: newTitle,
                          };
                        });
                        // Si au moins un item a changé : on remplace
                        const changedCount = recalculated.filter((r: any, i: number) => r.priceTTC !== editItems[i].priceTTC).length;
                        if (changedCount > 0) {
                          editItems.splice(0, editItems.length, ...recalculated);
                          priceRecalcMsg = ` (${changedCount} prix recalculé${changedCount > 1 ? 's' : ''} selon nouveaux rangs)`;
                        }
                      } catch (recalcErr) {
                        console.warn("[edit-payment] Recalcul rang échoué (non bloquant):", recalcErr);
                      }
                    }

                    const newTotal = Math.round(editItems.reduce((s, i) => s + (i.priceTTC || 0), 0) * 100) / 100;
                    const previousPaid = editPayment.paidAmount || 0;
                    const overpayment = Math.round((previousPaid - newTotal) * 100) / 100;
                    // Si trop-perçu : on garde paidAmount au niveau de newTotal
                    // et on crée un avoir pour la différence (pas d'écrasement silencieux)
                    const newPaid = Math.min(previousPaid, newTotal);
                    const newStatus = newPaid >= newTotal ? "paid" : newPaid > 0 ? "partial" : "pending";

                    // ─── Désinscription des items SUPPRIMÉS ─────────────
                    // Identifie les items qui étaient présents avant et ne le sont
                    // plus après modification. Pour chacun :
                    // - Retire l'enfant des creneaux.enrolled[] (créneau principal + creneauIds[] pour stages)
                    // - Supprime les réservations liées (creneauId match + childId match)
                    // Sans ça, Eliot resterait inscrit dans le stage du 6 juillet en "non payé"
                    // alors que sa ligne facture a été supprimée.
                    const oldItems = editPayment.items || [];
                    const removedItems = oldItems.filter((oi: any) => {
                      // Match strict sur childId + creneauId (ou stageKey si stage multi-jours)
                      return !editItems.some(ni =>
                        ni.childId === oi.childId &&
                        (ni.creneauId === oi.creneauId || (ni.stageKey && ni.stageKey === oi.stageKey))
                      );
                    });

                    let creneauxUpdated = 0;
                    let reservationsDeleted = 0;
                    for (const removed of removedItems) {
                      // Liste des creneaux concernés (cours = 1, stage = N jours)
                      const creneauIds: string[] = removed.creneauIds && Array.isArray(removed.creneauIds) && removed.creneauIds.length > 0
                        ? removed.creneauIds
                        : (removed.creneauId ? [removed.creneauId] : []);

                      for (const cid of creneauIds) {
                        try {
                          const cSnap = await getDoc(doc(db, "creneaux", cid));
                          if (!cSnap.exists()) continue;
                          const cData = cSnap.data();
                          const enrolled = cData.enrolled || [];
                          // On retire uniquement les inscriptions de CET enfant pour CETTE famille
                          const newEnrolled = enrolled.filter((e: any) =>
                            !(e.childId === removed.childId && e.familyId === editPayment.familyId)
                          );
                          if (newEnrolled.length !== enrolled.length) {
                            await updateDoc(doc(db, "creneaux", cid), {
                              enrolled: newEnrolled,
                              enrolledCount: newEnrolled.length,
                            });
                            creneauxUpdated++;
                          }
                        } catch (e) {
                          console.error(`[edit-payment] Désinscription créneau ${cid} échouée:`, e);
                        }

                        // Supprimer les réservations correspondantes
                        try {
                          const resaSnap = await getDocs(query(
                            collection(db, "reservations"),
                            where("familyId", "==", editPayment.familyId),
                            where("childId", "==", removed.childId),
                            where("creneauId", "==", cid),
                          ));
                          for (const r of resaSnap.docs) {
                            await deleteDoc(r.ref);
                            reservationsDeleted++;
                          }
                        } catch (e) {
                          console.error(`[edit-payment] Suppression réservation échouée:`, e);
                        }
                      }
                    }
                    if (removedItems.length > 0) {
                      console.log(`[edit-payment] ${removedItems.length} item(s) retiré(s) → ${creneauxUpdated} créneau(x) mis à jour, ${reservationsDeleted} réservation(s) supprimée(s)`);
                    }

                    await updateDoc(doc(db, "payments", editPayment.id), {
                      items: editItems,
                      totalTTC: newTotal,
                      paidAmount: newPaid,
                      status: newStatus,
                      updatedAt: serverTimestamp(),
                    });

                    // Création automatique d'un avoir si trop-perçu
                    let avoirMsg = "";
                    if (overpayment > 0) {
                      try {
                        // Reference + expiration cohérentes avec les autres créations d'avoir
                        // (voir lignes 679-695 dans le même fichier pour le format de référence)
                        const avoirRef_str = `AV-${Date.now().toString(36).toUpperCase()}`;
                        const avoirExpiry = new Date();
                        avoirExpiry.setFullYear(avoirExpiry.getFullYear() + 1);

                        const avoirRef = await addDoc(collection(db, "avoirs"), {
                          familyId: editPayment.familyId,
                          familyName: editPayment.familyName,
                          type: "avoir",
                          amount: overpayment,
                          usedAmount: 0,
                          remainingAmount: overpayment,
                          reason: `Trop-perçu suite modification commande ${editPayment.orderId || editPayment.id.slice(-6)} (total ${(editPayment.totalTTC || 0).toFixed(2)}€ → ${newTotal.toFixed(2)}€)`,
                          reference: avoirRef_str,
                          sourcePaymentId: editPayment.id,
                          sourceType: "trop_percu",
                          expiryDate: avoirExpiry,
                          status: "actif", // IMPORTANT: 'actif' (fr) et non 'active' (en) — la page Avoirs filtre sur 'actif'
                          usageHistory: [],
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                        });
                        avoirMsg = ` — Avoir de ${overpayment.toFixed(2)}€ créé (réf. ${avoirRef_str})`;

                        // Trace dans le journal des encaissements (montant négatif = avoir)
                        // Cohérent avec annulerCommande (ligne 698) : permet à l'avoir
                        // d'apparaître dans le Journal et de tracer le trop-perçu.
                        try {
                          await createEncaissement({
                            paymentId: editPayment.id,
                            familyId: editPayment.familyId,
                            familyName: editPayment.familyName,
                            montant: -overpayment,
                            mode: "avoir",
                            modeLabel: "Avoir (trop-perçu suite modification)",
                            ref: avoirRef_str,
                            activityTitle: (editItems || []).map((i: any) => i.activityTitle).join(", "),
                            isAvoir: true,
                            avoirRef: avoirRef_str,
                          });
                          // Retrait des points de fidelite proportionnel au trop-percu
                          await retraitPointsFidelite(editPayment.familyId, overpayment, `Trop-perçu suite modification ${avoirRef_str}`);
                        } catch (encErr) {
                          console.error("[paiements] échec trace encaissement avoir:", encErr);
                        }
                      } catch (avoirErr) {
                        console.error("[paiements] échec création avoir trop-perçu:", avoirErr);
                        toast(`⚠️ Commande modifiée mais avoir non créé — à faire manuellement (${overpayment.toFixed(2)}€)`, "warning");
                      }
                    }

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
