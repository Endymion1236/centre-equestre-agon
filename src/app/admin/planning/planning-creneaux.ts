/**
 * src/app/admin/planning/planning-creneaux.ts
 *
 * Toutes les ÉCRITURES Firestore qui touchent aux créneaux eux-mêmes :
 * création d'un lot, modification, duplication sur d'autres dates,
 * suppression, plus les lectures de comptage qui préparent ces décisions.
 *
 * Pourquoi les avoir sorties de la page : chacune de ces opérations porte un
 * garde-fou né d'un incident réel (stages coupés en deux, suppression qui
 * emporte une année de planning, index Firestore manquant qui faisait échouer
 * la requête en silence). Tant que ce code vivait au milieu de l'état React et
 * du JSX, ces garde-fous étaient invisibles et se réécrivaient de travers à
 * chaque retouche. Regroupés ici, ils se lisent d'affilée, avec la raison
 * d'être de chacun juste au-dessus.
 *
 * Aucune fonction de ce fichier ne connaît l'état du composant : tout lui est
 * passé en paramètre (le créneau concerné, la liste des activités, la fonction
 * toast), et tout ce qu'elle apprend est rendu à l'appelant, qui reste seul
 * responsable de fermer les modales et de recharger les données.
 */

"use client";

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Activity } from "@/types";
import { Creneau, fmtDate, sameStage } from "./types";
import { notifyPlanningChange } from "./planning-notifications";
import { toLocalDateString } from "@/lib/date-local";
import { estPerimee } from "@/lib/waitlist-cleanup";

