/**
 * src/app/admin/paiements/desinscription.ts
 *
 * Le pendant « planning » des opérations d'argent : quand une ligne de
 * commande disparaît, le cavalier doit disparaître des créneaux ; quand une
 * commande est dupliquée vers une autre famille, le cavalier doit apparaître
 * sur toutes les séances du forfait.
 *
 * Pourquoi c'est à part : une facture annulée dont le cavalier reste inscrit
 * fait un enfant présent sur la feuille d'appel que plus rien ne facture.
 * L'inverse (facturé mais pas inscrit) est tout aussi silencieux. Ces deux
 * fonctions sont donc appelées par TOUTES les voies d'annulation
 * (suppression, retrait de ligne, modification de commande) et ne doivent
 * exister qu'en un seul exemplaire.
 *
 * Les erreurs y sont volontairement avalées (console.error) : une
 * désinscription qui échoue ne doit jamais empêcher l'avoir ou le
 * remboursement d'être créé — l'argent prime, le planning se rattrape à la
 * main.
 */

import { collection, getDocs, deleteDoc, updateDoc, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Family } from "@/types";

/** Désinscrit un enfant des créneaux/réservations liés à un item de commande */
export const unenrollPaymentItem = async (payment: any, item: any) => {
  if (!item.childId) return;

  /** Helper : retire un enfant d'un créneau + met à jour enrolled + enrolledCount */
  const removeFromCreneau = async (creneauId: string, childId: string) => {
    try {
      const creneauRef = doc(db, "creneaux", creneauId);
      const cSnap = await getDoc(creneauRef);
      if (cSnap.exists()) {
        const enrolled = cSnap.data().enrolled || [];
        const newEnrolled = enrolled.filter((e: any) => e.childId !== childId);
        await updateDoc(creneauRef, { enrolled: newEnrolled, enrolledCount: newEnrolled.length });
      }
    } catch (e) { console.error("Erreur retrait créneau:", e); }
  };

  try {
    // Cas 1 : stage avec creneauIds array → désinscrire de TOUS les jours
    if (item.creneauIds && item.creneauIds.length > 0) {
      for (const cid of item.creneauIds) {
        await removeFromCreneau(cid, item.childId);
        // Supprimer les réservations liées à chaque jour
        try {
          const resSnap = await getDocs(query(collection(db, "reservations"), where("creneauId", "==", cid), where("childId", "==", item.childId)));
          for (const d of resSnap.docs) await deleteDoc(doc(db, "reservations", d.id));
        } catch (e) { console.error("Erreur suppression réservation:", e); }
      }
      return;
    }

    // Cas 2 : créneau unique lié directement par ID
    if (item.creneauId) {
      await removeFromCreneau(item.creneauId, item.childId);
      try {
        const resSnap = await getDocs(query(collection(db, "reservations"), where("creneauId", "==", item.creneauId), where("childId", "==", item.childId)));
        for (const d of resSnap.docs) await deleteDoc(doc(db, "reservations", d.id));
      } catch (e) { console.error("Erreur suppression réservation:", e); }
      return;
    }

    // Cas 3 : pas de creneauId → chercher les réservations par familyId + childId + matching texte
    const resSnap = await getDocs(query(collection(db, "reservations"), where("familyId", "==", payment.familyId), where("childId", "==", item.childId)));
    for (const d of resSnap.docs) {
      const r = d.data();
      const matchById = (item.activityId && r.activityId === item.activityId) ||
                        (item.stageKey && r.stageKey === item.stageKey);
      const matchByTitle = !matchById && item.activityTitle && r.activityTitle &&
                           r.activityTitle.includes(item.activityTitle.split(" (")[0].split(" — ")[0]);
      if (!matchById && !matchByTitle) continue;

      if (r.creneauId) await removeFromCreneau(r.creneauId, item.childId);
      await deleteDoc(doc(db, "reservations", d.id));
    }
  } catch (e) {
    console.error("Erreur désinscription:", e);
  }
};

// ─── Inscription d'un enfant dans tous les créneaux futurs d'un forfait ───
export const enrollChildInForfait = async (
  families: (Family & { firestoreId: string })[],
  payment: any,
  targetFamilyId: string,
): Promise<number> => {
  const targetFamily = families.find(f => f.firestoreId === targetFamilyId);
  if (!targetFamily) return 0;
  const targetChild = (targetFamily.children || [])[0];
  if (!targetChild) return 0;

  const today = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-${String(new Date().getDate()).padStart(2,"0")}`;
  let inscriptions = 0;

  // Items de type forfait/cours
  const forfaitItems = (payment.items || []).filter((i: any) =>
    i.activityType === "cours" || i.activityTitle?.includes("Forfait")
  );

  for (const item of forfaitItems) {
    try {
      let refDate = "", refStartTime = "", refTitle = "", refMonitor = "";

      if (item.creneauId) {
        const refSnap = await getDoc(doc(db, "creneaux", item.creneauId));
        if (!refSnap.exists()) continue;
        const r = refSnap.data() as any;
        refDate = r.date; refStartTime = r.startTime; refTitle = r.activityTitle; refMonitor = r.monitor || "";
      } else {
        // Extraire depuis le libellé : "Forfait Titre (Titre — Mer 17:00)"
        // On extrait le titre ET l'horaire directement depuis le libellé
        const matchFull = item.activityTitle?.match(/\((.+?) — \w+ (\d{2}:\d{2})\)/);
        const matchTitle = item.activityTitle?.match(/\((.+?) —/);
        if (!matchTitle) continue;
        refTitle = matchTitle[1].trim();
        // Extraire l'horaire depuis le libellé si disponible (ex: "Mer 17:00" → "17:00")
        const libelleStartTime = matchFull ? matchFull[2] : null;

        // Chercher un créneau existant avec ce titre pour avoir le jour/moniteur
        const sSnap = await getDocs(query(
          collection(db, "creneaux"),
          where("activityTitle", "==", refTitle),
          where("date", ">=", today)
        ));
        if (sSnap.empty) continue;

        // Si on a l'horaire depuis le libellé, chercher un créneau qui correspond
        let refDoc = sSnap.docs[0].data() as any;
        if (libelleStartTime) {
          const matching = sSnap.docs.find(d => d.data().startTime === libelleStartTime);
          if (matching) refDoc = matching.data();
        }
        refDate = refDoc.date;
        refStartTime = libelleStartTime || refDoc.startTime;
        refMonitor = refDoc.monitor || "";
      }

      const dow = new Date(refDate + "T12:00:00").getDay();

      const futureSnap = await getDocs(query(
        collection(db, "creneaux"),
        where("activityTitle", "==", refTitle),
        where("date", ">=", today)
      ));

      const slots = futureSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(c =>
          new Date(c.date + "T12:00:00").getDay() === dow &&
          c.startTime === refStartTime
        );

      for (const slot of slots) {
        const enrolled: any[] = slot.enrolled || [];
        if (enrolled.some((e: any) => e.childId === targetChild.id)) continue;
        await updateDoc(doc(db, "creneaux", slot.id), {
          enrolled: [...enrolled, {
            childId: targetChild.id,
            childName: targetChild.firstName || "",
            familyId: targetFamily.firestoreId,
            familyName: targetFamily.parentName || "",
            enrolledAt: new Date().toISOString(),
          }],
          enrolledCount: enrolled.length + 1,
        });
        inscriptions++;
      }
    } catch (e) { console.error("Erreur inscription forfait:", e); }
  }
  return inscriptions;
};
