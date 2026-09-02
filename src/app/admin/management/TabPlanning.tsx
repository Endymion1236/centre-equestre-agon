"use client";
import { useState, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { Plus, Trash2, Check, ChevronLeft, ChevronRight, Printer, Save, LayoutTemplate, AlignVerticalSpaceAround, AlertTriangle, Undo2, RotateCcw, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui";
import type { TacheType, TachePlanifiee, Salarie, JourSemaine, ModelePlanning, TacheModele } from "./types";
import {
  TIME_SLOTS, COULEURS_SALARIE, heureToMin, minToHeure, planDecoupage, roundToQuarter,
} from "./planning-utils";
import { TableauView, HoraireView, FicheView } from "./VuesPlanning";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, getISOWeek, formatDateCourte, fmtDuree, calcTempsTravailJour, bornesJournee } from "./types";
import { dateSaisieComplete } from "@/lib/date-saisie";
import {
  emailLayout, emailButton, emailTitre, emailParagraphe as P, emailCouleurs as CE,
} from "@/lib/email-templates";

const POLICE_PLANNING = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

interface Props {
  semaine: string;
  setSemaine: (s: string) => void;
  taches: TachePlanifiee[];
  tachesType: TacheType[];
  salaries: Salarie[];
  creneaux: any[];
  modeles: ModelePlanning[];
  onRefresh: () => void;
}

export default function TabPlanning({ semaine, setSemaine, taches, tachesType, salaries, creneaux, modeles, onRefresh }: Props) {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [addCell, setAddCell] = useState<{ salarieId: string; jour: JourSemaine } | null>(null);
  // Aperçu du découpage automatique avant application (chevauchements détectés).
  const [pendingSplit, setPendingSplit] = useState<{ newTasks: any[]; decoupes: any[] } | null>(null);
  // binomeIds : si la tache est marquée binomeRequis, contient les ids des salariés
  // additionnels à assigner sur le même créneau. La tache du salarié principal +
  // une tache identique pour chaque binôme sont créées en une fois.
  const [addForm, setAddForm] = useState({ tacheTypeId: "", heureDebut: "08:00", dureeMinutes: 30, joursSelectionnes: [] as JourSemaine[], enchainer: false, binomeIds: [] as string[] });
  // Lignes repliees : a dix collaboratrices la grille devient haute et on
  // perd de vue celle qu'on consulte. Un clic sur la fleche range la
  // semaine, un second la redeploie. Choix conserve entre visites.
  const [salariesReplies, setSalariesReplies] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const b = window.localStorage.getItem("planning_salaries_replies");
      return new Set(b ? (JSON.parse(b) as string[]) : []);
    } catch { return new Set(); }
  });
  const basculerSalarie = (id: string) => {
    setSalariesReplies((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      try { window.localStorage.setItem("planning_salaries_replies", JSON.stringify([...n])); } catch {}
      return n;
    });
  };
  // Édition d'une tâche existante : ouvre une modale de modification
  const [editingTache, setEditingTache] = useState<TachePlanifiee | null>(null);
  const [editForm, setEditForm] = useState({ tacheTypeId: "", heureDebut: "08:00", dureeMinutes: 30, notes: "", salarieId: "" });
  // Diffuser la NOTE seule sur toute la semaine : une consigne du type
  // « Caramel boite jusqu'a vendredi » vaut pour chaque jour, alors qu'un
  // changement d'horaire ne concerne que la tache ouverte.
  const [editNoteSemaine, setEditNoteSemaine] = useState(false);
  // Diffuser le nouvel HORAIRE sur les autres jours de la semaine. Une tâche
  // posée tous les jours à la même heure se déplace en bloc : sans cette
  // option, il fallait rouvrir chaque jour un par un — et la case « note »
  // laissait croire que l'horaire suivait aussi.
  const [editHoraireSemaine, setEditHoraireSemaine] = useState(false);
  // Une "tache a 2 personnes" = 2 documents distincts (un salarieId chacun).
  // Cette option repercute le changement d'horaire sur les jumelles.
  const [editAppliquerTous, setEditAppliquerTous] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApplyModele, setShowApplyModele] = useState(false);
  const [showSaveModele, setShowSaveModele] = useState(false);
  const [saveModeleName, setSaveModeleName] = useState("");
  const [saveModeleType, setSaveModeleType] = useState<"scolaire" | "vacances" | "autre">("scolaire");
  const [applyingModele, setApplyingModele] = useState(false);
  // ── Modale de gestion des conflits lors de l'application d'un modèle ─
  // Quand on applique un modèle sur une semaine non vide, on liste les
  // doublons et on propose : remplacer / ajouter quand même / annuler.
  // Une tâche est en doublon si même (salarieId, jour, heureDebut, tacheTypeId).
  const [conflictDialog, setConflictDialog] = useState<{
    modele: ModelePlanning;
    duplicates: { existante: TachePlanifiee; nouvelle: TacheModele }[];
    nouvelles: TacheModele[]; // tâches du modèle qui ne sont pas en doublon
  } | null>(null);
  // Vue par défaut : 'tableau' pour admin, 'fiche' pour moniteur
  // (seule info utile à une monitrice : son horaire et ses tâches individuelles)
  const [view, setView] = useState<"tableau" | "horaire" | "fiche">(isAdmin ? "tableau" : "fiche");
  const [selectedDay, setSelectedDay] = useState<JourSemaine>(() => {
    const dayIndex = (new Date().getDay() + 6) % 7; // 0=lundi
    return JOURS[Math.min(dayIndex, 4)] as JourSemaine; // cap à vendredi
  });
  const [selectedSalarieId, setSelectedSalarieId] = useState<string>("");
  const [joursTravailles, setJoursTravailles] = useState<JourSemaine[]>(["lundi","mardi","mercredi","jeudi","vendredi"]);

  const lundi = getLundideSemaine(semaine);

  const prevWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate()-7);
    const iso = getISO(d); setSemaine(iso);
  };
  const nextWeek = () => {
    const d = new Date(lundi); d.setDate(d.getDate()+7);
    setSemaine(getISO(d));
  };
  function getISO(date: Date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    d.setDate(d.getDate()+3-((d.getDay()+6)%7));
    const w1 = new Date(d.getFullYear(),0,4);
    const wn = 1+Math.round(((d.getTime()-w1.getTime())/86400000-3+((w1.getDay()+6)%7))/7);
    return `${d.getFullYear()}-W${String(wn).padStart(2,"0")}`;
  }

  const jourDates = JOURS.map((j, i) => {
    const d = new Date(lundi); d.setDate(d.getDate()+i);
    return { jour: j, date: d, label: `${JOURS_LABELS[j]} ${formatDateCourte(d)}` };
  });

  // Ouvrir le formulaire d'ajout
  const openAdd = (salarieId: string, jour: JourSemaine) => {
    const defaultTache = tachesType.find(t => t.joursDefaut?.includes(jour));

    // Calculer l'heure de début = fin de la dernière tâche de ce salarié ce jour
    const existingTaches = taches
      .filter(t => t.salarieId === salarieId && t.jour === jour)
      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
    
    let heureDebut = "08:00";
    if (existingTaches.length > 0) {
      const last = existingTaches[existingTaches.length - 1];
      heureDebut = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
    }

    // Si la tâche a des horaires standards, prendre le premier qui est >= heureDebut calculée
    const horairesStd = defaultTache?.horairesDefaut?.sort() || [];
    if (horairesStd.length > 0) {
      const debutMin = heureToMin(heureDebut);
      const nextHoraire = horairesStd.find(h => heureToMin(h) >= debutMin);
      if (nextHoraire) heureDebut = nextHoraire;
    }

    setAddForm({
      tacheTypeId: defaultTache?.id || (tachesType[0]?.id || ""),
      heureDebut,
      dureeMinutes: defaultTache?.dureeMinutes || 30,
      joursSelectionnes: [] as JourSemaine[],
      enchainer: false,
      binomeIds: [] as string[],
    });
    setAddCell({ salarieId, jour });
  };

  // Construit la liste des nouvelles tâches à créer + le plan de découpage
  // des tâches existantes chevauchées (par salarié/jour).
  const construirePlan = () => {
    const tt = tachesType.find(t => t.id === addForm.tacheTypeId)!;
    const joursToAdd: JourSemaine[] = addForm.joursSelectionnes.length > 0
      ? addForm.joursSelectionnes
      : [addCell!.jour];
    const allSalIds = [addCell!.salarieId, ...addForm.binomeIds.filter(id => id && id !== addCell!.salarieId)];
    const duree = addForm.dureeMinutes || roundToQuarter(tt.dureeMinutes);

    const newTasks: any[] = [];
    const decoupes: any[] = [];

    for (const jour of joursToAdd) {
      let heureDebut = addForm.heureDebut;
      if (addForm.enchainer && joursToAdd.length > 1) {
        const jourTaches = taches
          .filter(t => t.salarieId === addCell!.salarieId && t.jour === jour)
          .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
        if (jourTaches.length > 0) {
          const last = jourTaches[jourTaches.length - 1];
          heureDebut = minToHeure(heureToMin(last.heureDebut) + last.dureeMinutes);
        }
      }
      const newStart = heureToMin(heureDebut);
      const newEnd = newStart + duree;

      for (const salId of allSalIds) {
        const salObj = salaries.find(s => s.id === salId);
        if (!salObj) continue;
        newTasks.push({
          tacheTypeId: addForm.tacheTypeId, tacheLabel: tt.label, categorie: tt.categorie,
          salarieId: salId, salarieName: salObj.nom, jour, heureDebut, dureeMinutes: duree, semaine,
        });
        const existing = taches.filter(t => t.salarieId === salId && t.jour === jour && t.semaine === semaine);
        const ops = planDecoupage(existing, newStart, newEnd);
        if (ops.updates.length || ops.creates.length || ops.deletes.length) {
          decoupes.push({
            salarieName: salObj.nom, jour,
            nouvelle: `${tt.label} ${heureDebut}→${minToHeure(newEnd)}`,
            ...ops,
          });
        }
      }
    }
    return { newTasks, decoupes };
  };

  const addTache = async () => {
    if (!addCell || !addForm.tacheTypeId) return;
    const { newTasks, decoupes } = construirePlan();
    // S'il y a des chevauchements, on montre l'aperçu à valider avant d'écrire.
    if (decoupes.length > 0) { setPendingSplit({ newTasks, decoupes }); return; }
    await ecrireTaches(newTasks, []);
  };

  // Écrit les nouvelles tâches + applique le découpage (raccourcir / couper / supprimer).
  const ecrireTaches = async (newTasks: any[], decoupes: any[]) => {
    setSaving(true);
    try {
      const ops: Promise<any>[] = [];
      for (const nt of newTasks) {
        ops.push(addDoc(collection(db, "taches-planifiees"), { ...nt, done: false, createdAt: serverTimestamp() }));
      }
      for (const d of decoupes) {
        for (const u of d.updates) {
          ops.push(updateDoc(doc(db, "taches-planifiees", u.id), { heureDebut: u.heureDebut, dureeMinutes: u.dureeMinutes, updatedAt: serverTimestamp() }));
        }
        for (const c of d.creates) {
          ops.push(addDoc(collection(db, "taches-planifiees"), {
            tacheTypeId: c.from.tacheTypeId, tacheLabel: c.from.tacheLabel, categorie: c.from.categorie,
            salarieId: c.from.salarieId, salarieName: c.from.salarieName, jour: c.from.jour,
            heureDebut: c.heureDebut, dureeMinutes: c.dureeMinutes, semaine: c.from.semaine,
            done: false, createdAt: serverTimestamp(),
          }));
        }
        for (const del of d.deletes) {
          ops.push(deleteDoc(doc(db, "taches-planifiees", del.id)));
        }
      }
      await Promise.all(ops);
      toast(decoupes.length > 0 ? "Tâche ajoutée et planning ajusté" : "Tâche ajoutée", "success");
      setAddCell(null);
      setPendingSplit(null);
      onRefresh();
    } catch (e: any) { toast(`Erreur : ${e.message}`, "error"); }
    setSaving(false);
  };

  const toggleDone = async (t: TachePlanifiee) => {
    await updateDoc(doc(db, "taches-planifiees", t.id), { done: !t.done, updatedAt: serverTimestamp() });
    onRefresh();
  };

  // ── Édition d'une tâche (clic sur une carte) ──────────────────────────
  // Les tâches importées du planning (tacheTypeId === "__planning__") ne sont
  // pas éditables ici : elles correspondent aux cours/stages dont les
  // horaires sont imposés par /admin/planning. On affiche un toast pour
  // rediriger l'admin si besoin.
  const openEditTache = (t: TachePlanifiee) => {
    if (t.tacheTypeId === "__planning__") {
      toast("Cette tâche vient du planning général (cours/stage). Modifie-la dans la page Planning.", "info");
      return;
    }
    setEditingTache(t);
    setEditNoteSemaine(false);
    setEditHoraireSemaine(false);
    setEditAppliquerTous(true);
    setEditForm({
      salarieId: t.salarieId || "",
      tacheTypeId: t.tacheTypeId,
      heureDebut: t.heureDebut,
      dureeMinutes: t.dureeMinutes,
      notes: t.notes || "",
    });
  };

  const saveEditTache = async () => {
    if (!editingTache) return;
    const tt = tachesType.find(t => t.id === editForm.tacheTypeId);
    if (!tt) { toast("Type de tâche introuvable", "error"); return; }
    setSaving(true);
    try {
      // Reaffectation : le salarie peut changer sans supprimer/recreer.
      const nouveauSal = editForm.salarieId || editingTache.salarieId;
      const salObj = salaries.find(s => s.id === nouveauSal);

      await updateDoc(doc(db, "taches-planifiees", editingTache.id), {
        tacheTypeId: editForm.tacheTypeId,
        tacheLabel: tt.label,
        categorie: tt.categorie,
        heureDebut: editForm.heureDebut,
        dureeMinutes: editForm.dureeMinutes,
        notes: editForm.notes || null,
        salarieId: nouveauSal,
        salarieName: salObj?.nom || editingTache.salarieName || "",
        updatedAt: serverTimestamp(),
      });

      // Tâches JUMELLES : même tâche, même jour, même horaire d'origine, mais
      // affectée à quelqu'un d'autre. Une modification d'horaire doit les
      // suivre, sinon les deux personnes ne sont plus synchronisées.
      // La réaffectation, elle, ne concerne QUE la tâche ouverte.
      if (editAppliquerTous) {
        const jumelles = taches.filter((t: any) =>
          t.id !== editingTache.id
          && t.jour === editingTache.jour
          && t.semaine === editingTache.semaine
          && t.tacheTypeId === editingTache.tacheTypeId
          && t.heureDebut === editingTache.heureDebut
          && t.salarieId !== nouveauSal
        );
        await Promise.all(jumelles.map((t: any) =>
          updateDoc(doc(db, "taches-planifiees", t.id), {
            heureDebut: editForm.heureDebut,
            dureeMinutes: editForm.dureeMinutes,
            // Le commentaire suit aussi : une consigne saisie sur la tache
            // d'une personne (« sortir aussi les Kune Kune ») vaut pour tout
            // le monde sur la meme tache au meme moment — sinon seule la
            // personne depuis laquelle on a edite voyait la note.
            notes: editForm.notes || null,
            updatedAt: serverTimestamp(),
          })
        ));
        if (jumelles.length > 0) {
          toast(`Modifications répercutées sur ${jumelles.length} autre(s) personne(s)`, "success");
        }
      }
      // Horaire appliqué aux autres jours de la semaine, pour la même personne
      // et la même tâche. On ne touche QUE les jours qui étaient à la même
      // heure que celle d'origine : un jour volontairement décalé garde son
      // horaire au lieu d'être aligné de force sur les autres.
      if (editHoraireSemaine) {
        const memeHeure = taches.filter((t: any) =>
          t.id !== editingTache.id
          && t.semaine === editingTache.semaine
          && t.tacheTypeId === editingTache.tacheTypeId
          && t.salarieId === nouveauSal
          && t.heureDebut === editingTache.heureDebut
        );
        await Promise.all(memeHeure.map((t: any) =>
          updateDoc(doc(db, "taches-planifiees", t.id), {
            heureDebut: editForm.heureDebut,
            dureeMinutes: editForm.dureeMinutes,
            updatedAt: serverTimestamp(),
          })
        ));
        if (memeHeure.length > 0) {
          toast(`Horaire appliqué à ${memeHeure.length} autre(s) jour(s) de la semaine`, "success");
        }
      }

      // Note appliquée à toute la semaine : on ne touche QUE le champ notes,
      // jamais les horaires — chaque jour peut avoir les siens.
      if (editNoteSemaine) {
        const memeSemaine = taches.filter((t: any) =>
          t.id !== editingTache.id
          && t.semaine === editingTache.semaine
          && t.tacheTypeId === editingTache.tacheTypeId
          && t.salarieId === nouveauSal
        );
        await Promise.all(memeSemaine.map((t: any) =>
          updateDoc(doc(db, "taches-planifiees", t.id), {
            notes: editForm.notes || null,
            updatedAt: serverTimestamp(),
          })
        ));
        if (memeSemaine.length > 0) {
          toast(`Note appliquée à ${memeSemaine.length} autre(s) jour(s) de la semaine`, "success");
        }
      }

      setEditingTache(null);
      setEditNoteSemaine(false);
      setEditHoraireSemaine(false);
      onRefresh();
      toast(`"${tt.label}" mise à jour`, "success");
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, "error");
    }
    setSaving(false);
  };

  // ── Compacter la journée d'un salarié ────────────────────────────────
  /**
   * Tasse les tâches manuelles dans la journée pour combler les trous,
   * en respectant les tâches importées du planning (cours/stages) comme
   * des "ancres" temporelles fixes.
   *
   * Algorithme :
   * 1. Récupère toutes les tâches du salarié pour ce jour, triées par heure.
   * 2. Identifie les "ancres" (tacheTypeId === "__planning__") : leurs
   *    horaires sont imposés et ne bougent jamais.
   * 3. Sépare les tâches manuelles en groupes selon leur position vs ancres :
   *    - "avant la 1ère ancre"
   *    - "entre ancre N et ancre N+1"
   *    - "après la dernière ancre"
   * 4. Dans chaque groupe : on tasse les tâches en partant de l'extrémité
   *    de l'ancre précédente (ou de la 1ère heure si pas d'ancre avant).
   *    Une tâche qui dépasserait sur l'ancre suivante n'est PAS rognée :
   *    on prévient l'admin via toast et on la laisse à sa place originale.
   *
   * Cas particulier : la 1ère tâche manuelle "avant ancre" garde son heure
   * de début si elle n'a pas de prédécesseur (elle sert de point de départ
   * de la chaîne de compactage).
   */
  const [compactingKey, setCompactingKey] = useState<string | null>(null);
  const compacterJournee = async (salarieId: string, jour: JourSemaine) => {
    const key = `${salarieId}|${jour}`;
    if (compactingKey === key) return;
    setCompactingKey(key);
    try {
      // 1. Récupère toutes les tâches du jour pour ce salarié, triées
      const dayTaches = taches
        .filter(t => t.salarieId === salarieId && t.jour === jour)
        .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));

      if (dayTaches.length < 2) {
        toast("Rien à compacter (moins de 2 tâches)", "info");
        setCompactingKey(null);
        return;
      }

      // 2. Indice des ancres dans le tableau trié
      const ancreIndices: number[] = [];
      dayTaches.forEach((t, i) => { if (t.tacheTypeId === "__planning__") ancreIndices.push(i); });

      // 3. Calculer les nouveaux horaires en simulation (sans écrire)
      const updates: { id: string; oldHeure: string; newHeure: string }[] = [];
      const conflits: string[] = [];

      // Helper : pour une plage [startMin, limitMin] et une liste d'indices
      // de tâches manuelles, on les tasse en partant de startMin.
      const tasserPlage = (indices: number[], startMin: number, limitMin: number | null) => {
        let cursor = startMin;
        for (const idx of indices) {
          const t = dayTaches[idx];
          const newDebut = cursor;
          const newFin = newDebut + t.dureeMinutes;
          if (limitMin !== null && newFin > limitMin) {
            // La tâche déborderait sur l'ancre suivante : on ne la déplace pas
            conflits.push(`${t.tacheLabel} (${t.heureDebut})`);
            // On laisse cette tâche à sa place originale et on reprend après
            cursor = heureToMin(t.heureDebut) + t.dureeMinutes;
            continue;
          }
          const newHeure = minToHeure(newDebut);
          if (newHeure !== t.heureDebut) {
            updates.push({ id: t.id, oldHeure: t.heureDebut, newHeure });
          }
          cursor = newFin;
        }
      };

      if (ancreIndices.length === 0) {
        // Pas d'ancre : on tasse toutes les tâches manuelles depuis la
        // 1ère, qui garde son heure de début comme point d'ancrage de chaîne.
        const firstHeure = heureToMin(dayTaches[0].heureDebut);
        const indices = dayTaches.map((_, i) => i).filter(i => dayTaches[i].tacheTypeId !== "__planning__");
        tasserPlage(indices, firstHeure, null);
      } else {
        // Avant la 1ère ancre : on tasse en remontant depuis l'ancre
        // (la dernière tâche manuelle finit pile à l'heure de l'ancre).
        // Stratégie alternative plus simple : on garde la 1ère manuelle
        // à son heure originale, on tasse les suivantes à la chaîne.
        const before = dayTaches.slice(0, ancreIndices[0])
          .map((_, i) => i).filter(i => dayTaches[i].tacheTypeId !== "__planning__");
        if (before.length > 0) {
          const firstHeure = heureToMin(dayTaches[before[0]].heureDebut);
          const ancreHeure = heureToMin(dayTaches[ancreIndices[0]].heureDebut);
          tasserPlage(before, firstHeure, ancreHeure);
        }

        // Entre chaque paire d'ancres : on tasse depuis la fin de l'ancre N
        // jusqu'au début de l'ancre N+1.
        for (let a = 0; a < ancreIndices.length - 1; a++) {
          const ancreA = dayTaches[ancreIndices[a]];
          const ancreFinMin = heureToMin(ancreA.heureDebut) + ancreA.dureeMinutes;
          const ancreBmin = heureToMin(dayTaches[ancreIndices[a + 1]].heureDebut);
          const between: number[] = [];
          for (let i = ancreIndices[a] + 1; i < ancreIndices[a + 1]; i++) {
            if (dayTaches[i].tacheTypeId !== "__planning__") between.push(i);
          }
          if (between.length > 0) tasserPlage(between, ancreFinMin, ancreBmin);
        }

        // Après la dernière ancre
        const lastAncre = dayTaches[ancreIndices[ancreIndices.length - 1]];
        const lastAncreFinMin = heureToMin(lastAncre.heureDebut) + lastAncre.dureeMinutes;
        const after: number[] = [];
        for (let i = ancreIndices[ancreIndices.length - 1] + 1; i < dayTaches.length; i++) {
          if (dayTaches[i].tacheTypeId !== "__planning__") after.push(i);
        }
        if (after.length > 0) tasserPlage(after, lastAncreFinMin, null);
      }

      if (updates.length === 0) {
        toast(conflits.length > 0
          ? `Aucun changement possible (${conflits.length} tâche(s) bloquée(s))`
          : "La journée est déjà compactée", "info");
        setCompactingKey(null);
        return;
      }

      // 4. Confirmation utilisateur
      const sal = salaries.find(s => s.id === salarieId);
      const recap = updates.slice(0, 5).map(u => {
        const t = dayTaches.find(x => x.id === u.id)!;
        return `• ${t.tacheLabel} : ${u.oldHeure} → ${u.newHeure}`;
      }).join("\n");
      const confirmed = confirm(
        `Compacter ${JOURS_LABELS[jour]} pour ${sal?.nom} ?\n\n` +
        `${updates.length} tâche(s) seront décalées :\n${recap}` +
        (updates.length > 5 ? `\n… et ${updates.length - 5} autres` : "") +
        (conflits.length > 0
          ? `\n\n⚠️ ${conflits.length} tâche(s) ne peuvent pas être déplacées (déborderaient sur un cours)`
          : "")
      );
      if (!confirmed) { setCompactingKey(null); return; }

      // 5. Appliquer les updates en batch
      const batch = writeBatch(db);
      for (const u of updates) {
        batch.update(doc(db, "taches-planifiees", u.id), {
          heureDebut: u.newHeure,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      toast(`✅ ${updates.length} tâche(s) recompactée(s)`, "success");
      onRefresh();
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, "error");
    }
    setCompactingKey(null);
  };

  const delTache = async (t: TachePlanifiee) => {
    // Trouver les tâches similaires de la même personne cette semaine
    const similaires = taches.filter(
      other => other.id !== t.id &&
        other.salarieId === t.salarieId &&
        other.tacheLabel === t.tacheLabel &&
        other.heureDebut === t.heureDebut
    );

    if (similaires.length === 0) {
      // Seule occurrence → supprimer directement
      if (!confirm(`Supprimer "${t.tacheLabel}" (${JOURS_LABELS[t.jour]}) ?`)) return;
      await deleteDoc(doc(db, "taches-planifiees", t.id));
    } else {
      // Plusieurs occurrences → proposer le choix
      const choix = prompt(
        `"${t.tacheLabel}" est assignée à ${t.salarieName} sur ${similaires.length + 1} jours.\n\n` +
        `Tapez :\n` +
        `  1 → Supprimer uniquement ${JOURS_LABELS[t.jour]}\n` +
        `  2 → Supprimer les ${similaires.length + 1} jours (${[t, ...similaires].map(x => JOURS_LABELS[x.jour].slice(0,3)).join(", ")})`,
        "1"
      );
      if (!choix) return;

      if (choix.trim() === "2") {
        // Supprimer toutes les similaires + celle-ci
        const toDelete = [t, ...similaires];
        await Promise.all(toDelete.map(d => deleteDoc(doc(db, "taches-planifiees", d.id))));
        toast(`${toDelete.length} tâches "${t.tacheLabel}" supprimées pour ${t.salarieName}`, "success");
      } else {
        await deleteDoc(doc(db, "taches-planifiees", t.id));
        toast(`"${t.tacheLabel}" supprimée (${JOURS_LABELS[t.jour]})`, "success");
      }
    }
    onRefresh();
  };

  // ── Vider une case : toutes les tâches d'une personne sur un jour précis ──
  const viderCellule = async (salarieId: string, jour: JourSemaine) => {
    const cellTaches = taches.filter(t => t.salarieId === salarieId && t.jour === jour);
    if (cellTaches.length === 0) return;
    const sal = salaries.find(s => s.id === salarieId);
    if (!confirm(
      `Supprimer toutes les tâches de ${sal?.nom || "ce salarié"} le ${JOURS_LABELS[jour]} ?\n\n` +
      `${cellTaches.length} tâche(s) seront définitivement supprimées (cours/stages importés inclus).`
    )) return;
    try {
      // writeBatch limité à 500 opérations → découpage par lots de 450.
      for (let i = 0; i < cellTaches.length; i += 450) {
        const batch = writeBatch(db);
        cellTaches.slice(i, i + 450).forEach(t => batch.delete(doc(db, "taches-planifiees", t.id)));
        await batch.commit();
      }
      toast(`${cellTaches.length} tâche(s) supprimée(s) — ${sal?.nom || ""} ${JOURS_LABELS[jour]}`, "success");
      onRefresh();
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, "error");
    }
  };

  // ── Sauvegarder la semaine comme modèle ─────────────────────────────
  const handleSaveAsModele = async () => {
    if (!saveModeleName.trim()) { toast("Nom du modèle requis", "error"); return; }
    if (taches.length === 0) { toast("La semaine est vide, rien à sauvegarder", "error"); return; }
    setSaving(true);
    try {
      const tachesModele: TacheModele[] = taches.map(t => ({
        tacheTypeId: t.tacheTypeId || "",
        tacheLabel: t.tacheLabel || "",
        categorie: t.categorie || "autre",
        salarieId: t.salarieId || "",
        salarieName: t.salarieName || "",
        jour: t.jour,
        heureDebut: t.heureDebut || "08:00",
        dureeMinutes: t.dureeMinutes || 30,
        ...(t.notes ? { notes: t.notes } : {}),
      }));

      const COULEURS_TYPE = { scolaire: "#2050A0", vacances: "#d97706", autre: "#6b7280" };
      await addDoc(collection(db, "modeles-planning"), {
        nom: saveModeleName.trim(),
        description: `Créé depuis la semaine ${semaine}`,
        type: saveModeleType,
        couleur: COULEURS_TYPE[saveModeleType],
        taches: tachesModele,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast(`Modèle "${saveModeleName}" créé avec ${tachesModele.length} tâches`, "success");
      setShowSaveModele(false);
      setSaveModeleName("");
      onRefresh();
    } catch (e: any) {
      console.error("Erreur sauvegarde modèle:", e);
      toast(`Erreur : ${e.message || "Échec sauvegarde"}`, "error");
    }
    setSaving(false);
  };

  // ── Appliquer un modèle sur la semaine courante ─────────────────────
  // Étape 1 : on détecte les doublons (même salarié + jour + heure + tâche)
  //   - 0 doublon → on applique direct (avec confirm classique)
  //   - 1+ doublons → on ouvre la modale de conflits (3 choix possibles)
  const handleApplyModele = async (modele: ModelePlanning) => {
    // Détection des doublons
    const duplicates: { existante: TachePlanifiee; nouvelle: TacheModele }[] = [];
    const nouvelles: TacheModele[] = [];
    for (const tm of modele.taches) {
      const existante = taches.find(t =>
        t.salarieId === tm.salarieId &&
        t.jour === tm.jour &&
        t.heureDebut === tm.heureDebut &&
        t.tacheTypeId === tm.tacheTypeId
      );
      if (existante) duplicates.push({ existante, nouvelle: tm });
      else nouvelles.push(tm);
    }

    // Cas simple : pas de doublons → confirmation rapide puis ajout
    if (duplicates.length === 0) {
      const msg = taches.length > 0
        ? `Appliquer "${modele.nom}" sur la semaine ${semaine} ?\n\nLes ${taches.length} tâches existantes seront conservées, les ${modele.taches.length} tâches du modèle seront AJOUTÉES.`
        : `Appliquer "${modele.nom}" sur la semaine ${semaine} ?\n\n${modele.taches.length} tâches seront créées.`;
      if (!confirm(msg)) return;
      await doApplyModele(modele, modele.taches, []);
      return;
    }

    // Cas avec conflits : ouvrir la modale dédiée
    setConflictDialog({ modele, duplicates, nouvelles });
    setShowApplyModele(false);
  };

  // ── Exécution effective de l'application d'un modèle ────────────────
  // - tachesAjouter : liste des TacheModele à créer
  // - tachesASupprimer : liste des TachePlanifiee existantes à effacer avant ajout
  //   (utilisé pour le mode "Remplacer les doublons")
  // Toutes les tâches créées portent le même importBatchId pour permettre
  // une annulation propre ensuite (bouton "Annuler le dernier import").
  const doApplyModele = async (
    modele: ModelePlanning,
    tachesAjouter: TacheModele[],
    tachesASupprimer: TachePlanifiee[]
  ) => {
    setApplyingModele(true);
    try {
      // ── 1. Suppression des doublons (si mode "Remplacer") ─────────────
      // On utilise writeBatch pour la cohérence (tout ou rien sur les delete)
      if (tachesASupprimer.length > 0) {
        // Firestore batch max 500 ops, on découpe par 400 pour avoir de la marge
        for (let i = 0; i < tachesASupprimer.length; i += 400) {
          const batch = writeBatch(db);
          tachesASupprimer.slice(i, i + 400).forEach(t => {
            batch.delete(doc(db, "taches-planifiees", t.id));
          });
          await batch.commit();
        }
      }

      // ── 2. Génération d'un identifiant unique pour ce batch d'import ──
      // crypto.randomUUID est dispo dans tous les navigateurs récents
      const importBatchId = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      // ── 3. Création des nouvelles tâches par chunks de 50 ─────────────
      let count = 0;
      for (let i = 0; i < tachesAjouter.length; i += 50) {
        const chunk = tachesAjouter.slice(i, i + 50);
        const promises = chunk.map(t =>
          addDoc(collection(db, "taches-planifiees"), {
            tacheTypeId: t.tacheTypeId,
            tacheLabel: t.tacheLabel,
            categorie: t.categorie,
            salarieId: t.salarieId,
            salarieName: t.salarieName,
            jour: t.jour,
            heureDebut: t.heureDebut,
            dureeMinutes: t.dureeMinutes,
            notes: t.notes || "",
            semaine,
            done: false,
            createdAt: serverTimestamp(),
            // Traçabilité : permet l'annulation en bloc et la détection de
            // ré-imports involontaires.
            importBatchId,
            importedFromModeleId: modele.id,
            importedFromModeleNom: modele.nom,
            importedAt: serverTimestamp(),
          })
        );
        await Promise.all(promises);
        count += chunk.length;
      }

      // ── 4. Toast récap ────────────────────────────────────────────────
      const parts: string[] = [];
      if (tachesASupprimer.length > 0) parts.push(`${tachesASupprimer.length} doublon(s) remplacé(s)`);
      parts.push(`${count} tâche(s) ajoutée(s)`);
      toast(`Modèle "${modele.nom}" appliqué · ${parts.join(" · ")}`, "success");

      setShowApplyModele(false);
      setConflictDialog(null);
      onRefresh();
    } catch (e: any) {
      console.error(e);
      toast("Erreur lors de l'application du modèle", "error");
    }
    setApplyingModele(false);
  };

  // ── Actions de la modale de conflits ──────────────────────────────────

  /** Supprime les doublons existants puis ajoute TOUTES les tâches du modèle */
  const conflictRemplacer = async () => {
    if (!conflictDialog) return;
    const { modele, duplicates, nouvelles } = conflictDialog;
    const aSupprimer = duplicates.map(d => d.existante);
    // On réajoute aussi les "nouvelles + doublons" pour reconstituer le modèle complet
    const aAjouter = [...nouvelles, ...duplicates.map(d => d.nouvelle)];
    await doApplyModele(modele, aAjouter, aSupprimer);
  };

  /** Ajoute toutes les tâches du modèle SANS supprimer les doublons (comportement legacy) */
  const conflictAjouterQuandMeme = async () => {
    if (!conflictDialog) return;
    const { modele } = conflictDialog;
    await doApplyModele(modele, modele.taches, []);
  };

  /** Ferme la modale sans rien faire */
  const conflictAnnuler = () => setConflictDialog(null);

  // ── Annuler le dernier import (ou un import spécifique par batchId) ─
  // Supprime toutes les tâches de la semaine courante qui portent cet
  // importBatchId. Utile si on s'aperçoit après coup qu'on a appliqué le
  // mauvais modèle ou qu'on a importé deux fois la même semaine.
  const handleUndoImport = async (importBatchId: string, nomModele?: string) => {
    const aSupprimer = taches.filter(t => t.importBatchId === importBatchId);
    if (aSupprimer.length === 0) {
      toast("Aucune tâche à annuler pour cet import", "info");
      return;
    }
    if (!confirm(
      `Annuler l'import${nomModele ? ` du modèle "${nomModele}"` : ""} ?\n\n` +
      `${aSupprimer.length} tâche(s) seront supprimées.\n\n` +
      `⚠️ Cette action est irréversible.`
    )) return;

    setApplyingModele(true);
    try {
      for (let i = 0; i < aSupprimer.length; i += 400) {
        const batch = writeBatch(db);
        aSupprimer.slice(i, i + 400).forEach(t => {
          batch.delete(doc(db, "taches-planifiees", t.id));
        });
        await batch.commit();
      }
      toast(`✅ Import annulé · ${aSupprimer.length} tâche(s) supprimée(s)`, "success");
      onRefresh();
    } catch (e) {
      console.error(e);
      toast("Erreur lors de l'annulation", "error");
    }
    setApplyingModele(false);
  };

  // ── Liste des imports distincts de la semaine (pour le bouton "Annuler") ──
  // Regroupe les tâches par importBatchId pour proposer une annulation ciblée.
  const importsDeLaSemaine = useMemo(() => {
    const groups: Record<string, { batchId: string; nom: string; count: number; date: Date | null }> = {};
    for (const t of taches) {
      if (!t.importBatchId) continue;
      const key = t.importBatchId;
      if (!groups[key]) {
        const importedAt = t.importedAt?.toDate?.() || null;
        groups[key] = {
          batchId: key,
          nom: t.importedFromModeleNom || "Modèle inconnu",
          count: 0,
          date: importedAt,
        };
      }
      groups[key].count++;
    }
    // Tri du plus récent au plus ancien (les imports sans date à la fin)
    return Object.values(groups).sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    });
  }, [taches]);

  // Calcul charge par salarié (minutes totales / semaine)
  // Charge par salarié = somme par jour de (amplitude première→dernière tâche − pauses explicites).
  // Cohérent avec TabHoraires : les battements courts entre tâches non-pause sont comptés.
  const [inclureDimanche, setInclureDimanche] = useState(false);
  const nbJours = inclureDimanche ? 7 : 6;

  // Le total compte TOUJOURS les sept jours. Le bouton « Dim. » cache une
  // colonne, il ne retire pas des heures : masquer le dimanche affichait 35 h
  // là où l'onglet Horaires en comptait 40h30 pour le même salarié, et c'est
  // le second chiffre qui va sur la fiche de paie. Un filtre d'affichage ne
  // doit jamais changer un total d'heures.
  const chargeParSalarie = useMemo(() => {
    const map: Record<string, number> = {};
    const salIds = [...new Set(taches.map(t => t.salarieId))];
    for (const salId of salIds) {
      let total = 0;
      for (const jour of JOURS) {
        const dayT = taches.filter(t => t.salarieId === salId && t.jour === jour);
        total += calcTempsTravailJour(dayT);
      }
      map[salId] = total;
    }
    return map;
  }, [taches]);

  /** Heures du dimanche non affichées : à signaler plutôt qu'à taire. */
  const dimancheMasque = useMemo(() => {
    if (inclureDimanche) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    for (const salId of [...new Set(taches.map(t => t.salarieId))]) {
      const dayT = taches.filter(t => t.salarieId === salId && t.jour === "dimanche");
      const charge = calcTempsTravailJour(dayT);
      if (charge > 0) map[salId] = charge;
    }
    return map;
  }, [taches, inclureDimanche]);

  // ── Importer les cours/stages du planning dans les tâches ───────────────
  const [importing, setImporting] = useState(false);

  const handleImportCreneaux = async () => {
    // Calculer les dates de la semaine
    // ⚠️ On importe TOUJOURS les 7 jours (lun→dim) indépendamment du toggle "Dim."
    // d'affichage. Sinon, si le toggle est décoché, les cours/stages du dimanche
    // ne seraient jamais importés en tâches → horaires du dimanche absents de
    // la fiche horaires mensuelle (TabHoraires).
    const dates = jourDates.map(({ jour, date }) => ({
      jour,
      dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    }));

    // ── 1. Lister tout ce qu'il faudrait avoir après import ──
    // (= les créneaux du planning de la semaine qui ont un moniteur reconnu)
    const targetCreneaux: { creneau: any; salarieId: string; salarieName: string; jour: JourSemaine }[] = [];

    for (const { jour, dateStr } of dates) {
      const dayCr = creneaux.filter(c => c.date === dateStr && c.monitor);
      for (const c of dayCr) {
        // Supporter plusieurs moniteurs séparés par virgule
        const monitorNames = (c.monitor || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        for (const monitorName of monitorNames) {
          const monitorLower = monitorName.toLowerCase();
          const sal = salaries.find(s =>
            s.actif && s.nom.toLowerCase().trim() === monitorLower
          );
          if (sal) {
            targetCreneaux.push({ creneau: c, salarieId: sal.id, salarieName: sal.nom, jour });
          }
        }
      }
    }

    // ── 2. Synchro non destructive : on garde les cours/stages déjà importés ──
    // (et leur statut 'fait'), on crée seulement les manquants, on retire les
    // obsolètes. Clé d'unicité d'un cours/stage : salarié + jour + heure + titre.
    // Les tâches manuelles (vrai tacheTypeId) ne sont JAMAIS touchées.
    const keyOf = (salarieId: string, jour: string, heure: string, label: string) =>
      `${salarieId}|${jour}|${heure}|${(label || "").trim()}`;

    const existantes = taches.filter(t =>
      t.tacheTypeId === "__planning__" && t.semaine === semaine
    );
    const existKeys = new Map<string, TachePlanifiee>();
    existantes.forEach(t => existKeys.set(keyOf(t.salarieId, t.jour, t.heureDebut, t.tacheLabel), t));

    const aCreer: typeof targetCreneaux = [];
    const keysVues = new Set<string>();
    for (const tc of targetCreneaux) {
      const k = keyOf(tc.salarieId, tc.jour, tc.creneau.startTime, tc.creneau.activityTitle);
      if (keysVues.has(k)) continue;       // doublon entre deux créneaux identiques → ignoré
      keysVues.add(k);
      if (!existKeys.has(k)) aCreer.push(tc); // déjà présent → on garde, sinon à créer
    }
    // Obsolètes : tâches __planning__ qui ne correspondent plus à aucun créneau actuel
    const aSupprimer = existantes.filter(t =>
      !keysVues.has(keyOf(t.salarieId, t.jour, t.heureDebut, t.tacheLabel))
    );
    const nbGardees = existantes.length - aSupprimer.length;

    // ── 3. Garde-fou : si rien à créer ni à supprimer, le planning est déjà à jour ──
    if (aCreer.length === 0 && aSupprimer.length === 0) {
      toast(targetCreneaux.length === 0
        ? "Aucun cours/stage avec moniteur reconnu cette semaine"
        : "Planning déjà à jour — aucun doublon créé", "info");
      return;
    }

    // ── 4. Confirmation utilisateur avec récap clair ──
    const confirmed = confirm(
      `Synchroniser le planning de la semaine ?\n\n` +
      (nbGardees > 0 ? `✅ ${nbGardees} cours/stage déjà présent(s) CONSERVÉS (statut 'fait' gardé)\n` : "") +
      (aCreer.length > 0 ? `📥 ${aCreer.length} nouveau(x) cours/stage ajouté(s)\n` : "") +
      (aSupprimer.length > 0 ? `🗑️ ${aSupprimer.length} cours/stage obsolète(s) (plus au planning) supprimé(s)\n` : "") +
      (aCreer.length > 0
        ? "\n" + aCreer.slice(0, 6).map(m =>
            `• ${JOURS_LABELS[m.jour]} ${m.creneau.startTime}→${m.creneau.endTime} : ${m.creneau.activityTitle} (${m.salarieName})`
          ).join("\n") +
          (aCreer.length > 6 ? `\n… et ${aCreer.length - 6} autres` : "")
        : "") +
      `\n\nLes tâches manuelles (non issues du planning) ne sont PAS touchées.`
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      // ── 5. Supprimer uniquement les cours/stages obsolètes ──
      const deletePromises = aSupprimer.map(t => deleteDoc(doc(db, "taches-planifiees", t.id)));
      await Promise.all(deletePromises);

      // ── 6. Créer uniquement les nouveaux cours/stages (jamais de doublon) ──
      const createPromises: Promise<any>[] = [];
      for (const { creneau, salarieId, salarieName, jour } of aCreer) {
        const startMin = heureToMin(creneau.startTime);
        const endMin = heureToMin(creneau.endTime);
        const duree = endMin - startMin;

        createPromises.push(addDoc(collection(db, "taches-planifiees"), {
          tacheTypeId: "__planning__",
          tacheLabel: creneau.activityTitle,
          categorie: "animation" as any,
          color: creneau.color || "",
          salarieId,
          salarieName,
          jour,
          heureDebut: creneau.startTime,
          dureeMinutes: duree > 0 ? duree : 60,
          semaine,
          done: false,
          notes: `${creneau.activityType || ""} · ${(creneau.enrolled || []).length}/${creneau.maxPlaces || "?"} inscrits`,
          createdAt: serverTimestamp(),
        }));
      }
      await Promise.all(createPromises);

      // Si on a ajouté au moins un créneau le dimanche, on active l'affichage
      // du dimanche pour que l'admin voie bien ce qui vient d'être ajouté.
      const hasSunday = aCreer.some(t => t.jour === "dimanche");
      if (hasSunday && !inclureDimanche) {
        setInclureDimanche(true);
      }

      // ── 7. Toast récap ──
      const parts: string[] = [];
      if (aCreer.length > 0) parts.push(`${aCreer.length} ajouté(s)`);
      if (nbGardees > 0) parts.push(`${nbGardees} conservé(s)`);
      if (aSupprimer.length > 0) parts.push(`${aSupprimer.length} obsolète(s) retiré(s)`);
      toast(`✅ ${parts.join(" · ")}`, "success");
      onRefresh();
    } catch (e: any) {
      console.error(e);
      toast("Erreur lors de l'import", "error");
    }
    setImporting(false);
  };

  const getCat = (cat: string) => CATEGORIES.find(c => c.id === cat);
  // Couleur de la tâche : couleur custom (import planning) > couleur catégorie > fallback
  const getTaskColor = (t: TachePlanifiee) => (t as any).color || getCat(t.categorie)?.color || "#64748b";

  // ── Détection automatique des tâches obligatoires manquantes ───────────
  const tachesObligatoires = tachesType.filter(t => t.obligatoire);

  const tachesManquantes = useMemo(() => {
    const manquantes: { tache: TacheType; jour: JourSemaine }[] = [];
    for (const tt of tachesObligatoires) {
      // Jours attendus : joursObligatoires > joursDefaut > lun-ven
      const joursConfig = (tt.joursObligatoires && tt.joursObligatoires.length > 0)
        ? tt.joursObligatoires
        : (tt.joursDefaut && tt.joursDefaut.length > 0)
          ? tt.joursDefaut
          : JOURS.slice(0, 5) as JourSemaine[];
      // Filtrer par les jours réellement travaillés cette semaine
      const joursAttendus = joursConfig.filter(j => joursTravailles.includes(j));
      for (const jour of joursAttendus) {
        const exists = taches.some(t => t.tacheTypeId === tt.id && t.jour === jour);
        const existsByLabel = taches.some(t => t.tacheLabel === tt.label && t.jour === jour);
        if (!exists && !existsByLabel) {
          manquantes.push({ tache: tt, jour });
        }
      }
    }
    return manquantes;
  }, [taches, tachesObligatoires, joursTravailles]);

  // ── Détection des conflits horaires (même salarié, même jour, chevauchement) ─
  interface Conflit {
    salarieName: string;
    salarieId: string;
    jour: JourSemaine;
    tache1: TachePlanifiee;
    tache2: TachePlanifiee;
  }

  const conflits = useMemo(() => {
    const result: Conflit[] = [];
    const salIds = [...new Set(taches.map(t => t.salarieId))];
    for (const salId of salIds) {
      // Sept jours : un chevauchement du dimanche est un vrai conflit, même
      // quand la colonne est masquée.
      for (const jour of JOURS) {
        const jourTaches = taches
          .filter(t => t.salarieId === salId && t.jour === jour)
          .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
        for (let i = 0; i < jourTaches.length; i++) {
          const t1 = jourTaches[i];
          const fin1 = heureToMin(t1.heureDebut) + t1.dureeMinutes;
          for (let j = i + 1; j < jourTaches.length; j++) {
            const t2 = jourTaches[j];
            const debut2 = heureToMin(t2.heureDebut);
            if (debut2 < fin1) {
              // Chevauchement détecté
              result.push({
                salarieName: t1.salarieName,
                salarieId: salId,
                jour,
                tache1: t1,
                tache2: t2,
              });
            }
          }
        }
      }
    }
    return result;
  }, [taches]);

  // ── Vérification IA complète ──────────────────────────────────────────
  const [iaChecking, setIaChecking] = useState(false);
  const [iaResult, setIaResult] = useState<string | null>(null);
  const [showConflits, setShowConflits] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const [openPanel, setOpenPanel] = useState<"planning" | "partager" | null>(null);

  // ── Notifier l'équipe par email ───────────────────────────────────────
  const handleNotifyEquipe = async () => {
    setNotifying(true);
    try {
      const snap = await getDocs(collection(db, "moniteurs"));
      const moniteurs = snap.docs.map(d => ({ ...(d.data() as any), id: d.id }))
        .filter((m: any) => m.status === "active" && m.email);

      if (moniteurs.length === 0) {
        toast("Aucun moniteur avec email trouvé dans Paramètres → Moniteurs", "error");
        setNotifying(false);
        return;
      }

      const activeSals = salaries.filter(s => s.actif);
      // L'email part avec le dimanche dès qu'il y a des tâches dessus : un
      // moniteur qui travaille le dimanche doit le lire dans son planning, et
      // le total en bas doit correspondre à ce qu'il voit.
      const emailAvecDimanche = taches.some(t => t.jour === "dimanche");
      const joursLabels = jourDates.slice(0, emailAvecDimanche ? 7 : nbJours);
      const semaineNum = semaine.split("-W")[1];
      const dateDebut = formatDateCourte(lundi);
      const dateFin = formatDateCourte(new Date(lundi.getTime() + (joursLabels.length - 1) * 86400000));
      const siteUrl = "https://centre-equestre-agon.vercel.app";

      let sent = 0;
      for (const mon of moniteurs) {
        // Trouver le salarié correspondant
        const sal = activeSals.find(s => s.nom.toLowerCase().trim() === (mon.name || "").toLowerCase().trim());
        const salTaches = sal
          ? taches.filter(t => t.salarieId === sal.id).sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || a.heureDebut.localeCompare(b.heureDebut))
          : [];
        const totalCharge = joursLabels.reduce((sum, { jour }) => {
          const dayT = salTaches.filter(t => t.jour === jour);
          return sum + calcTempsTravailJour(dayT);
        }, 0);

        // Construire le tableau style management (jours en colonnes, tâches en cartes)
        const jourHeaders = joursLabels.map(({ jour, date }) =>
          `<th style="padding:6px 4px;text-align:center;font-size:10px;font-weight:700;color:#475569;background:#f1f5f9;border-bottom:2px solid #e2e8f0;width:${Math.floor(85/6)}%;">${JOURS_LABELS[jour].slice(0,3)} ${date.getDate()}</th>`
        ).join("");

        const jourCells = joursLabels.map(({ jour }) => {
          const dayT = salTaches.filter(t => t.jour === jour);
          if (dayT.length === 0) {
            return `<td style="padding:4px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:center;"><span style="color:#d1d5db;font-size:11px;">—</span></td>`;
          }
          const cards = dayT.map(t => {
            const color = (t as any).color || getCat(t.categorie)?.color || "#64748b";
            const cat = getCat(t.categorie);
            return `<div style="background:${color}12;border:1px solid ${color}25;border-radius:6px;padding:4px 6px;margin-bottom:3px;">
              <div style="font-size:10px;font-weight:600;color:${color};line-height:1.3;">${t.tacheLabel}</div>
              <div style="font-size:9px;color:#94a3b8;">${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}</div>
            </div>`;
          }).join("");
          return `<td style="padding:3px;border-bottom:1px solid #f1f5f9;vertical-align:top;">${cards}</td>`;
        }).join("");

        // Résumé charge par jour
        const chargeCells = joursLabels.map(({ jour }) => {
          const dayT = salTaches.filter(t => t.jour === jour);
          const charge = calcTempsTravailJour(dayT);
          // Heure de fin de journée (fin de la dernière tâche) sous la charge
          const bornes = bornesJournee(dayT);
          const finStr = bornes ? `<br/><span style="font-weight:400;color:#64748b;">→ ${bornes.fin}</span>` : "";
          return `<td style="padding:4px;text-align:center;font-size:9px;font-weight:700;color:${charge > 0 ? "#1e3a5f" : "#d1d5db"};border-top:1px solid #e2e8f0;">${charge > 0 ? fmtDuree(charge) + finStr : "—"}</td>`;
        }).join("");

        const html = emailLayout([
          emailTitre(`Planning de la semaine ${semaineNum}`),
          P(`Bonjour <strong>${mon.name}</strong>,`),
          P(totalCharge > 0
            ? `Du ${dateDebut} au ${dateFin} — <strong>${fmtDuree(totalCharge)}</strong> de travail.`
            : `Du ${dateDebut} au ${dateFin} — aucune tâche assignée cette semaine.`),
          totalCharge > 0 ? `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-family:${POLICE_PLANNING};">
            <thead><tr>${jourHeaders}</tr></thead>
            <tbody><tr>${jourCells}</tr></tbody>
            <tfoot>
              <tr>${chargeCells}</tr>
              <tr><td colspan="${joursLabels.length}" style="padding:10px 12px;text-align:center;font-weight:700;color:${CE.encre};font-size:13px;border-top:1px solid ${CE.bord};">Total : ${fmtDuree(totalCharge)}</td></tr>
            </tfoot>
          </table>` : "",
          emailButton("Voir mon planning", `${siteUrl}/espace-moniteur/planning`),
          P("Ce planning peut être modifié. En cas de question, contacte Nicolas.", 13),
        ].join("\n"), `Semaine ${semaineNum} — ${totalCharge > 0 ? fmtDuree(totalCharge) : "aucune tâche"}`);

        try {
          await authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: mon.email,
              subject: `Votre planning — semaine ${semaineNum}, du ${dateDebut} au ${dateFin}`,
              html,
              context: "admin_planning_moniteur",
              template: "planningMoniteur",
            }),
          });
          sent++;
        } catch (e) {
          console.error(`Erreur envoi à ${mon.name}:`, e);
        }
      }

      toast(`Planning envoyé à ${sent} moniteur${sent > 1 ? "s" : ""} par email`, "success");
    } catch (e: any) {
      console.error("Erreur notification:", e);
      toast(`Erreur : ${e.message || "Échec envoi"}`, "error");
    }
    setNotifying(false);
  };

  const handleIACheck = async () => {
    setIaChecking(true);
    setIaResult(null);
    try {
      const planningResume = JOURS.map(jour => {
        const jourTaches = taches.filter(t => t.jour === jour);
        return `${JOURS_LABELS[jour]} :\n` + (jourTaches.length === 0
          ? "  (aucune tâche)"
          : jourTaches.map(t => `  - ${t.tacheLabel} → ${t.salarieName} (${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)})`).join("\n"));
      }).join("\n");

      const obligatoiresListe = tachesObligatoires.map(t =>
        `- ${t.label} (${t.categorie}, ${fmtDuree(t.dureeMinutes)}, jours: ${(t.joursDefaut || []).map(j => JOURS_LABELS[j].slice(0, 3)).join(", ") || "lun-ven"})`
      ).join("\n");

      const salariesListe = salaries.filter(s => s.actif).map(s => s.nom).join(", ");

      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assistant",
          question: `Tu es l'assistant de gestion du centre équestre. Vérifie ce planning hebdomadaire de l'équipe.

SALARIÉS ACTIFS : ${salariesListe}

TÂCHES OBLIGATOIRES (doivent être assignées chaque jour prévu) :
${obligatoiresListe || "(aucune tâche marquée obligatoire)"}

PLANNING DE LA SEMAINE ${semaine} :
${planningResume}

TÂCHES MANQUANTES DÉTECTÉES AUTOMATIQUEMENT : ${tachesManquantes.length === 0 ? "Aucune" : tachesManquantes.map(m => `${m.tache.label} le ${JOURS_LABELS[m.jour]}`).join(", ")}

Analyse ce planning et donne :
1. ✅ Ce qui est bien couvert
2. ⚠️ Les tâches obligatoires manquantes ou incomplètes
3. 💡 Des suggestions d'amélioration (charge équilibrée, tâches oubliées, surcharge d'un salarié)

Réponds de façon concise et pratique, en français.`,
          context: {
            _systemOverride: `Tu es l'assistant de gestion du Centre Équestre d'Agon-Coutainville. Analyse le planning management de l'équipe.`,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIaResult(data.answer || data.response || data.text || "Pas de réponse");
      } else {
        setIaResult("Erreur lors de la vérification IA");
      }
    } catch (e) {
      setIaResult("Erreur de connexion à l'IA");
    }
    setIaChecking(false);
  };

  // ── Vue tableau ──────────────────────────────────────────────────────────

  // ── Vue Horaire (grille heures × jours, alignée) ──────────────────────────

  // ── Vue Fiche individuelle (lisible + imprimable) ────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── PRINT-ONLY HEADER ── */}
      <div className="print-header" style={{display:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"2px solid #1e3a5f",paddingBottom:8,marginBottom:12}}>
          <div>
            <div style={{fontFamily:"sans-serif",fontSize:18,fontWeight:800,color:"#1e3a5f"}}>
              Planning équipe — {lundi.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}
            </div>
            <div style={{fontFamily:"sans-serif",fontSize:12,color:"#64748b",marginTop:2}}>
              Semaine {semaine.split("-W")[1]} · {formatDateCourte(lundi)} → {formatDateCourte(new Date(lundi.getTime()+(nbJours-1)*86400000))}
            </div>
          </div>
          <div style={{fontFamily:"sans-serif",fontSize:11,color:"#64748b",textAlign:"right"}}>
            Centre Équestre<br/>d'Agon-Coutainville
          </div>
        </div>
      </div>

      <div className="print-hide flex flex-col gap-4">

        {/* ── NAVIGATION SEMAINE + JOURS ── */}
        <Card padding="sm">
          <div className="flex items-center justify-between px-2 mb-3">
            <button type="button" onClick={prevWeek} className="flex items-center gap-1 font-body text-sm font-semibold text-blue-800 bg-transparent border-none cursor-pointer hover:text-blue-500 transition-colors px-2 py-1">
              <ChevronLeft size={16}/>Préc.
            </button>
            <div className="flex flex-col items-center gap-0.5">
              <div className="font-display text-lg font-bold text-blue-800 capitalize">
                {lundi.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </div>
              <div className="font-body text-xs text-gray-400">
                Du {formatDateCourte(lundi)} au {formatDateCourte(new Date(lundi.getTime() + (nbJours - 1) * 86400000))} · Semaine {semaine.split("-W")[1]}
              </div>
              <input type="date" title="Aller à cette date"
                className="font-body text-[10px] px-2 py-0.5 rounded-lg border border-gray-200 bg-white cursor-pointer focus:border-blue-400 focus:outline-none text-gray-400 mt-0.5"
                onChange={e => {
                  // Attendre la date complète : sinon chaque frappe de l'année
                  // faisait sauter la semaine affichée, et la remise à zéro du
                  // champ empêchait de finir la saisie (cf. lib/date-saisie).
                  const jour = dateSaisieComplete(e.target.value);
                  if (!jour) return;
                  jour.setHours(12);
                  setSemaine(getISOWeek(jour));
                  e.target.value = "";
                }}/>
            </div>
            <div className="flex items-center gap-2">
              <label
                title="Inclure le dimanche dans la semaine"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-body text-xs font-semibold cursor-pointer transition-all
                  ${inclureDimanche
                    ? "bg-blue-500 text-white border-blue-500"
                    : "bg-white text-slate-500 border-gray-200 hover:bg-gray-50"}`}>
                <input
                  type="checkbox"
                  checked={inclureDimanche}
                  onChange={e => setInclureDimanche(e.target.checked)}
                  className="hidden"
                />
                Dim.
              </label>
              <button type="button" onClick={() => setSemaine(getISOWeek(new Date()))}
                className="font-body text-xs font-semibold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-lg border-none cursor-pointer hover:bg-blue-100 transition-colors">Auj.</button>
              <button type="button" onClick={nextWeek} className="flex items-center gap-1 font-body text-sm font-semibold text-blue-800 bg-transparent border-none cursor-pointer hover:text-blue-500 transition-colors px-2 py-1">
                Suiv.<ChevronRight size={16}/>
              </button>
            </div>
          </div>
          {/* Jours de la semaine */}
          <div className="grid gap-1.5 px-2" style={{gridTemplateColumns: `repeat(${nbJours}, 1fr)`}}>
            {jourDates.slice(0, nbJours).map(({ jour, date }) => {
              const isToday = (() => {
                const now = new Date();
                return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
              })();
              const hasTaches = taches.some(t => t.jour === jour);
              return (
                <div key={jour}
                  className={`text-center py-2 rounded-xl font-body text-xs font-semibold transition-all
                    ${isToday
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/25"
                      : hasTaches
                        ? "bg-blue-50 text-blue-800 border border-blue-100"
                        : "bg-gray-50 text-gray-400 border border-gray-100"
                    }`}>
                  {JOURS_LABELS[jour].slice(0, 3)} {date.getDate()}{date.getMonth() !== lundi.getMonth() ? `/${date.getMonth() + 1}` : ""}
                  {hasTaches && !isToday && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-400 align-middle" />}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── CARDS MONITEURS ── */}
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {salaries.filter(s=>s.actif).map(sal => {
            const charge = chargeParSalarie[sal.id]||0;
            const done = taches.filter(t=>t.salarieId===sal.id&&t.done).length;
            const total = taches.filter(t=>t.salarieId===sal.id).length;
            const pct = total > 0 ? Math.round((done/total)*100) : 0;
            return (
              <Card key={sal.id} padding="sm">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:sal.couleur}}/>
                    <span className="font-display text-sm font-bold text-blue-800 truncate">{sal.nom}</span>
                  </div>
                  <div className="font-body text-lg font-bold text-blue-800">{fmtDuree(charge)}</div>
                  {total > 0 ? (
                    <>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${pct}%`, background:sal.couleur}}/>
                      </div>
                      <div className="font-body text-[10px] text-gray-400">{done}/{total} tâches ✓</div>
                    </>
                  ) : (
                    <div className="font-body text-[10px] text-gray-300">Aucune tâche</div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── BARRE D'ACTIONS — 3 gros boutons (admin uniquement) ──
            Les moniteurs n'ont pas besoin de ces actions :
            - Le switcher de vues est inutile (on leur impose la vue Fiche)
            - 'Planning' (Importer/Modèles) est une action de configuration
            - 'Partager' est une action de coordination d'équipe
            Ils ne voient donc que leur fiche, directement lisible. */}
        {isAdmin && (
        <>
        <div className="flex gap-3 items-stretch">

          {/* ① Switcher de vue — toujours visible */}
          <div className="flex bg-gray-100 rounded-2xl p-1.5 gap-1 flex-shrink-0">
            {(["tableau","horaire","fiche"] as const).map(v => (
              <button type="button" key={v} onClick={()=>setView(v)}
                className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl font-body text-xs font-semibold border-none cursor-pointer transition-all min-w-[72px]
                  ${view===v ? "bg-white text-blue-700 shadow-sm" : "bg-transparent text-gray-400 hover:text-blue-700 hover:bg-white/60"}`}>
                <span className="text-lg">{v === "tableau" ? "📊" : v === "horaire" ? "🕐" : "📋"}</span>
                <span>{v === "tableau" ? "Tableau" : v === "horaire" ? "Horaire" : "Fiche"}</span>
              </button>
            ))}
          </div>

          {/* ② Bouton Planning */}
          <button type="button"
            onClick={() => setOpenPanel(openPanel === "planning" ? null : "planning")}
            className={`flex-1 flex items-center gap-4 px-5 py-4 rounded-2xl border-2 cursor-pointer transition-all text-left
              ${openPanel === "planning"
                ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/25"
                : "bg-white border-gray-200 text-blue-800 hover:border-blue-300 hover:bg-blue-50 shadow-sm"}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl
              ${openPanel === "planning" ? "bg-white/20" : "bg-blue-50"}`}>
              📅
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold">Planning</div>
              <div className={`font-body text-xs mt-0.5 ${openPanel === "planning" ? "text-white/70" : "text-gray-400"}`}>
                Importer, modèles, organisation
              </div>
            </div>
            <div className={`ml-auto text-lg transition-transform ${openPanel === "planning" ? "rotate-180" : ""}`}>⌄</div>
          </button>

          {/* ③ Bouton Partager */}
          <button type="button"
            onClick={() => setOpenPanel(openPanel === "partager" ? null : "partager")}
            className={`flex-1 flex items-center gap-4 px-5 py-4 rounded-2xl border-2 cursor-pointer transition-all text-left
              ${openPanel === "partager"
                ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/25"
                : "bg-white border-gray-200 text-blue-800 hover:border-blue-300 hover:bg-blue-50 shadow-sm"}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl
              ${openPanel === "partager" ? "bg-white/20" : "bg-blue-50"}`}>
              📤
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold">Partager</div>
              <div className={`font-body text-xs mt-0.5 ${openPanel === "partager" ? "text-white/70" : "text-gray-400"}`}>
                Imprimer, envoyer par email
              </div>
            </div>
            <div className={`ml-auto text-lg transition-transform ${openPanel === "partager" ? "rotate-180" : ""}`}>⌄</div>
          </button>
        </div>

        {/* ── PANEL PLANNING ── */}
        {openPanel === "planning" && (
          <Card padding="md">
            <div className="grid grid-cols-3 gap-4">

              {/* Importer cours/stages */}
              <button type="button" onClick={() => { handleImportCreneaux(); setOpenPanel(null); }} disabled={importing}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-purple-100 bg-purple-50 hover:border-purple-300 hover:bg-purple-100 cursor-pointer text-left transition-all disabled:opacity-50 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm group-hover:shadow">
                  {importing ? <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" /> : "📅"}
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-purple-800">{importing ? "Import en cours…" : "Importer cours/stages"}</div>
                  <div className="font-body text-xs text-purple-500 mt-0.5">Récupère automatiquement les créneaux du planning de la semaine</div>
                </div>
              </button>

              {/* Appliquer un modèle */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-green-100 bg-green-50 hover:border-green-300 hover:bg-green-100 transition-all">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                  <LayoutTemplate size={20} className="text-green-600" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-green-800">Appliquer un modèle</div>
                  <div className="font-body text-xs text-green-600 mt-0.5">Charge une semaine type enregistrée</div>
                </div>
                {modeles.length === 0 ? (
                  <p className="font-body text-xs text-green-500 italic">Aucun modèle. Créez-en ci-dessous.</p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                    {modeles.map(m => (
                      <button type="button" key={m.id} onClick={() => { handleApplyModele(m); }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-green-50 cursor-pointer border border-green-200 hover:border-green-400 text-left transition-colors">
                        <span className="text-sm">{m.type === "scolaire" ? "📚" : m.type === "vacances" ? "☀️" : "📌"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-xs font-semibold text-green-800 truncate">{m.nom}</div>
                          <div className="font-body text-[9px] text-gray-400">{m.taches.length} tâches</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sauvegarder comme modèle */}
              <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-200 transition-all">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Save size={20} className="text-blue-500" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">Sauvegarder modèle</div>
                  <div className="font-body text-xs text-blue-500 mt-0.5">Enregistre la semaine actuelle comme template</div>
                </div>
                {taches.length === 0 ? (
                  <p className="font-body text-xs text-blue-400 italic">Aucune tâche cette semaine.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input value={saveModeleName} onChange={e => setSaveModeleName(e.target.value)}
                      placeholder="Nom du modèle…"
                      className="w-full px-3 py-2 rounded-xl border border-blue-200 font-body text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/30 text-blue-800 bg-white" />
                    <div className="flex gap-1">
                      {([["scolaire","📚","Scolaire"],["vacances","☀️","Vacances"],["autre","📌","Autre"]] as const).map(([id, emoji, label]) => (
                        <button type="button" key={id} onClick={() => setSaveModeleType(id)}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border font-body text-[10px] font-semibold cursor-pointer transition-all
                            ${saveModeleType === id ? "bg-blue-500 text-white border-blue-500 shadow-sm" : "bg-white text-blue-800 border-blue-200 hover:border-blue-400"}`}>
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={handleSaveAsModele}
                      className="w-full py-2 rounded-xl bg-blue-500 text-white font-body text-xs font-semibold cursor-pointer border-none hover:bg-blue-400 shadow-md shadow-blue-500/20 transition-colors">
                      Créer le modèle ({taches.length} tâches)
                    </button>
                  </div>
                )}
              </div>

              {/* ── Annuler un import (rollback ciblé) ─────────────────────
                  Affiche la liste des modèles appliqués sur cette semaine et
                  permet de tout effacer en bloc. Utile si on a appliqué le
                  mauvais modèle ou importé 2 fois la même semaine. */}
              {importsDeLaSemaine.length > 0 && (
                <div className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-orange-100 bg-orange-50 hover:border-orange-200 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
                    <Undo2 size={20} className="text-orange-500" />
                  </div>
                  <div>
                    <div className="font-display text-sm font-bold text-orange-800">Annuler un import</div>
                    <div className="font-body text-xs text-orange-600 mt-0.5">
                      {importsDeLaSemaine.length} import{importsDeLaSemaine.length > 1 ? "s" : ""} sur cette semaine
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                    {importsDeLaSemaine.map(imp => (
                      <button type="button"
                        key={imp.batchId}
                        onClick={() => handleUndoImport(imp.batchId, imp.nom)}
                        disabled={applyingModele}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-orange-50 cursor-pointer border border-orange-200 hover:border-orange-400 text-left transition-colors disabled:opacity-40"
                      >
                        <Undo2 size={12} className="text-orange-500" />
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-xs font-semibold text-orange-800 truncate">{imp.nom}</div>
                          <div className="font-body text-[9px] text-gray-400">
                            {imp.count} tâche{imp.count > 1 ? "s" : ""}
                            {imp.date && ` · ${imp.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </Card>
        )}

        {/* ── PANEL PARTAGER ── */}
        {openPanel === "partager" && (
          <Card padding="md">
            <div className="grid grid-cols-2 gap-4">

              {/* Imprimer */}
              <button type="button" onClick={() => { window.print(); setOpenPanel(null); }} disabled={taches.length === 0}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 cursor-pointer text-left transition-all disabled:opacity-40 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm group-hover:shadow">
                  <Printer size={20} className="text-blue-800" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">Imprimer</div>
                  <div className="font-body text-xs text-gray-400 mt-0.5">Format A4 paysage, optimisé pour l'impression</div>
                </div>
              </button>

              {/* Email équipe */}
              <button type="button" onClick={() => { handleNotifyEquipe(); setOpenPanel(null); }} disabled={notifying || taches.length === 0}
                className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-blue-100 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 cursor-pointer text-left transition-all disabled:opacity-40 group">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm group-hover:shadow">
                  {notifying ? <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> : "📧"}
                </div>
                <div>
                  <div className="font-display text-sm font-bold text-blue-800">{notifying ? "Envoi en cours…" : "Email à l'équipe"}</div>
                  <div className="font-body text-xs text-blue-500 mt-0.5">Envoie le planning personnalisé à chaque moniteur</div>
                </div>
              </button>

            </div>
          </Card>
        )}
        </>
        )}

        {/* ── ALERTES ── */}
        {conflits.length > 0 && isAdmin && (
          <div style={{background: showConflits ? "#fffbeb" : "#f8fafc", border: showConflits ? "1px solid #fde68a" : "1px solid #e2e8f0", borderRadius:12, padding: showConflits ? "12px 16px" : "8px 16px", display:"flex", alignItems:"center", gap:10}}>
            <span style={{fontSize: showConflits ? 18 : 14, flexShrink:0}}>{showConflits ? "🔴" : "⚪"}</span>
            {showConflits ? (
              <div style={{flex:1}}>
                <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#92400e",marginBottom:6}}>
                  {conflits.length} conflit{conflits.length > 1 ? "s" : ""} horaire{conflits.length > 1 ? "s" : ""} détecté{conflits.length > 1 ? "s" : ""}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {conflits.map((c, i) => (
                    <div key={i} style={{fontFamily:"sans-serif",fontSize:11,color:"#78350f",display:"flex",alignItems:"center",gap:6,background:"#fef3c7",padding:"4px 10px",borderRadius:6,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700}}>{c.salarieName}</span>
                      <span style={{color:"#a16207"}}>·</span>
                      <span>{JOURS_LABELS[c.jour].slice(0, 3)}</span>
                      <span style={{color:"#a16207"}}>·</span>
                      <span style={{fontWeight:600,color:"#dc2626"}}>
                        {c.tache1.tacheLabel} ({c.tache1.heureDebut}→{minToHeure(heureToMin(c.tache1.heureDebut) + c.tache1.dureeMinutes)})
                      </span>
                      <span style={{color:"#a16207"}}>↔</span>
                      <span style={{fontWeight:600,color:"#dc2626"}}>
                        {c.tache2.tacheLabel} ({c.tache2.heureDebut}→{minToHeure(heureToMin(c.tache2.heureDebut) + c.tache2.dureeMinutes)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span style={{fontFamily:"sans-serif",fontSize:11,color:"#94a3b8",flex:1}}>
                {conflits.length} conflit{conflits.length > 1 ? "s" : ""} masqué{conflits.length > 1 ? "s" : ""}
              </span>
            )}
            <button type="button" onClick={() => setShowConflits(!showConflits)}
              style={{flexShrink:0,padding:"4px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"white",fontFamily:"sans-serif",fontSize:10,color:"#64748b",cursor:"pointer",fontWeight:600}}>
              {showConflits ? "Masquer" : "Afficher"}
            </button>
          </div>
        )}

        {tachesManquantes.length > 0 && isAdmin && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"flex-start",gap:10}}>
            <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
            <div style={{flex:1}}>
              <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#991b1b",marginBottom:4}}>
                {tachesManquantes.length} tâche{tachesManquantes.length > 1 ? "s" : ""} obligatoire{tachesManquantes.length > 1 ? "s" : ""} manquante{tachesManquantes.length > 1 ? "s" : ""}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {tachesManquantes.slice(0, 12).map((m, i) => (
                  <span key={i} style={{fontFamily:"sans-serif",fontSize:10,background:"#fee2e2",color:"#dc2626",padding:"2px 8px",borderRadius:6,fontWeight:600}}>
                    {m.tache.label} · {JOURS_LABELS[m.jour].slice(0, 3)}
                  </span>
                ))}
                {tachesManquantes.length > 12 && (
                  <span style={{fontFamily:"sans-serif",fontSize:10,color:"#991b1b"}}>+{tachesManquantes.length - 12} autres</span>
                )}
              </div>
            </div>
            <button type="button" onClick={handleIACheck} disabled={iaChecking}
              style={{flexShrink:0,padding:"6px 14px",borderRadius:8,border:"none",background:"#7c3aed",color:"white",fontFamily:"sans-serif",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
              {iaChecking ? <div style={{width:12,height:12,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} /> : <span>🤖</span>}
              {iaChecking ? "Analyse…" : "Vérifier avec l'IA"}
            </button>
          </div>
        )}

        {tachesManquantes.length === 0 && tachesObligatoires.length > 0 && taches.length > 0 && isAdmin && (
          <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16}}>✅</span>
            <span style={{fontFamily:"sans-serif",fontSize:12,color:"#166534",fontWeight:600}}>
              Toutes les tâches obligatoires sont assignées cette semaine
            </span>
            <div style={{flex:1}} />
            <button type="button" onClick={handleIACheck} disabled={iaChecking}
              style={{padding:"5px 12px",borderRadius:8,border:"1px solid #d4d4d8",background:"white",color:"#7c3aed",fontFamily:"sans-serif",fontSize:10,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
              {iaChecking ? "Analyse…" : "🤖 Check complet IA"}
            </button>
          </div>
        )}

        {iaResult && isAdmin && (
          <div style={{background:"#faf5ff",border:"1px solid #e9d5ff",borderRadius:12,padding:"14px 18px",position:"relative"}}>
            <button type="button" onClick={() => setIaResult(null)}
              style={{position:"absolute",top:8,right:10,background:"transparent",border:"none",cursor:"pointer",color:"#a78bfa",fontSize:16}}>✕</button>
            <div style={{fontFamily:"sans-serif",fontSize:12,fontWeight:700,color:"#7c3aed",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              🤖 Analyse IA du planning
            </div>
            <div style={{fontFamily:"sans-serif",fontSize:12,color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
              {iaResult}
            </div>
          </div>
        )}

      </div>{/* fin print-hide */}

      {/* ── VUE PRINCIPALE ── */}
      <Card padding="md" className="overflow-hidden print-keep">
        {salaries.filter(s=>s.actif).length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-body text-sm">Ajoutez des salariés dans l'onglet Équipe.</div>
        ) : view === "tableau" ? (
          <TableauView
            semaine={semaine} taches={taches} salaries={salaries} jourDates={jourDates}
            nbJours={nbJours} getCat={getCat} getTaskColor={getTaskColor} toggleDone={toggleDone}
            tachesType={tachesType} chargeParSalarie={chargeParSalarie} dimancheMasque={dimancheMasque}
            salariesReplies={salariesReplies} basculerSalarie={basculerSalarie}
            addCell={addCell} setAddCell={setAddCell} addForm={addForm} setAddForm={setAddForm}
            addTache={addTache} delTache={delTache} openAdd={openAdd} openEditTache={openEditTache}
            viderCellule={viderCellule} compacterJournee={compacterJournee}
            compactingKey={compactingKey} saving={saving} />
        ) : view === "horaire" ? (
          <HoraireView
            semaine={semaine} taches={taches} salaries={salaries} jourDates={jourDates}
            nbJours={nbJours} getCat={getCat} getTaskColor={getTaskColor} toggleDone={toggleDone} />
        )
          : (
          <FicheView
            semaine={semaine} taches={taches} salaries={salaries} jourDates={jourDates}
            nbJours={nbJours} getCat={getCat} getTaskColor={getTaskColor} toggleDone={toggleDone}
            creneaux={creneaux} chargeParSalarie={chargeParSalarie} dimancheMasque={dimancheMasque}
            lundi={lundi} selectedSalarieId={selectedSalarieId}
            setSelectedSalarieId={setSelectedSalarieId} />
        )}
      </Card>

      <style>{`
        @media print {
          aside, nav, header,
          [data-sidebar], [data-header],
          .no-print, .print-hide,
          .md\\:hidden, .sticky {
            display: none !important;
          }
          .min-h-screen.bg-cream.flex > :first-child {
            display: none !important;
          }
          .min-h-screen.bg-cream.flex {
            display: block !important;
          }
          .min-h-screen.bg-cream.flex > .flex-1 {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          h1, .flex.flex-col.sm\\:flex-row,
          .flex.flex-wrap.gap-2:not(.print-keep) {
            display: none !important;
          }
          body, body > div, main, [role="main"], div {
            background: white !important;
          }
          body { padding: 0 !important; margin: 0 !important; }
          .print-header { display: block !important; }
          .print-keep {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
          .print-keep button { display: none !important; }
          table { font-size: 10px !important; }
          td, th { padding: 3px 4px !important; }
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          @page { size: A4 landscape; margin: 8mm; }
        }
      `}</style>

      {/* ─── Modale d'édition d'une tâche ──────────────────────────────────── */}
      {editingTache && (
        <div onClick={() => setEditingTache(null)}
          style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(2px)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
          <div onClick={e => e.stopPropagation()}
            style={{background:"white", borderRadius:16, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", width:"100%", maxWidth:500, padding:24, maxHeight:"90vh", overflowY:"auto"}}>
            <h3 style={{fontFamily:"serif", fontSize:18, fontWeight:700, color:"#1e3a5f", marginBottom:4}}>
              Modifier une tâche
            </h3>
            <p style={{fontFamily:"sans-serif", fontSize:12, color:"#94a3b8", marginBottom:16}}>
              {editingTache.salarieName} · {JOURS_LABELS[editingTache.jour]}
            </p>

            {/* Réaffectation : évite de supprimer/recréer la tâche */}
            <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
              Assignée à
            </label>
            <select value={editForm.salarieId}
              onChange={e => setEditForm({ ...editForm, salarieId: e.target.value })}
              style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, background:"white", marginBottom:12}}>
              {salaries.map(sal => (
                <option key={sal.id} value={sal.id}>{sal.nom}</option>
              ))}
            </select>

            {/* Sélecteur tâche type */}
            <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
              Tâche
            </label>
            <select value={editForm.tacheTypeId}
              onChange={e => {
                const tt = tachesType.find(t => t.id === e.target.value);
                setEditForm({ ...editForm, tacheTypeId: e.target.value, dureeMinutes: tt?.dureeMinutes ? roundToQuarter(tt.dureeMinutes) : editForm.dureeMinutes });
              }}
              style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, background:"white", marginBottom:12}}>
              {CATEGORIES.map(cat => {
                const items = tachesType.filter(t => t.categorie === cat.id);
                if (!items.length) return null;
                return (
                  <optgroup key={cat.id} label={`${cat.emoji} ${cat.label}`}>
                    {items.map(t => (
                      <option key={t.id} value={t.id}>
                        {cat.emoji} {t.label} ({t.dureeMinutes < 60 ? `${t.dureeMinutes}min` : `${Math.floor(t.dureeMinutes/60)}h${t.dureeMinutes%60>0?t.dureeMinutes%60:""}`})
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>

            {/* Heure début + durée côte à côte */}
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
              <div>
                <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
                  Heure de début
                </label>
                <input type="time" value={editForm.heureDebut}
                  onChange={e => setEditForm({ ...editForm, heureDebut: e.target.value })}
                  style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13}} />
              </div>
              <div>
                <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
                  Durée
                </label>
                <select value={editForm.dureeMinutes}
                  onChange={e => setEditForm({ ...editForm, dureeMinutes: parseInt(e.target.value, 10) })}
                  style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, background:"white"}}>
                  {/* Pas de 15 min de 15min a 4h. Si la duree actuelle de la tache n'est
                      pas un multiple de 15 (ex: ancienne tache a 20min), on l'ajoute en tete
                      pour ne pas la perdre lors de l'edition. */}
                  {(() => {
                    const standard = [15,30,45,60,75,90,105,120,135,150,165,180,195,210,225,240,255,270,285,300];
                    const current = editForm.dureeMinutes;
                    const all = standard.includes(current) ? standard : [current, ...standard].sort((a,b)=>a-b);
                    return all.map(d => {
                      const h = Math.floor(d/60);
                      const m = d%60;
                      const label = h === 0 ? `${m} min` : (m === 0 ? `${h}h` : `${h}h${String(m).padStart(2,"0")}`);
                      return <option key={d} value={d}>{label}</option>;
                    });
                  })()}
                </select>
              </div>
            </div>

            {/* Récap horaire calculé */}
            <div style={{background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 10px", marginBottom:12, fontFamily:"sans-serif", fontSize:12, color:"#64748b"}}>
              ⏱️ De <strong>{editForm.heureDebut}</strong> à <strong>{minToHeure(heureToMin(editForm.heureDebut) + editForm.dureeMinutes)}</strong>
              {" "}({editForm.dureeMinutes < 60 ? `${editForm.dureeMinutes} min` : `${Math.floor(editForm.dureeMinutes/60)}h${editForm.dureeMinutes%60>0?editForm.dureeMinutes%60:""}`})
            </div>

            {/* Notes */}
            <label style={{fontFamily:"sans-serif", fontSize:11, fontWeight:600, color:"#475569", display:"block", marginBottom:4}}>
              Notes (optionnel)
            </label>
            <textarea value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
              rows={2}
              placeholder="Précisions, rappels…"
              style={{width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #e2e8f0", fontFamily:"sans-serif", fontSize:13, marginBottom:8, resize:"vertical"}} />

            {(() => {
              // Mêmes tâches, même personne, ailleurs dans la semaine.
              const memeSalarie = (editForm.salarieId || editingTache.salarieId);
              const autresJours = taches.filter((t: any) =>
                t.id !== editingTache.id
                && t.semaine === editingTache.semaine
                && t.tacheTypeId === editingTache.tacheTypeId
                && t.salarieId === memeSalarie
              );
              if (autresJours.length === 0) return null;
              // L'horaire ne se diffuse qu'aux jours qui partagent l'heure de
              // départ : un jour volontairement décalé n'est pas réaligné.
              const memeHeure = autresJours.filter((t: any) => t.heureDebut === editingTache.heureDebut);
              const horaireChange = editForm.heureDebut !== editingTache.heureDebut
                || editForm.dureeMinutes !== editingTache.dureeMinutes;
              return (
                <div style={{marginBottom:16, padding:"8px 10px", background:"#fefce8", border:"1px solid #fde68a", borderRadius:8}}>
                  <div style={{fontFamily:"sans-serif", fontSize:10, fontWeight:700, color:"#92400e", textTransform:"uppercase", letterSpacing:0.4, marginBottom:6}}>
                    Répercuter sur la semaine
                  </div>
                  <label style={{display:"flex", alignItems:"flex-start", gap:8, cursor:"pointer"}}>
                    <input type="checkbox" checked={editNoteSemaine}
                      onChange={e => setEditNoteSemaine(e.target.checked)}
                      style={{marginTop:2, cursor:"pointer"}} />
                    <span style={{fontFamily:"sans-serif", fontSize:11, color:"#92400e", lineHeight:1.5}}>
                      La <strong>note</strong>, sur les <strong>{autresJours.length} autre(s) jour(s)</strong> de la semaine.
                    </span>
                  </label>
                  {memeHeure.length > 0 && (
                    <label style={{display:"flex", alignItems:"flex-start", gap:8, cursor:"pointer", marginTop:6}}>
                      <input type="checkbox" checked={editHoraireSemaine}
                        onChange={e => setEditHoraireSemaine(e.target.checked)}
                        style={{marginTop:2, cursor:"pointer"}} />
                      <span style={{fontFamily:"sans-serif", fontSize:11, color:"#92400e", lineHeight:1.5}}>
                        L&apos;<strong>horaire et la durée</strong>, sur les <strong>{memeHeure.length} jour(s)</strong> qui
                        étaient aussi à {editingTache.heureDebut}.
                        {memeHeure.length < autresJours.length && (
                          <> Les {autresJours.length - memeHeure.length} jour(s) à un autre horaire ne bougent pas.</>
                        )}
                      </span>
                    </label>
                  )}
                  {horaireChange && memeHeure.length > 0 && !editHoraireSemaine && (
                    <div style={{fontFamily:"sans-serif", fontSize:10, color:"#b45309", marginTop:6, lineHeight:1.5}}>
                      Sans cette seconde case, seul le jour ouvert change d&apos;horaire.
                    </div>
                  )}
                </div>
              );
            })()}

            {(() => {
              // Personnes sur la MÊME tâche, même jour, même horaire. Le filtre
              // reprend celui de l'enregistrement — sinon le nombre annoncé
              // n'était pas celui des tâches réellement modifiées.
              const nbJumelles = taches.filter((t: any) =>
                t.id !== editingTache.id
                && t.jour === editingTache.jour
                && t.semaine === editingTache.semaine
                && t.tacheTypeId === editingTache.tacheTypeId
                && t.heureDebut === editingTache.heureDebut
                && t.salarieId !== (editForm.salarieId || editingTache.salarieId)
              ).length;
              if (nbJumelles === 0) return null;
              return (
                <label style={{display:"flex", alignItems:"flex-start", gap:8, marginBottom:12, padding:"8px 10px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8, cursor:"pointer"}}>
                  <input type="checkbox" checked={editAppliquerTous}
                    onChange={e => setEditAppliquerTous(e.target.checked)}
                    style={{marginTop:2, cursor:"pointer"}} />
                  <span style={{fontFamily:"sans-serif", fontSize:11, color:"#1e40af", lineHeight:1.5}}>
                    Appliquer le nouvel horaire aux <strong>{nbJumelles} autre(s) personne(s)</strong> sur cette même tâche, ce jour-là.
                  </span>
                </label>
              );
            })()}

            {/* Boutons */}
            <div style={{display:"flex", gap:8}}>
              <button type="button" onClick={saveEditTache} disabled={saving || !editForm.tacheTypeId}
                style={{flex:1, padding:"10px 16px", background:"#3b82f6", color:"white", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:600, cursor:"pointer", opacity: (saving || !editForm.tacheTypeId) ? 0.5 : 1}}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" onClick={() => setEditingTache(null)}
                style={{padding:"10px 16px", background:"#f1f5f9", color:"#475569", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:500, cursor:"pointer"}}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALE DE CONFLITS LORS DE L'APPLICATION D'UN MODÈLE ─────────
          S'ouvre quand on applique un modèle qui a au moins une tâche en
          doublon avec la semaine actuelle (même salarié + même jour +
          même heure + même tâche). 3 options : remplacer / ajouter / annuler. */}
      {conflictDialog && (
        <div
          onClick={conflictAnnuler}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, zIndex: 80,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "white", borderRadius: 18, maxWidth: 560, width: "100%",
              maxHeight: "90vh", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
            }}
          >
            {/* En-tête */}
            <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: "#fef3c7",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <AlertTriangle size={18} color="#d97706" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                    Conflit détecté
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#64748b" }}>
                    Modèle « {conflictDialog.modele.nom} » · semaine {semaine}
                  </div>
                </div>
                <button type="button"
                  onClick={conflictAnnuler}
                  style={{
                    background: "transparent", border: "none", padding: 4,
                    cursor: "pointer", color: "#94a3b8",
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#475569", margin: "10px 0 0", lineHeight: 1.5 }}>
                <strong>{conflictDialog.duplicates.length}</strong> tâche{conflictDialog.duplicates.length > 1 ? "s" : ""} du modèle existe{conflictDialog.duplicates.length > 1 ? "nt" : ""} déjà dans la semaine
                {conflictDialog.nouvelles.length > 0 && (
                  <> · <strong>{conflictDialog.nouvelles.length}</strong> nouvelle{conflictDialog.nouvelles.length > 1 ? "s" : ""} à ajouter</>
                )}
              </p>
            </div>

            {/* Liste des doublons */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 22px" }}>
              <div style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Doublons ({conflictDialog.duplicates.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {conflictDialog.duplicates.slice(0, 20).map((d, i) => {
                  const cat = CATEGORIES.find(c => c.id === d.nouvelle.categorie);
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8,
                      padding: "8px 12px",
                    }}>
                      <span style={{ fontSize: 14 }}>{cat?.emoji || "📌"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                          {d.nouvelle.tacheLabel}
                        </div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#64748b" }}>
                          {JOURS_LABELS[d.nouvelle.jour]} · {d.nouvelle.heureDebut} · {d.nouvelle.salarieName}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {conflictDialog.duplicates.length > 20 && (
                  <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#94a3b8", fontStyle: "italic", paddingLeft: 8 }}>
                    … et {conflictDialog.duplicates.length - 20} autre{conflictDialog.duplicates.length - 20 > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: "14px 22px 20px", borderTop: "1px solid #f1f5f9", display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button"
                onClick={conflictRemplacer}
                disabled={applyingModele}
                style={{
                  width: "100%", padding: "12px 14px",
                  background: "#3b82f6", color: "white", border: "none", borderRadius: 10,
                  fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: applyingModele ? 0.5 : 1,
                }}
              >
                <RotateCcw size={15} />
                Remplacer les doublons ({conflictDialog.duplicates.length})
              </button>
              <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#94a3b8", textAlign: "center", margin: "-2px 0 4px" }}>
                Recommandé · les tâches existantes sont supprimées puis recréées
              </div>

              <button type="button"
                onClick={conflictAjouterQuandMeme}
                disabled={applyingModele}
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "white", color: "#d97706",
                  border: "1px solid #fcd34d", borderRadius: 10,
                  fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  opacity: applyingModele ? 0.5 : 1,
                }}
              >
                Ajouter quand même (créera des doublons)
              </button>

              <button type="button"
                onClick={conflictAnnuler}
                disabled={applyingModele}
                style={{
                  width: "100%", padding: "10px 14px",
                  background: "#f1f5f9", color: "#475569",
                  border: "none", borderRadius: 10,
                  fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aperçu du découpage automatique à valider */}
      {pendingSplit && (
        <div onClick={() => setPendingSplit(null)}
          style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", backdropFilter:"blur(2px)", zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", padding:16}}>
          <div onClick={e => e.stopPropagation()}
            style={{background:"white", borderRadius:16, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", width:"100%", maxWidth:560, padding:24, maxHeight:"90vh", overflowY:"auto"}}>
            <h3 style={{fontFamily:"serif", fontSize:18, fontWeight:700, color:"#1e3a5f", marginBottom:4}}>
              Ajuster le planning ?
            </h3>
            <p style={{fontFamily:"sans-serif", fontSize:12, color:"#94a3b8", marginBottom:16}}>
              La nouvelle tâche chevauche des tâches existantes. Voici ce qui sera fait :
            </p>

            {pendingSplit.decoupes.map((d: any, i: number) => (
              <div key={i} style={{border:"1px solid #e2e8f0", borderRadius:12, padding:12, marginBottom:10}}>
                <div style={{fontFamily:"sans-serif", fontSize:12, fontWeight:600, color:"#334155", marginBottom:6}}>
                  {d.salarieName} · {JOURS_LABELS[d.jour as JourSemaine]}
                </div>
                <div style={{fontFamily:"sans-serif", fontSize:13, color:"#0f766e", marginBottom:4}}>
                  ➕ {d.nouvelle} <span style={{color:"#94a3b8"}}>(nouvelle)</span>
                </div>
                {d.updates.map((u: any, j: number) => (
                  <div key={`u${j}`} style={{fontFamily:"sans-serif", fontSize:13, color:"#b45309"}}>
                    ✂️ {u.label} : <span style={{textDecoration:"line-through", color:"#94a3b8"}}>{u.ancien}</span> → {u.heureDebut}→{minToHeure(heureToMin(u.heureDebut) + u.dureeMinutes)}
                  </div>
                ))}
                {d.creates.map((c: any, j: number) => (
                  <div key={`c${j}`} style={{fontFamily:"sans-serif", fontSize:13, color:"#0f766e"}}>
                    ➕ {c.label} {c.heureDebut}→{minToHeure(heureToMin(c.heureDebut) + c.dureeMinutes)} <span style={{color:"#94a3b8"}}>(2ᵉ morceau)</span>
                  </div>
                ))}
                {d.deletes.map((del: any, j: number) => (
                  <div key={`d${j}`} style={{fontFamily:"sans-serif", fontSize:13, color:"#dc2626"}}>
                    🗑️ {del.label} {del.plage} <span style={{color:"#94a3b8"}}>(supprimée, entièrement recouverte)</span>
                  </div>
                ))}
              </div>
            ))}

            <div style={{display:"flex", gap:8, marginTop:14}}>
              <button type="button" onClick={() => ecrireTaches(pendingSplit.newTasks, pendingSplit.decoupes)} disabled={saving}
                style={{flex:1, padding:"12px 14px", background:"#16a34a", color:"white", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:600, cursor:saving?"not-allowed":"pointer", opacity:saving?0.6:1}}>
                Appliquer
              </button>
              <button type="button" onClick={() => setPendingSplit(null)} disabled={saving}
                style={{padding:"12px 18px", background:"#f1f5f9", color:"#475569", border:"none", borderRadius:10, fontFamily:"sans-serif", fontSize:13, fontWeight:500, cursor:"pointer"}}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
