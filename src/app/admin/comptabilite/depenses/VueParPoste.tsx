"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Receipt, Loader2, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import { POSTES_DEPENSES as POSTES_DEFAUT } from "@/lib/postes-depenses";
import {
  MOIS_EXERCICE,
  NOMS_MOIS,
  NOMS_MOIS_LONGS,
  attenduAdate,
  construirePostes,
  cumulPoste,
  exerciceDe,
  exercicesDisponibles,
  facturesDe as filtrerFactures,
  formaterEuros as eur,
  moisCourant,
  moisDe,
  nombreMoisEcoules,
  posteEnDepassement,
  totalDe as totalDepensesDe,
  totalMois,
  type Depense,
} from "./depenses-utils";

/**
 * Dépenses par poste, le pendant « charges » de la trésorerie.
 * Une matrice postes × mois sur l'exercice comptable juillet → juin permet
 * de voir un dérapage pendant l'exercice plutôt qu'après le bilan.
 */
export default function DepensesPage() {
  const { isAdmin, user } = useAuth();
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exercice, setExercice] = useState(() => exerciceDe(moisCourant()));
  const [sel, setSel] = useState<{ mois: string; poste: string } | null>(null);
  const [form, setForm] = useState<{ editId: string | null; fournisseur: string; montant: string }>({ editId: null, fournisseur: "", montant: "" });
  const [saving, setSaving] = useState(false);
  const [postesPerso, setPostesPerso] = useState<string[]>([]);
  const [nouveauPoste, setNouveauPoste] = useState<string | null>(null);

  const api = useCallback(async (body?: any) => {
    const token = await user!.getIdToken();
    const res = await fetch("/api/admin/depenses", {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Erreur");
    return data;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      setDepenses((await api()).depenses || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [user, api]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const exercices = useMemo(() => exercicesDisponibles(depenses), [depenses]);
  const postes = useMemo(
    () => construirePostes(POSTES_DEFAUT, depenses, postesPerso),
    [depenses, postesPerso],
  );
  const facturesDe = useCallback(
    (poste: string, mois: string) => filtrerFactures(depenses, poste, mois),
    [depenses],
  );
  const totalDe = useCallback(
    (poste: string, mois: string) => totalDepensesDe(depenses, poste, mois),
    [depenses],
  );
  const moisEcoules = useMemo(() => nombreMoisEcoules(exercice), [exercice]);
  const facturesSel = sel ? facturesDe(sel.poste, sel.mois) : [];

  const enregistrerFacture = async () => {
    if (!sel || saving || form.montant.trim() === "") return;
    setSaving(true);
    setError("");
    try {
      if (form.editId) {
        await api({ action: "modifier", id: form.editId, fournisseur: form.fournisseur, montant: form.montant });
      } else {
        await api({ action: "ajouter", poste: sel.poste, mois: sel.mois, fournisseur: form.fournisseur, montant: form.montant });
      }
      setForm({ editId: null, fournisseur: "", montant: "" });
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const supprimerFacture = async (facture: Depense) => {
    if (!confirm(`Retirer la facture ${facture.fournisseur ? `« ${facture.fournisseur} » ` : ""}de ${eur(facture.montant)} ?`)) return;
    try {
      await api({ action: "supprimer", id: facture.id });
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  if (!isAdmin) return <div className="p-8"><h1 className="font-display text-2xl">Accès refusé</h1></div>;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <Receipt size={20} className="text-orange-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-blue-800">Dépenses par poste</h1>
            <p className="font-body text-sm text-slate-500">
              Une ligne par facture (fournisseur, montant), comparée au bilan 2024-25, pour voir un dérapage en octobre, pas dans dix-huit mois.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/comptabilite"
            className="font-body text-xs text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg no-underline hover:bg-gray-50">
            ← Comptabilité
          </Link>
          <Link href="/admin/comptabilite/masse-salariale"
            className="font-body text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg no-underline hover:bg-purple-100">
            👥 Masse salariale
          </Link>
          <button type="button" onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {exercices.map(ex => (
          <button type="button" key={ex} onClick={() => { setExercice(ex); setSel(null); }}
            className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold border cursor-pointer ${exercice === ex ? "bg-orange-600 text-white border-orange-600" : "bg-white text-slate-600 border-gray-200 hover:bg-orange-50"}`}>
            Exercice {ex}
          </button>
        ))}
        <span className="font-body text-[11px] text-slate-400">
          {moisEcoules > 0 && moisEcoules < 12 ? `${moisEcoules} mois écoulé${moisEcoules > 1 ? "s" : ""} — l'« attendu » est proratisé` : ""}
        </span>
      </div>

      {loading ? (
        <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto" /></div>
      ) : (
        <>
          <Card padding="sm" className="overflow-x-auto !p-0">
            <table className="w-full border-collapse font-body text-[13px]">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200 text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-slate-50">Poste</th>
                  {MOIS_EXERCICE.map(mm => (
                    <th key={mm} className="px-1.5 py-2.5 text-right font-semibold">{NOMS_MOIS[mm]}</th>
                  ))}
                  <th className="px-2 py-2.5 text-right font-semibold text-orange-700">Cumul</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-amber-700" title="Référence annuelle × mois écoulés / 12">Attendu</th>
                  <th className="px-2 py-2.5 text-right font-semibold text-slate-500" title="Total du poste sur l'exercice 2024-25 (bilan)">Bilan 24-25</th>
                </tr>
              </thead>
              <tbody>
                {postes.map(poste => {
                  const cumul = cumulPoste(depenses, poste.nom, exercice);
                  const attendu = attenduAdate(poste.ref, moisEcoules);
                  const depassement = posteEnDepassement(cumul, attendu);
                  return (
                    <tr key={poste.nom} className="border-b border-gray-100 hover:bg-orange-50/30">
                      <td className="px-3 py-1.5 text-slate-700 font-medium sticky left-0 bg-white max-w-56 truncate" title={poste.nom}>{poste.nom}</td>
                      {MOIS_EXERCICE.map(mm => {
                        const mois = moisDe(exercice, mm);
                        const factures = facturesDe(poste.nom, mois);
                        const total = factures.reduce((s, facture) => s + facture.montant, 0);
                        const active = sel && sel.mois === mois && sel.poste === poste.nom;
                        return (
                          <td key={mm} className="px-1 py-1 text-right">
                            <button type="button" onClick={() => { setSel({ mois, poste: poste.nom }); setForm({ editId: null, fournisseur: "", montant: "" }); }}
                              title={factures.length > 0 ? `${factures.length} facture(s) — cliquer pour le détail` : "Cliquer pour saisir les factures"}
                              className={`w-full text-right border-none cursor-pointer px-1 py-0.5 rounded font-body text-[13px] ${active ? "bg-orange-200/70" : "bg-transparent hover:bg-orange-100/60"}`}>
                              {factures.length > 0
                                ? <span className="text-slate-700">{eur(total)}{factures.length > 1 && <sup className="text-[9px] text-orange-600 ml-0.5">{factures.length}</sup>}</span>
                                : <span className="text-slate-300">—</span>}
                            </button>
                          </td>
                        );
                      })}
                      <td className={`px-2 py-1.5 text-right font-semibold ${depassement ? "text-red-600" : "text-orange-800"}`}>
                        {cumul > 0 ? eur(cumul) : "—"}{depassement ? " ⚠" : ""}
                      </td>
                      <td className="px-2 py-1.5 text-right text-amber-700/80 italic">{attendu != null ? eur(attendu) : "—"}</td>
                      <td className="px-2 py-1.5 text-right text-slate-400">{poste.ref != null ? eur(poste.ref) : "—"}</td>
                    </tr>
                  );
                })}
                <tr className="bg-orange-50/60 font-semibold text-orange-900">
                  <td className="px-3 py-2 sticky left-0 bg-orange-50/60">Total</td>
                  {MOIS_EXERCICE.map(mm => {
                    const total = totalMois(depenses, postes, exercice, mm);
                    return <td key={mm} className="px-1.5 py-2 text-right">{total > 0 ? eur(total) : "—"}</td>;
                  })}
                  <td className="px-2 py-2 text-right">
                    {eur(postes.reduce((s, poste) => s + cumulPoste(depenses, poste.nom, exercice), 0))}
                  </td>
                  <td className="px-2 py-2 text-right text-amber-800 italic">
                    {eur(postes.reduce((s, poste) => s + (poste.ref || 0), 0) * moisEcoules / 12)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-500">{eur(postes.reduce((s, poste) => s + (poste.ref || 0), 0))}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2">
              {nouveauPoste === null ? (
                <button type="button" onClick={() => setNouveauPoste("")}
                  className="flex items-center gap-1 font-body text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-orange-100">
                  <Plus size={11} /> Ajouter un poste
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  <input autoFocus value={nouveauPoste} onChange={e => setNouveauPoste(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && nouveauPoste.trim()) { setPostesPerso(prev => [...prev, nouveauPoste.trim()]); setNouveauPoste(null); }
                      if (e.key === "Escape") setNouveauPoste(null);
                    }}
                    placeholder="Nom du poste (Entrée pour ajouter)"
                    className="font-body text-xs border border-orange-300 rounded px-2 py-1 w-64" />
                  <button type="button" onClick={() => setNouveauPoste(null)} className="text-slate-500 bg-white border border-gray-200 px-2 py-1 rounded-lg cursor-pointer text-xs">✕</button>
                </span>
              )}
              <p className="font-body text-[11px] text-slate-400">
                Clique une case pour voir et saisir ses factures (montants HT).
                <strong> Attendu</strong> = référence bilan × mois écoulés ; ⚠ = cumul à plus de 110 % de l&apos;attendu.
                Outil de pilotage, pas une écriture comptable.
              </p>
            </div>
          </Card>

          {sel && (
            <Card padding="md" className="mt-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h2 className="font-display text-base font-bold text-blue-800">
                  {sel.poste} — {NOMS_MOIS_LONGS[sel.mois.slice(5)]} {sel.mois.slice(0, 4)}
                </h2>
                <button type="button" onClick={() => setSel(null)}
                  className="font-body text-xs text-slate-500 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg cursor-pointer">✕ Fermer</button>
              </div>

              {facturesSel.length === 0 ? (
                <p className="font-body text-xs text-slate-400 italic mb-2">Aucune facture ce mois-ci sur ce poste.</p>
              ) : (
                <div className="flex flex-col gap-1 mb-2">
                  {facturesSel.map(facture => (
                    <div key={facture.id} className="flex items-center justify-between gap-2 rounded-lg bg-orange-50/60 border border-orange-100 px-3 py-1.5 font-body text-sm">
                      <span className="text-slate-700">{facture.fournisseur || <span className="text-slate-400 italic">(sans fournisseur)</span>}</span>
                      <span className="flex items-center gap-1">
                        <strong className="text-orange-900">{eur(facture.montant)}</strong>
                        <button type="button" onClick={() => setForm({ editId: facture.id, fournisseur: facture.fournisseur, montant: String(facture.montant) })}
                          title="Corriger" className="text-slate-400 hover:text-blue-600 bg-transparent border-none cursor-pointer p-1"><Pencil size={12} /></button>
                        <button type="button" onClick={() => supprimerFacture(facture)} title="Retirer"
                          className="text-slate-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><Trash2 size={12} /></button>
                      </span>
                    </div>
                  ))}
                  {facturesSel.length > 1 && (
                    <div className="flex items-center justify-between px-3 py-1 font-body text-xs font-semibold text-orange-900">
                      <span>Total du poste sur le mois</span>
                      <span>{eur(facturesSel.reduce((s, facture) => s + facture.montant, 0))}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-orange-200 bg-orange-50/40 px-3 py-2 flex flex-wrap items-center gap-2 font-body text-xs">
                <input value={form.fournisseur} onChange={e => setForm({ ...form, fournisseur: e.target.value })}
                  placeholder="Fournisseur (facultatif)" className="border border-gray-200 rounded px-2 py-1 w-56" />
                <input value={form.montant} inputMode="decimal" onChange={e => setForm({ ...form, montant: e.target.value })}
                  onKeyDown={e => { if (e.key === "Enter") enregistrerFacture(); }}
                  placeholder="Montant HT" className="border border-gray-200 rounded px-2 py-1 w-24 text-right" />
                <button type="button" onClick={enregistrerFacture} disabled={saving || form.montant.trim() === ""}
                  className="font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                  {form.editId ? "Corriger" : "+ Ajouter la facture"}
                </button>
                {form.editId && (
                  <button type="button" onClick={() => setForm({ editId: null, fournisseur: "", montant: "" })}
                    className="text-slate-500 bg-white border border-gray-200 px-2 py-1.5 rounded-lg cursor-pointer">annuler la correction</button>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
