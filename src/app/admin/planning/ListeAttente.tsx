"use client";
/**
 * src/app/admin/planning/ListeAttente.tsx
 *
 * Tout ce qui concerne les familles qui n'ont PAS (encore) de place :
 *  - le bandeau « place réservée » quand un désistement a été notifié ;
 *  - la file d'attente elle-même, dans l'ordre d'arrivée ;
 *  - l'ajout manuel en attente quand le créneau est complet.
 *
 * Enjeu métier commun aux trois : une place tenue pour quelqu'un ne doit
 * jamais être donnée en silence à un autre. Si l'admin remplit la place sans
 * libérer la réservation, la demande de la famille prévenue reste bloquée en
 * « notifiée » et ne sera plus jamais représentée à personne — d'où le
 * bandeau explicite et son bouton de libération.
 *
 * Présentationnel : les écritures (accepter, retirer, libérer, ajouter)
 * restent chez l'orchestrateur.
 */

import { Loader2, Trash2, Search } from "lucide-react";

/** Bandeau « place réservée à … » (hold posé par la notification de place). */
export function BandeauPlaceTenue({ holdActif, holdReleasing, onLiberer }: {
  holdActif: any;
  holdReleasing: boolean;
  onLiberer: () => void;
}) {
  if (!holdActif) return null;
  return (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <div className="font-body text-xs font-semibold text-amber-800">
                🔒 Place réservée à {holdActif.childName}
              </div>
              <div className="mt-0.5 font-body text-[11px] text-amber-700">
                Prévenue par email qu&apos;une place s&apos;est libérée, cette famille a jusqu&apos;au{" "}
                {new Date(holdActif.until).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à{" "}
                {new Date(holdActif.until).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} pour réserver.
                Si vous inscrivez quelqu&apos;un d&apos;autre sur cette place, libérez d&apos;abord la réservation —
                sinon sa demande resterait bloquée et elle ne serait plus jamais renotifiée.
              </div>
              <button onClick={onLiberer} disabled={holdReleasing}
                className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-body text-[11px] font-semibold text-amber-800 cursor-pointer hover:bg-amber-100 disabled:opacity-50">
                {holdReleasing ? <Loader2 size={12} className="animate-spin inline" /> : "Libérer la réservation"}
              </button>
            </div>
  );
}

/** File d'attente du créneau, dans l'ordre d'arrivée. */
export default function ListeAttente({ waitlist, spots, waitlistLoading, waitRemoving, onAccepter, onRetirer }: {
  waitlist: any[];
  spots: number;
  waitlistLoading: boolean;
  waitRemoving: string;
  onAccepter: (entry: any) => void;
  onRetirer: (entry: any) => void;
}) {
  if (waitlist.length === 0) return null;
  return (
            <div className="mb-4 border border-orange-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50">
                <span className="font-body text-xs font-semibold text-orange-700">🔔 Liste d'attente ({waitlist.length})</span>
                {spots > 0 && <span className="font-body text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded">Place disponible !</span>}
              </div>
              {waitlist.map((entry: any, i: number) => (
                <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 border-t border-orange-100">
                  <div>
                    <div className="font-body text-sm font-semibold text-blue-800">
                      <span className="text-orange-400 mr-1.5">#{i + 1}</span>
                      {entry.childName}
                    </div>
                    <div className="font-body text-xs text-slate-500">{entry.familyName}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onAccepter(entry)}
                      disabled={waitlistLoading || spots <= 0}
                      className={`font-body text-xs font-semibold px-3 py-1.5 rounded-lg border-none cursor-pointer ${spots > 0 ? "bg-green-500 text-white hover:bg-green-600" : "bg-gray-100 text-slate-400 cursor-not-allowed"} disabled:opacity-50`}>
                      {waitlistLoading ? <Loader2 size={12} className="animate-spin inline" /> : "✓ Accepter"}
                    </button>
                    <button
                      onClick={() => onRetirer(entry)}
                      disabled={waitRemoving === entry.id}
                      title="Retirer de la liste d'attente"
                      className="bg-transparent border-none cursor-pointer text-red-400 hover:text-red-600 px-1 disabled:opacity-40">
                      {waitRemoving === entry.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
  );
}

/**
 * Ajout MANUEL en liste d'attente (admin), affiché quand le créneau est
 * complet : une famille appelle, on l'inscrit en attente sans qu'elle ait à
 * passer par l'espace famille.
 */
export function AjoutListeAttente({
  creneau, filteredFamilies, allFamilies, search, selFam, selChild,
  waitAdding, onChangeRecherche, onChangeFamille, onChangeCavalier, onAjouter,
}: {
  creneau: any;
  filteredFamilies: any[];
  allFamilies: any[];
  search: string;
  selFam: string;
  selChild: string;
  waitAdding: boolean;
  onChangeRecherche: (v: string) => void;
  onChangeFamille: (v: string) => void;
  onChangeCavalier: (v: string) => void;
  onAjouter: () => void;
}) {
  return (
            <div className="mb-4 border-t border-blue-500/8 pt-4">
              <h3 className="font-body text-sm font-semibold text-orange-700 mb-3">
                🔔 Ajouter en liste d&apos;attente
              </h3>
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => onChangeRecherche(e.target.value)}
                    placeholder="Nom parent, prénom enfant, email..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-orange-400 focus:outline-none" />
                </div>
                <select value={selFam} onChange={e => onChangeFamille(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream">
                  <option value="">Famille ({filteredFamilies.length})</option>
                  {filteredFamilies.map(f => {
                    const n = (f.children || []).map((c: any) => c.firstName).join(", ");
                    return <option key={f.firestoreId} value={f.firestoreId}>{f.parentName} {n ? `(${n})` : ""}</option>;
                  })}
                </select>
                {selFam && (
                  <select value={selChild} onChange={e => onChangeCavalier(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream">
                    <option value="">Cavalier…</option>
                    {(allFamilies.find((f: any) => f.firestoreId === selFam)?.children || []).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName || ""}</option>
                    ))}
                  </select>
                )}
                <button onClick={onAjouter} disabled={!selChild || waitAdding}
                  className={`w-full py-2.5 rounded-lg font-body text-sm font-semibold border-none ${!selChild || waitAdding ? "bg-gray-100 text-slate-400 cursor-not-allowed" : "bg-orange-500 text-white cursor-pointer hover:bg-orange-600"}`}>
                  {waitAdding ? <Loader2 size={14} className="animate-spin inline" /> : "🔔 Mettre en liste d'attente"}
                </button>
                <p className="font-body text-[11px] text-slate-500">
                  La famille sera prévenue par email si une place se libère
                  {(creneau.activityType === "stage" || creneau.activityType === "stage_journee") ? " sur la semaine complète" : ""}.
                </p>
              </div>
            </div>
  );
}
