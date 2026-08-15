"use client";
import { useState, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { authFetch } from "@/lib/auth-fetch";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui";
import type { TacheType, TachePlanifiee, Salarie, JourSemaine, ModelePlanning, TacheModele } from "./types";
import { CATEGORIES, JOURS, JOURS_LABELS, getLundideSemaine, formatDateCourte } from "./types";
import type { AddCell, AddForm, ApercuDecoupage, DialogueConflitsModele, EditForm } from "./planning-types";
import {
  calculerChargeParSalarie, detecterConflits, detecterDoublonsModele, detecterTachesManquantes,
  getISO, heureToMin, minToHeure, planDecoupage, planifierCompactage, planifierSynchroCreneaux,
  regrouperImportsDeLaSemaine, roundToQuarter,
} from "./planning-utils";
import {
  appliquerDecalagesHoraires, creerTachesDepuisCreneaux, creerTachesDepuisModele,
  ecrireTachesEtDecoupages, supprimerTachesParLots,
} from "./planning-firestore";
import { calculerChargeSemaine, construireEmailPlanningMoniteur } from "./planning-email";
import { construirePromptVerificationIA, messageConfirmationCompactage, messageConfirmationSynchro } from "./planning-textes";
import { CSS_IMPRESSION_SEMAINIER } from "./planning-impression";
import PlanningEnteteSemaine from "./PlanningEnteteSemaine";
import PlanningCartesSalaries from "./PlanningCartesSalaries";
import PlanningBarreActions from "./PlanningBarreActions";
import PlanningAlertes from "./PlanningAlertes";
import PlanningVueTableau from "./PlanningVueTableau";
import PlanningVueHoraire from "./PlanningVueHoraire";
import PlanningFicheSalarie from "./PlanningFicheSalarie";
import PlanningModaleEdition from "./PlanningModaleEdition";
import PlanningModaleConflits from "./PlanningModaleConflits";
import PlanningModaleDecoupage from "./PlanningModaleDecoupage";

/**
 * Onglet « Planning » du management : le semainier de l'équipe.
 *
 * Ce fichier est l'orchestrateur — il tient l'état de l'écran, parle à
 * Firestore et assemble les morceaux. Tout ce qui peut vivre sans lui a été
 * sorti à côté :
 *   - planning-utils.ts      : les calculs (découpage, compactage, conflits…)
 *   - planning-textes.ts     : les récapitulatifs de confirmation, le prompt IA
 *   - planning-email.ts      : le mail hebdomadaire aux monitrices
 *   - planning-impression.ts : les feuilles de style d'impression
 *   - Planning*.tsx          : les vues et les modales
 *
 * Règle de partage : une écriture Firestore ne se fait QUE d'ici. Les
 * sous-composants reçoivent les actions en props et n'écrivent jamais eux-mêmes.
 */

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

const COULEURS_SALARIE = ["#2050A0","#16a34a","#dc2626","#d97706","#7c3aed","#0891b2","#be185d","#374151"];

export default function TabPlanning({ semaine, setSemaine, taches, tachesType, salaries, creneaux, modeles, onRefresh }: Props) {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [addCell, setAddCell] = useState<AddCell | null>(null);
  // Aperçu du découpage automatique avant application (chevauchements détectés).
  const [pendingSplit, setPendingSplit] = useState<ApercuDecoupage | null>(null);
  const [addForm, setAddForm] = useState<AddForm>({ tacheTypeId: "", heureDebut: "08:00", dureeMinutes: 30, joursSelectionnes: [], enchainer: false, binomeIds: [] });
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
  const [editForm, setEditForm] = useState<EditForm>({ tacheTypeId: "", heureDebut: "08:00", dureeMinutes: 30, notes: "", salarieId: "" });
  // Diffuser la NOTE seule sur toute la semaine : une consigne du type
  // « Caramel boite jusqu'a vendredi » vaut pour chaque jour, alors qu'un
  // changement d'horaire ne concerne que la tache ouverte.
  const [editNoteSemaine, setEditNoteSemaine] = useState(false);
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
  const [conflictDialog, setConflictDialog] = useState<DialogueConflitsModele | null>(null);
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
      await ecrireTachesEtDecoupages(newTasks, decoupes);
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
      onRefresh();
      toast(`"${tt.label}" mise à jour`, "success");
    } catch (e: any) {
      toast(`Erreur : ${e.message}`, "error");
    }
    setSaving(false);
  };

  // ── Compacter la journée d'un salarié ────────────────────────────────
  // L'algorithme (ancres = cours/stages, tassage par plage) est décrit et
  // implémenté dans planifierCompactage() ; ici on ne fait que confirmer
  // puis écrire.
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

      // 2 & 3. Simulation : nouveaux horaires + tâches bloquées par un cours
      const { updates, conflits } = planifierCompactage(dayTaches);

      if (updates.length === 0) {
        toast(conflits.length > 0
          ? `Aucun changement possible (${conflits.length} tâche(s) bloquée(s))`
          : "La journée est déjà compactée", "info");
        setCompactingKey(null);
        return;
      }

      // 4. Confirmation utilisateur
      const sal = salaries.find(s => s.id === salarieId);
      const confirmed = confirm(messageConfirmationCompactage({ jour, nomSalarie: sal?.nom, updates, dayTaches, conflits }));
      if (!confirmed) { setCompactingKey(null); return; }

      // 5. Appliquer les updates en batch
      await appliquerDecalagesHoraires(updates);
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
      await supprimerTachesParLots(cellTaches, 450);
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
    const { duplicates, nouvelles } = detecterDoublonsModele(modele, taches);

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
      if (tachesASupprimer.length > 0) {
        await supprimerTachesParLots(tachesASupprimer, 400);
      }

      // ── 2 & 3. Création des nouvelles tâches (traçées par un importBatchId) ──
      const count = await creerTachesDepuisModele(modele, tachesAjouter, semaine);

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
      await supprimerTachesParLots(aSupprimer, 400);
      toast(`✅ Import annulé · ${aSupprimer.length} tâche(s) supprimée(s)`, "success");
      onRefresh();
    } catch (e) {
      console.error(e);
      toast("Erreur lors de l'annulation", "error");
    }
    setApplyingModele(false);
  };

  // ── Liste des imports distincts de la semaine (pour le bouton "Annuler") ──
  const importsDeLaSemaine = useMemo(() => regrouperImportsDeLaSemaine(taches), [taches]);

  // Charge par salarié = somme par jour de (amplitude première→dernière tâche − pauses explicites).
  const [inclureDimanche, setInclureDimanche] = useState(false);
  const nbJours = inclureDimanche ? 7 : 6;
  const joursActifs = JOURS.slice(0, nbJours) as JourSemaine[];
  const chargeParSalarie = useMemo(() => calculerChargeParSalarie(taches, joursActifs), [taches, joursActifs]);

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

    // Ce qu'il faut créer / garder / supprimer (synchro non destructive)
    const { targetCreneaux, aCreer, aSupprimer, nbGardees } = planifierSynchroCreneaux({ dates, creneaux, salaries, taches, semaine });

    // ── 3. Garde-fou : si rien à créer ni à supprimer, le planning est déjà à jour ──
    if (aCreer.length === 0 && aSupprimer.length === 0) {
      toast(targetCreneaux.length === 0
        ? "Aucun cours/stage avec moniteur reconnu cette semaine"
        : "Planning déjà à jour — aucun doublon créé", "info");
      return;
    }

    // ── 4. Confirmation utilisateur avec récap clair ──
    const confirmed = confirm(messageConfirmationSynchro({ nbGardees, aCreer, aSupprimer }));
    if (!confirmed) return;

    setImporting(true);
    try {
      // ── 5. Supprimer uniquement les cours/stages obsolètes ──
      const deletePromises = aSupprimer.map(t => deleteDoc(doc(db, "taches-planifiees", t.id)));
      await Promise.all(deletePromises);

      // ── 6. Créer uniquement les nouveaux cours/stages (jamais de doublon) ──
      await creerTachesDepuisCreneaux(aCreer, semaine);

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

  const tachesManquantes = useMemo(
    () => detecterTachesManquantes(tachesObligatoires, taches, joursTravailles),
    [taches, tachesObligatoires, joursTravailles]
  );

  // ── Détection des conflits horaires (même salarié, même jour, chevauchement) ─
  const conflits = useMemo(() => detecterConflits(taches, joursActifs), [taches]);

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
      const joursLabels = jourDates.slice(0, nbJours);
      const semaineNum = semaine.split("-W")[1];
      const dateDebut = formatDateCourte(lundi);
      const dateFin = formatDateCourte(new Date(lundi.getTime() + (nbJours - 1) * 86400000));
      const siteUrl = "https://centre-equestre-agon.vercel.app";

      let sent = 0;
      for (const mon of moniteurs) {
        // Trouver le salarié correspondant
        const sal = activeSals.find(s => s.nom.toLowerCase().trim() === (mon.name || "").toLowerCase().trim());
        const salTaches = sal
          ? taches.filter(t => t.salarieId === sal.id).sort((a, b) => JOURS.indexOf(a.jour) - JOURS.indexOf(b.jour) || a.heureDebut.localeCompare(b.heureDebut))
          : [];
        const totalCharge = calculerChargeSemaine(salTaches, joursLabels);

        const html = construireEmailPlanningMoniteur({
          nomMoniteur: mon.name,
          salTaches,
          joursLabels,
          totalCharge,
          semaineNum,
          dateDebut,
          dateFin,
          siteUrl,
        });

        try {
          await authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: mon.email,
              subject: `📋 Votre planning semaine ${semaineNum} — ${dateDebut} → ${dateFin}`,
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
      const question = construirePromptVerificationIA({
        joursActifs, taches, tachesObligatoires, salaries, semaine, tachesManquantes,
      });

      const res = await authFetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assistant",
          question,
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

  // ── Vues ─────────────────────────────────────────────────────────────
  // ⚠️ Ces trois wrappers sont volontairement redéfinis à chaque rendu, comme
  // avant l'extraction des vues dans leurs propres fichiers : leur type change
  // à chaque rendu, donc React remonte la vue. Le raccourci « Autre… » de la
  // vue Tableau affiche son sélecteur en touchant directement au DOM
  // (style.display, hors React) et compte sur cette remise à zéro.
  const TableauView = () => (
    <PlanningVueTableau
      jourDates={jourDates} nbJours={nbJours}
      salaries={salaries} taches={taches} tachesType={tachesType}
      chargeParSalarie={chargeParSalarie}
      salariesReplies={salariesReplies} basculerSalarie={basculerSalarie}
      addCell={addCell} setAddCell={setAddCell}
      addForm={addForm} setAddForm={setAddForm}
      saving={saving} compactingKey={compactingKey}
      getCat={getCat} getTaskColor={getTaskColor}
      openAdd={openAdd} openEditTache={openEditTache} addTache={addTache}
      toggleDone={toggleDone} delTache={delTache}
      compacterJournee={compacterJournee} viderCellule={viderCellule}
    />
  );

  const HoraireView = () => (
    <PlanningVueHoraire
      jourDates={jourDates} nbJours={nbJours}
      salaries={salaries} taches={taches}
      getCat={getCat} getTaskColor={getTaskColor} toggleDone={toggleDone}
    />
  );

  const FicheView = () => (
    <PlanningFicheSalarie
      salaries={salaries} taches={taches} creneaux={creneaux}
      jourDates={jourDates} nbJours={nbJours} lundi={lundi} semaine={semaine}
      chargeParSalarie={chargeParSalarie}
      selectedSalarieId={selectedSalarieId} setSelectedSalarieId={setSelectedSalarieId}
      getCat={getCat} getTaskColor={getTaskColor} toggleDone={toggleDone}
    />
  );

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
        <PlanningEnteteSemaine
          semaine={semaine} setSemaine={setSemaine} lundi={lundi} nbJours={nbJours}
          jourDates={jourDates} taches={taches}
          inclureDimanche={inclureDimanche} setInclureDimanche={setInclureDimanche}
          prevWeek={prevWeek} nextWeek={nextWeek}
        />

        {/* ── CARDS MONITEURS ── */}
        <PlanningCartesSalaries salaries={salaries} taches={taches} chargeParSalarie={chargeParSalarie} />

        {/* ── BARRE D'ACTIONS — 3 gros boutons (admin uniquement) ── */}
        {isAdmin && (
          <PlanningBarreActions
            view={view} setView={setView}
            openPanel={openPanel} setOpenPanel={setOpenPanel}
            taches={taches} modeles={modeles}
            importing={importing} notifying={notifying} applyingModele={applyingModele}
            saveModeleName={saveModeleName} setSaveModeleName={setSaveModeleName}
            saveModeleType={saveModeleType} setSaveModeleType={setSaveModeleType}
            importsDeLaSemaine={importsDeLaSemaine}
            handleImportCreneaux={handleImportCreneaux}
            handleApplyModele={handleApplyModele}
            handleSaveAsModele={handleSaveAsModele}
            handleUndoImport={handleUndoImport}
            handleNotifyEquipe={handleNotifyEquipe}
          />
        )}

        {/* ── ALERTES ── */}
        <PlanningAlertes
          isAdmin={isAdmin}
          conflits={conflits} showConflits={showConflits} setShowConflits={setShowConflits}
          taches={taches} tachesObligatoires={tachesObligatoires} tachesManquantes={tachesManquantes}
          iaChecking={iaChecking} iaResult={iaResult} setIaResult={setIaResult}
          handleIACheck={handleIACheck}
        />

      </div>{/* fin print-hide */}

      {/* ── VUE PRINCIPALE ── */}
      <Card padding="md" className="overflow-hidden print-keep">
        {salaries.filter(s=>s.actif).length === 0 ? (
          <div className="text-center py-8 text-slate-400 font-body text-sm">Ajoutez des salariés dans l'onglet Équipe.</div>
        ) : view === "tableau" ? <TableauView/>
          : view === "horaire" ? <HoraireView/>
          : <FicheView/>}
      </Card>

      <style>{CSS_IMPRESSION_SEMAINIER}</style>

      {/* ─── Modale d'édition d'une tâche ──────────────────────────────────── */}
      {editingTache && (
        <PlanningModaleEdition
          editingTache={editingTache} setEditingTache={setEditingTache}
          editForm={editForm} setEditForm={setEditForm}
          editNoteSemaine={editNoteSemaine} setEditNoteSemaine={setEditNoteSemaine}
          editAppliquerTous={editAppliquerTous} setEditAppliquerTous={setEditAppliquerTous}
          salaries={salaries} tachesType={tachesType} taches={taches}
          saving={saving} saveEditTache={saveEditTache}
        />
      )}

      {/* ── MODALE DE CONFLITS LORS DE L'APPLICATION D'UN MODÈLE ── */}
      {conflictDialog && (
        <PlanningModaleConflits
          conflictDialog={conflictDialog} semaine={semaine} applyingModele={applyingModele}
          conflictRemplacer={conflictRemplacer}
          conflictAjouterQuandMeme={conflictAjouterQuandMeme}
          conflictAnnuler={conflictAnnuler}
        />
      )}

      {/* Aperçu du découpage automatique à valider */}
      {pendingSplit && (
        <PlanningModaleDecoupage
          pendingSplit={pendingSplit} setPendingSplit={setPendingSplit}
          saving={saving} ecrireTaches={ecrireTaches}
        />
      )}
    </div>
  );
}
