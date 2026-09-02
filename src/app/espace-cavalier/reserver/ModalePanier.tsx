"use client";

/**
 * src/app/espace-cavalier/reserver/ModalePanier.tsx
 *
 * Le panier de la famille : ce qu'elle a choisi, ce qu'elle doit, et le mode
 * de règlement.
 *
 * Les totaux et l'acompte viennent de panier-reservation, la même source que
 * le paiement : ce que la famille lit ici est ce qu'elle règle.
 */

/** Un créneau tel que l'écran de réservation le manipule. */
export interface Creneau {
  id: string; activityId: string; activityTitle: string; activityType: string;
  date: string; startTime: string; endTime: string; monitor: string;
  maxPlaces: number; enrolled: any[]; enrolledCount: number;
  priceHT: number; priceTTC?: number; tvaTaux: number;
}

import { CGV_STAGES_COURT } from "@/lib/cgv-clauses";
import { ACOMPTE_PAR_ENFANT, type TotauxPanier } from "@/lib/panier-reservation";
import { Loader2, X, ShoppingCart, CreditCard } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/components/ui/Toast";

export interface ModalePanierProps {
  cart: any[];
  setCart: (c: any[]) => void;
  removeFromCart: (idx: number) => void;
  onClose: () => void;
  creneaux: Creneau[];
  isStage: (c: any) => boolean;
  /** Totaux calculés par panier-reservation. */
  totaux: TotauxPanier;
  familyAvoirs: any[];
  depositMode: "full" | "deposit";
  cartPayMode: "cb" | "cheque" | "especes" | "virement" | "avoir";
  setCartPayMode: (m: any) => void;
  cgvAccepted: boolean;
  setCgvAccepted: (v: boolean) => void;
  cartPaySuccess: boolean;
  setCartPaySuccess: (v: boolean) => void;
  paying: boolean;
  setPaying: (v: boolean) => void;
  handlePay: () => void | Promise<void>;
  /** Le compte connecté et sa famille — le règlement par avoir passe par eux. */
  user: any;
  family: any;
}