type Toast = (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;

/** Un créneau tel qu'il sort de Firestore, avec son identifiant. */
type CreneauAvecId = Creneau & { id: string };

// Un stage se reconnaît à son type d'activité. Deux valeurs cohabitent pour
// des raisons historiques : "stage" (demi-journée) et "stage_journee".
export const estTypeStage = (c: any) => c.activityType === "stage" || c.activityType === "stage_journee";

/**
 * Création d'un lot de créneaux (formulaire simple ou générateur de période).
 * Renvoie le décompte de ce qui a été fait, sans rien afficher : l'appelant
 * compose le message et referme ses formulaires.
 */
export async function creerCreneaux(
  nc: Partial<Creneau>[],
  activities: Activity[],
): Promise<{ created: number; skipped: number; rattaches: number; firstCreated: Partial<Creneau> | null }> {
  // Anti-doublon : vérifier si des créneaux identiques existent déjà
  const dates = [...new Set(nc.map(c => c.date))];
  let existingCreneaux: any[] = [];
  if (dates.length > 0) {
    const snap = await getDocs(query(collection(db, "creneaux"), where("date", ">=", dates[0]), where("date", "<=", dates[dates.length - 1])));
    existingCreneaux = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }
  let created = 0, skipped = 0, rattaches = 0;
  let firstCreated: Partial<Creneau> | null = null;
  // stageGroupId du lot en cours : tous les jours d'un même stage doivent le
  // partager, y compris ceux qui existaient déjà.
  const groupeDuLot = (nc.find((x: any) => x.stageGroupId) as any)?.stageGroupId || null;

  for (const c of nc) {
    const existant = existingCreneaux.find(ex =>
      ex.date === c.date && ex.startTime === c.startTime && ex.activityTitle === c.activityTitle
    );
    if (existant) {
      // Sauter en silence un jour déjà présent fabriquait des stages à trous :
      // les autres jours recevaient le nouveau stageGroupId, celui-ci gardait
      // l'ancien. L'application y voyait alors DEUX stages distincts — d'où
      // les modales ne proposant qu'une partie des jours et les inscriptions
      // « semaine complète » incomplètes. On le rattache au lot.
      if (groupeDuLot && existant.stageGroupId !== groupeDuLot) {
        try {
          await updateDoc(doc(db, "creneaux", existant.id), { stageGroupId: groupeDuLot });
          rattaches++;
        } catch (e) {
          console.error("[handleCreate] rattachement impossible", existant.id, e);
          skipped++;
        }
      } else {
        skipped++;
      }
      continue;
    }
    // Injecter la couleur de l'activité si elle n'est pas déjà sur le créneau
    const actColor = activities.find(a => a.title === c.activityTitle)?.color;
    const creneauData: any = { ...c, createdAt: serverTimestamp() };
    if (actColor && !creneauData.color) creneauData.color = actColor;
    await addDoc(collection(db, "creneaux"), creneauData);
    if (!firstCreated) firstCreated = c;
    created++;
  }
  return { created, skipped, rattaches, firstCreated };
}

/**
 * Libellé du toast de création. Sorti tel quel de la page : les pluriels y
 * sont accordés à la main, un par un.
 */
export function messageCreationCreneaux(created: number, rattaches: number, skipped: number): string {
  return (
    `${created} créneau${created > 1 ? "x" : ""} créé${created > 1 ? "s" : ""}` +
    `${rattaches > 0 ? ` · ${rattaches} jour${rattaches > 1 ? "s" : ""} existant${rattaches > 1 ? "s" : ""} rattaché${rattaches > 1 ? "s" : ""} au stage` : ""}` +
    `${skipped > 0 ? ` · ${skipped} doublon${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}` : ""}`
  );
}

/**
 * Comptages affichés dans la modale de suppression : combien de créneaux
 * seraient emportés selon le mode choisi (ce jour seul, tous les similaires de
 * la saison, la série voisine, ou le stage entier).
 */
export async function chargerComptagesSuppression(
  c: CreneauAvecId,
): Promise<{ similaires: number; stage: number; serie: number }> {
  let similaires = 0, stage = 0, serie = 0;
  try {
    // Similaires sur la SAISON du créneau (même titre + même heure + même
    // jour de semaine + même activité), bornés à la saison sept→août pour ne
    // pas englober les autres saisons (le libellé 'toute l'année' = la saison).
    const dow = new Date(c.date).getDay();
    const cd = new Date(c.date);
    const ssy = cd.getMonth() >= 8 ? cd.getFullYear() : cd.getFullYear() - 1;
    const seasonStart = `${ssy}-09-01`, seasonEnd = `${ssy + 1}-06-30`;
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("activityTitle", "==", c.activityTitle),
      where("startTime", "==", c.startTime),
    ));
    similaires = snap.docs.filter(d => {
      const data = d.data() as any;
      return new Date(data.date).getDay() === dow && data.activityId === (c as any).activityId
        && data.date >= seasonStart && data.date <= seasonEnd;
    }).length;

    // [DIAGNOSTIC] type du créneau cliqué (toujours loggé)

    // Série d'occurrences proches (même titre + même horaire, ±21j, tous
    // jours) — proposé pour TOUT créneau, stage ou non, dès qu'il y a des
    // jours multiples. Couvre les stages mal typés et les réplications.
    {
      const cDate2 = new Date(c.date + "T12:00:00");
      const from2 = new Date(cDate2); from2.setDate(cDate2.getDate() - 21);
      const to2 = new Date(cDate2); to2.setDate(cDate2.getDate() + 21);
      const snapSerie = snap.docs.filter(d => {
        const data = d.data() as any;
        return data.startTime === c.startTime && data.date >= fmtDate(from2) && data.date <= fmtDate(to2);
      });
      serie = snapSerie.length;
    }

    // Pour les stages : compter les créneaux du même stage. On réutilise le
    // snap déjà chargé (même titre + même horaire) et on filtre par sameStage,
    // au lieu d'une requête datée séparée qui ratait les bornes à cause du
    // fuseau (new Date(c.date) en UTC) → stageCount tombait à 0 alors que les
    // jours existaient (série les trouvait, pas le bloc stage).
    if (estTypeStage(c)) {
      const matched = snap.docs.filter(d => sameStage(d.data(), c));
      stage = matched.length;
    }
  } catch { return { similaires: 1, stage: 0, serie: 0 }; }
  return { similaires, stage, serie };
}

/**
 * Suppression, selon le mode choisi dans la modale. Renvoie ce qui s'est
 * passé pour que l'appelant sache s'il doit fermer la modale et recharger :
 * "annule" (l'admin a reculé devant le garde-fou), "supprime", ou "erreur".
 */
