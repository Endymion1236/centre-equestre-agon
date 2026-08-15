"use client";
/**
 * src/app/admin/planning/ListeInscrits.tsx
 *
 * Liste des cavaliers inscrits sur le créneau, et juste en dessous, ceux qui
 * ne sont PAS attendus cette semaine (rythme une semaine sur deux).
 *
 * C'est l'écran que le moniteur regarde avant d'entrer en carrière. Tout ce
 * qu'il affiche répond à une question pratique : qui vient, quel âge, quel
 * galop, qui a payé, qui n'est qu'en pré-inscription, qui occupe une place
 * simplement « tenue » le temps d'un paiement en ligne. La couleur de la
 * pastille vient d'une fonction unique (statutPaiementInscrit) pour que le
 * planning et le montoir ne racontent jamais deux histoires différentes.
 *
 * Purement présentationnel : les actions (surligner, envoyer une fiche,
 * confirmer une pré-inscription, désinscrire) écrivent dans Firestore et
 * restent donc chez l'orchestrateur.
 */

import { Check, Loader2, Trash2 } from "lucide-react";
import { estQuinzaine, libelleRythme, expliqueRythme } from "@/lib/rythme";
import { calcAge, nomActuel, statutPaiementInscrit } from "./enroll-helpers";

export default function ListeInscrits({
  creneau, enrolled, families, allFamilies, payments, nonAttendusQuinzaine,
  isAdmin, isMoniteur,
  highlightBusy, onToggleHighlight,
  sendingFicheFor, onEnvoyerFiche,
  conversion, onConvertirPreinscription,
  unenrolling, onDesinscrire,
}: {
  creneau: any;
  enrolled: any[];
  /** Familles du planning : source du nom À JOUR d'un inscrit. */
  families: any[];
  /** Familles + celles créées dans la modale : source de l'âge et du galop. */
  allFamilies: any[];
  payments: any[];
  nonAttendusQuinzaine: any[];
  isAdmin: boolean;
  isMoniteur: boolean;
  highlightBusy: string;
  onToggleHighlight: (e: any) => void;
  sendingFicheFor: string | null;
  onEnvoyerFiche: (e: any) => void;
  conversion: string | null;
  onConvertirPreinscription: (e: any) => void;
  unenrolling: string;
  onDesinscrire: (childId: string) => void;
}) {
  return (
    <>
          {enrolled.length === 0 ? <p className="font-body text-sm text-slate-500 italic mb-4">Aucun</p> :
          <div className="flex flex-col gap-2 mb-4">{enrolled.map((e: any) => {
            const { statusLabel, statusColor, hasPaid, isForfaitPaid, isForfaitPending } =
              statutPaiementInscrit(e, payments, creneau);
            const enrolledFam = allFamilies.find(f => f.firestoreId === e.familyId);
            const enrolledChild = (enrolledFam?.children || []).find((c: any) => c.id === e.childId);
            const age = calcAge(enrolledChild?.birthDate);
            const galop = (enrolledChild as any)?.galopLevel || "—";
            return (
              <div key={e.childId} className="flex flex-wrap items-center justify-between gap-y-1.5 bg-sand rounded-lg px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 flex-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} title={statusLabel || undefined}></span>
                  <a
                    href={
                      isMoniteur && !isAdmin
                        // Moniteur : on va directement à la page progression (pas accès à /admin/cavaliers)
                        ? `/admin/progression/${e.childId}?familyId=${encodeURIComponent(e.familyId || "")}`
                        // Admin : fiche famille complète avec le bon enfant ciblé
                        : `/admin/cavaliers?search=${encodeURIComponent(e.familyName || e.childName)}&showProgression=${e.childId}`
                    }
                    target="_blank" rel="noopener noreferrer"
                    className={`font-body text-sm font-semibold hover:text-blue-500 hover:underline no-underline cursor-pointer truncate ${e.highlight ? "text-slate-900 px-1 rounded" : "text-blue-800"}`}
                    style={e.highlight ? { backgroundColor: "#fef08a", boxShadow: "0 0 0 2px #fef08a" } : undefined}
                    title="Ouvrir la fiche cavalier">
                    {nomActuel(e, families)}
                  </a>
                  {age && <span className="font-body text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full flex-shrink-0">{age}</span>}
                  {galop && galop !== "—" && <span className="font-body text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full flex-shrink-0">{galop}</span>}
                  {statusLabel && <span className={`font-body text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 hidden sm:inline ${isForfaitPaid ? "text-emerald-700 bg-emerald-50" : isForfaitPending ? "text-amber-700 bg-amber-50" : hasPaid ? "text-green-700 bg-green-50" : "text-orange-600 bg-orange-50"}`}>{statusLabel}</span>}
                  {(e as any).preinscription && (
                    <span title="Pré-inscription : aucun paiement ni facture n'a été créé"
                      className="font-body text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 text-indigo-700 bg-indigo-100">
                      ✎ pré-inscrit
                    </span>
                  )}
                  {/* Rythme quinzaine : dit au moniteur que ce cavalier ne
                      revient pas la semaine prochaine, avant qu'il ne le
                      cherche. */}
                  {estQuinzaine(e) && (
                    <span title={expliqueRythme(creneau.date, e)}
                      className="font-body text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 text-sky-700 bg-sky-100">
                      ⇄ {libelleRythme(e)}
                    </span>
                  )}
                  {/* Place TENUE : inscription provisoire posée le temps d'un
                      paiement en ligne. Elle se libère toute seule à
                      expiration — à ne pas confondre avec une inscription
                      ferme en attente de chèque. */}
                  {(e as any).pending && (e as any).holdUntil && (() => {
                    const fin = new Date((e as any).holdUntil);
                    const expiree = fin.getTime() < Date.now();
                    return (
                      <span
                        title={expiree
                          ? `Place tenue expirée le ${fin.toLocaleString("fr-FR")} — sera libérée au prochain passage automatique`
                          : `Place tenue pendant le paiement, jusqu'à ${fin.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                        className={`font-body text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          expiree ? "text-rose-700 bg-rose-100" : "text-violet-700 bg-violet-100"
                        }`}>
                        {expiree ? "⏳ hold expiré" : "⏳ place tenue"}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => onToggleHighlight(e)} disabled={highlightBusy === e.childId}
                    title={e.highlight ? "Retirer le surlignage" : "Surligner"}
                    className={`border-none cursor-pointer px-1.5 py-0.5 rounded text-sm leading-none disabled:opacity-40 ${e.highlight ? "bg-yellow-200 opacity-100" : "bg-transparent opacity-40 hover:opacity-80"}`}>
                    🖍️
                  </button>
                  <a
                    href={`/admin/progression/${e.childId}?familyId=${encodeURIComponent(e.familyId || "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 font-body text-xs text-purple-500 hover:text-purple-700 bg-transparent no-underline px-2 py-1 rounded hover:bg-purple-50"
                    title={`Progression de ${e.childName}`}>
                    <span>📊</span>
                  </a>
                  <button onClick={() => onEnvoyerFiche(e)} disabled={sendingFicheFor !== null}
                    className="flex items-center gap-1 font-body text-xs text-green-500 hover:text-green-700 bg-transparent border-none cursor-pointer px-2 py-1 rounded hover:bg-green-50 flex-shrink-0 disabled:opacity-40"
                    title={`Envoyer la fiche d'évaluation de ${e.childName} par email à la famille`}>
                    {sendingFicheFor === e.childId ? <Loader2 size={12} className="animate-spin" /> : <span>✉️</span>}
                  </button>
                  {(e as any).preinscription && (
                    <button onClick={() => onConvertirPreinscription(e)} disabled={conversion === e.childId}
                      title="Transformer en inscription définitive : le paiement sera créé"
                      className="flex items-center gap-1 font-body text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-transparent border-none cursor-pointer px-2 py-1 rounded hover:bg-indigo-50 flex-shrink-0 disabled:opacity-40">
                      {conversion === e.childId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      <span className="hidden sm:inline">Confirmer</span>
                    </button>
                  )}
                  <button onClick={() => onDesinscrire(e.childId)} disabled={unenrolling===e.childId}
                    className="flex items-center gap-1 font-body text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer px-2 py-1 rounded hover:bg-red-50 flex-shrink-0">
                    {unenrolling===e.childId ? <Loader2 size={12} className="animate-spin"/> : <Trash2 size={12}/>}
                  </button>
                </div>
              </div>
            );
          })}</div>}

          {/* ── Quinzaine : attendus la semaine prochaine ── */}
          {nonAttendusQuinzaine.length > 0 && (
            <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
              <div className="font-body text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Pas attendus cette semaine ({nonAttendusQuinzaine.length})
              </div>
              <div className="mt-1.5 flex flex-col gap-1">
                {nonAttendusQuinzaine.map((f: any) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-body text-sm text-slate-400 line-through">{f.childName}</span>
                    <span title={expliqueRythme(creneau.date, f)}
                      className="font-body text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-slate-500 bg-slate-200">
                      ⇄ {libelleRythme(f)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 font-body text-[11px] text-slate-500">
                Garde alternée : ils reviennent la semaine prochaine. Ce n&apos;est pas une
                absence, ne les comptez pas sur la feuille d&apos;appel.
              </div>
            </div>
          )}
    </>
  );
}
