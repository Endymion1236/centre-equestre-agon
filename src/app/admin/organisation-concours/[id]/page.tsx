"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Save, Printer, ArrowLeft, Plus, Trash2, Loader2, X,
  AlertOctagon, AlertTriangle, CheckCircle2, UserPlus,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { analyser } from "@/lib/concours/contraintes";
import { getConcours, saveConcours } from "@/lib/concours/store";
import Affiche from "../Affiche";
import type { Concours, Passage, RoleAssignation, RoleType } from "@/lib/concours/types";

const inp =
  "w-full px-2.5 py-2 rounded-lg border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";
const inpSm = "px-2 py-1.5 rounded-md border border-blue-500/15 font-body text-sm bg-white focus:border-blue-500 focus:outline-none";

const LIBELLE_ROLE: Record<RoleType, string> = {
  coach: "Coach", placeur: "Placeurs", juge: "Juge", camion: "Aide camion", detente: "Détente",
};
const ROLES_EDITABLES: RoleType[] = ["coach", "placeur", "juge", "camion"];

function rolesDefaut(): RoleAssignation[] {
  return [
    { type: "coach", personneIds: [], nbRequis: 1 },
    { type: "placeur", personneIds: [], nbRequis: 2 },
    { type: "juge", personneIds: [], nbRequis: 1 },
    { type: "camion", personneIds: [], nbRequis: 1, optionnel: true },
  ];
}

