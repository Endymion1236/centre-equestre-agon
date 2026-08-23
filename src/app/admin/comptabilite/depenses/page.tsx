"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui";
import { Receipt, Loader2, RefreshCw, Plus } from "lucide-react";

/**
 * Dépenses par poste — le pendant « charges » de la trésorerie.
 *
 * Le bilan n'arrive qu'une fois par an, six mois après la clôture : quand un
 * poste a doublé (entretien, fournitures, véto…), c'est trop tard pour réagir.
 * Ici : une matrice postes × mois sur l'exercice comptable (juillet → juin),
 * saisie au fil de l'eau, comparée au dernier exercice validé par le cabinet
 * (bilan 2024-25). Montants HT de préférence, comme au bilan — l'important
 * est surtout d'être constant d'un mois à l'autre.
 */

interface Depense { id: string; mois: string; poste: string; montant: number; note: string; }

// Référence : compte de résultat détaillé de l'exercice clos le 30/06/2025.
// Chaque poste regroupe les comptes 60x/61x/62x correspondants du bilan.
const POSTES_DEFAUT: { nom: string; ref: number | null }[] = [
  { nom: "Aliments, litières, paille", ref: 24723 },
  { nom: "Maréchalerie & travail des chevaux", ref: 7597 },
  { nom: "Vétérinaire & santé des chevaux", ref: 7877 },
  { nom: "Eau & électricité", ref: 7227 },
  { nom: "Carburants", ref: 3391 },
  { nom: "Fournitures & petit équipement (dont sellerie)", ref: 18470 },
  { nom: "Entretien (bâtiments, matériel, véhicules)", ref: 10546 },
  { nom: "Locations & loyers", ref: 21357 },
  { nom: "Assurances", ref: 9992 },
  { nom: "Honoraires & gestion (compta, juridique, GHN)", ref: 5321 },
  { nom: "Publicité & communication", ref: 2024 },
  { nom: "Autres dépenses", ref: null },
];

// Même exercice comptable que la masse salariale : juillet → juin, comme le bilan.
const MOIS_EXERCICE = ["07", "08", "09", "10", "11", "12", "01", "02", "03", "04", "05", "06"] as const;
const NOMS_MOIS: Record<string, string> = {
  "07": "Juil", "08": "Août", "09": "Sept", "10": "Oct", "11": "Nov", "12": "Déc",
  "01": "Janv", "02": "Févr", "03": "Mars", "04": "Avr", "05": "Mai", "06": "Juin",
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
  // Cellule en cours d'édition (clic dans la matrice) + valeur tapée.
  const [edit, setEdit] = useState<{ mois: string; poste: string; valeur: string } | null>(null);
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

  const valeur = useCallback((poste: string, mois: string) =>
    depenses.find(d => d.poste === poste && d.mois === mois)?.montant, [depenses]);

  // Combien de mois de l'exercice affiché sont déjà écoulés (mois courant
  // compris) — pour comparer le cumul à un « attendu à date », pas à l'année entière.
  const moisEcoules = useMemo(() => {
    const courant = moisCourant();
    return MOIS_EXERCICE.filter(mm => moisDe(exercice, mm) <= courant).length;
  }, [exercice]);

  const enregistrer = async (poste: string, mois: string, brut: string) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await api({ action: "saisir", poste, mois, montant: brut.trim() === "" ? null : brut });
      setEdit(null);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setSaving(false); }
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
              Les postes de charges suivis au fil de l&apos;eau, comparés au bilan 2024-25 —
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
          <button key={ex} onClick={() => setExercice(ex)}
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
                const cumul = MOIS_EXERCICE.reduce((s, mm) => s + (valeur(p.nom, moisDe(exercice, mm)) || 0), 0);
                const attendu = p.ref != null ? (p.ref * moisEcoules) / 12 : null;
                const depassement = attendu != null && cumul > attendu * 1.1;
                return (
                  <tr key={p.nom} className="border-b border-gray-100 hover:bg-orange-50/30">
                    <td className="px-3 py-1.5 text-slate-700 font-medium sticky left-0 bg-white max-w-56 truncate" title={p.nom}>{p.nom}</td>
                    {MOIS_EXERCICE.map(mm => {
                      const mois = moisDe(exercice, mm);
                      const v = valeur(p.nom, mois);
                      const enEdition = edit && edit.mois === mois && edit.poste === p.nom;
                      return (
                        <td key={mm} className="px-1 py-1 text-right">
                          {enEdition ? (
                            <input autoFocus value={edit.valeur} inputMode="decimal"
                              onChange={e => setEdit({ ...edit, valeur: e.target.value })}
                              onKeyDown={e => { if (e.key === "Enter") enregistrer(p.nom, mois, edit.valeur); if (e.key === "Escape") setEdit(null); }}
                              onBlur={() => enregistrer(p.nom, mois, edit.valeur)}
                              className="w-16 border border-orange-300 rounded px-1 py-0.5 text-right text-[13px]" />
                          ) : (
                            <button onClick={() => setEdit({ mois, poste: p.nom, valeur: v != null ? String(v) : "" })}
                              title="Saisir / corriger (vider pour effacer)"
                              className="w-full text-right bg-transparent border-none cursor-pointer px-1 py-0.5 rounded hover:bg-orange-100/60 font-body text-[13px]">
                              {v != null ? <span className="text-slate-700">{eur(v)}</span> : <span className="text-slate-300">—</span>}
                            </button>
                          )}
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
                  const t = postes.reduce((s, p) => s + (valeur(p.nom, moisDe(exercice, mm)) || 0), 0);
                  return <td key={mm} className="px-1.5 py-2 text-right">{t > 0 ? eur(t) : "—"}</td>;
                })}
                <td className="px-2 py-2 text-right">
                  {eur(postes.reduce((s, p) => s + MOIS_EXERCICE.reduce((s2, mm) => s2 + (valeur(p.nom, moisDe(exercice, mm)) || 0), 0), 0))}
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
              Clique une case pour saisir (montant HT du mois, vider pour effacer).
              <strong> Attendu</strong> = référence bilan × mois écoulés ; ⚠ = cumul à plus de 110 % de l&apos;attendu.
              Outil de pilotage, pas une écriture comptable.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
