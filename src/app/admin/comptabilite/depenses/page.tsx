"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Receipt, Loader2, RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import { POSTES_DEPENSES as POSTES_DEFAUT } from "@/lib/postes-depenses";

/**
 * Dépenses par poste — le pendant « charges » de la trésorerie.
 *
 * Le bilan n'arrive qu'une fois par an, six mois après la clôture : quand un
 * poste a doublé (entretien, fournitures, véto…), c'est trop tard pour réagir.
 * Ici : une matrice postes × mois sur l'exercice comptable (juillet → juin).
 * Chaque case est la somme des FACTURES du poste sur le mois — une ligne par
 * facture, avec le fournisseur — et se compare au dernier exercice validé par
 * le cabinet (bilan 2024-25). Montants HT de préférence, comme au bilan —
 * l'important est surtout d'être constant d'un mois à l'autre.
 */

interface Depense { id: string; mois: string; poste: string; fournisseur: string; montant: number; note: string; }

// Même exercice comptable que la masse salariale : juillet → juin, comme le bilan.
const MOIS_EXERCICE = ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06"] as const;
const NOMS_MOIS: Record<string, string> = {
  "07": "Juil", "08": "Août", "09": "Sept", "10": "Oct", "11": "Nov", "12": "Déc",
  "01": "Janv", "02": "Févr", "03": "Mars", "04": "Avr", "05": "Mai", "06": "Juin",
};
const NOMS_MOIS_LONGS: Record<string, string> = {
  "07": "Juillet", "08": "Août", "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril", "05": "Mai", "06": "Juin",
};
function exerciceDe(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
}
function moisDe(exercice: string, mm: string): string {
  const [a1, a2] = exercice.split("-");
  return `${Number(mm) >= 7 ? a1 : a2}-${mm}`;
}
const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const moisCourant = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export default function DepensesPage() {
  const { isAdmin, user } = useAuth();
  const [depenses, setDepenses] = useState<Depense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exercice, setExercice] = useState(exerciceDe(moisCourant()));
  // Case sélectionnée : ouvre le détail des factures du (poste, mois) sous la matrice.
  const [sel, setSel] = useState<{ mois: string; poste: string } | null>(null);
  // Formulaire d'ajout / correction d'une facture (editId = correction).
  const [form, setForm] = useState<{ editId: string | null; fournisseur: string; montant: string }>({ editId: null, fournisseur: "", montant: "" });
  const [saving, setSaving] = useState(false);
  // Postes ajoutés à la main (au-delà de la liste par défaut), le temps de la session.
  const [postesPerso, setPostesPerso] = useState<string[]>([]);
  const [nouveauPoste, setNouveauPoste] = useState<string | null>(null);

  const api = useCallback(async (body?: any) => {
    const token = await user!.getIdToken();
    const res = await fetch("/api/admin/depenses", {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error || "Erreur");
    return d;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try { setDepenses((await api()).depenses || []); }
    catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, [user, api]);

  useEffect(() => { if (isAdmin && user) load(); }, [isAdmin, user, load]);

  const exercices = useMemo(() => {
    const s = new Set(depenses.map(d => exerciceDe(d.mois)));
    s.add(exerciceDe(moisCourant()));
    return [...s].sort();
  }, [depenses]);

  // Tous les postes à afficher : la liste par défaut + ceux trouvés dans les
  // données (un poste renommé ou historique reste visible) + ceux ajoutés là.
  const postes = useMemo(() => {
    const connus = new Set(POSTES_DEFAUT.map(p => p.nom));
    const extra = [...new Set([...depenses.map(d => d.poste), ...postesPerso])]
      .filter(p => !connus.has(p)).sort((a, b) => a.localeCompare(b, "fr"));
    return [...POSTES_DEFAUT, ...extra.map(nom => ({ nom, ref: null as number | null }))];
  }, [depenses, postesPerso]);

  const facturesDe = useCallback((poste: string, mois: string) =>
    depenses.filter(d => d.poste === poste && d.mois === mois), [depenses]);
  const totalDe = useCallback((poste: string, mois: string) =>
    facturesDe(poste, mois).reduce((s, f) => s + f.montant, 0), [facturesDe]);

  // Combien de mois de l'exercice affiché sont déjà écoulés (mois courant
  // compris) — pour comparer le cumul à un « attendu à date », pas à l'année entière.
  const moisEcoules = useMemo(() => {
    const courant = moisCourant();
    return MOIS_EXERCICE.filter(mm => moisDe(exercice, mm) <= courant).length;
  }, [exercice]);

  const facturesSel = sel ? facturesDe(sel.poste, sel.mois) : [];

  const enregistrerFacture = async () => {
    if (!sel || saving || form.montant.trim() === "") return;
    setSaving(true); setError("");
    try {
      if (form.editId) {
        await api({ action: "modifier", id: form.editId, fournisseur: form.fournisseur, montant: form.montant });
      } else {
        await api({ action: "ajouter", poste: sel.poste, mois: sel.mois, fournisseur: form.fournisseur, montant: form.montant });
      }
      setForm({ editId: null, fournisseur: "", montant: "" });
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
  };

  const supprimerFacture = async (f: Depense) => {
    if (!confirm(`Retirer la facture ${f.fournisseur ? `« ${f.fournisseur} » ` : ""}de ${eur(f.montant)} ?`)) return;
    try { await api({ action: "supprimer", id: f.id }); await load(); }
    catch (e: any) { setError(e?.message || String(e)); }
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
              Une ligne par facture (fournisseur, montant), comparée au bilan 2024-25 —
              pour voir un dérapage en octobre, pas dans dix-huit mois.
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
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 font-body text-xs font-semibold text-slate-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {exercices.map(ex => (
          <button key={ex} onClick={() => { setExercice(ex); setSel(null); }}
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
                {postes.map(p => {
                  const cumul = MOIS_EXERCICE.reduce((s, mm) => s + totalDe(p.nom, moisDe(exercice, mm)), 0);
                  const attendu = p.ref != null ? (p.ref * moisEcoules) / 12 : null;
                  const depassement = attendu != null && cumul > attendu * 1.1;
                  return (
                    <tr key={p.nom} className="border-b border-gray-100 hover:bg-orange-50/30">
                      <td className="px-3 py-1.5 text-slate-700 font-medium sticky left-0 bg-white max-w-56 truncate" title={p.nom}>{p.nom}</td>
                      {MOIS_EXERCICE.map(mm => {
                        const mois = moisDe(exercice, mm);
                        const factures = facturesDe(p.nom, mois);
                        const total = factures.reduce((s, f) => s + f.montant, 0);
                        const active = sel && sel.mois === mois && sel.poste === p.nom;
                        return (
                          <td key={mm} className="px-1 py-1 text-right">
                            <button onClick={() => { setSel({ mois, poste: p.nom }); setForm({ editId: null, fournisseur: "", montant: "" }); }}
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
                      <td className="px-2 py-1.5 text-right text-slate-400">{p.ref != null ? eur(p.ref) : "—"}</td>
                    </tr>
                  );
                })}
                <tr className="bg-orange-50/60 font-semibold text-orange-900">
                  <td className="px-3 py-2 sticky left-0 bg-orange-50/60">Total</td>
                  {MOIS_EXERCICE.map(mm => {
                    const t = postes.reduce((s, p) => s + totalDe(p.nom, moisDe(exercice, mm)), 0);
                    return <td key={mm} className="px-1.5 py-2 text-right">{t > 0 ? eur(t) : "—"}</td>;
                  })}
                  <td className="px-2 py-2 text-right">
                    {eur(postes.reduce((s, p) => s + MOIS_EXERCICE.reduce((s2, mm) => s2 + totalDe(p.nom, moisDe(exercice, mm)), 0), 0))}
                  </td>
                  <td className="px-2 py-2 text-right text-amber-800 italic">
                    {eur(postes.reduce((s, p) => s + (p.ref || 0), 0) * moisEcoules / 12)}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-500">{eur(postes.reduce((s, p) => s + (p.ref || 0), 0))}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2">
              {nouveauPoste === null ? (
                <button onClick={() => setNouveauPoste("")}
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
                  <button onClick={() => setNouveauPoste(null)} className="text-slate-500 bg-white border border-gray-200 px-2 py-1 rounded-lg cursor-pointer text-xs">✕</button>
                </span>
              )}
              <p className="font-body text-[11px] text-slate-400">
                Clique une case pour voir et saisir ses factures (montants HT).
                <strong> Attendu</strong> = référence bilan × mois écoulés ; ⚠ = cumul à plus de 110 % de l&apos;attendu.
                Outil de pilotage, pas une écriture comptable.
              </p>
            </div>
          </Card>

          {/* ── Détail des factures de la case sélectionnée ── */}
          {sel && (
            <Card padding="md" className="mt-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <h2 className="font-display text-base font-bold text-blue-800">
                  {sel.poste} — {NOMS_MOIS_LONGS[sel.mois.slice(5)]} {sel.mois.slice(0, 4)}
                </h2>
                <button onClick={() => setSel(null)}
                  className="font-body text-xs text-slate-500 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg cursor-pointer">✕ Fermer</button>
              </div>

              {facturesSel.length === 0 ? (
                <p className="font-body text-xs text-slate-400 italic mb-2">Aucune facture ce mois-ci sur ce poste.</p>
              ) : (
                <div className="flex flex-col gap-1 mb-2">
                  {facturesSel.map(f => (
                    <div key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-orange-50/60 border border-orange-100 px-3 py-1.5 font-body text-sm">
                      <span className="text-slate-700">{f.fournisseur || <span className="text-slate-400 italic">(sans fournisseur)</span>}</span>
                      <span className="flex items-center gap-1">
                        <strong className="text-orange-900">{eur(f.montant)}</strong>
                        <button onClick={() => setForm({ editId: f.id, fournisseur: f.fournisseur, montant: String(f.montant) })}
                          title="Corriger" className="text-slate-400 hover:text-blue-600 bg-transparent border-none cursor-pointer p-1"><Pencil size={12} /></button>
                        <button onClick={() => supprimerFacture(f)} title="Retirer"
                          className="text-slate-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1"><Trash2 size={12} /></button>
                      </span>
                    </div>
                  ))}
                  {facturesSel.length > 1 && (
                    <div className="flex items-center justify-between px-3 py-1 font-body text-xs font-semibold text-orange-900">
                      <span>Total du poste sur le mois</span>
                      <span>{eur(facturesSel.reduce((s, f) => s + f.montant, 0))}</span>
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
                <button onClick={enregistrerFacture} disabled={saving || form.montant.trim() === ""}
                  className="font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3 py-1.5 rounded-lg border-none cursor-pointer disabled:opacity-50">
                  {form.editId ? "Corriger" : "+ Ajouter la facture"}
                </button>
                {form.editId && (
                  <button onClick={() => setForm({ editId: null, fournisseur: "", montant: "" })}
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