export async function supprimerCreneaux(
  mode: "single" | "similar" | "week" | "serie",
  deleteCreneau: CreneauAvecId,
  toast: Toast,
): Promise<"annule" | "supprime" | "erreur"> {
  try {
    let deletedCount = 0;
    if (mode === "week") {
      // Supprimer tous les créneaux du même stage (plage large pour couvrir
      // les stages à cheval sur deux semaines — cohérent avec le décompte).
      // Même requête que la lecture (titre + horaire, index simple, pas de
      // date range qui exigeait un index composite absent → la requête
      // plantait et la suppression échouait). Filtre sameStage en mémoire.
      const snap = await getDocs(query(
        collection(db, "creneaux"),
        where("activityTitle", "==", deleteCreneau.activityTitle),
        where("startTime", "==", deleteCreneau.startTime),
      ));
      // Filtre sameStage (stageGroupId prioritaire) : ne supprime QUE ce stage
      const weekTargets = snap.docs.filter(d => sameStage(d.data(), deleteCreneau));

      // Garde-fou : un stage tient en une semaine, donc au plus 7 créneaux.
      // Au-delà, le regroupement a forcément dérapé — mieux vaut s'arrêter
      // et demander confirmation que d'effacer une année de planning.
      if (weekTargets.length > 7) {
        const dates = [...new Set(weekTargets.map(t => (t.data() as any).date))].sort();
        const ok = confirm(
          `⚠️ ATTENTION — ${weekTargets.length} créneaux vont être supprimés.\n\n` +
          `Un stage tient normalement en 5 à 7 jours. Ce nombre indique que des ` +
          `stages d'autres semaines sont concernés.\n\n` +
          `Du ${dates[0]} au ${dates[dates.length - 1]}\n\n` +
          `Confirmer la suppression de TOUS ces créneaux ?`
        );
        if (!ok) {
          toast("Suppression annulée", "info");
          return "annule";
        }
      }

      for (const t of weekTargets) await deleteDoc(doc(db, "creneaux", t.id));
      deletedCount = weekTargets.length;
      toast(`🗑️ Stage supprimé (${weekTargets.length} créneaux)`, "success");
    } else if (mode === "similar") {
      const dow = new Date(deleteCreneau.date).getDay();
      const dcd = new Date(deleteCreneau.date);
      const dssy = dcd.getMonth() >= 8 ? dcd.getFullYear() : dcd.getFullYear() - 1;
      const dStart = `${dssy}-09-01`, dEnd = `${dssy + 1}-06-30`;
      const snap = await getDocs(query(
        collection(db, "creneaux"),
        where("activityTitle", "==", deleteCreneau.activityTitle),
        where("startTime", "==", deleteCreneau.startTime),
      ));
      const targets = snap.docs.filter(d => {
        const data = d.data() as any;
        return new Date(data.date).getDay() === dow && data.activityId === (deleteCreneau as any).activityId
          && data.date >= dStart && data.date <= dEnd;
      });
      for (const t of targets) await deleteDoc(doc(db, "creneaux", t.id));
      deletedCount = targets.length;
      toast(`🗑️ ${targets.length} créneaux supprimés`, "success");
    } else if (mode === "serie") {
      // Suppression d'une série d'occurrences proches (non-stage)
      const cDate3 = new Date(deleteCreneau.date);
      const from3 = new Date(cDate3); from3.setDate(cDate3.getDate() - 21);
      const to3 = new Date(cDate3); to3.setDate(cDate3.getDate() + 21);
      const snap = await getDocs(query(
        collection(db, "creneaux"),
        where("activityTitle", "==", deleteCreneau.activityTitle),
        where("startTime", "==", deleteCreneau.startTime),
      ));
      const targets = snap.docs.filter(d => {
        const data = d.data() as any;
        return data.date >= fmtDate(from3) && data.date <= fmtDate(to3);
      });
      for (const t of targets) await deleteDoc(doc(db, "creneaux", t.id));
      deletedCount = targets.length;
      toast(`🗑️ ${targets.length} créneaux supprimés`, "success");
    } else {
      await deleteDoc(doc(db, "creneaux", deleteCreneau.id));
      deletedCount = 1;
      toast("🗑️ Créneau supprimé", "success");
    }
    await notifyPlanningChange({
      action: "deleted",
      activityTitle: deleteCreneau.activityTitle,
      date: deleteCreneau.date,
      startTime: deleteCreneau.startTime,
      endTime: deleteCreneau.endTime,
      monitor: deleteCreneau.monitor,
      count: deletedCount,
    });
    return "supprime";
  } catch (e) { console.error(e); return "erreur"; }
}

