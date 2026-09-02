"use client";

/**
 * src/app/espace-cavalier/reserver/ModaleChoixCavalier.tsx
 *
 * Le choix des cavaliers à inscrire sur un créneau, depuis la vue calendrier.
 *
 * Selon les places restantes, la même liste sert à mettre au panier ou à
 * demander une place en liste d'attente : c'est le nombre de places, pas le
 * bouton, qui décide.
 */

import { Loader2, Check } from "lucide-react";

export interface ModaleChoixCavalierProps {
  /** Le créneau visé ; la modale n'est montée que s'il existe. */
  bookingCreneau: any;
  onClose: () => void;
  children: any[];
  cart: any[];
  filter: string;
  selCavaliers: Set<string>;
  setSelCavaliers: (maj: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setShowCart: (v: boolean) => void;
  /** Places restantes sur un créneau, liste d'attente comprise. */
  spotsLeft: (c: any) => number;
  /** Le cavalier est-il déjà en liste d'attente sur ce créneau ? */
  enAttente: (creneauId: string, childId: string) => boolean;
  addCoursToCart: (creneau: any, childId: string, opts?: { viaHold?: boolean }) => void;
  addToWaitlist: (c: any, childId: string) => void | Promise<void>;
  waitlistLoading: string | null;
  waitlistSuccess: string | null;
  /** La famille connectée — son identifiant sert aux inscriptions. */
  family: any;
}

export default function ModaleChoixCavalier({
  bookingCreneau, onClose, children, cart, filter, selCavaliers, setSelCavaliers,
  setShowCart, spotsLeft, enAttente, addCoursToCart, addToWaitlist,
  waitlistLoading, waitlistSuccess, family,
}: ModaleChoixCavalierProps) {
  const setBookingCreneau = (v: any) => { if (!v) onClose(); };

  return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
        onClick={() => setBookingCreneau(null)}>
        <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="p-5 border-b border-gray-100">
            <div className="font-display text-base font-bold text-blue-800">{bookingCreneau.activityTitle}</div>
            <div className="font-body text-xs text-slate-500 mt-0.5">{bookingCreneau.startTime}–{bookingCreneau.endTime} · {bookingCreneau.monitor}</div>
          </div>
          <div className="p-5">
            {spotsLeft(bookingCreneau) === 0 ? (
              /* ── Créneau complet : inscription en liste d'attente ── */
              waitlistSuccess === bookingCreneau.id ? (
                <div className="text-center py-2">
                  <div className="flex items-center justify-center gap-2 text-green-600 font-body text-sm font-semibold mb-2">
                    <Check size={18} /> Inscrit en liste d&apos;attente !
                  </div>
                  <p className="font-body text-xs text-slate-500 mb-4">
                    Vous serez notifié par email si une place se libère.
                  </p>
                  {selCavaliers.size > 0 && (
                    <button type="button"
                      onClick={() => {
                        selCavaliers.forEach((cid) => addCoursToCart(bookingCreneau, cid));
                        setBookingCreneau(null);
                        setShowCart(true);
                      }}
                      className="w-full mt-2 py-3 rounded-xl font-body text-sm font-bold text-white bg-green-600 hover:bg-green-500 border-none cursor-pointer">
                      Ajouter {selCavaliers.size} cavalier{selCavaliers.size > 1 ? "s" : ""} au panier
                    </button>
                  )}
                  <a href={`/espace-cavalier/profil?action=ajouter-cavalier&retour=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search + (bookingCreneau ? `${window.location.search ? "&" : "?"}creneau=${bookingCreneau.id}` : "") : "/espace-cavalier/reserver")}`}
                    className="block text-center font-body text-xs font-semibold text-blue-600 no-underline mt-2 py-1.5">
                    + Ajouter un nouveau membre de la famille
                  </a>
                  <button type="button" onClick={() => setBookingCreneau(null)}
                    className="w-full py-2.5 rounded-xl font-body text-sm font-semibold text-white bg-blue-500 border-none cursor-pointer hover:bg-blue-400">
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <div className="font-body text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                    🔔 Ce créneau est complet. Inscrivez-vous en liste d&apos;attente :
                  </div>
                  <div className="font-body text-sm font-semibold text-slate-700 mb-1">Pour quel cavalier ?</div>
              <div className="font-body text-xs text-slate-500 mb-3">
                Touchez un cavalier : son inscription en liste d&apos;attente est immédiate.
              </div>
                  <div className="flex flex-col gap-2">
                    {(family?.children || [])
                      .filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id))
                      .map((ch: any) => (
                        enAttente(bookingCreneau.id, ch.id) ? (
                          <div key={ch.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-green-200 bg-green-50 font-body text-sm text-green-700">
                            <span className="font-semibold flex items-center gap-2"><Check size={14} /> {ch.firstName} — en liste d&apos;attente</span>
                          </div>
                        ) : (
                          <button type="button" key={ch.id}
                            onClick={() => addToWaitlist(bookingCreneau, ch.id)}
                            disabled={waitlistLoading === bookingCreneau.id}
                            className="flex items-center justify-between px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 font-body text-sm text-orange-700 cursor-pointer hover:bg-orange-100 disabled:opacity-50">
                            <span className="font-semibold flex items-center gap-2">
                              {waitlistLoading === bookingCreneau.id ? <Loader2 size={14} className="animate-spin" /> : "🔔"} Inscrire {ch.firstName}
                            </span>
                            {ch.galopLevel && ch.galopLevel !== "—" && (
                              <span className="font-body text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{/^\d/.test(String(ch.galopLevel)) ? `G${ch.galopLevel}` : ch.galopLevel}</span>
                            )}
                          </button>
                        )
                      ))}
                    {(family?.children || []).filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id)).length === 0 && (
                      (children.length === 0 ? (
                  <div className="text-center py-2">
                    <p className="font-body text-sm text-slate-600 mb-2">
                      Vous n&apos;avez pas encore ajouté de cavalier à votre famille.
                    </p>
                    <a href={`/espace-cavalier/profil?action=ajouter-cavalier&retour=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search + (bookingCreneau ? `${window.location.search ? "&" : "?"}creneau=${bookingCreneau.id}` : "") : "/espace-cavalier/reserver")}`} className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold no-underline">
                      Ajouter un cavalier
                    </a>
                  </div>
                ) : <p className="font-body text-sm text-slate-500 text-center py-2">Tous vos cavaliers sont déjà inscrits à ce créneau.</p>)
                    )}
                  </div>
                  <button type="button" onClick={() => { setSelCavaliers(new Set()); setBookingCreneau(null); }}
                    className="w-full mt-3 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
                    Annuler
                  </button>
                </>
              )
            ) : (
            <>
            <div className="font-body text-sm font-semibold text-slate-700 mb-3">Pour quel cavalier ?</div>
            <div className="flex flex-col gap-2">
              {(family?.children || [])
                .filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id))
                .map((ch: any) => {
                  // Règle : 12 ans minimum pour les promenades
                  let tooYoung = false;
                  if (bookingCreneau.activityType === "balade") {
                    const bd: any = ch.birthDate;
                    const bdDate = bd?.seconds ? new Date(bd.seconds * 1000) : (bd ? new Date(bd) : null);
                    if (!bdDate || isNaN(bdDate.getTime())) tooYoung = true;
                    else if (bdDate.getFullYear() > new Date().getFullYear() - 12) tooYoung = true;
                  }
                  // Deja dans le panier pour CE creneau : plus selectionnable
                  // — un double ajout ferait payer deux fois la meme place.
                  const dejaAuPanier = cart.some((i) =>
                    i.childId === ch.id && i.creneauIds.includes(bookingCreneau.id));
                  return (
                    <button type="button" key={ch.id}
                      onClick={() => {
                        if (dejaAuPanier) return;
                        if (tooYoung) {
                          alert(`Les promenades sont réservées aux cavaliers de 12 ans et plus (nés en ${new Date().getFullYear() - 12} ou avant).`);
                          return;
                        }
                        setSelCavaliers((prev) => {
                          const n = new Set(prev);
                          if (n.has(ch.id)) n.delete(ch.id); else n.add(ch.id);
                          return n;
                        });
                      }}
                      disabled={tooYoung || dejaAuPanier}
                      title={dejaAuPanier ? "Déjà dans votre panier pour ce créneau" : tooYoung ? "Promenades réservées aux 12 ans et plus" : undefined}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border font-body text-sm transition-all ${
                        dejaAuPanier
                          ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                          : tooYoung
                          ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                          : selCavaliers.has(ch.id)
                            ? "border-green-500 bg-green-50 text-green-800 cursor-pointer"
                            : "border-blue-200 bg-blue-50 text-blue-800 cursor-pointer hover:bg-blue-100"
                      }`}>
                      <span className="font-semibold">
                        {selCavaliers.has(ch.id) && !dejaAuPanier && "✓ "}{ch.firstName}
                        {dejaAuPanier && <span className="ml-2 text-xs">🛒 Déjà au panier</span>}
                        {!dejaAuPanier && tooYoung && <span className="ml-2 text-xs">🔒 Moins de 12 ans</span>}
                      </span>
                      {ch.galopLevel && ch.galopLevel !== "—" && (
                        <span className="font-body text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{/^\d/.test(String(ch.galopLevel)) ? `G${ch.galopLevel}` : ch.galopLevel}</span>
                      )}
                    </button>
                  );
                })
              }
              {/* Validation de la selection : la coche multiple existait
                  mais SANS bouton dans cette branche — il n'etait present
                  que cote liste d'attente. On inscrit tous les cavaliers
                  coches en une fois, puis on ouvre le panier. */}
              {/* Toujours affiche : la selection multiple a rendu le clic
                  « silencieux » (il coche au lieu d'ajouter) — sans bouton
                  visible en permanence, la famille croit que rien ne se
                  passe. Desactive tant que rien n'est coche. */}
              <button type="button"
                disabled={selCavaliers.size === 0}
                onClick={() => {
                  selCavaliers.forEach((cid) => addCoursToCart(bookingCreneau, cid));
                  setSelCavaliers(new Set());
                  setBookingCreneau(null);
                  setShowCart(true);
                }}
                className={`w-full py-3 rounded-xl font-body text-sm font-bold border-none ${
                  selCavaliers.size === 0
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "text-white bg-green-600 hover:bg-green-500 cursor-pointer"
                }`}>
                {selCavaliers.size === 0
                  ? "Sélectionnez un cavalier ci-dessus"
                  : `Valider — ${selCavaliers.size} cavalier${selCavaliers.size > 1 ? "s" : ""} au panier`}
              </button>
              {(family?.children || []).filter((ch: any) => !(bookingCreneau.enrolled || []).some((e: any) => e.childId === ch.id)).length === 0 && (
                (children.length === 0 ? (
                  <div className="text-center py-2">
                    <p className="font-body text-sm text-slate-600 mb-2">
                      Vous n&apos;avez pas encore ajouté de cavalier à votre famille.
                    </p>
                    <a href={`/espace-cavalier/profil?action=ajouter-cavalier&retour=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search + (bookingCreneau ? `${window.location.search ? "&" : "?"}creneau=${bookingCreneau.id}` : "") : "/espace-cavalier/reserver")}`} className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold no-underline">
                      Ajouter un cavalier
                    </a>
                  </div>
                ) : <p className="font-body text-sm text-slate-500 text-center py-2">Tous vos cavaliers sont déjà inscrits à ce créneau.</p>)
              )}
            </div>
            <a href={`/espace-cavalier/profil?action=ajouter-cavalier&retour=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search + (bookingCreneau ? `${window.location.search ? "&" : "?"}creneau=${bookingCreneau.id}` : "") : "/espace-cavalier/reserver")}`}
              className="block text-center font-body text-xs font-semibold text-blue-600 no-underline mt-2 py-1.5">
              + Ajouter un nouveau membre de la famille
            </a>
            <button type="button" onClick={() => setBookingCreneau(null)}
              className="w-full mt-3 py-2.5 rounded-xl font-body text-sm text-slate-500 bg-gray-100 border-none cursor-pointer">
              Annuler
            </button>
            </>
            )}
          </div>
        </div>
      </div>
  );
}
