/**
 * src/app/admin/montoir/montoir-cloture.ts
 *
 * La CLOTURE d'une reprise — le moment ou la feuille d'appel devient une
 * ecriture : elle pose une trace pedagogique par present, debite les cartes
 * de seances, trace les absents, fait perdre la seance aux absents non
 * justifies et cree les credits de rattrapage. Plus la reouverture, qui est
 * son pendant quand on a cloture trop vite.
 *
 * Pourquoi ce fichier : 290 lignes qui touchent a des seances PAYEES. Chaque
 * bifurcation vient d'une decision du centre et porte son explication juste
 * au-dessus. Les deux a ne jamais perdre de vue :
 *
 *  - PRESENCE PAR DEFAUT : un cavalier qui n'est pas explicitement marque
 *    absent est considere present — donc sa carte est debitee. On ne pointe
 *    que les absences.
 *  - ABSENCE NON JUSTIFIEE : la seance est consommee quand meme. Sans ca,
 *    ne pas prevenir deviendrait plus avantageux que prevenir.
 *
 * ⚠️ Code DEPLACE tel quel depuis page.tsx, ligne pour ligne, commentaires
 * compris. La fonction ne connait pas l'etat React : creneaux, familles,
 * toast et rechargement lui sont passes dans `deps`.
 */

"use client";

import { collection, getDocs, getDoc, updateDoc, addDoc, doc, query, where, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ecrireNotePeda } from "./montoir-notes";
import type { Creneau, QuickNoteChild, Toast } from "./types";