export default function ModalePanier({
  cart, setCart, removeFromCart, onClose, creneaux, isStage, totaux,
  familyAvoirs, depositMode, cartPayMode, setCartPayMode,
  cgvAccepted, setCgvAccepted, cartPaySuccess, setCartPaySuccess,
  paying, setPaying, handlePay, user, family,
}: ModalePanierProps) {
  const {
    total: cartTotal, reductions: cartTotalReductions, contientUnStage: cartHasStage,
    nbEnfantsStage, acompte: acompteFixe, solde: soldeFixe,
  } = totaux;
  const setShowCart = (v: boolean) => { if (!v) onClose(); };
  const { toast } = useToast();

  return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[78vh] overflow-auto shadow-2xl pb-6" onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-display text-lg font-bold text-blue-800"><ShoppingCart size={18} className="inline mr-2" />Mon panier</h2>
              <button type="button" onClick={() => setShowCart(false)} className="text-gray-600 bg-transparent border-none cursor-pointer"><X size={20} /></button>
            </div>
          </div>
          <div className="p-5">
            {cart.length === 0 ? (
              <p className="font-body text-sm text-gray-600 text-center py-8">Votre panier est vide.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-4">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-sand rounded-lg px-3 py-2.5">
                      <div className="flex-1">
                        <div className="font-body text-sm font-semibold text-blue-800">{item.activityTitle}</div>
                        <div className="font-body text-xs text-gray-600">{item.childName} · {item.dates}</div>
                        {item.remiseEuros > 0 && <div className="font-body text-xs text-green-600">Reduction : -{item.remiseEuros}€</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          {item.remiseEuros > 0 && <div className="font-body text-xs text-gray-600 line-through">{item.prixBase.toFixed(0)}€</div>}
                          <div className="font-body text-sm font-bold text-blue-500">{item.prixFinal.toFixed(2)}€</div>
                        </div>
                        <button type="button" onClick={() => removeFromCart(idx)} className="text-red-400 bg-transparent border-none cursor-pointer p-1 hover:text-red-600"><X size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totaux */}
                {cartTotalReductions > 0 && (
                  <div className="flex justify-between font-body text-xs text-green-600 mb-1 px-1">
                    <span>Reductions</span><span>-{cartTotalReductions.toFixed(2)}€</span>
                  </div>
                )}
                <div className="flex justify-between font-body text-base font-bold text-blue-800 px-1 mb-4 pt-2 border-t border-gray-200">
                  <span>Total</span><span className="text-green-600">{cartTotal.toFixed(2)}€</span>
                </div>

                {/* Stages : reglement par acompte uniquement. Le solde est
                    preleve automatiquement a ~J-7. Quand l'acompte couvre
                    deja le total (petite journee), on ne parle ni de solde
                    ni d'empreinte de carte : il n'y a rien a prelever. */}
                {cart.some(i => i.isStage) && cartPayMode === "cb" && (
                  <div className="bg-blue-50 rounded-lg p-3 mb-4">
                    <div className="font-body text-xs font-semibold text-blue-800 mb-2">
                      Règlement du stage : acompte maintenant, solde avant le stage
                    </div>
                    <div className="space-y-2">
                      <div className="font-body text-xs text-slate-600 text-center">
                        {soldeFixe > 0
                          ? `${nbEnfantsStage} enfant${nbEnfantsStage > 1 ? "s" : ""} × ${ACOMPTE_PAR_ENFANT}€ = ${acompteFixe.toFixed(2)}€ maintenant · solde ${soldeFixe.toFixed(2)}€ prélevé automatiquement ~1 semaine avant le stage`
                          : `Montant réglé aujourd'hui : ${acompteFixe.toFixed(2)}€ — rien d'autre à prévoir.`}
                      </div>
                      {soldeFixe > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                          <p className="font-body text-xs text-amber-800 leading-snug">
                            ⚠️ <strong>À faire sur la page de paiement :</strong> cochez la case <strong>« Enregistrer mes données de paiement »</strong>. En la cochant, vous autorisez le prélèvement automatique du solde de <strong>{soldeFixe.toFixed(2)}€</strong> environ une semaine avant le stage. Sans cette case, le solde restera à régler manuellement.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Choix mode de paiement */}
                <div className="mb-4">
                  <div className="font-body text-xs font-semibold text-slate-600 mb-2">Comment souhaitez-vous régler ?</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["cb", "💳 Carte bancaire"],
                      ["cheque", "📝 Chèque"],
                      ["especes", "💵 Espèces"],
                      ["virement", "🏦 Virement"],
                    ] as const).map(([mode, label]) => (
                      <button type="button" key={mode} onClick={() => setCartPayMode(mode)}
                        className={`py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all ${cartPayMode === mode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-slate-500 hover:border-blue-300"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Bouton avoir si la famille a un solde */}
                  {familyAvoirs.length > 0 && (() => {
                    const totalAvoir = familyAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                    return (
                      <button type="button" onClick={() => setCartPayMode("avoir")}
                        className={`w-full mt-2 py-2.5 rounded-xl font-body text-sm font-semibold border cursor-pointer transition-all ${cartPayMode === "avoir" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-amber-600 hover:border-amber-300"}`}>
                        💜 Utiliser mon avoir ({totalAvoir.toFixed(2)}€ disponible)
                      </button>
                    );
                  })()}
                </div>

                {/* Conditions d'annulation — acceptation AVANT paiement.
                    Une clause n'est opposable que si le client en a eu
                    connaissance et l'a acceptée avant de contracter :
                    l'email de confirmation arrive trop tard pour ça. */}
                {cartHasStage && (
                  <label className="flex items-start gap-2.5 mb-3 p-3 rounded-xl bg-orange-50 border border-orange-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cgvAccepted}
                      onChange={(e) => setCgvAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-orange-500"
                    />
                    <span className="font-body text-xs text-orange-900 leading-relaxed">
                      J&apos;ai lu et j&apos;accepte les <a href="/cgv" target="_blank" rel="noopener noreferrer" className="font-semibold underline">conditions d&apos;annulation</a> : {CGV_STAGES_COURT}
                    </span>
                  </label>
                )}

                <button type="button"
                  onClick={() => setShowCart(false)}
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl py-2.5 px-4 cursor-pointer transition-colors mb-3"
                >
                  <ShoppingCart size={15} />
                  Continuer mes réservations
                </button>

                {/* Bouton CB → CAWL */}
                {cartPayMode === "cb" && (
                  <>
                    <button type="button" onClick={handlePay} disabled={paying || (cartHasStage && !cgvAccepted)}
                      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-body text-base font-semibold border-none cursor-pointer ${paying || (cartHasStage && !cgvAccepted) ? "bg-gray-200 text-gray-600 cursor-not-allowed" : depositMode === "deposit" ? "bg-orange-500 text-white hover:bg-orange-400" : "bg-green-600 text-white hover:bg-green-500"}`}>
                      {paying ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                      {paying ? "Paiement en cours..." : depositMode === "deposit" ? (soldeFixe > 0 ? `Payer l'acompte ${acompteFixe.toFixed(2)}€` : `Payer ${acompteFixe.toFixed(2)}€`) : `Payer ${cartTotal.toFixed(2)}€`}
                    </button>
                    <p className="font-body text-xs text-gray-600 text-center mt-2">Paiement sécurisé par CAWL / Crédit Agricole</p>
                  </>
                )}

                {/* Bouton Chèque/Espèces/Virement → déclaration */}
                {cartPayMode === "avoir" && (() => {
                  const totalAvoir = familyAvoirs.reduce((s, a) => s + (a.remainingAmount || 0), 0);
                  const couvre = totalAvoir >= cartTotal;
                  return cartPaySuccess ? (
                    <div className="text-center py-4">
                      <div className="text-4xl mb-2">✅</div>
                      <p className="font-body text-base font-semibold text-green-700">Avoir utilisé !</p>
                      <p className="font-body text-xs text-slate-500 mt-1">
                        {couvre ? "Votre avoir a couvert la totalité." : "Le centre équestre vous contactera pour le complément."}
                      </p>
                    </div>
                  ) : (
                    <>
                      {!couvre && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                          <p className="font-body text-xs text-orange-700">
                            Votre avoir ({totalAvoir.toFixed(2)}€) ne couvre pas la totalité ({cartTotal.toFixed(2)}€). Le reste ({(cartTotal - totalAvoir).toFixed(2)}€) sera à régler séparément.
                          </p>
                        </div>
                      )}
                      <button type="button" onClick={async () => {
                        if (!user || !family) return;
                        setPaying(true);
                        try {
                          // Tout passe par l'API serveur — les écritures Firestore
                          // (payments, encaissements, avoirs, reservations, creneaux)
                          // sont atomiques et sécurisées côté adminDb.
                          const res = await authFetch("/api/pay-with-avoir", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              cart: cart.map(i => ({
                                activityTitle: i.activityTitle,
                                childId: i.childId,
                                childName: i.childName,
                                creneauIds: i.creneauIds,
                                prixFinal: i.prixFinal,
                                isStage: i.isStage,
                                ...((i as any).sourceFamilyId ? { sourceFamilyId: (i as any).sourceFamilyId } : {}),
                              })),
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            throw new Error(data.error || "Erreur serveur");
                          }
                          setCart([]);
                          setCartPaySuccess(true);
                        } catch (e: any) {
                          console.error(e);
                          alert(`Erreur lors du paiement par avoir${e?.message ? ` : ${e.message}` : ""}.`);
                        }
                        setPaying(false);
                      }} disabled={paying}
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-body text-base font-semibold border-none cursor-pointer ${paying ? "bg-gray-200 text-gray-600" : "bg-amber-600 text-white hover:bg-amber-500"}`}>
                        {paying ? <Loader2 size={18} className="animate-spin" /> : null}
                        {paying ? "En cours..." : couvre ? `Payer avec mon avoir (${cartTotal.toFixed(2)}€)` : `Utiliser ${totalAvoir.toFixed(2)}€ d'avoir`}
                      </button>
                    </>
                  );
                })()}
                {cartPayMode !== "cb" && cartPayMode !== "avoir" && (
                  cartPaySuccess ? (
                    <div className="text-center py-4">
                      <div className="text-4xl mb-2">✅</div>
                      <p className="font-body text-base font-semibold text-green-700">Déclaration envoyée !</p>
                      <p className="font-body text-xs text-slate-500 mt-1">
                        Le centre équestre va confirmer réception de votre {cartPayMode === "cheque" ? "chèque" : cartPayMode === "especes" ? "règlement en espèces" : "virement"}.
                      </p>
                    </div>
                  ) : (
                    <>
                      <button onClick={async () => {
                        if (!user || !family) return;
                        setPaying(true);
                        try {
                          // UN SEUL appel serveur : inscriptions (places
                          // tenues) puis réservations + commande +
                          // déclaration en une transaction, email au club.
                          // Avant, le navigateur enchaînait cinq écritures :
                          // un rafraîchissement au milieu laissait un impayé
                          // orphelin sans déclaration ni email (vécu). Une
                          // fois cette requête partie, le serveur termine
                          // même si l'onglet se ferme.
                          const res = await authFetch("/api/declarer-paiement", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              mode: cartPayMode,
                              items: cart.map(i => ({
                                childId: i.childId, childName: i.childName,
                                activityTitle: i.activityTitle, isStage: i.isStage,
                                creneauIds: i.creneauIds, prixFinal: i.prixFinal,
                                ...((i as any).sourceFamilyId ? { sourceFamilyId: (i as any).sourceFamilyId } : {}),
                              })),
                            }),
                          });
                          const d = await res.json().catch(() => ({} as any));
                          if (!res.ok) throw new Error(d?.error || "Erreur. Réessayez.");
                          setCartPaySuccess(true);
                          setCart([]);
                        } catch (e: any) { console.error(e); toast(e?.message || "Erreur. Réessayez.", "error"); }
                        setPaying(false);
                      }} disabled={paying}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-body text-base font-semibold border-none cursor-pointer bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                        {paying ? <Loader2 size={18} className="animate-spin" /> : null}
                        {paying ? "Envoi..." : `Déclarer mon paiement par ${cartPayMode === "cheque" ? "chèque" : cartPayMode === "especes" ? "espèces" : "virement"}`}
                      </button>
                      <p className="font-body text-xs text-gray-500 text-center mt-2">
                        L'équipe confirmera réception lors de votre prochain passage.
                      </p>
                    </>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
  );
}