/**
 * Jours d'un stage multi-jours, pour la modale d'édition : l'admin doit
 * pouvoir cocher précisément les journées à modifier. En cas d'échec de
 * lecture on renvoie une liste vide — la modale retombe alors sur le seul
 * jour cliqué plutôt que de bloquer l'édition.
 */
export async function chargerJoursDuStage(editCreneau: CreneauAvecId): Promise<{ id: string; date: string }[]> {
  try {
    const d = new Date(editCreneau.date + "T12:00:00");
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("date", ">=", fmtDate(mon)),
      where("date", "<=", fmtDate(sun)),
    ));
    const days = snap.docs
      .filter(dd => { const cc: any = dd.data(); return sameStage(cc, editCreneau) && (cc.activityType === "stage" || cc.activityType === "stage_journee"); })
      .map(dd => ({ id: dd.id, date: (dd.data() as any).date as string }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return days;
  } catch (e) {
    console.warn("[stage days] chargement impossible:", e);
    return [];
  }
}

/**
 * Enregistrement de la modale d'édition. Renvoie true si l'écriture a abouti
 * (l'appelant referme alors la modale et recharge le planning).
 *
 * Trois portées possibles, dans cet ordre de priorité : les jours cochés d'un
 * stage, toutes les occurrences futures d'un cours récurrent, ou ce seul
 * créneau.
 */
export async function enregistrerModificationCreneau(params: {
  editCreneau: CreneauAvecId;
  editForm: any;
  editSelectedDayIds: string[];
  editApplyAll: boolean;
  toast: Toast;
}): Promise<boolean> {
  const { editCreneau, editForm, editSelectedDayIds, editApplyAll, toast } = params;
  try {
    const update: any = {
      activityId: editForm.activityId ?? (editCreneau as any).activityId,
      activityType: editForm.activityType ?? editCreneau.activityType,
      tvaTaux: editForm.tvaTaux ?? (editCreneau as any).tvaTaux ?? 5.5,
      activityTitle: editForm.activityTitle,
      monitor: editForm.monitor,
      // La date n'est écrite que si elle a réellement changé : évite de
      // toucher au champ sur une simple modification d'horaire.
      ...(editForm.date && editForm.date !== editCreneau.date ? { date: editForm.date } : {}),
      startTime: editForm.startTime,
      endTime: editForm.endTime,
      maxPlaces: parseInt(editForm.maxPlaces) || editCreneau.maxPlaces,
      priceTTC: parseFloat(editForm.priceTTC) || 0,
      allowDayBooking: !!editForm.allowDayBooking,
      priceTTCDay: editForm.allowDayBooking ? (parseFloat(editForm.priceTTCDay as string) || 0) : 0,
      themeStage: editForm.themeStage || null,
      updatedAt: serverTimestamp(),
    };
    if (editForm.color) update.color = editForm.color;

    const isStageType = editCreneau.activityType === "stage" || editCreneau.activityType === "stage_journee";
    let updatedCount = 1;
    if (isStageType) {
      // ── Appliquer aux jours SÉLECTIONNÉS du stage ──
      // L'admin choisit les jours dans la modale ; par défaut = le jour cliqué.
      const dayIds = editSelectedDayIds.length > 0 ? editSelectedDayIds : [editCreneau.id];
      for (const id of dayIds) {
        await updateDoc(doc(db, "creneaux", id), update);
      }
      updatedCount = dayIds.length;
      toast(`✅ Stage mis à jour (${dayIds.length} jour${dayIds.length > 1 ? "s" : ""})`, "success");
    } else if (editApplyAll && !isStageType) {
      // Cours récurrents UNIQUEMENT (jamais les stages : eux passent par la
      // branche stage ci-dessus, bornée à la semaine).
      // Charger TOUS les créneaux futurs depuis Firestore (pas seulement la semaine affichée)
      const today = new Date().toISOString().split("T")[0];
      const allSnap = await getDocs(query(
        collection(db, "creneaux"),
        where("date", ">=", today)
      ));
      const dow = new Date(editCreneau.date + "T12:00:00").getDay();
      const targets = allSnap.docs.filter(d => {
        const c = d.data();
        return c.activityTitle === editCreneau.activityTitle &&
          new Date(c.date + "T12:00:00").getDay() === dow &&
          c.startTime === editCreneau.startTime;
      });
      for (const t of targets) {
        await updateDoc(doc(db, "creneaux", t.id), update);
      }
      updatedCount = targets.length;
      toast(`✅ ${targets.length} créneaux mis à jour`, "success");
    } else {
      await updateDoc(doc(db, "creneaux", editCreneau.id), update);
      toast("✅ Créneau mis à jour", "success");
    }
    await notifyPlanningChange({
      action: "updated",
      activityTitle: editForm.activityTitle,
      date: editCreneau.date,
      startTime: editForm.startTime,
      endTime: editForm.endTime,
      previousStartTime: editCreneau.startTime,
      previousEndTime: editCreneau.endTime,
      monitor: editForm.monitor,
      count: updatedCount,
    });
    return true;
  } catch (e) { console.error(e); toast("Erreur", "error"); return false; }
}

