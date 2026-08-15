/**
 * src/app/admin/planning/enroll-inscriptions.ts
 *
 * Deux opérations d'inscription qui ne créent AUCUNE facture, et qu'on ne
 * voulait donc pas voir voisiner avec le code de facturation :
 *
 *  - inscrireSaisonEtablissement : poser un cavalier sur toutes les séances
 *    récurrentes de la saison, pour un partenariat (collège, hôpital, IME).
 *    L'établissement est facturé à part, au forfait ; le parent, lui, ne doit
 *    jamais recevoir quoi que ce soit.
 *  - verifierEtAlerterSiComplet : après une salve d'inscriptions, dire à
 *    l'admin qu'un créneau vient de se remplir, pour qu'il en ouvre un autre
 *    tant qu'il y pense.
 */

import { collection, getDocs, getDoc, updateDoc, doc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { estSemaineAttendue } from "@/lib/rythme";
import type { Creneau } from "./types";
import type { FonctionEnroll } from "./enroll-types";

type Toast = (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;

// ── Inscription établissement sur TOUTE la saison ──
// Inscrit l'enfant dans tous les créneaux récurrents à venir (même titre,
// même heure, même jour de semaine) SANS forfait facturé ni paiement parent.
// L'établissement est facturé à part (forfait fixe par séance). Le suivi péda
// (présences, progression) fonctionne normalement sur chaque créneau.
export async function inscrireSaisonEtablissement(params: {
  creneau: any;
  dateFinSaisonEffective: Date;
  childId: string;
  childName: string;
  familyId: string;
  familyName: string;
  panelToast: Toast;
  setJustEnrolled: (v: string) => void;
  onRefresh?: () => Promise<void>;
}): Promise<void> {
  const { creneau, dateFinSaisonEffective, childId, childName, familyId, familyName, panelToast, setJustEnrolled, onRefresh } = params;
  try {
    const creneauDate = new Date(creneau.date); creneauDate.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = creneauDate > today ? creneauDate : today;
    const startStr = start.toISOString().split("T")[0];
    const endStr = dateFinSaisonEffective.toISOString().split("T")[0];
    const jourRef = new Date(creneau.date + "T12:00:00").getDay();

    const snap = await getDocs(query(
      collection(db, "creneaux"),
      where("date", ">=", startStr),
      where("date", "<=", endStr),
    ));
    // Créneaux récurrents : même cours, même heure, même jour de semaine, à venir
    const cibles = snap.docs.filter(d => {
      const c = d.data() as any;
      if (c.activityTitle !== creneau.activityTitle) return false;
      if (c.startTime !== creneau.startTime) return false;
      if (new Date(c.date + "T12:00:00").getDay() !== jourRef) return false;
      // Pas déjà inscrit
      return !(c.enrolled || []).some((e: any) => e.childId === childId);
    });

    let count = 0;
    for (const d of cibles) {
      const c = d.data() as any;
      const newEnrolled = [...(c.enrolled || []), {
        childId, childName, familyId, familyName,
        enrolledAt: new Date().toISOString(), presence: null,
        institutional: true, // marqueur : séance facturée à l'établissement
      }];
      await updateDoc(doc(db, "creneaux", d.id), { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
      count++;
    }
    panelToast(`🏫 ${childName} inscrit(e) sur ${count} séance(s) de la saison (établissement, sans facturation)`, "success");
    setJustEnrolled(`🏫 ${childName} — ${count} séances de la saison (établissement)`);
    await onRefresh?.();
  } catch (e) {
    console.error("Inscription saison établissement:", e);
    panelToast("Erreur lors de l'inscription saison", "error");
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Alerte "créneau complet" après inscription
// ─────────────────────────────────────────────────────────────────────
// Demande Nicolas : quand une inscription remplit un stage (ou un cours)
// au max des places, on affiche un toast warning longue durée qui suggère
// d'ouvrir un nouveau créneau.
//
// Approche : on rafraîchit allCreneaux via onRefresh, puis on relit le
// créneau impacté dans Firestore pour avoir l'état réel (les onEnroll
// précédents peuvent avoir skipRefresh:true → allCreneaux pas à jour).
// Plus fiable que de tenter de calculer enrolled+1 nous-mêmes (cas des
// conflits horaires, doublons childId, etc. qui font qu'un onEnroll
// n'incrémente pas toujours le compteur).
export async function verifierEtAlerterSiComplet(creneauIds: string[], panelToast: Toast): Promise<void> {
  if (creneauIds.length === 0) return;
  try {
    const checks = await Promise.all(creneauIds.map(async (cid) => {
      try {
        const snap = await getDoc(doc(db, "creneaux", cid));
        if (!snap.exists()) return null;
        const data = snap.data() as any;
        const enrolledCount = (data.enrolled || []).length;
        const maxPlaces = data.maxPlaces || 0;
        if (maxPlaces > 0 && enrolledCount >= maxPlaces) {
          return {
            title: data.activityTitle || "Créneau",
            date: data.date as string,
            isStage: data.activityType === "stage" || data.activityType === "stage_journee",
          };
        }
        return null;
      } catch { return null; }
    }));
    const fulls = checks.filter(Boolean) as Array<{ title: string; date: string; isStage: boolean }>;
    if (fulls.length === 0) return;

    // Regrouper par titre pour ne pas spammer si un stage occupe plusieurs jours
    const byTitle = new Map<string, { count: number; isStage: boolean }>();
    for (const f of fulls) {
      const cur = byTitle.get(f.title) || { count: 0, isStage: f.isStage };
      cur.count += 1;
      byTitle.set(f.title, cur);
    }
    byTitle.forEach(({ count, isStage }, title) => {
      const label = isStage ? "Stage" : "Créneau";
      const suffix = count > 1 ? ` (${count} jours)` : "";
      panelToast(
        `⚠️ ${label} "${title}"${suffix} COMPLET — pense à ouvrir un nouveau créneau`,
        "warning",
        10000, // 10s pour avoir le temps de lire
      );
    });
  } catch (e) {
    console.warn("checkAndAlertIfFull:", e);
  }
}


/**
 * Pose le cavalier sur TOUTES les séances de sa saison : le créneau principal
 * et, le cas échéant, ses 2e et 3e créneaux hebdomadaires.
 *
 * Rend la liste des séances effectivement visées, pour que l'appelant puisse
 * vérifier lesquelles viennent de se remplir.
 */
export async function inscrireSurToutesLesSeances(params: {
  creneau: any;
  dateFinSaisonEffective: Date;
  quinzaine: boolean;
  semainePaire: boolean;
  extraSlots: string[];
  weekCreneaux: any[];
  selChild: string;
  childName: string;
  fam: any;
  onEnroll: FonctionEnroll;
  onRefresh?: () => Promise<void>;
}): Promise<string[]> {
  const {
    creneau, dateFinSaisonEffective, quinzaine, semainePaire, extraSlots,
    weekCreneaux, selChild, childName, fam, onEnroll, onRefresh,
  } = params;
  // Inscrire dans TOUS les créneaux futurs du même cours (même jour + même heure + même activité)
  // IMPORTANT: allCreneaux ne contient que la semaine affichée, on charge tous les futurs
  // Bornes :
  //   - début = la date du créneau cliqué (pas "aujourd'hui") — pour le cas
  //     d'une pré-inscription saison N+1 où l'on ne veut PAS inscrire le cavalier
  //     dans les dernières séances de la saison en cours
  //   - fin = dateFinSaisonEffective (saison du créneau, calculée plus haut)
  const startDate = creneau.date; // borne basse incluse
  const endDate = dateFinSaisonEffective.toISOString().split("T")[0]; // borne haute incluse
  const allFutureSnap = await getDocs(
    query(collection(db, "creneaux"), where("date", ">=", startDate), where("date", "<=", endDate))
  );
  const allFutureCreneaux = allFutureSnap.docs.map(d => ({ id: d.id, ...d.data() })) as (Creneau & { id: string })[];

  // Créneau principal : filtrer par jour + heure + activityTitle SEULEMENT
  // Ne PAS filtrer par moniteur — il peut changer en cours de saison (remplacements)
  const dow = new Date(creneau.date + "T12:00:00").getDay();
  // Rythme du forfait : une quinzaine ne doit poser le cavalier QUE sur les
  // semaines de sa parité. L'inscrire partout puis le griser à l'affichage
  // ne suffirait pas : la feuille d'appel compte présent tout inscrit non
  // marqué absent, et gonflerait ses séances d'un facteur deux.
  const rythmeForfait = { rythme: quinzaine ? "quinzaine" : "hebdo", semainePaire };
  const slotsToEnroll = allFutureCreneaux.filter(c =>
    new Date(c.date + "T12:00:00").getDay() === dow &&
    c.startTime === creneau.startTime &&
    c.activityTitle === creneau.activityTitle &&
    estSemaineAttendue(c.date, rythmeForfait)
  );

  console.log(`📋 Inscription annuelle : ${slotsToEnroll.length} séances pour "${creneau.activityTitle}" (jour ${dow}, ${creneau.startTime}) du ${startDate} au ${endDate}`);

  // ── Collecte de TOUS les slots a inscrire (principal + extras) ───
  // Au lieu d'enchainer les onEnroll en sequence (250ms x 114 = 30s),
  // on les collecte tous puis on lance Promise.all en parallele
  // (~3-5s total). Pas de risque de concurrence car chaque slot est un
  // doc Firestore distinct, et runTransaction protege chaque doc
  // individuellement.
  const allSlotsToEnroll: { id: string }[] = [...slotsToEnroll.map(s => ({ id: s.id! }))];

  // Resoudre les creneaux supplementaires (2x ou 3x par semaine) avant
  // le Promise.all global
  for (const slotKey of extraSlots) {
    const refCreneau = weekCreneaux.find(c => {
      const cdow = new Date(c.date + "T12:00:00").getDay();
      return `${cdow}-${c.startTime}-${c.activityTitle}-${c.monitor || ""}` === slotKey;
    });

    if (!refCreneau) {
      console.warn(`⚠️ Aucun créneau trouvé pour la clé : ${slotKey}`);
      continue;
    }

    const extraDow = new Date(refCreneau.date + "T12:00:00").getDay();
    const extraCreneaux = allFutureCreneaux.filter(c =>
      c.date >= startDate &&
      new Date(c.date + "T12:00:00").getDay() === extraDow &&
      c.startTime === refCreneau.startTime &&
      c.activityTitle === refCreneau.activityTitle &&
      // Le rythme vaut pour le forfait entier : un cavalier en garde
      // alternée n'est pas là non plus pour ses 2e et 3e créneaux.
      estSemaineAttendue(c.date, rythmeForfait)
    );

    console.log(`📋 Créneau supplémentaire : ${extraCreneaux.length} séances pour "${refCreneau.activityTitle}" (jour ${extraDow}, ${refCreneau.startTime})`);
    for (const slot of extraCreneaux) {
      allSlotsToEnroll.push({ id: slot.id! });
    }
  }

  console.log(`📋 Total : ${allSlotsToEnroll.length} séances à inscrire (parallele Promise.all)`);
  const enrollPayload = {
    childId: selChild, childName,
    familyId: fam.firestoreId, familyName: fam.parentName || "—",
    enrolledAt: new Date().toISOString(),
    paymentSource: "forfait" as const,
    // Recopié sur chaque inscription : le planning et le montoir lisent le
    // créneau, pas le forfait. Sans ce marqueur, rien à l'écran ne dirait
    // pourquoi ce cavalier manque une semaine sur deux.
    ...(quinzaine ? { rythme: "quinzaine" as const, semainePaire } : {}),
  };

  // Promise.all : toutes les ecritures partent en meme temps. Firestore
  // peut absorber facilement 100+ requetes paralleles. Si une echoue
  // (ex. concurrence detectee), elle echoue isolement sans bloquer les
  // autres. allSettled plutot que all pour ne pas tout perdre si 1 fail.
  const results = await Promise.allSettled(
    allSlotsToEnroll.map(s =>
      onEnroll(s.id, enrollPayload, undefined, {
        skipPayment: true, skipEmail: true, skipRefresh: true,
      })
    )
  );
  const failedCount = results.filter(r => r.status === "rejected").length;
  if (failedCount > 0) {
    console.warn(`⚠️ ${failedCount}/${allSlotsToEnroll.length} inscriptions ont echoue`);
  }

  // Refresh global une seule fois apres tous les onEnroll
  // (qui ont tous skipRefresh:true). Sans ca, l'UI ne se met pas a jour.
  try { await onRefresh?.(); } catch (e) { console.warn("Refresh post-annual:", e); }
  return allSlotsToEnroll.map(s => s.id);
}
