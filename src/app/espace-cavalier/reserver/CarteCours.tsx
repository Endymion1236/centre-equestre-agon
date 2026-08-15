"use client";

/**
 * src/app/espace-cavalier/reserver/CarteCours.tsx
 *
 * La carte d'un créneau non-stage (cours, balade, compétition, anniversaire)
 * dans la vue liste : horaire, prix, places, choix du cavalier, liste d'attente
 * et bandeau « place réservée » quand la famille a été notifiée.
 *
 * Sortie de `page.tsx` pour tenir dans un écran : la carte est courte mais
 * porte deux règles qu'il ne faut pas perdre de vue en la modifiant.
 *  - Les promenades sont réservées aux 12 ans et plus (année des 12 ans) :
 *    le bouton du cavalier trop jeune est barré et désactivé, et si AUCUN
 *    cavalier de la famille n'a l'âge, on l'explique au lieu de laisser une
 *    liste vide inexplicable.
 *  - Le bandeau de place réservée n'était au départ qu'informatif : la famille
 *    lisait que la place lui était gardée sans aucun moyen de l'accepter. Le
 *    bouton « J'accepte cette place » doit rester.
 */

import { Card, Badge } from "@/components/ui";
import { Users, Loader2, Check } from "lucide-react";
import { typeLabels } from "./libelles";
import type { Creneau } from "./types";
import { holdActive, placesRestantes, tropJeunePourBalade } from "./utils-reservation";

export default function CarteCours({
  creneau: c, familyId, cavaliers,
  selectedCreneau, setSelectedCreneau, setSelectedChildren,
  addCoursToCart, addToWaitlist, setShowCart,
  waitlistSuccess, waitlistLoading,
}: {
  creneau: Creneau;
  familyId: string;
  /** Cavaliers de la famille (propres + liés). */
  cavaliers: any[];
  selectedCreneau: Creneau | null;
  setSelectedCreneau: (c: Creneau | null) => void;
  setSelectedChildren: (ids: string[]) => void;
  addCoursToCart: (creneau: Creneau, childId: string, opts?: { viaHold?: boolean }) => void;
  addToWaitlist: (c: Creneau, childId: string) => void;
  setShowCart: (v: boolean) => void;
  waitlistSuccess: string | null;
  waitlistLoading: string | null;
}) {
    const prix = (c as any).priceTTC || c.priceHT * (1 + (c.tvaTaux || 5.5) / 100);
    const spots = placesRestantes(c, familyId);
    const tl = typeLabels[c.activityType] || { label: c.activityType, color: "#666" };
    const isSelected = selectedCreneau?.id === c.id;
    return (
      <Card padding="sm" className={`cursor-pointer ${isSelected ? "ring-2 ring-blue-500" : ""} ${spots === 0 ? "opacity-80" : ""}`} onClick={() => { if (spots > 0) { setSelectedCreneau(isSelected ? null : c); setSelectedChildren([]); } else { setSelectedCreneau(isSelected ? null : c); } }}>
        {(() => {
          const hold = (c as any).waitlistHold;
          if (!holdActive(c) || hold?.familyId !== familyId) return null;
          const fin = new Date(hold.until);
          return (
            <div className="mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <div className="font-body text-xs font-semibold text-green-800">
                🎉 Place réservée pour {hold.childName}
              </div>
              <div className="mt-0.5 font-body text-[11px] text-green-700">
                Confirmez avant le{" "}
                {fin.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à{" "}
                {fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.
              </div>
              {/* Le bandeau etait purement informatif : la famille
                  lisait que la place lui etait gardee sans aucun
                  moyen de l'accepter. Ce bouton ajoute directement
                  l'enfant concerne au panier et ouvre le panier. */}
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  addCoursToCart(c, hold.childId);
                  setShowCart(true);
                }}
                className="w-full mt-2 py-2.5 rounded-lg font-body text-xs font-bold text-white bg-green-600 hover:bg-green-500 border-none cursor-pointer">
                ✓ J'accepte cette place — passer au paiement
              </button>
            </div>
          );
        })()}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-1 h-10 rounded-full" style={{ backgroundColor: tl.color }} />
            <div>
              <div className="font-body text-sm font-semibold text-blue-800">{c.activityTitle}</div>
              <div className="font-body text-xs text-slate-600">{c.startTime}–{c.endTime} · {c.monitor}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-body text-sm font-bold text-blue-500">{prix.toFixed(0)}€</div>
            <Badge color={spots > 2 ? "green" : spots > 0 ? "orange" : "red"}>
              {spots > 0 ? `${spots} pl.` : "Complet"}
            </Badge>
          </div>
        </div>

        {/* Créneau disponible — sélection enfant */}
        {isSelected && spots > 0 && (
          <div className="mt-3 pt-3 border-t border-blue-100">
            <div className="font-body text-xs text-slate-600 mb-2">Pour quel enfant ?</div>
            <div className="flex flex-wrap gap-2">
              {cavaliers.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => {
                // Règle : 12 ans minimum pour les promenades (année des 12 ans)
                const tooYoung = c.activityType === "balade" && tropJeunePourBalade(ch);
                return (
                  <button key={ch.id}
                    onClick={(e) => { e.stopPropagation(); addCoursToCart(c, ch.id); }}
                    disabled={tooYoung}
                    title={tooYoung ? "Promenades réservées aux 12 ans et plus" : undefined}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-body text-xs cursor-pointer ${
                      tooYoung
                        ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed line-through"
                        : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                    }`}>
                    <Users size={12} /> {ch.firstName}
                    {tooYoung && <span className="ml-1">🔒</span>}
                  </button>
                );
              })}
              {/* Message si tous les enfants sont trop jeunes pour cette balade */}
              {c.activityType === "balade" && cavaliers.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).length > 0 && cavaliers.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).every((ch: any) => tropJeunePourBalade(ch)) && (
                <div className="w-full mt-1 font-body text-[11px] text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
                  ⚠️ Les promenades sont réservées aux cavaliers de 12 ans et plus (nés en {new Date().getFullYear() - 12} ou avant).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Créneau complet — liste d'attente */}
        {isSelected && spots === 0 && (
          <div className="mt-3 pt-3 border-t border-orange-100">
            {waitlistSuccess === c.id ? (
              <div className="flex items-center gap-2 text-green-600 font-body text-xs">
                <Check size={14} /> Inscrit en liste d&apos;attente ! Vous serez notifié par email si une place se libère.
              </div>
            ) : (
              <>
                <div className="font-body text-xs text-orange-600 mb-2">
                  🔔 Ce créneau est complet. Inscrivez-vous en liste d&apos;attente :
                </div>
                <div className="flex flex-wrap gap-2">
                  {cavaliers.filter((ch: any) => !(c.enrolled || []).some((e: any) => e.childId === ch.id)).map((ch: any) => (
                    <button key={ch.id}
                      onClick={(e) => { e.stopPropagation(); addToWaitlist(c, ch.id); }}
                      disabled={waitlistLoading === c.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 font-body text-xs text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                      {waitlistLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : "🔔"} {ch.firstName}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Card>
    );
}
