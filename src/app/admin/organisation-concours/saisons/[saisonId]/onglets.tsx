"use client";

import { useState } from "react";
import { Plus, Trash2, PencilLine, X, Check, UserPlus, Trophy, Calendar, MapPin } from "lucide-react";
import {
  CATEGORIES_SUGGEREES, INDICES_SUGGERES,
  retirerCavalier, retirerEquipe, saisirClassement, lireNombre, resultatsTries,
  bilanSaison, nomsCavaliers, equipesDuCavalier,
  type SaisonPonyGames, type EquipeSaison, type CavalierSaison,
} from "@/lib/concours/saisons";

export type Maj = (f: (s: SaisonPonyGames) => SaisonPonyGames) => void;

const inp =
  "w-full px-2.5 py-2 rounded-lg border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";
const btnPrimaire =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50";
const btnSecondaire =
  "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-50 text-blue-700 font-body text-sm font-semibold hover:bg-blue-100 transition";
const btnIcone = "p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition";

function genId(prefixe: string): string {
  return `${prefixe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function nomComplet(c: CavalierSaison): string {
  return [c.prenom, c.nom].filter(Boolean).join(" ");
}

function SuggestionsCategories() {
  return (
    <>
      <datalist id="pg-categories">{CATEGORIES_SUGGEREES.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="pg-indices">{INDICES_SUGGERES.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}

// ─── Équipes ───────────────────────────────────────────────────────────────

type BrouillonEquipe = Omit<EquipeSaison, "id">;
const EQUIPE_VIDE: BrouillonEquipe = { nom: "", categorie: "", indice: "", cavalierIds: [] };

function FormulaireEquipe({
  saison, maj, initial, onValider, onAnnuler, libelle,
}: {
  saison: SaisonPonyGames;
  maj: Maj;
  initial: BrouillonEquipe;
  onValider: (e: BrouillonEquipe) => void;
  onAnnuler?: () => void;
  libelle: string;
}) {
  const [b, setB] = useState<BrouillonEquipe>(initial);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");

  const basculer = (id: string) =>
    setB((x) => ({ ...x, cavalierIds: x.cavalierIds.includes(id) ? x.cavalierIds.filter((c) => c !== id) : [...x.cavalierIds, id] }));

  // Ajoute un cavalier à la saison et le coche aussitôt dans l'équipe.
  const ajouterCavalier = () => {
    if (!prenom.trim()) return;
    const c: CavalierSaison = { id: genId("cav"), prenom: prenom.trim(), nom: nom.trim() || undefined };
    maj((s) => ({ ...s, cavaliers: [...s.cavaliers, c] }));
    setB((x) => ({ ...x, cavalierIds: [...x.cavalierIds, c.id] }));
    setPrenom("");
    setNom("");
  };

  // Supprime le cavalier de la saison (et donc de toutes ses équipes), pas seulement de celle-ci.
  const supprimerCavalier = (c: CavalierSaison) => {
    const autres = equipesDuCavalier(saison, c.id).map((e) => e.nom);
    const detail = autres.length ? `\nIl sera aussi retiré de : ${autres.join(", ")}.` : "";
    if (!confirm(`Supprimer ${nomComplet(c)} de la saison ?${detail}`)) return;
    maj((s) => retirerCavalier(s, c.id));
    setB((x) => ({ ...x, cavalierIds: x.cavalierIds.filter((id) => id !== c.id) }));
  };

  const valider = () => {
    if (!b.nom.trim()) return;
    onValider({ ...b, nom: b.nom.trim(), categorie: b.categorie.trim(), indice: b.indice.trim() });
  };

  return (
    <div className="rounded-xl border border-blue-500/15 bg-white p-4 space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nom de l&apos;équipe</label>
          <input className={inp} value={b.nom} onChange={(e) => setB({ ...b, nom: e.target.value })} placeholder="Les Jamais 2 sans toi" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Catégorie</label>
          <input className={inp} list="pg-categories" value={b.categorie} onChange={(e) => setB({ ...b, categorie: e.target.value })} placeholder="Benjamin" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Indice</label>
          <input className={inp} list="pg-indices" value={b.indice} onChange={(e) => setB({ ...b, indice: e.target.value })} placeholder="Club 2" />
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-600 mb-1.5">
          Cavaliers de l&apos;équipe ({b.cavalierIds.length})
          <span className="font-normal text-gray-400"> — clic sur le nom : dans l&apos;équipe ou non · croix : supprimer le cavalier</span>
        </div>
        {saison.cavaliers.length === 0 ? (
          <p className="text-xs text-gray-400 mb-2">Aucun cavalier dans la saison : ajoute-les juste en dessous.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {saison.cavaliers.map((c) => {
              const coche = b.cavalierIds.includes(c.id);
              return (
                <span key={c.id} className={`inline-flex items-center rounded-full text-xs font-semibold border transition ${
                  coche ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                }`}>
                  <button type="button" onClick={() => basculer(c.id)} className="pl-2.5 pr-1.5 py-1">
                    {coche && <Check size={11} className="inline mr-1 -mt-0.5" />}{nomComplet(c)}
                  </button>
                  <button type="button" onClick={() => supprimerCavalier(c)} title="Supprimer ce cavalier de la saison"
                    className={`pr-2 py-1 ${coche ? "text-blue-200 hover:text-white" : "text-gray-300 hover:text-red-600"}`}>
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inp} max-w-[160px]`} value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom"
            onKeyDown={(e) => e.key === "Enter" && ajouterCavalier()} />
          <input className={`${inp} max-w-[160px]`} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom (optionnel)"
            onKeyDown={(e) => e.key === "Enter" && ajouterCavalier()} />
          <button type="button" onClick={ajouterCavalier} disabled={!prenom.trim()} className={btnSecondaire}>
            <UserPlus size={14} /> Nouveau cavalier
          </button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={valider} disabled={!b.nom.trim()} className={btnPrimaire}>
          <Check size={15} /> {libelle}
        </button>
        {onAnnuler && <button type="button" onClick={onAnnuler} className={btnSecondaire}><X size={15} /> Annuler</button>}
      </div>
    </div>
  );
}

