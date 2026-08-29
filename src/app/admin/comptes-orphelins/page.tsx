"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { UserX, Mail, Baby, Loader2, RefreshCw, AlertTriangle, Check, Phone, FileUp, X } from "lucide-react";

/**
 * Comptes orphelins — écran de rattrapage.
 *
 * Un compte orphelin naît d'une fiche famille sans adresse email : quand le
 * parent se connecte, l'application ne retrouve pas sa fiche et en crée une
 * seconde, vide. Ses cavaliers restent sur la fiche du bureau, et son adresse
 * est désormais prise par le compte vide.
 *
 * L'écran montre les deux bouts : les orphelins déjà créés, et les fiches sans
 * adresse qui en fabriqueront un à la prochaine connexion. C'est cette
 * deuxième liste qu'il faut vider avant d'envoyer un mail de pré-inscription.
 */

interface Rapprochement {
  id: string;
  parentName: string;
  parentEmail: string;
  nbEnfants: number;
  memeEmail: boolean;
}

interface Orphelin {
  uid: string;
  email: string;
  displayName: string;
  provider: string;
  creePar: string;
  ficheVide: boolean;
  creeLe: string | null;
  derniereConnexion: string | null;
  rapprochements: Rapprochement[];
}

interface SansAdresse {
  id: string;
  parentName: string;
  parentPhone: string;
  nbEnfants: number;
  adressePresente: boolean;
  accountType: string;
}

interface CandidatEmail {
  email: string;
  source: string;
  fiabilite: "enfant" | "parent";
}

interface Proposition {
  familyId: string;
  parentName: string;
  parentPhone: string;
  enfants: string[];
  candidats: CandidatEmail[];
  ambigu: boolean;
}