/** Tout ce que la cloture emprunte a la page, passe explicitement. */
export type DepsCloture = {
  creneaux: Creneau[];
  families: any[];
  /** Surnom usuel du poney, pour les libelles ecrits en base. */
  displayFromHorseName: (horseName: string) => string;
  toast: Toast;
  fetchData: () => void | Promise<void>;
  setQuickNoteChild: (v: QuickNoteChild | null) => void;
};

  export const rouvrirReprise = async (cid: string, title: string, deps: DepsCloture) => {
    const { toast, fetchData } = deps;
    if (!confirm(`Rouvrir "${title}" ?\n\nLe créneau repassera en "ouvert" (les débits de cartes et notes déjà faits à la clôture restent inchangés).`)) return;
    try {
      await updateDoc(doc(db, "creneaux", cid), { status: "active", closedAt: null, reopenedAt: serverTimestamp() });
      toast("Créneau rouvert.", "success");
      fetchData();
    } catch (e) { console.error("Rouvrir créneau:", e); toast("Erreur lors de la réouverture.", "error"); }
  };

  export const cloturerReprise = async (cid: string, deps: DepsCloture) => {
    const { creneaux, families, displayFromHorseName, toast, fetchData, setQuickNoteChild } = deps;
    const c = creneaux.find(x => x.id === cid);
    if (!c) return;
    // Anti-duplication : si déjà clôturé, ne rien faire
    if (c.status === "closed") { toast("Cette reprise est déjà clôturée.", "warning"); return; }

    // Modele "presence par defaut" (mai 2026, demande Nicolas) :
    // Tout cavalier qui n'est PAS explicitement marque absent ou absent
    // non justifie est considere present. Plus besoin de cocher la
    // presence un par un, on ne marque que les absents.
    //
    // -> presents inclut donc les anciens "present" ET ceux qui n'ont
    //    pas de statut (anciennement "nonPointes"). C'est intentionnel.
    const absents = (c.enrolled || []).filter((e: any) => e.presence === "absent");
    const absentsNonJustified = (c.enrolled || []).filter((e: any) => e.presence === "absent_nonjustified");
    const presents = (c.enrolled || []).filter((e: any) =>
      e.presence !== "absent" && e.presence !== "absent_nonjustified"
    );

    const msg = `Clôturer "${c.activityTitle}" (${c.startTime}) ?\n\n` +
      `${presents.length} présent${presents.length > 1 ? "s" : ""}, ${absents.length} absent${absents.length > 1 ? "s" : ""}` +
      (absentsNonJustified.length > 0 ? `, ${absentsNonJustified.length} non justifié${absentsNonJustified.length > 1 ? "s" : ""}` : "");
    if (!confirm(msg)) return;

    // 1. Clôturer le créneau
    await updateDoc(doc(db, "creneaux", cid), { status: "closed", closedAt: serverTimestamp() });

    // 2. Charger toutes les familles (depuis le state)
    const allFams = families;

    // 3. Créer une trace pédagogique pour chaque enfant présent
    let notesCreated = 0;
    for (const child of presents) {
      try {
        const seanceNote = {
          date: new Date().toISOString(),
          text: `Séance : ${c.activityTitle} (${c.startTime}-${c.endTime})${child.horseName ? ` — Poney : ${displayFromHorseName(child.horseName)}` : ""}`,
          author: "Montoir (auto)",
          type: "seance",
          creneauId: cid,
          activityTitle: c.activityTitle,
          horseName: child.horseName || "",
        };
        if (await ecrireNotePeda(child.childId, seanceNote, "montoir-cloture", families)) {
          notesCreated++;
        }
      } catch (e) { console.error("Erreur trace péda:", e); }
    }

    // 4. Débiter automatiquement les cartes des cavaliers présents
    let cartesDebitees = 0;
    for (const child of presents) {
      // Cas 1 : paymentSource=card avec cardId explicite
      // Cas 2 : fallback — chercher une carte compatible (individuelle ou familiale)
      let carteId = (child as any).cardId;
      const ps = (child as any).paymentSource;
      if (!carteId && ps !== "card" && ps !== "forfait" && ps !== "offert" && ps !== "celeris") {
        try {
          const isCours = ["cours","cours_collectif","cours_particulier"].includes(c.activityType);
          const isBalade = ["balade","promenade","ponyride"].includes(c.activityType);
          // Récupérer la famille de l'enfant pour chercher les cartes familiales
          const famDoc = families.find((f: any) => (f.children || []).some((ch: any) => ch.id === child.childId)) as any;
          const [cartesIndivSnap, cartesFamSnap] = await Promise.all([
            getDocs(query(collection(db, "cartes"), where("childId", "==", child.childId), where("status", "==", "active"))),
            famDoc ? getDocs(query(collection(db, "cartes"), where("familyId", "==", famDoc.id || famDoc.firestoreId), where("familiale", "==", true), where("status", "==", "active"))) : Promise.resolve({ docs: [] }),
          ]);
          const allDocs = [...cartesIndivSnap.docs, ...(cartesFamSnap as any).docs];
          const carteDoc = allDocs.find(d => {
            const cd = d.data();
            if ((cd.remainingSessions || 0) <= 0) return false;
            if (cd.dateFin && new Date(cd.dateFin) < new Date()) return false;
            const ct = cd.activityType || "cours";
            return (ct === "cours" && isCours) || (ct === "balade" && isBalade);
          });
          if (carteDoc) carteId = carteDoc.id;
        } catch {}
      }
      if (!carteId) continue;
      try {
        const carteSnap = await getDoc(doc(db, "cartes", carteId));
        if (!carteSnap.exists()) continue;
        const carte = carteSnap.data();
        if ((carte.remainingSessions || 0) <= 0) continue;
        const dejaDebite = (carte.history || []).some((h: any) =>
          h.creneauId === cid && !h.credit && h.childName === child.childName
        );
        if (dejaDebite) continue;
        const newHistory = [...(carte.history || []), {
          date: new Date().toISOString(),
          activityTitle: c.activityTitle,
          creneauId: cid, creneauDate: c.date, startTime: c.startTime,
          horseName: (child as any).horseName || (child as any).equideName || "",
          childName: child.childName, presence: "present", auto: true,
        }];
        const newRemaining = (carte.remainingSessions || 0) - 1;
        await runTransaction(db, async (tx) => {
          // Re-lire dans la transaction pour éviter les race conditions
          const freshSnap = await tx.get(doc(db, "cartes", carteId));
          if (!freshSnap.exists()) throw new Error("Carte introuvable");
          const freshData = freshSnap.data();
          if ((freshData.remainingSessions || 0) <= 0) throw new Error("Carte épuisée");
          // Vérifier anti-doublon dans la transaction
          if ((freshData.history || []).some((h: any) => h.creneauId === cid && !h.credit && h.childName === child.childName)) {
            throw new Error("Déjà débité");
          }
          const updatedHistory = [...(freshData.history || []), {
            date: new Date().toISOString(),
            activityTitle: c.activityTitle,
            creneauId: cid, creneauDate: c.date, startTime: c.startTime,
            horseName: (child as any).horseName || (child as any).equideName || "",
            childName: child.childName, presence: "present", auto: true,
          }];
          const newRem = (freshData.remainingSessions || 0) - 1;
          tx.update(doc(db, "cartes", carteId), {
            remainingSessions: newRem,
            usedSessions: (freshData.usedSessions || 0) + 1,
            history: updatedHistory,
            status: newRem <= 0 ? "used" : "active",
            updatedAt: serverTimestamp(),
          });
        });
        cartesDebitees++;
      } catch (e) { console.error("Erreur débit carte montoir:", e); }
    }

    // 4b. Tracer les absents dans l'historique de leur carte (sans débiter)
    for (const child of absents) {
      if ((child as any).paymentSource !== "card" || !(child as any).cardId) continue;
      const carteId = (child as any).cardId;
      try {
        const carteSnap = await getDoc(doc(db, "cartes", carteId));
        if (!carteSnap.exists()) continue;
        const carte = carteSnap.data();
        // Ne pas tracer si déjà tracé pour ce créneau
        if ((carte.history || []).some((h: any) => h.creneauId === cid && h.presence === "absent" && h.childName === child.childName)) continue;
        const newHistory = [...(carte.history || []), {
          date: new Date().toISOString(),
          activityTitle: c.activityTitle,
          creneauId: cid,
          creneauDate: c.date,
          startTime: c.startTime,
          horseName: (child as any).horseName || "",
          childName: child.childName,
          presence: "absent",
          auto: true,
        }];
        await updateDoc(doc(db, "cartes", carteId), {
          history: newHistory,
          updatedAt: serverTimestamp(),
        });
        // Pas de débit — la séance reste disponible
      } catch (e) { console.error("Erreur trace absent carte:", e); }
    }

    // 4b-bis. Absents NON JUSTIFIÉS : débiter la carte (séance perdue).
    // Politique : pas prévenu ou trop tard → la séance est consommée même
    // sans présence. Cohérent avec le 3ème bouton "Absent non justifié".
    // Sans ça, le cavalier serait "récompensé" de son absence : la carte
    // garderait sa séance, comme pour une absence légitime.
    let cartesDebiteesNJ = 0;
    for (const child of absentsNonJustified) {
      if ((child as any).paymentSource !== "card" || !(child as any).cardId) continue;
      const carteId = (child as any).cardId;
      try {
        await runTransaction(db, async (tx) => {
          const freshSnap = await tx.get(doc(db, "cartes", carteId));
          if (!freshSnap.exists()) throw new Error("Carte introuvable");
          const freshData = freshSnap.data();
          if ((freshData.remainingSessions || 0) <= 0) throw new Error("Carte épuisée");
          // Anti-doublon
          if ((freshData.history || []).some((h: any) => h.creneauId === cid && !h.credit && h.childName === child.childName)) {
            throw new Error("Déjà débité");
          }
          const updatedHistory = [...(freshData.history || []), {
            date: new Date().toISOString(),
            activityTitle: c.activityTitle,
            creneauId: cid, creneauDate: c.date, startTime: c.startTime,
            horseName: (child as any).horseName || (child as any).equideName || "",
            childName: child.childName,
            presence: "absent_nonjustified",
            reason: "Séance perdue (absence non justifiée)",
            auto: true,
          }];
          const newRem = (freshData.remainingSessions || 0) - 1;
          tx.update(doc(db, "cartes", carteId), {
            remainingSessions: newRem,
            usedSessions: (freshData.usedSessions || 0) + 1,
            history: updatedHistory,
            status: newRem <= 0 ? "used" : "active",
            updatedAt: serverTimestamp(),
          });
        });
        cartesDebiteesNJ++;
      } catch (e) { console.error("Erreur débit carte (non justifié):", e); }
    }

    // 4c. Créer des crédits rattrapage pour les absents ayant un forfait actif
    let rattrapagesCreated = 0;
    for (const child of absents) {
      try {
        // Vérifier si l'enfant a un forfait actif
        const forfaitSnap = await getDocs(query(
          collection(db, "forfaits"),
          where("childId", "==", child.childId),
          where("status", "in", ["active", "actif"])
        ));
        if (forfaitSnap.empty) continue;

        // Anti-doublon : vérifier si un rattrapage existe déjà pour ce créneau + enfant
        const existingSnap = await getDocs(query(
          collection(db, "rattrapages"),
          where("childId", "==", child.childId),
          where("sourceCreneauId", "==", cid)
        ));
        if (!existingSnap.empty) continue;

        // Saison sept→juin : aucun rattrapage accordé pour une absence en juillet/août.
        const absMonthM = (c.date || "").slice(5, 7);
        if (absMonthM === "07" || absMonthM === "08") continue;

        // Limite de 5 rattrapages par saison (hors situation médicale).
        // Au-delà, on demande si c'est médical : si oui on accorde (exempté),
        // sinon on n'accorde pas de rattrapage.
        const seasonStartStr = (() => { const n = new Date(); const y = n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1; return `${y}-09-01`; })();
        const allRSnap = await getDocs(query(collection(db, "rattrapages"), where("childId", "==", child.childId)));
        const nbNonMedical = allRSnap.docs.filter(d => { const r: any = d.data(); return r.medical !== true && (r.sourceDate || "") >= seasonStartStr; }).length;
        let medical = false;
        if (nbNonMedical >= 5) {
          const ok = window.confirm(`${child.childName} a déjà 5 rattrapages cette saison (hors médical).\n\nS'agit-il d'une situation médicale ?\nOK = accorder un rattrapage médical (exempté de la limite)\nAnnuler = ne pas accorder de rattrapage`);
          if (!ok) continue;
          medical = true;
        }

        // Date d'expiration = date d'absence + 3 mois (politique métier)
        // Cohérent avec la désinscription forfait depuis planning admin.
        // Évite l'aberration "fin trimestre civil" qui pouvait être avant
        // la date même de l'absence pour une absence en fin d'année.
        const absenceDate = new Date(c.date + "T12:00:00");
        const expiry = new Date(absenceDate);
        expiry.setMonth(expiry.getMonth() + 3);
        const expiryDateStr = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}`;

        await addDoc(collection(db, "rattrapages"), {
          childId: child.childId,
          childName: child.childName,
          familyId: child.familyId,
          familyName: child.familyName,
          forfaitId: forfaitSnap.docs[0].id,
          sourceCreneauId: cid,
          sourceDate: c.date,
          sourceActivity: c.activityTitle,
          sourceTime: `${c.startTime}–${c.endTime}`,
          status: "pending", // pending | used | expired
          medical,
          usedOnCreneauId: null,
          usedOnDate: null,
          expiryDate: expiryDateStr,
          createdAt: serverTimestamp(),
        });
        rattrapagesCreated++;
      } catch (e) { console.error("Erreur création rattrapage:", e); }
    }

    // 5. Proposer l'ajout de notes rapides
    if (presents.length > 0) {
      setQuickNoteChild({ cid, children: presents.map(p => ({ childId: p.childId, childName: p.childName, horseName: p.horseName || "" })) });
    }

    const parts = [`Reprise clôturée.`];
    if (notesCreated > 0) parts.push(`${notesCreated} trace${notesCreated > 1 ? "s" : ""} péda.`);
    if (cartesDebitees > 0) parts.push(`${cartesDebitees} carte${cartesDebitees > 1 ? "s" : ""} débitée${cartesDebitees > 1 ? "s" : ""}.`);
    if (cartesDebiteesNJ > 0) parts.push(`${cartesDebiteesNJ} séance${cartesDebiteesNJ > 1 ? "s" : ""} perdue${cartesDebiteesNJ > 1 ? "s" : ""} (NJ).`);
    if (rattrapagesCreated > 0) parts.push(`${rattrapagesCreated} rattrapage${rattrapagesCreated > 1 ? "s" : ""} créé${rattrapagesCreated > 1 ? "s" : ""}.`);
    if (absentsNonJustified.length > rattrapagesCreated && absentsNonJustified.length > 0) {
      // Mention discrète : ces absences ne génèrent ni rattrapage ni recrédit
      parts.push(`${absentsNonJustified.length} non justifié${absentsNonJustified.length > 1 ? "s" : ""} (séance perdue).`);
    }
    toast(parts.join(" "), "success");
    fetchData();
  };