/**
 * Duplication d'un créneau sur une liste de dates choisies. Les copies
 * repartent vides (aucun inscrit, aucun paiement) : dupliquer un créneau
 * plein ne doit jamais recopier les cavaliers avec lui.
 */
export async function dupliquerCreneauSurDates(
  src: CreneauAvecId,
  dates: string[],
): Promise<{ created: number; skipped: number }> {
  // Vérifier doublons
  const minDate = dates.reduce((a, b) => a < b ? a : b);
  const maxDate = dates.reduce((a, b) => a > b ? a : b);
  const snap = await getDocs(query(
    collection(db, "creneaux"),
    where("date", ">=", minDate),
    where("date", "<=", maxDate)
  ));
  const existing = snap.docs.map(d => d.data());
  let created = 0, skipped = 0;
  for (const d of dates) {
    const isDup = existing.some(ex =>
      ex.date === d && ex.startTime === src.startTime && ex.activityTitle === src.activityTitle
    );
    if (isDup) { skipped++; continue; }
    const { id: _id, ...srcData } = src as any;
    await addDoc(collection(db, "creneaux"), {
      ...srcData,
      date: d,
      enrolled: [],
      enrolledCount: 0,
      status: "planned",
      createdAt: serverTimestamp(),
    });
    created++;
  }
  return { created, skipped };
}

/**
 * Compteurs « en attente » affichés sur les cartes du planning, chargés en
 * UNE requête pour toute la période plutôt qu'une par créneau.
 */
export async function compterListesAttente(creneaux: CreneauAvecId[]): Promise<Record<string, number>> {
  const snap = await getDocs(query(collection(db, "waitlist"), where("status", "==", "waiting")));
  const ids = new Set(creneaux.map(c => c.id));
  const counts: Record<string, number> = {};
  const aujourdhui = toLocalDateString();
  snap.docs.forEach(d => {
    const w = d.data() as any;
    // Une demande dont la seance est passee n'a plus d'objet : la place
    // ne sera jamais liberee. On cesse de la compter immediatement,
    // sans attendre la purge du cron (qui, elle, supprime vraiment).
    if (estPerimee(w, aujourdhui)) return;
    const cibles: string[] = Array.isArray(w.creneauIds) && w.creneauIds.length
      ? w.creneauIds
      : w.creneauId ? [w.creneauId] : [];
    // Une entree de stage compte sur CHACUN de ses jours affiches.
    cibles.filter(id => ids.has(id)).forEach(id => {
      counts[id] = (counts[id] || 0) + 1;
    });
  });
  return counts;
}
