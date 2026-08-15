/**
 * src/app/admin/management/planning-firestore.ts
 *
 * Les écritures dans la collection `taches-planifiees` faites par le
 * semainier : création des tâches, application d'un découpage, décalage
 * d'horaires, suppression en masse, import d'un modèle ou des cours.
 *
 * Pourquoi séparé : toutes ces opérations butent sur la même contrainte,
 * `writeBatch` est limité à 500 opérations. Le découpage en lots était
 * répété à quatre endroits du composant, avec des tailles différentes et le
 * commentaire du garde-fou recopié à chaque fois. Rassemblées ici, la règle
 * est écrite une fois et les appelants ne s'occupent plus que du « quoi ».
 *
 * Aucune de ces fonctions ne touche à l'état React ni n'affiche de toast :
 * elles lèvent l'erreur, c'est l'appelant qui la présente à l'utilisateur.
 */

import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ModelePlanning, TacheModele, TachePlanifiee } from "./types";
import type { CreneauCible } from "./planning-utils";
import { heureToMin } from "./planning-utils";

/**
 * Écrit les nouvelles tâches + applique le découpage (raccourcir / couper /
 * supprimer) calculé par planDecoupage(). Tout est envoyé en parallèle : le
 * découpage ne concerne que des tâches distinctes, il n'y a pas d'ordre à tenir.
 */
export async function ecrireTachesEtDecoupages(newTasks: any[], decoupes: any[]): Promise<void> {
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
}

/** Applique les décalages d'horaires calculés par le compactage, en un seul batch. */
export async function appliquerDecalagesHoraires(updates: { id: string; newHeure: string }[]): Promise<void> {
  const batch = writeBatch(db);
  for (const u of updates) {
    batch.update(doc(db, "taches-planifiees", u.id), {
      heureDebut: u.newHeure,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/**
 * Supprime des tâches par paquets.
 * ⚠️ writeBatch est limité à 500 opérations : on découpe en dessous pour
 * garder de la marge (450 pour vider une case, 400 pour un import annulé).
 */
export async function supprimerTachesParLots(aSupprimer: TachePlanifiee[], taillePaquet: number): Promise<void> {
  for (let i = 0; i < aSupprimer.length; i += taillePaquet) {
    const batch = writeBatch(db);
    aSupprimer.slice(i, i + taillePaquet).forEach(t => {
      batch.delete(doc(db, "taches-planifiees", t.id));
    });
    await batch.commit();
  }
}

/**
 * Crée les tâches d'un modèle sur la semaine, par chunks de 50.
 *
 * Toutes les tâches créées portent le même importBatchId : c'est ce qui
 * permet ensuite l'annulation en bloc (bouton « Annuler le dernier import »)
 * et la détection d'un ré-import involontaire.
 *
 * Renvoie le nombre de tâches réellement créées.
 */
export async function creerTachesDepuisModele(
  modele: ModelePlanning,
  tachesAjouter: TacheModele[],
  semaine: string
): Promise<number> {
  // crypto.randomUUID est dispo dans tous les navigateurs récents
  const importBatchId = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `imp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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
  return count;
}

/**
 * Crée les tâches correspondant aux cours/stages du planning général.
 *
 * Elles portent `tacheTypeId: "__planning__"` : c'est ce marqueur qui les
 * rend non éditables dans le semainier (leurs horaires viennent de la page
 * Planning) et qui en fait des ancres fixes lors d'un compactage.
 */
export async function creerTachesDepuisCreneaux(aCreer: CreneauCible[], semaine: string): Promise<void> {
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
}