const dateFr = (iso: string | null) =>
  !iso ? "—" : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default function ComptesOrphelinsPage() {
  const { isAdmin, user } = useAuth();
  const [orphelins, setOrphelins] = useState<Orphelin[]>([]);
  const [sansAdresse, setSansAdresse] = useState<SansAdresse[]>([]);
  const [nbComptes, setNbComptes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Rapprochement par l'export CSV de l'ancien logiciel ──
  const [propositions, setPropositions] = useState<Proposition[] | null>(null);
  const [csvStats, setCsvStats] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);
  const [rattachees, setRattachees] = useState<Record<string, string>>({}); // familyId → email posé
  const [rattachEnCours, setRattachEnCours] = useState<string | null>(null);

  const proposerDepuisCsv = async (fichier: File) => {
    if (!user) return;
    setCsvLoading(true); setError("");
    try {
      const csv = await fichier.text();
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/rattacher-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "proposer", csv }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setPropositions(d.propositions || []);
      setCsvStats(`${d.nbLignesCsv} cavaliers dans le fichier · ${d.trouvees} fiche(s) sur ${d.nbSansAdresse} avec au moins une adresse trouvée`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCsvLoading(false);
    }
  };

  const rattacher = async (familyId: string, email: string) => {
    if (!user || rattachEnCours) return;
    setRattachEnCours(familyId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/rattacher-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "appliquer", familyId, email }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setRattachees(prev => ({ ...prev, [familyId]: email }));
      setSansAdresse(prev => prev.filter(f => f.id !== familyId));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setRattachEnCours(null);
    }
  };

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/admin/comptes-orphelins", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Erreur");
      setOrphelins(d.orphelins || []);
      setSansAdresse(d.sansAdresse || []);
      setNbComptes(d.nbComptes || 0);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
            <UserX className="text-amber-500" /> Comptes orphelins
          </h1>
          <p className="font-body text-sm text-slate-600">
            Un compte de connexion sans cavalier rattaché. Il se crée tout seul quand une
            famille se connecte alors que sa fiche n&apos;a pas d&apos;adresse email — et il
            garde ensuite cette adresse, qui ne peut plus être donnée à la bonne fiche.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="shrink-0 flex items-center gap-2 font-body text-xs font-semibold text-slate-600 bg-white px-3 py-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" /></div>
      ) : (
        <>
          {/* ── Fiches sans adresse : le prochain orphelin ── */}
          <section className="mb-8">
            <h2 className="font-display text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              Fiches sans adresse ({sansAdresse.length})
            </h2>
            <p className="font-body text-sm text-slate-600 mb-3">
              Ces fiches ont des cavaliers mais pas d&apos;adresse exploitable. Chacune
              fabriquera un compte orphelin à la première connexion de la famille.
              À compléter <strong>avant</strong> d&apos;envoyer le mail de pré-inscription.
            </p>
            {/* ── Croiser avec l'export CSV de l'ancien logiciel ── */}
            {sansAdresse.length > 0 && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3">
                <div className="font-body text-sm font-semibold text-blue-900 flex items-center gap-2 mb-1">
                  <FileUp size={15} /> Retrouver les adresses dans l&apos;export de l&apos;ancien logiciel
                </div>
                <p className="font-body text-xs text-slate-600 mb-2">
                  Téléverse l&apos;export « Liste cavaliers » (CSV, colonnes Nom / Prénom / E-mail /
                  E-mail tuteur) : chaque fiche sans adresse est croisée avec le fichier, par le nom
                  des cavaliers d&apos;abord. Rien n&apos;est écrit sans un clic de ta part, et une
                  adresse déjà en place n&apos;est jamais écrasée.
                </p>
                <label className="inline-flex items-center gap-2 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-lg cursor-pointer">
                  {csvLoading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                  {csvLoading ? "Croisement en cours…" : "Choisir le fichier CSV"}
                  <input type="file" accept=".csv,text/csv" className="hidden" disabled={csvLoading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) proposerDepuisCsv(f); e.target.value = ""; }} />
                </label>
                {csvStats && <span className="ml-3 font-body text-xs text-slate-500">{csvStats}</span>}
              </div>
            )}

            {propositions && propositions.length > 0 && (
              <div className="mb-5 flex flex-col gap-2">
                {propositions.map(p => {
                  const posee = rattachees[p.familyId];
                  return (
                    <div key={p.familyId}
                      className={`rounded-xl border px-4 py-3 ${posee ? "border-green-200 bg-green-50/60" : p.candidats.length === 0 ? "border-gray-200 bg-gray-50/60" : "border-blue-200 bg-white"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-body font-semibold text-slate-800 truncate">{p.parentName || "— sans nom —"}</div>
                          <div className="font-body text-xs text-slate-500 mt-0.5">
                            {p.enfants.join(", ")}
                            {p.parentPhone && <span> · {p.parentPhone}</span>}
                          </div>
                        </div>
                        <Link href={`/admin/cavaliers?id=${p.familyId}`}
                          className="shrink-0 font-body text-[11px] text-blue-600 no-underline hover:underline">
                          ouvrir
                        </Link>
                      </div>

                      {posee ? (
                        <div className="mt-2 font-body text-sm text-green-700 flex items-center gap-1.5">
                          <Check size={14} /> Adresse rattachée : <strong>{posee}</strong>
                        </div>
                      ) : p.candidats.length === 0 ? (
                        <div className="mt-2 font-body text-xs text-slate-500 flex items-center gap-1.5">
                          <X size={13} /> Aucune adresse trouvée dans le fichier — à récupérer par téléphone.
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {p.ambigu && (
                            <div className="font-body text-[11px] text-amber-700">
                              Plusieurs adresses possibles — vérifie avant de choisir :
                            </div>
                          )}
                          {p.candidats.map(c => (
                            <div key={c.email} className="flex items-center justify-between gap-3 bg-sand rounded-lg px-3 py-2">
                              <div className="font-body text-sm text-slate-700 min-w-0 truncate">
                                <span className="font-semibold">{c.email}</span>
                                <span className="text-slate-500 text-xs"> · via {c.source}</span>
                              </div>
                              <button type="button" onClick={() => rattacher(p.familyId, c.email)}
                                disabled={rattachEnCours === p.familyId}
                                className="shrink-0 font-body text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                                {rattachEnCours === p.familyId ? "…" : "Rattacher"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {sansAdresse.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-body text-sm text-green-700 flex items-center gap-2">
                <Check size={16} /> Toutes les fiches avec cavaliers ont une adresse email.
              </div>
            ) : propositions ? null : (
              <div className="flex flex-col gap-2">
                {sansAdresse.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50/50 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="font-body font-semibold text-slate-800 truncate">
                        {f.parentName || "— sans nom —"}
                        {f.accountType !== "particulier" && (
                          <span className="ml-2 font-normal text-xs text-slate-500">🏫 établissement</span>
                        )}
                      </div>
                      <div className="font-body text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-0.5">
                        <span className="inline-flex items-center gap-1"><Baby size={11} />{f.nbEnfants} cavalier{f.nbEnfants > 1 ? "s" : ""}</span>
                        {f.parentPhone && <span className="inline-flex items-center gap-1"><Phone size={11} />{f.parentPhone}</span>}
                        {f.adressePresente && <span className="text-orange-600">adresse présente mais mal formée</span>}
                      </div>
                    </div>
                    <Link href={`/admin/cavaliers?id=${f.id}`}
                      className="shrink-0 font-body text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg no-underline">
                      Ouvrir la fiche
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Orphelins déjà créés ── */}
          <section>
            <h2 className="font-display text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <UserX size={18} className="text-amber-500" />
              Comptes orphelins ({orphelins.length})
            </h2>
            <p className="font-body text-sm text-slate-600 mb-3">
              Comptes de connexion sans cavalier, sur {nbComptes} compte{nbComptes > 1 ? "s" : ""} famille.
              Quand une fiche du bureau correspond, elle est proposée ci-dessous : le
              rapprochement se fait à la main, par fusion de fiches ou changement d&apos;adresse.
            </p>
            {orphelins.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-body text-sm text-green-700 flex items-center gap-2">
                <Check size={16} /> Aucun compte orphelin.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {orphelins.map(o => (
                  <div key={o.uid} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-body font-semibold text-slate-800 truncate">
                          {o.displayName || o.email || "— sans nom —"}
                        </div>
                        <div className="font-body text-xs text-slate-500 flex flex-col gap-0.5 mt-1">
                          {o.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} className="shrink-0" />{o.email}</span>}
                          <span>
                            {o.provider.replace(".com", "")} · créé le {dateFr(o.creeLe)}
                            {o.derniereConnexion && ` · dernière connexion ${dateFr(o.derniereConnexion)}`}
                          </span>
                          {!o.ficheVide && <span className="text-amber-600">aucune fiche famille pour ce compte</span>}
                        </div>
                      </div>
                    </div>

                    {o.rapprochements.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="font-body text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          Fiche(s) qui pourraient lui correspondre
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {o.rapprochements.map(r => (
                            <div key={r.id} className="flex items-center justify-between gap-3 bg-sand rounded-lg px-3 py-2">
                              <div className="font-body text-sm text-slate-700 min-w-0">
                                <span className="font-semibold text-blue-800">{r.parentName || "— sans nom —"}</span>
                                <span className="text-slate-500"> · {r.nbEnfants} cavalier{r.nbEnfants > 1 ? "s" : ""}</span>
                                {r.memeEmail && <span className="text-emerald-600"> · même adresse</span>}
                              </div>
                              <Link href={`/admin/cavaliers?id=${r.id}`}
                                className="shrink-0 font-body text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 no-underline">
                                Ouvrir
                              </Link>
                            </div>
                          ))}
                        </div>
                        <p className="font-body text-[11px] text-slate-400 mt-2">
                          Pour rattacher : <Link href="/admin/doublons" className="text-blue-500">fusionner les fiches</Link>,
                          ou donner l&apos;adresse du compte à la fiche du bureau depuis sa fiche client.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