function genId(base: string): string {
  const slug = base.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "x"}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function EditeurConcours() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { toast } = useToast();

  const [concours, setConcours] = useState<Concours | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // saisies "ajouter"
  const [nouvPersonne, setNouvPersonne] = useState("");
  const [nouvCheval, setNouvCheval] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const c = await getConcours(id);
        setConcours(c);
      } catch (e) {
        console.error(e);
        toast("Chargement impossible", "error");
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const conflits = useMemo(() => (concours ? analyser(concours) : []), [concours]);
  const erreurs = conflits.filter((c) => c.gravite === "erreur");
  const alertes = conflits.filter((c) => c.gravite === "alerte");

  const update = (mut: (c: Concours) => Concours) => {
    setConcours((prev) => (prev ? mut(prev) : prev));
    setDirty(true);
  };
  const patchPassage = (pid: string, patch: Partial<Passage>) =>
    update((c) => ({ ...c, passages: c.passages.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }));

  // ---- Personnes ----
  const ajouterPersonne = () => {
    const prenom = nouvPersonne.trim();
    if (!prenom) return;
    update((c) => ({ ...c, personnes: [...c.personnes, { id: genId(prenom), prenom }] }));
    setNouvPersonne("");
  };
  const supprimerPersonne = (pid: string) =>
    update((c) => ({
      ...c,
      personnes: c.personnes.filter((p) => p.id !== pid),
      passages: c.passages.map((pa) => ({
        ...pa,
        participants: pa.participants.filter((x) => x.personneId !== pid),
        roles: pa.roles.map((r) => ({ ...r, personneIds: r.personneIds.filter((x) => x !== pid) })),
      })),
    }));
  const toggleCap = (pid: string, cap: "peutCoacher" | "peutJuger" | "peutResponsableCamion") =>
    update((c) => ({
      ...c,
      personnes: c.personnes.map((p) => (p.id === pid ? { ...p, [cap]: !p[cap] } : p)),
    }));

  // ---- Chevaux ----
  const ajouterCheval = () => {
    const nom = nouvCheval.trim();
    if (!nom) return;
    update((c) => ({ ...c, chevaux: [...c.chevaux, { id: genId(nom), nom }] }));
    setNouvCheval("");
  };
  const supprimerCheval = (cid: string) =>
    update((c) => ({
      ...c,
      chevaux: c.chevaux.filter((x) => x.id !== cid),
      passages: c.passages.map((pa) => ({
        ...pa,
        participants: pa.participants.map((x) => (x.chevalId === cid ? { ...x, chevalId: undefined } : x)),
      })),
    }));

  // ---- Passages ----
  const ajouterPassage = (terrain: string) =>
    update((c) => {
      const ordres = c.passages.filter((p) => p.terrain === terrain).map((p) => p.ordre);
      const ordre = (ordres.length ? Math.max(...ordres) : 0) + 1;
      const passage: Passage = {
        id: genId("passage"),
        terrain: terrain as Passage["terrain"],
        ordre,
        heureACheval: "",
        categorie: "",
        nomEquipe: "Nouvelle équipe",
        participants: [],
        roles: rolesDefaut(),
      };
      return { ...c, passages: [...c.passages, passage] };
    });
  const supprimerPassage = (pid: string) =>
    update((c) => ({ ...c, passages: c.passages.filter((p) => p.id !== pid) }));

  const ajouterParticipant = (pid: string) =>
    patchPassageFn(pid, (p) => ({ ...p, participants: [...p.participants, { personneId: "", chevalId: undefined }] }));
  const setParticipant = (pid: string, idx: number, field: "personneId" | "chevalId", value: string) =>
    patchPassageFn(pid, (p) => ({
      ...p,
      participants: p.participants.map((x, i) => (i === idx ? { ...x, [field]: value || undefined } : x)),
    }));
  const supprimerParticipant = (pid: string, idx: number) =>
    patchPassageFn(pid, (p) => ({ ...p, participants: p.participants.filter((_, i) => i !== idx) }));

  const assignerRole = (pid: string, type: RoleType, personneId: string) => {
    if (!personneId) return;
    patchPassageFn(pid, (p) => ({
      ...p,
      roles: p.roles.map((r) =>
        r.type === type && !r.personneIds.includes(personneId)
          ? { ...r, personneIds: [...r.personneIds, personneId] }
          : r,
      ),
    }));
  };
  const retirerRole = (pid: string, type: RoleType, personneId: string) =>
    patchPassageFn(pid, (p) => ({
      ...p,
      roles: p.roles.map((r) =>
        r.type === type ? { ...r, personneIds: r.personneIds.filter((x) => x !== personneId) } : r,
      ),
    }));
  const setNbRequis = (pid: string, type: RoleType, n: number) =>
    patchPassageFn(pid, (p) => ({
      ...p,
      roles: p.roles.map((r) => (r.type === type ? { ...r, nbRequis: Math.max(0, n) } : r)),
    }));

  // version fonctionnelle de patchPassage (pour les maj basées sur l'ancien passage)
  function patchPassageFn(pid: string, fn: (p: Passage) => Passage) {
    update((c) => ({ ...c, passages: c.passages.map((p) => (p.id === pid ? fn(p) : p)) }));
  }

  const enregistrer = async () => {
    if (!concours) return;
    setSaving(true);
    try {
      await saveConcours(concours);
      setDirty(false);
      toast("Concours enregistré", "success");
    } catch (e) {
      console.error(e);
      toast("Échec de l'enregistrement (règle Firestore concours manquante ?)", "error");
    }
    setSaving(false);
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 text-gray-400 py-20 justify-center">
        <Loader2 size={18} className="animate-spin" /> Chargement…
      </div>
    );
  if (!concours)
    return (
      <div className="max-w-[700px] mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 mb-4">Ce concours est introuvable.</p>
        <button onClick={() => router.push("/admin/organisation-concours")} className="text-blue-600 font-semibold">
          ← Retour à la liste
        </button>
      </div>
    );

  const nomPersonne = (pid: string) => concours.personnes.find((p) => p.id === pid)?.prenom ?? "?";
  const passagesTerrain = (t: string) => concours.passages.filter((p) => p.terrain === t).sort((a, b) => a.ordre - b.ordre);
  const rappelsTexte = (concours.rappels ?? []).join("\n");

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6">
      {/* Barre du haut */}
      <div className="flex items-center gap-3 mb-5 no-print">
        <button onClick={() => router.push("/admin/organisation-concours")} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" title="Retour">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold text-blue-900 truncate">{concours.titre || "Concours"}</h1>
          {dirty && <span className="text-xs text-amber-600 font-semibold">Modifications non enregistrées</span>}
        </div>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/20 text-blue-700 font-body text-sm font-semibold hover:bg-blue-50">
          <Printer size={15} /> Imprimer
        </button>
        <button onClick={enregistrer} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-body text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer
        </button>
      </div>

      {/* Conflits */}
      <div className="mb-5 no-print">
        {erreurs.length === 0 && alertes.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 font-body text-sm">
            <CheckCircle2 size={18} /> Aucun conflit détecté.
          </div>
        ) : (
          <div className="rounded-lg border border-blue-500/10 bg-white overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-blue-500/8 font-body text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-red-700"><AlertOctagon size={15} /> {erreurs.length} erreur{erreurs.length > 1 ? "s" : ""}</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700"><AlertTriangle size={15} /> {alertes.length} alerte{alertes.length > 1 ? "s" : ""}</span>
            </div>
            <ul className="divide-y divide-blue-500/6 max-h-56 overflow-auto">
              {conflits.map((c, i) => (
                <li key={i} className="flex items-start gap-2 px-4 py-2 font-body text-sm">
                  {c.gravite === "erreur" ? <AlertOctagon size={14} className="text-red-600 mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />}
                  <span className={c.gravite === "erreur" ? "text-red-800" : "text-gray-700"}>{c.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Méta */}
      <div className="mb-5 rounded-xl border border-blue-500/12 bg-white p-4 grid sm:grid-cols-3 gap-3 no-print">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Titre</label>
          <input className={inp} value={concours.titre} onChange={(e) => update((c) => ({ ...c, titre: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Sous-titre</label>
          <input className={inp} value={concours.sousTitre ?? ""} onChange={(e) => update((c) => ({ ...c, sousTitre: e.target.value || undefined }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
          <input type="date" className={inp} value={concours.date} onChange={(e) => update((c) => ({ ...c, date: e.target.value }))} />
        </div>
      </div>

      {/* Personnes + Chevaux */}
      <div className="mb-5 grid md:grid-cols-2 gap-4 no-print">
        <div className="rounded-xl border border-blue-500/12 bg-white p-4">
          <div className="font-display font-bold text-gray-800 mb-2 text-sm">Personnes ({concours.personnes.length})</div>
          <div className="flex gap-2 mb-3">
            <input className={inp} placeholder="Prénom…" value={nouvPersonne} onChange={(e) => setNouvPersonne(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouterPersonne()} />
            <button onClick={ajouterPersonne} className="px-3 rounded-lg bg-blue-600 text-white shrink-0"><UserPlus size={16} /></button>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {concours.personnes.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="font-body text-gray-800 w-24 truncate shrink-0">{p.prenom}</span>
                <label className="inline-flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={!!p.peutCoacher} onChange={() => toggleCap(p.id, "peutCoacher")} /> coach</label>
                <label className="inline-flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={!!p.peutJuger} onChange={() => toggleCap(p.id, "peutJuger")} /> juge</label>
                <label className="inline-flex items-center gap-1 text-xs text-gray-500" title="Peut être responsable de la prépa au camion"><input type="checkbox" checked={!!p.peutResponsableCamion} onChange={() => toggleCap(p.id, "peutResponsableCamion")} /> camion</label>
                <button onClick={() => supprimerPersonne(p.id)} className="ml-auto text-gray-300 hover:text-red-500"><X size={15} /></button>
              </div>
            ))}
            {concours.personnes.length === 0 && <p className="text-xs text-gray-400">Ajoute les cavaliers et l&apos;encadrement.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/12 bg-white p-4">
          <div className="font-display font-bold text-gray-800 mb-2 text-sm">Poneys ({concours.chevaux.length})</div>
          <div className="flex gap-2 mb-3">
            <input className={inp} placeholder="Nom du poney…" value={nouvCheval} onChange={(e) => setNouvCheval(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouterCheval()} />
            <button onClick={ajouterCheval} className="px-3 rounded-lg bg-blue-600 text-white shrink-0"><Plus size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-72 overflow-auto">
            {concours.chevaux.map((ch) => (
              <span key={ch.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full pl-2.5 pr-1 py-1">
                {ch.nom}
                <button onClick={() => supprimerCheval(ch.id)} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
              </span>
            ))}
            {concours.chevaux.length === 0 && <p className="text-xs text-gray-400">Optionnel — pour afficher « Cavalier / Poney ».</p>}
          </div>
        </div>
      </div>

      {/* Passages par terrain */}
      <div className="grid md:grid-cols-2 gap-4 no-print">
        {concours.terrains.map((terrain) => (
          <div key={terrain.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-blue-900">{terrain.nom}</h2>
              <button onClick={() => ajouterPassage(terrain.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100">
                <Plus size={15} /> Passage
              </button>
            </div>

            {passagesTerrain(terrain.id).map((p) => (
              <div key={p.id} className="rounded-xl border border-blue-500/12 bg-white p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <input type="number" className={`${inpSm} w-14`} value={p.ordre} onChange={(e) => patchPassage(p.id, { ordre: Number(e.target.value) })} title="Ordre" />
                  <input className={`${inpSm} flex-1`} placeholder="Nom de l'équipe" value={p.nomEquipe} onChange={(e) => patchPassage(p.id, { nomEquipe: e.target.value })} />
                  <button onClick={() => supprimerPassage(p.id)} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={!!p.evenement} onChange={(e) => patchPassage(p.id, { evenement: e.target.checked })} />
                  Remise des prix / temps fort (sans staff)
                </label>

                {p.evenement ? (
                  <input className={`${inpSm} w-32`} placeholder="Heure" value={p.heureACheval} onChange={(e) => patchPassage(p.id, { heureACheval: e.target.value })} />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <input className={inpSm} placeholder="Catégorie" value={p.categorie} onChange={(e) => patchPassage(p.id, { categorie: e.target.value })} />
                      <div className="grid grid-cols-3 gap-1">
                        <input className={inpSm} placeholder="Prépa" value={p.heurePrepa ?? ""} onChange={(e) => patchPassage(p.id, { heurePrepa: e.target.value || undefined })} title="Prépa (HH:MM)" />
                        <input className={inpSm} placeholder="À chev." value={p.heureACheval} onChange={(e) => patchPassage(p.id, { heureACheval: e.target.value })} title="À cheval (HH:MM)" />
                        <input className={inpSm} placeholder="Passage" value={p.heurePassage ?? ""} onChange={(e) => patchPassage(p.id, { heurePassage: e.target.value || undefined })} title="Passage (HH:MM)" />
                      </div>
                    </div>

                    {/* Participants */}
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Cavaliers</div>
                      <div className="space-y-1.5">
                        {p.participants.map((part, idx) => (
                          <div key={idx} className="flex gap-1.5">
                            <select className={`${inpSm} flex-1`} value={part.personneId} onChange={(e) => setParticipant(p.id, idx, "personneId", e.target.value)}>
                              <option value="">— cavalier —</option>
                              {concours.personnes.map((pe) => <option key={pe.id} value={pe.id}>{pe.prenom}</option>)}
                            </select>
                            <select className={`${inpSm} flex-1`} value={part.chevalId ?? ""} onChange={(e) => setParticipant(p.id, idx, "chevalId", e.target.value)}>
                              <option value="">— poney —</option>
                              {concours.chevaux.map((ch) => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
                            </select>
                            <button onClick={() => supprimerParticipant(p.id, idx)} className="px-1.5 text-gray-300 hover:text-red-500"><X size={15} /></button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => ajouterParticipant(p.id)} className="mt-1.5 text-xs text-blue-600 font-semibold inline-flex items-center gap-1"><Plus size={13} /> cavalier</button>
                    </div>

                    {/* Rôles */}
                    <div className="space-y-1.5">
                      {ROLES_EDITABLES.map((type) => {
                        const r = p.roles.find((x) => x.type === type);
                        if (!r) return null;
                        const dispos = concours.personnes.filter((pe) => !r.personneIds.includes(pe.id));
                        return (
                          <div key={type} className="flex items-start gap-2">
                            <span className="text-xs font-semibold text-gray-600 w-16 shrink-0 pt-1.5">{LIBELLE_ROLE[type]}</span>
                            <input type="number" className={`${inpSm} w-12`} value={r.nbRequis} onChange={(e) => setNbRequis(p.id, type, Number(e.target.value))} title="Nombre requis" />
                            <div className="flex flex-wrap gap-1 flex-1 items-center">
                              {r.personneIds.map((pid) => (
                                <span key={pid} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 rounded-full pl-2 pr-1 py-0.5">
                                  {nomPersonne(pid)}
                                  <button onClick={() => retirerRole(p.id, type, pid)} className="hover:text-red-500"><X size={12} /></button>
                                </span>
                              ))}
                              <select className={`${inpSm} text-xs`} value="" onChange={(e) => assignerRole(p.id, type, e.target.value)}>
                                <option value="">+ ajouter</option>
                                {dispos.map((pe) => <option key={pe.id} value={pe.id}>{pe.prenom}</option>)}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <input className={inpSm + " w-full"} placeholder="Note de relais (optionnel)" value={p.noteRelais ?? ""} onChange={(e) => patchPassage(p.id, { noteRelais: e.target.value || undefined })} />
                  </>
                )}
              </div>
            ))}
            {passagesTerrain(terrain.id).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl">Aucun passage. Clique « Passage » pour en ajouter.</p>
            )}
          </div>
        ))}
      </div>

      {/* Rappels */}
      <div className="mt-5 rounded-xl border border-blue-500/12 bg-white p-4 no-print">
        <label className="block text-xs font-semibold text-gray-600 mb-1">Relais &amp; rappels (une ligne par rappel)</label>
        <textarea
          className={`${inp} min-h-[80px]`}
          value={rappelsTexte}
          onChange={(e) => update((c) => ({ ...c, rappels: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }))}
        />
      </div>

      {/* Aperçu / impression */}
      <div className="mt-8">
        <div className="text-xs font-semibold text-gray-400 mb-2 no-print">Aperçu de l&apos;affiche (version imprimée)</div>
        <Affiche concours={concours} />
      </div>
    </div>
  );
}