export function OngletEquipes({ saison, maj }: { saison: SaisonPonyGames; maj: Maj }) {
  const [creation, setCreation] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const bilan = bilanSaison(saison);

  const supprimer = (e: EquipeSaison) => {
    if (!confirm(`Supprimer l'équipe « ${e.nom} » et ses résultats de la saison ?`)) return;
    maj((s) => retirerEquipe(s, e.id));
  };

  return (
    <div className="space-y-4">
      <SuggestionsCategories />
      {creation ? (
        <FormulaireEquipe saison={saison} maj={maj} initial={EQUIPE_VIDE} libelle="Enregistrer l'équipe"
          onAnnuler={() => setCreation(false)}
          onValider={(b) => { maj((s) => ({ ...s, equipes: [...s.equipes, { ...b, id: genId("eq") }] })); setCreation(false); }} />
      ) : (
        <button type="button" onClick={() => setCreation(true)} className={btnPrimaire}><Plus size={15} /> Nouvelle équipe</button>
      )}

      {saison.equipes.length === 0 && !creation && (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">
          Aucune équipe pour cette saison.
        </p>
      )}

      {bilan.map((groupe) => (
        <div key={groupe.categorie}>
          <h2 className="font-display font-bold text-blue-900 mb-2">{groupe.categorie}</h2>
          <div className="space-y-2">
            {groupe.equipes.map(({ equipe, pointsTotal, nbConcours }) =>
              edition === equipe.id ? (
                <FormulaireEquipe key={equipe.id} saison={saison} maj={maj} initial={equipe} libelle="Enregistrer"
                  onAnnuler={() => setEdition(null)}
                  onValider={(b) => {
                    maj((s) => ({ ...s, equipes: s.equipes.map((e) => (e.id === equipe.id ? { ...b, id: equipe.id } : e)) }));
                    setEdition(null);
                  }} />
              ) : (
                <div key={equipe.id} className="flex items-start gap-3 rounded-xl border border-blue-500/12 bg-white p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-gray-800">
                      {equipe.nom}
                      {equipe.indice && <span className="ml-2 px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 text-xs font-semibold">{equipe.indice}</span>}
                    </div>
                    <div className="text-sm text-gray-600 mt-0.5">
                      {nomsCavaliers(saison, equipe).join(", ") || <span className="text-gray-400">Aucun cavalier</span>}
                    </div>
                    {nbConcours > 0 && (
                      <div className="text-xs text-gray-500 mt-1">{pointsTotal} pt(s) sur {nbConcours} concours</div>
                    )}
                  </div>
                  <button type="button" onClick={() => setEdition(equipe.id)} className="p-2 rounded-lg text-gray-400 hover:text-blue-700 hover:bg-blue-50 transition" title="Modifier">
                    <PencilLine size={16} />
                  </button>
                  <button type="button" onClick={() => supprimer(equipe)} className={btnIcone} title="Supprimer"><Trash2 size={16} /></button>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Cavaliers ─────────────────────────────────────────────────────────────

export function OngletCavaliers({ saison, maj }: { saison: SaisonPonyGames; maj: Maj }) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");

  const ajouter = () => {
    if (!prenom.trim()) return;
    const c: CavalierSaison = { id: genId("cav"), prenom: prenom.trim(), nom: nom.trim() || undefined };
    maj((s) => ({ ...s, cavaliers: [...s.cavaliers, c] }));
    setPrenom("");
    setNom("");
  };

  const modifier = (id: string, champ: "prenom" | "nom", valeur: string) =>
    maj((s) => ({ ...s, cavaliers: s.cavaliers.map((c) => (c.id === id ? { ...c, [champ]: valeur } : c)) }));

  const supprimer = (c: CavalierSaison) => {
    const equipes = equipesDuCavalier(saison, c.id);
    const detail = equipes.length ? `\nIl sera retiré de : ${equipes.map((e) => e.nom).join(", ")}.` : "";
    if (!confirm(`Retirer ${nomComplet(c)} de la saison ?${detail}`)) return;
    maj((s) => retirerCavalier(s, c.id));
  };

  const tries = [...saison.cavaliers].sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/15 bg-white p-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Prénom</label>
          <input className={inp} value={prenom} onChange={(e) => setPrenom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouter()} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nom (optionnel)</label>
          <input className={inp} value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouter()} />
        </div>
        <button type="button" onClick={ajouter} disabled={!prenom.trim()} className={btnPrimaire}><UserPlus size={15} /> Ajouter</button>
      </div>

      {tries.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">Aucun cavalier pour cette saison.</p>
      ) : (
        <div className="rounded-xl border border-blue-500/12 bg-white divide-y divide-gray-100">
          {tries.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <input className={`${inp} max-w-[150px]`} value={c.prenom} onChange={(e) => modifier(c.id, "prenom", e.target.value)} />
              <input className={`${inp} max-w-[150px]`} value={c.nom ?? ""} placeholder="Nom" onChange={(e) => modifier(c.id, "nom", e.target.value)} />
              <div className="flex-1 flex flex-wrap gap-1">
                {equipesDuCavalier(saison, c.id).map((e) => (
                  <span key={e.id} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">{e.nom}</span>
                ))}
              </div>
              <button type="button" onClick={() => supprimer(c)} className={btnIcone} title="Retirer"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Résultats des concours ────────────────────────────────────────────────

function CarteResultat({ saison, maj, resultatId }: { saison: SaisonPonyGames; maj: Maj; resultatId: string }) {
  const r = saison.resultats.find((x) => x.id === resultatId)!;
  const groupes = bilanSaison(saison);

  const champ = (equipeId: string, cle: "rang" | "points", saisie: string) => {
    const actuel = r.classements.find((c) => c.equipeId === equipeId) ?? { equipeId };
    const valeurs = { rang: actuel.rang, points: actuel.points, [cle]: lireNombre(saisie) };
    maj((s) => saisirClassement(s, r.id, equipeId, valeurs));
  };

  const supprimer = () => {
    if (!confirm(`Supprimer le concours « ${r.nom} » et les résultats saisis ?`)) return;
    maj((s) => ({ ...s, resultats: s.resultats.filter((x) => x.id !== r.id) }));
  };

  return (
    <div className="rounded-xl border border-blue-500/15 bg-white p-4">
      <div className="flex items-start gap-3 mb-3">
        <Trophy size={18} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-gray-800">{r.nom}</div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-0.5">
            <span className="inline-flex items-center gap-1"><Calendar size={12} /> {r.date.split("-").reverse().join("/")}</span>
            {r.lieu && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {r.lieu}</span>}
          </div>
        </div>
        <button type="button" onClick={supprimer} className={btnIcone} title="Supprimer le concours"><Trash2 size={16} /></button>
      </div>
      {saison.equipes.length === 0 ? (
        <p className="text-xs text-gray-400">Crée d&apos;abord les équipes de la saison.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 text-left">
              <th className="font-semibold py-1">Équipe</th>
              <th className="font-semibold py-1 w-24">Classement</th>
              <th className="font-semibold py-1 w-24">Points</th>
            </tr>
          </thead>
          <tbody>
            {groupes.map((g) => [
              <tr key={`g-${g.categorie}`}><td colSpan={3} className="pt-3 pb-1 text-xs font-bold text-blue-900 uppercase tracking-wide">{g.categorie}</td></tr>,
              ...g.equipes.map(({ equipe }) => {
                const c = r.classements.find((x) => x.equipeId === equipe.id);
                return (
                  <tr key={equipe.id} className="border-t border-gray-100">
                    <td className="py-1.5 pr-2">
                      {equipe.nom}
                      {equipe.indice && <span className="text-xs text-gray-400 ml-1.5">{equipe.indice}</span>}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input key={`${r.id}-${equipe.id}-rang-${c?.rang ?? ""}`} className={inp} inputMode="numeric" placeholder="—"
                        defaultValue={c?.rang ?? ""} onBlur={(e) => champ(equipe.id, "rang", e.target.value)} />
                    </td>
                    <td className="py-1.5">
                      <input key={`${r.id}-${equipe.id}-pts-${c?.points ?? ""}`} className={inp} inputMode="decimal" placeholder="—"
                        defaultValue={c?.points ?? ""} onBlur={(e) => champ(equipe.id, "points", e.target.value)} />
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function OngletResultats({ saison, maj }: { saison: SaisonPonyGames; maj: Maj }) {
  const [nom, setNom] = useState("");
  const [date, setDate] = useState("");
  const [lieu, setLieu] = useState("");

  const ajouter = () => {
    if (!nom.trim() || !date) return;
    maj((s) => ({ ...s, resultats: [...s.resultats, { id: genId("cc"), nom: nom.trim(), date, lieu: lieu.trim() || undefined, classements: [] }] }));
    setNom("");
    setDate("");
    setLieu("");
  };

  const tries = resultatsTries(saison).reverse();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-500/15 bg-white p-4">
        <div className="text-sm font-semibold text-blue-900 mb-2">Ajouter un concours terminé</div>
        <div className="grid sm:grid-cols-[2fr_1fr_1.5fr_auto] gap-2 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Concours</label>
            <input className={inp} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Pony Games de Pieux" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
            <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Lieu (optionnel)</label>
            <input className={inp} value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
          <button type="button" onClick={ajouter} disabled={!nom.trim() || !date} className={btnPrimaire}><Plus size={15} /> Ajouter</button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Puis saisis le classement et les points de chaque équipe engagée ; laisse vide celles qui n&apos;y étaient pas.</p>
      </div>

      {tries.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">Aucun concours enregistré pour cette saison.</p>
      ) : (
        tries.map((r) => <CarteResultat key={r.id} saison={saison} maj={maj} resultatId={r.id} />)
      )}
    </div>
  );
}

// ─── Classement de la saison ───────────────────────────────────────────────

export function OngletClassement({ saison }: { saison: SaisonPonyGames }) {
  const concours = resultatsTries(saison);
  const bilan = bilanSaison(saison);

  if (saison.equipes.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded-xl">Aucune équipe pour cette saison.</p>;
  }

  return (
    <div className="space-y-6">
      {bilan.map((g) => (
        <div key={g.categorie}>
          <h2 className="font-display font-bold text-blue-900 mb-2">{g.categorie}</h2>
          <div className="overflow-x-auto rounded-xl border border-blue-500/12 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-blue-50/60 text-xs text-gray-600">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Équipe</th>
                  <th className="text-left font-semibold px-3 py-2">Indice</th>
                  {concours.map((c) => (
                    <th key={c.id} className="text-center font-semibold px-3 py-2 whitespace-nowrap" title={c.lieu}>
                      {c.nom}<div className="font-normal text-gray-400">{c.date.slice(8, 10)}/{c.date.slice(5, 7)}</div>
                    </th>
                  ))}
                  <th className="text-right font-bold px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {g.equipes.map(({ equipe, pointsTotal }) => (
                  <tr key={equipe.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-800">{equipe.nom}</div>
                      <div className="text-xs text-gray-400">{nomsCavaliers(saison, equipe).join(", ")}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{equipe.indice}</td>
                    {concours.map((c) => {
                      const l = c.classements.find((x) => x.equipeId === equipe.id);
                      return (
                        <td key={c.id} className="px-3 py-2 text-center whitespace-nowrap">
                          {l ? (
                            <>
                              {l.rang !== undefined && <span className="font-semibold">{l.rang}<sup>{l.rang === 1 ? "er" : "e"}</sup></span>}
                              {l.points !== undefined && <span className="text-gray-500 ml-1">· {l.points} pt</span>}
                            </>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-bold text-blue-900">{pointsTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
