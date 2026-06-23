"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Save, Printer, ArrowLeft, Plus, Trash2, Loader2, X,
  AlertOctagon, AlertTriangle, CheckCircle2, UserPlus, Users, Wand2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { analyser, compterPassagesPoneys, personnesOccupeesAuPassage } from "@/lib/concours/contraintes";
import { attribuerAuto } from "@/lib/concours/attribution";
import {
  getConcours, saveConcours,
  listerCavaliersBase, listerPoneysBase, listerCreneauxDuJour,
  type CavalierBase, type PoneyBase, type CreneauImport,
} from "@/lib/concours/store";
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
  const [nouvEquipe, setNouvEquipe] = useState("");

  // bases existantes (cavaliers + poneys)
  const [cavBase, setCavBase] = useState<CavalierBase[]>([]);
  const [poneyBase, setPoneyBase] = useState<PoneyBase[]>([]);
  // séances du planning à la date du concours (pour importer les inscrits)
  const [creneauxJour, setCreneauxJour] = useState<CreneauImport[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [cav, pon] = await Promise.all([listerCavaliersBase(), listerPoneysBase()]);
        setCavBase(cav);
        setPoneyBase(pon);
      } catch (e) {
        console.error("Bases cavaliers/poneys indisponibles", e);
      }
    })();
  }, []);

  // Recharge les séances du planning quand la date du concours change.
  useEffect(() => {
    const date = concours?.date;
    if (!date) { setCreneauxJour([]); return; }
    (async () => {
      try {
        setCreneauxJour(await listerCreneauxDuJour(date));
      } catch (e) {
        console.error("Séances du planning indisponibles", e);
        setCreneauxJour([]);
      }
    })();
  }, [concours?.date]);

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
  const passagesParPoney = useMemo(() => (concours ? compterPassagesPoneys(concours) : {}), [concours]);
  const occupesParPassage = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    if (concours) for (const p of concours.passages) m[p.id] = personnesOccupeesAuPassage(concours, p.id);
    return m;
  }, [concours]);

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
      equipes: (c.equipes || []).map((e) => ({
        ...e,
        membres: e.membres.map((m) => (m.chevalId === cid ? { ...m, chevalId: undefined } : m)),
      })),
    }));

  // ---- Import des inscrits d'une séance du planning ----
  const importerSeance = (creneauId: string) => {
    const cr = creneauxJour.find((x) => x.id === creneauId);
    if (!cr) return;
    update((c) => {
      const chevaux = c.chevaux.map((ch) => ({ ...ch }));
      // Retrouve (ou ajoute) le poney attribué et renvoie son id dans le concours.
      const resoudrePoney = (poneyNom?: string): string | undefined => {
        if (!poneyNom || !poneyNom.trim()) return undefined;
        const cible = poneyNom.trim().toLowerCase();
        const exist = chevaux.find((ch) => ch.nom.trim().toLowerCase() === cible);
        if (exist) return exist.id;
        const base = poneyBase.find((po) => po.nom.trim().toLowerCase() === cible);
        if (base) {
          const id = `eq-${base.equideId}`;
          if (!chevaux.some((ch) => ch.id === id)) chevaux.push({ id, nom: base.nom, equideId: base.equideId });
          return id;
        }
        const id = genId(poneyNom);
        chevaux.push({ id, nom: poneyNom.trim() });
        return id;
      };

      const personnes = c.personnes.map((p) => ({ ...p }));
      for (const i of cr.inscrits) {
        const poneyId = resoudrePoney(i.poneyNom);
        const cav = cavBase.find((x) => x.childId === i.childId);
        const existant = personnes.find((p) => p.cavalierId === i.childId);
        if (existant) {
          if (poneyId && !existant.poneyAttribueId) existant.poneyAttribueId = poneyId;
          if (cav?.naissance && !existant.naissance) existant.naissance = cav.naissance;
        } else {
          personnes.push({
            id: `cav-${i.childId}`,
            prenom: i.prenom,
            cavalierId: i.childId,
            familyId: i.familyId,
            poneyAttribueId: poneyId,
            naissance: cav?.naissance,
          });
        }
      }
      return { ...c, personnes, chevaux };
    });
  };

  // ---- Ajout depuis les bases existantes ----
  const ajouterCavalierDeBase = (childId: string) => {
    if (!childId) return;
    const cav = cavBase.find((x) => x.childId === childId);
    if (!cav) return;
    update((c) => {
      if (c.personnes.some((p) => p.cavalierId === childId)) return c; // déjà ajouté
      return {
        ...c,
        personnes: [
          ...c.personnes,
          { id: `cav-${childId}`, prenom: cav.prenom, cavalierId: cav.childId, familyId: cav.familyId, naissance: cav.naissance },
        ],
      };
    });
  };
  const ajouterPoneyDeBase = (equideId: string) => {
    if (!equideId) return;
    const po = poneyBase.find((x) => x.equideId === equideId);
    if (!po) return;
    update((c) => {
      if (c.chevaux.some((ch) => ch.equideId === equideId)) return c;
      return { ...c, chevaux: [...c.chevaux, { id: `eq-${equideId}`, nom: po.nom, equideId: po.equideId }] };
    });
  };

  // ---- Équipes ----
  const ajouterEquipe = () => {
    const nom = nouvEquipe.trim();
    if (!nom) return;
    update((c) => ({ ...c, equipes: [...(c.equipes || []), { id: genId(nom), nom, membres: [] }] }));
    setNouvEquipe("");
  };
  const supprimerEquipe = (eid: string) =>
    update((c) => ({
      ...c,
      equipes: (c.equipes || []).filter((e) => e.id !== eid),
      passages: c.passages.map((p) => (p.equipeId === eid ? { ...p, equipeId: undefined } : p)),
    }));
  const renommerEquipe = (eid: string, nom: string) =>
    update((c) => ({ ...c, equipes: (c.equipes || []).map((e) => (e.id === eid ? { ...e, nom } : e)) }));
  const ajouterMembre = (eid: string) =>
    update((c) => ({
      ...c,
      equipes: (c.equipes || []).map((e) =>
        e.id === eid ? { ...e, membres: [...e.membres, { personneId: "", chevalId: undefined }] } : e,
      ),
    }));
  const setMembre = (eid: string, idx: number, field: "personneId" | "chevalId", value: string) =>
    update((c) => ({
      ...c,
      equipes: (c.equipes || []).map((e) => {
        if (e.id !== eid) return e;
        return {
          ...e,
          membres: e.membres.map((m, i) => {
            if (i !== idx) return m;
            if (field === "chevalId") return { ...m, chevalId: value || undefined };
            // Choix d'un cavalier : pré-remplit son poney attribué si la case est vide.
            const pers = c.personnes.find((p) => p.id === value);
            return { ...m, personneId: value, chevalId: m.chevalId || pers?.poneyAttribueId || undefined };
          }),
        };
      }),
    }));
  const supprimerMembre = (eid: string, idx: number) =>
    update((c) => ({
      ...c,
      equipes: (c.equipes || []).map((e) =>
        e.id === eid ? { ...e, membres: e.membres.filter((_, i) => i !== idx) } : e,
      ),
    }));

  // Affecter une équipe à un passage : remplit le nom + les participants.
  const appliquerEquipe = (pid: string, equipeId: string) =>
    patchPassageFn(pid, (p) => {
      if (!equipeId) return { ...p, equipeId: undefined };
      const eq = (concours?.equipes || []).find((e) => e.id === equipeId);
      if (!eq) return { ...p, equipeId };
      return {
        ...p,
        equipeId,
        nomEquipe: eq.nom,
        participants: eq.membres.map((m) => ({ personneId: m.personneId, chevalId: m.chevalId })),
      };
    });

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
      participants: p.participants.map((x, i) => {
        if (i !== idx) return x;
        if (field === "chevalId") return { ...x, chevalId: value || undefined };
        const pers = concours?.personnes.find((pe) => pe.id === value);
        return { ...x, personneId: value, chevalId: x.chevalId || pers?.poneyAttribueId || undefined };
      }),
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

  // Toutes les équipes sont-elles déterminées ? (chaque passage non-événement a des cavaliers)
  const passagesReels = concours.passages.filter((p) => !p.evenement);
  const equipesDeterminees = passagesReels.length > 0 && passagesReels.every((p) => p.participants.length > 0);

  const lancerAttributionAuto = () => {
    const res = attribuerAuto(concours);
    update(() => res.concours);
    const reste = res.nonPourvus.reduce((s, x) => s + x.manque, 0);
    toast(
      reste > 0
        ? `${res.pourvus} poste(s) attribué(s) · ${reste} non pourvu(s), à compléter à la main`
        : `${res.pourvus} poste(s) attribué(s) automatiquement`,
      "success",
    );
  };

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
        <button
          onClick={lancerAttributionAuto}
          disabled={!equipesDeterminees}
          title={equipesDeterminees ? "Attribuer automatiquement les postes manquants" : "Détermine d'abord toutes les équipes (un cavalier au moins par passage)"}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-300 text-purple-700 font-body text-sm font-semibold hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Wand2 size={15} /> Attribution auto
        </button>
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
          <div className="space-y-2 mb-3">
            {creneauxJour.length > 0 && (
              <select className={`${inp} bg-green-50 border-green-300`} value="" onChange={(e) => importerSeance(e.target.value)}>
                <option value="">⤓ Importer les inscrits d&apos;une séance du planning…</option>
                {creneauxJour.map((cr) => (
                  <option key={cr.id} value={cr.id}>{cr.heure} · {cr.titre} ({cr.inscrits.length})</option>
                ))}
              </select>
            )}
            <select className={inp} value="" onChange={(e) => ajouterCavalierDeBase(e.target.value)}>
              <option value="">+ Ajouter un cavalier (base)…</option>
              {cavBase
                .filter((cv) => !concours.personnes.some((p) => p.cavalierId === cv.childId))
                .map((cv) => (
                  <option key={cv.childId} value={cv.childId}>
                    {cv.prenom}{cv.famille ? ` ${cv.famille}` : ""}{cv.galop && cv.galop !== "—" ? ` · ${cv.galop}` : ""}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <input className={inp} placeholder="Encadrant / personne libre…" value={nouvPersonne} onChange={(e) => setNouvPersonne(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouterPersonne()} />
              <button onClick={ajouterPersonne} className="px-3 rounded-lg bg-blue-600 text-white shrink-0" title="Ajouter une personne hors base (Nicolas, Emmeline, parent…)"><UserPlus size={16} /></button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {concours.personnes.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="font-body text-gray-800 truncate shrink-0 max-w-[150px]" title={p.poneyAttribueId ? `Poney attribué : ${concours.chevaux.find((ch) => ch.id === p.poneyAttribueId)?.nom ?? ""}` : undefined}>
                  {p.prenom}
                  {p.poneyAttribueId && <span className="text-blue-500"> · {concours.chevaux.find((ch) => ch.id === p.poneyAttribueId)?.nom ?? ""}</span>}
                </span>
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
          <div className="space-y-2 mb-3">
            <select className={inp} value="" onChange={(e) => ajouterPoneyDeBase(e.target.value)}>
              <option value="">+ Ajouter un poney (cavalerie)…</option>
              {poneyBase
                .filter((po) => !concours.chevaux.some((ch) => ch.equideId === po.equideId))
                .map((po) => <option key={po.equideId} value={po.equideId}>{po.nom}</option>)}
            </select>
            <div className="flex gap-2">
              <input className={inp} placeholder="Poney hors base…" value={nouvCheval} onChange={(e) => setNouvCheval(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouterCheval()} />
              <button onClick={ajouterCheval} className="px-3 rounded-lg bg-blue-600 text-white shrink-0" title="Ajouter un poney hors base"><Plus size={16} /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-72 overflow-auto">
            {concours.chevaux.map((ch) => (
              <span key={ch.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full pl-2.5 pr-1 py-1">
                {ch.nom}
                {passagesParPoney[ch.id] ? <span className="text-blue-600 font-semibold">· {passagesParPoney[ch.id]} passage{passagesParPoney[ch.id] > 1 ? "s" : ""}</span> : null}
                <button onClick={() => supprimerCheval(ch.id)} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
              </span>
            ))}
            {concours.chevaux.length === 0 && <p className="text-xs text-gray-400">Optionnel — pour afficher « Cavalier / Poney ».</p>}
          </div>
        </div>
      </div>

      {/* Équipes */}
      <div className="mb-5 rounded-xl border border-blue-500/12 bg-white p-4 no-print">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-blue-600" />
          <span className="font-display font-bold text-gray-800 text-sm">Équipes ({(concours.equipes || []).length})</span>
        </div>
        <div className="flex gap-2 mb-3 max-w-md">
          <input className={inp} placeholder="Nom de l'équipe…" value={nouvEquipe} onChange={(e) => setNouvEquipe(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouterEquipe()} />
          <button onClick={ajouterEquipe} className="px-3 rounded-lg bg-blue-600 text-white shrink-0 inline-flex items-center gap-1 text-sm font-semibold"><Plus size={15} /> Équipe</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {(concours.equipes || []).map((eq) => (
            <div key={eq.id} className="rounded-lg border border-blue-500/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <input className={`${inpSm} flex-1 font-semibold`} value={eq.nom} onChange={(e) => renommerEquipe(eq.id, e.target.value)} />
                <button onClick={() => supprimerEquipe(eq.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
              <div className="space-y-1.5">
                {eq.membres.map((m, idx) => (
                  <div key={idx} className="flex gap-1.5">
                    <select className={`${inpSm} flex-1`} value={m.personneId} onChange={(e) => setMembre(eq.id, idx, "personneId", e.target.value)}>
                      <option value="">— cavalier —</option>
                      {concours.personnes.map((pe) => <option key={pe.id} value={pe.id}>{pe.prenom}</option>)}
                    </select>
                    <select className={`${inpSm} flex-1`} value={m.chevalId ?? ""} onChange={(e) => setMembre(eq.id, idx, "chevalId", e.target.value)}>
                      <option value="">— poney —</option>
                      {concours.chevaux.map((ch) => <option key={ch.id} value={ch.id}>{ch.nom}</option>)}
                    </select>
                    <button onClick={() => supprimerMembre(eq.id, idx)} className="px-1 text-gray-300 hover:text-red-500"><X size={15} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => ajouterMembre(eq.id)} className="mt-1.5 text-xs text-blue-600 font-semibold inline-flex items-center gap-1"><Plus size={13} /> membre</button>
            </div>
          ))}
          {(concours.equipes || []).length === 0 && (
            <p className="text-xs text-gray-400">Crée une équipe, nomme-la, puis ajoute ses membres (cavalier + poney). Tu pourras ensuite l&apos;affecter à un passage.</p>
          )}
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-600 shrink-0">Équipe</span>
                      <select className={`${inpSm} flex-1`} value={p.equipeId ?? ""} onChange={(e) => appliquerEquipe(p.id, e.target.value)}>
                        <option value="">— choisir une équipe —</option>
                        {(concours.equipes || []).map((eq) => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
                      </select>
                    </div>
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
                                {dispos.map((pe) => {
                                  const occupe = occupesParPassage[p.id]?.has(pe.id);
                                  return (
                                    <option key={pe.id} value={pe.id} disabled={occupe}>
                                      {pe.prenom}{occupe ? " — occupé" : ""}
                                    </option>
                                  );
                                })}
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
