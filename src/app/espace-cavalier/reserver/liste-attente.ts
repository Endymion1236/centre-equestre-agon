/**
 * src/app/espace-cavalier/reserver/liste-attente.ts
 *
 * Inscription en liste d'attente depuis l'espace famille, pour un créneau seul
 * (cours, balade) ou pour un stage entier.
 *
 * Séparé de la page parce que ces deux écritures obéissent à des règles
 * Firestore précises qu'on ne veut pas voir se diluer dans le JSX :
 *  - le doublon se teste sur le trio (creneauId, childId, familyId) — c'est
 *    l'index composite DÉJÀ déployé, en changer ferait échouer la requête en
 *    production ;
 *  - seules les entrées ACTIVES (waiting / notified) bloquent une nouvelle
 *    inscription : une entrée expirée ne doit pas laisser une famille coincée
 *    hors de la file ;
 *  - pour un stage, on crée UNE entrée pour toute la semaine, pas une par jour.
 *
 * Ces fonctions renvoient `true` quand la famille est déjà en liste (l'appelant
 * affiche alors son message) et lèvent en cas d'erreur réelle : elles ne
 * touchent jamais à l'état React ni aux toasts.
 */

import { collection, getDocs, addDoc, query, where, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import type { Family } from "@/types";
import type { Creneau } from "./types";

/** Nom affiché dans la file d'attente : « Prénom Nom » si on a les deux. */
export const nomCompletCavalier = (childObj: any) =>
  childObj?.lastName ? `${childObj.firstName} ${childObj.lastName}` : childObj?.firstName || "Cavalier";

/**
 * Liste d'attente pour UN créneau. Renvoie true si la famille y est déjà.
 */
export async function inscrireEnListeAttente(opts: {
  creneau: Creneau;
  childId: string;
  childName: string;
  user: User;
  family: Family;
}): Promise<boolean> {
  const { creneau: c, childId, childName, user, family } = opts;
  // Vérifier si déjà en attente
  const existing = await getDocs(query(
    collection(db, "waitlist"),
    where("creneauId", "==", c.id),
    where("childId", "==", childId),
    where("familyId", "==", user.uid)
  ));
  // Seules les entrees ACTIVES bloquent (waiting/notified). Une entree
  // expiree — 24h ecoulees sans reponse — ne doit pas empecher de se
  // reinscrire : sinon « deja en liste d'attente » tombe alors que la
  // famille n'est plus dans la file.
  if (existing.docs.some((d) => ["waiting", "notified"].includes((d.data() as any).status || "waiting"))) {
    return true;
  }
  await addDoc(collection(db, "waitlist"), {
    creneauId: c.id,
    activityTitle: c.activityTitle,
    activityType: c.activityType,
    date: c.date,
    startTime: c.startTime,
    endTime: c.endTime,
    monitor: c.monitor,
    familyId: user.uid,
    familyName: family.parentName,
    familyEmail: family.parentEmail || user.email || "",
    childId,
    childName,
    status: "waiting",
    position: existing.size + 1,
    createdAt: serverTimestamp(),
  });
  // Confirmation par email via une route DEDIEE : /api/send-email est
  // reserve aux admins, l'appel depuis l'espace famille partait en 401
  // et le catch l'avalait — la famille ne recevait rien.
  authFetch("/api/waitlist/confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creneauId: c.id,
      activityTitle: c.activityTitle,
      date: c.date,
      startTime: c.startTime,
      endTime: c.endTime,
      childName,
      parentName: family.parentName || "",
    }),
  }).catch((e) => console.warn("Confirmation liste d'attente:", e));
  return false;
}

// ── Liste d'attente STAGE : UNE seule entrée pour toute la semaine ──────
// Une famille veut la semaine, pas le mardi : on ne crée donc pas 5 entrées.
// `creneauId` reste le PREMIER jour pour rester compatible avec les écrans
// admin existants (qui interrogent waitlist par creneauId), et `creneauIds`
// porte tous les jours pour qu'une place libérée n'importe quel jour puisse
// retrouver l'entrée.
// `jours` doit arriver DÉJÀ trié par date croissante (l'appelant s'en sert
// aussi pour l'indicateur de chargement du premier jour).
export async function inscrireStageEnListeAttente(opts: {
  jours: Creneau[];
  childId: string;
  childName: string;
  user: User;
  family: Family;
}): Promise<boolean> {
  const { jours, childId, childName, user, family } = opts;
  const first = jours[0];
  const last = jours[jours.length - 1];
  // Doublon : même trio de champs que pour les cours, afin de réutiliser
  // l'index composite existant (pas de nouvel index Firestore à déployer).
  const existing = await getDocs(query(
    collection(db, "waitlist"),
    where("creneauId", "==", first.id),
    where("childId", "==", childId),
    where("familyId", "==", user.uid)
  ));
  if (existing.docs.some((d) => ["waiting", "notified"].includes((d.data() as any).status || "waiting"))) {
    return true;
  }
  await addDoc(collection(db, "waitlist"), {
    isStage: true,
    stageKey: `${first.activityTitle}_${first.date}`,
    creneauId: first.id,
    creneauIds: jours.map(c => c.id),
    activityTitle: first.activityTitle,
    activityType: first.activityType,
    date: first.date,
    dateFin: last.date,
    nbJours: jours.length,
    startTime: first.startTime,
    endTime: first.endTime,
    monitor: first.monitor,
    familyId: user.uid,
    familyName: family.parentName,
    familyEmail: family.parentEmail || user.email || "",
    childId,
    childName,
    status: "waiting",
    position: existing.size + 1,
    createdAt: serverTimestamp(),
  });
  return false;
}
