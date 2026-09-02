"use client";

/**
 * src/app/admin/planning/inscription-actions.ts
 *
 * Inscrire et désinscrire un cavalier sur un créneau : ce que ces deux gestes
 * écrivent réellement en base.
 *
 * Mille lignes de traitement — commande, encaissement, carte de séances,
 * forfait annuel, liste d'attente, courriels — vivaient dans le composant de
 * l'écran planning, mêlées à la navigation par semaine et au rendu du
 * calendrier. Elles n'ont rien d'un affichage : elles décident de ce qui est
 * facturé et de ce qui est envoyé aux familles.
 *
 * Tout ce dont elles ont besoin arrive par un contexte explicite, et ce
 * qu'elles doivent rafraîchir passe par des rappels. Rien du traitement n'a
 * changé.
 */

import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, setDoc,
  query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateOrderId } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";
import { applyDiscounts, type VacationPeriod, type DiscountSettings } from "@/lib/discounts";
import {
  emailTemplates, emailLayout, emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe as P, emailSignature,
} from "@/lib/email-templates";
import { prixInscriptionCavalier } from "@/lib/tarif-forfaitaire";
import type { Creneau, EnrolledChild } from "./types";
import {
  enrollChildInCreneau, removeChildFromCreneau, createReservation, deleteReservations,
  findStageCreneaux, findLinkedPayment, computeTropPercu, createAvoir,
} from "@/lib/planning-services";
import { encadreConditionsPourType } from "@/lib/cgv-clauses";
import { createEncaissement } from "@/lib/compta-encaissement";
import { inscritsMemeFamille, prixCreneauTTC } from "@/lib/tarif-forfaitaire";

/**
 * Ce que les deux gestes doivent connaître de l'écran, et ce qu'ils doivent
 * pouvoir rafraîchir une fois leur travail fait.
 */
export interface ContexteInscription {
  creneaux: (Creneau & { id: string })[];
  families: any[];
  payments: any[];
  allForfaits: any[];
  vacationPeriods: VacationPeriod[];
  discountSettings: DiscountSettings;
  /** Relit les créneaux de la période affichée et renvoie la version fraîche. */
  refreshCreneaux: () => Promise<(Creneau & { id: string })[]>;
  /** Recharge tout l'écran. */
  fetchData: () => Promise<void> | void;
  setAllForfaits: (f: any[]) => void;
  setSelectedCreneau: (c: any) => void;
  /** Message à l'écran, pour ce que l'utilisateur doit savoir. */
  toast: (message: string, type?: any) => void;
}

export async function inscrireCavalier(ctx: ContexteInscription, cid: string, child: EnrolledChild, payMode?: string, options?: { skipPayment?: boolean; skipEmail?: boolean; freeReason?: string; rattrapageId?: string; competitionItems?: any[]; skipRefresh?: boolean }) {
  const {
    creneaux, families, payments, allForfaits, vacationPeriods, discountSettings,
    refreshCreneaux, fetchData, setAllForfaits, setSelectedCreneau, toast,
  } = ctx;
  const enrolled = await enrollChildInCreneau(cid, child);
  // Sortir en silence laissait les appelants croire l'inscription faite :
  // l'ajout d'un jour de stage facturait alors 2 jours pour 1 seul inscrit.
  if (!enrolled) return false;

  // Une inscription solde la demande d'attente correspondante : sans cela,
  // la famille restait affichee « En attente » sur un creneau ou elle est
  // desormais inscrite, et le hold pouvait masquer une place a tort.
  // On nettoie au niveau de la FAMILLE : elle peut accepter la place avec
  // un autre cavalier que celui inscrit en attente (limite d'age, etc.).
  try {
    const wSnap = await getDocs(query(
      collection(db, "waitlist"),
      where("creneauId", "==", cid),
      where("familyId", "==", child.familyId),
    ));
    await Promise.all(wSnap.docs.map((d) => deleteDoc(doc(db, "waitlist", d.id))));
    const cRef = doc(db, "creneaux", cid);
    const cSnap = await getDoc(cRef);
    const holdFam = (cSnap.data() as any)?.waitlistHold?.familyId;
    if (holdFam && holdFam === child.familyId) {
      await updateDoc(cRef, { waitlistHold: null });
    }
  } catch (e) { console.warn("Nettoyage liste d'attente:", e); }

  // ── Mode Compétition : créer un paiement avec les lignes engagement/coaching ──
  if (options?.competitionItems && options.competitionItems.length > 0) {
    try {
      const c = creneaux.find(x => x.id === cid) as any;
      const totalTTC = options.competitionItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);
      const totalHT = options.competitionItems.reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
      const payData: any = {
        orderId: `COMP-${Date.now().toString(36).toUpperCase()}`,
        familyId: child.familyId, familyName: child.familyName,
        items: options.competitionItems,
        totalTTC, totalHT, totalTVA: totalTTC - totalHT,
        paymentMode: payMode || "",
        paymentRef: "", status: payMode ? "paid" : "pending",
        paidAmount: payMode ? totalTTC : 0,
        source: "competition", creneauId: cid,
        date: serverTimestamp(), createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "payments"), payData);
    } catch (e) { console.error("Erreur paiement compétition:", e); }
    await refreshCreneaux();
    return;
  }

  // Variables de rollback — capturées au fur et à mesure pour être disponibles dans le catch
  let usedCardId: string | null = null;
  let reservationCreated = false;

  try {
    const snap = await getDoc(doc(db, "creneaux", cid));
    if (!snap.exists()) return;
    const c = { id: snap.id, ...snap.data() } as any;
    await createReservation(child, c);
    reservationCreated = true;

    // Inscription offerte → créer un paiement à 0€ avec motif (traçabilité)
    if (options?.freeReason) {
      const priceTTC = c.priceTTC || (c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100);
      const priceHT = priceTTC / (1 + (c.tvaTaux || 5.5) / 100);
      // Cas "Établissement" : ce n'est PAS une séance offerte (elle est payée
      // par l'établissement, facturé à part). On la marque institutionnelle
      // pour la sortir des stats de gratuités, tout en gardant la trace.
      const isEtablissement = options.freeReason === "Établissement";
      await addDoc(collection(db, "payments"), {
        orderId: generateOrderId(),
        familyId: child.familyId, familyName: child.familyName,
        items: [{
          activityTitle: c.activityTitle, childId: child.childId, childName: child.childName,
          creneauId: cid, activityType: c.activityType, date: c.date,
          startTime: c.startTime, endTime: c.endTime,
          priceHT: 0, tva: c.tvaTaux || 5.5, priceTTC: 0,
          originalPriceTTC: Math.round(priceTTC * 100) / 100,
        }],
        totalTTC: 0, paidAmount: 0,
        paymentMode: isEtablissement ? "institutionnel" : "offert",
        paymentRef: "",
        status: "paid",
        // isFree uniquement pour les vraies gratuités, pas pour l'établissement
        ...(isEtablissement ? { isInstitutional: true } : { isFree: true }),
        freeReason: options.freeReason,
        note: isEtablissement
          ? `🏫 Établissement — facturé séparément (valeur indicative : ${priceTTC.toFixed(2)}€)`
          : `🎁 Offert — ${options.freeReason} (valeur : ${priceTTC.toFixed(2)}€)`,
        date: serverTimestamp(),
      });
      // Pas d'encaissement, pas de facture — juste la trace
      if (!options?.skipEmail && child.familyId) {
        // Email optionnel si besoin
      }
      await refreshCreneaux();
      return;
    }

    // Inscription en rattrapage → pas de paiement, marquer le rattrapage comme utilisé
    if (options?.rattrapageId) {
      try {
        await updateDoc(doc(db, "rattrapages", options.rattrapageId), {
          status: "used",
          usedOnCreneauId: cid,
          usedOnDate: c.date,
          usedAt: serverTimestamp(),
        });
      } catch (e) { console.error("Erreur mise à jour rattrapage:", e); }
      // Pas de paiement, pas d'encaissement — c'est un rattrapage
      await refreshCreneaux();
      return;
    }

    // skipPayment = true pour les inscriptions stage multi-jours
    //
    // Créneau au tarif forfaitaire (balade privatisée) : le montant est
    // celui de la SORTIE, pas du cavalier. Le premier inscrit de la famille
    // le porte, les suivants sont à 0 € — `c` vient d'être relu, il contient
    // déjà le cavalier qu'on inscrit, d'où son exclusion du compte.
    const dejaFamille = inscritsMemeFamille(c.enrolled, child.familyId, child.childId);
    const priceTTC = prixInscriptionCavalier(c, dejaFamille);
    const forfaitDejaFacture = !!c.tarifForfaitaire && dejaFamille > 0;

    // ⚠️ GARDE-FOU : créneau sans prix défini
    // Sans cette vérification, handleEnroll aurait sauté tout le bloc de
    // création de payment (ligne "if priceTTC > 0"), laissant le cavalier
    // inscrit au planning sans aucune trace financière. Nicolas nous a
    // confirmé que tous ses créneaux DOIVENT avoir un prix — un priceTTC
    // à 0 ou manquant est donc un oubli, pas un cas volontaire.
    if (!options?.skipPayment && !options?.freeReason && !forfaitDejaFacture && priceTTC <= 0) {
      console.error("[handleEnroll] Créneau sans prix !", {
        creneauId: cid,
        activityTitle: c.activityTitle,
        date: c.date,
        priceTTC: c.priceTTC,
        priceHT: c.priceHT,
      });
      toast(
        `⚠️ Ce créneau "${c.activityTitle}" n'a pas de prix défini. ` +
        `Configure son prix dans les paramètres du créneau avant d'inscrire un cavalier.`,
        "error"
      );
      // On annule : on retire l'inscription qui vient d'être faite
      await removeChildFromCreneau(cid, child.childId);
      if (reservationCreated) await deleteReservations(cid, child.childId);
      return;
    }

    // Identifiant de la commande créée ou fusionnée — renvoyé à l'appelant
    // (déclaré ici pour rester visible jusqu'au `return` en fin de fonction).
    let payRefId = "";

    // Cavalier supplémentaire d'une famille sur un créneau au forfait : rien
    // à facturer — la sortie est déjà payée. On écrit tout de même une ligne
    // à 0 €, soldée : sans elle, aucune commande ne couvrirait ce cavalier,
    // le planning l'afficherait « non réglé » à vie et rien n'expliquerait
    // pourquoi il ne paie pas.
    if (!options?.skipPayment && forfaitDejaFacture) {
      const forfait = prixCreneauTTC(c);
      await addDoc(collection(db, "payments"), {
        orderId: generateOrderId(),
        familyId: child.familyId, familyName: child.familyName,
        items: [{
          activityTitle: `${c.activityTitle} — inclus au forfait`,
          childId: child.childId, childName: child.childName,
          creneauId: cid, activityType: c.activityType, date: c.date,
          startTime: c.startTime, endTime: c.endTime,
          priceHT: 0, tva: c.tvaTaux || 5.5, priceTTC: 0,
          originalPriceTTC: 0,
        }],
        totalTTC: 0, paidAmount: 0,
        paymentMode: "forfait_creneau",
        paymentRef: "",
        status: "paid",
        tarifForfaitaire: true,
        note: `Compris dans le forfait de la sortie (${forfait.toFixed(2)}€), réglé par le premier cavalier de la famille`,
        date: serverTimestamp(),
      });
      await refreshCreneaux();
      return;
    }

    if (!options?.skipPayment && priceTTC > 0) {

    // ─── LOGIQUE CARTE : noter paymentSource=card si carte compatible, sans débiter ───
    // Le débit réel se fait au montoir lors de la clôture (confirmation de présence)
    const isCoursType = ["cours", "cours_collectif", "cours_particulier"].includes(c.activityType);
    const isBaladeType = ["balade", "promenade", "ponyride"].includes(c.activityType);
    if (isCoursType || isBaladeType) {
      try {
        // Forfait actif sur le MÊME créneau précis → pas de carte
        // On calcule le slotKey du créneau courant pour comparer
        const currentSlotKey = `${c.activityTitle} — ${new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${c.startTime}`;
        const forfaitSnap = await getDocs(query(
          collection(db, "forfaits"),
          where("childId", "==", child.childId),
          where("status", "==", "actif")
        ));
        const hasForfaitActif = forfaitSnap.docs.some(d => {
          const fd = d.data();
          const forfaitType = fd.activityType || "cours";
          // Vérification 1 : type compatible
          const typeMatch =
            forfaitType === "all" ||
            (forfaitType === "cours" && isCoursType) ||
            (forfaitType === "balade" && isBaladeType);
          if (!typeMatch) return false;
          // Vérification 2 : même créneau précis via slotKey
          // Si le forfait a un slotKey, il doit correspondre au créneau courant
          if (fd.slotKey && fd.slotKey !== currentSlotKey) return false;
          return true;
        });
        if (!hasForfaitActif) {
          // Chercher carte individuelle OU carte familiale
          const [cartesIndivSnap, cartesFamSnap] = await Promise.all([
            getDocs(query(collection(db, "cartes"), where("childId", "==", child.childId), where("status", "==", "active"))),
            getDocs(query(collection(db, "cartes"), where("familyId", "==", child.familyId), where("familiale", "==", true), where("status", "==", "active"))),
          ]);
          const allCartesDocs = [...cartesIndivSnap.docs, ...cartesFamSnap.docs];
          const carteActive = allCartesDocs.find(d => {
            const data = d.data();
            if ((data.remainingSessions || 0) <= 0) return false;
            if (data.dateFin && new Date(data.dateFin) < new Date()) return false;
            const cardType = data.activityType || "cours";
            if (cardType === "cours" && isCoursType) return true;
            if (cardType === "balade" && isBaladeType) return true;
            return false;
          });
          if (carteActive) {
            usedCardId = null; // Pas de débit à l'inscription — le montoir s'en charge
            // Marquer paymentSource=card pour que le montoir sache quoi faire
            const creneauRef2 = doc(db, "creneaux", cid);
            const cSnap2 = await getDoc(creneauRef2);
            if (cSnap2.exists()) {
              const enrolled2 = cSnap2.data().enrolled || [];
              const updatedEnrolled = enrolled2.map((e: any) =>
                e.childId === child.childId ? { ...e, paymentSource: "card", cardId: carteActive.id } : e
              );
              await updateDoc(creneauRef2, { enrolled: updatedEnrolled });
            }
            return; // Pas de payment pending — le débit se fait à la présence confirmée
          }
        }
      } catch (e) { console.error("Erreur vérification carte:", e); }
    }
    // ─── FIN LOGIQUE CARTE ───

    // ─── CALCUL RÉDUCTIONS (famille + multi-stages) ───
    // Ne s'applique qu'aux stages en période de vacances scolaires.
    // Pour les autres types, applyDiscounts renvoie le prix plein.
    const discountResult = await applyDiscounts({
      familyId: child.familyId,
      newChildId: child.childId,
      stageDate: c.date,
      stageType: c.activityType,
      originalPriceTTC: Math.round(priceTTC * 100) / 100,
      settings: discountSettings,
      periods: vacationPeriods,
      excludeCreneauId: cid, // la résa vient juste d'être créée pour ce créneau
    });
    const finalPriceTTC = discountResult.finalPriceTTC;
    const finalPriceHT = finalPriceTTC / (1 + (c.tvaTaux || 5.5) / 100);
    // ─── FIN CALCUL RÉDUCTIONS ───

    const priceHT = finalPriceHT;
    const isPaid = !!payMode;
    const newItem: any = {
      activityTitle: c.activityTitle,
      childId: child.childId,
      childName: child.childName,
      creneauId: cid,
      activityType: c.activityType,
      date: c.date,
      startTime: c.startTime,
      endTime: c.endTime,
      priceHT: Math.round(finalPriceHT * 100) / 100,
      tva: c.tvaTaux || 5.5,
      priceTTC: Math.round(finalPriceTTC * 100) / 100,
    };
    if (discountResult.discountPercent > 0) {
      newItem.originalPriceTTC = discountResult.originalPriceTTC;
      newItem.discountPercent = discountResult.discountPercent;
      newItem.discountAmount = discountResult.discountAmount;
      newItem.discountReasons = discountResult.reasons;
    }

    if (isPaid) {
      // Encaissement immédiat → toujours créer un payment séparé (pas de fusion)
      // Numéro de facture séquentiel via API atomique (évite doublons)
      let invoiceNumber = "";
      try {
        const res = await authFetch("/api/invoice/next-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.invoiceNumber) invoiceNumber = data.invoiceNumber;
        } else {
          console.error("Numéro facture — API error:", res.status, await res.text());
        }
      } catch (e) {
        console.error("Numéro facture — erreur réseau:", e);
      }
      // Si l'attribution a échoué, on crée quand même le paiement
      // (sans invoiceNumber) — il pourra être régularisé plus tard en admin
      const payRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
        familyId: child.familyId, familyName: child.familyName,
        items: [newItem],
        totalTTC: Math.round(finalPriceTTC * 100) / 100,
        paymentMode: payMode || "",
        paymentRef: "",
        status: "paid",
        paidAmount: Math.round(finalPriceTTC * 100) / 100,
        ...(invoiceNumber ? { invoiceNumber } : {}),
        date: serverTimestamp(),
      });
      payRefId = payRef.id;

      // ─── Mode AVOIR : vérifier solde puis déduire ───
      if (payMode === "avoir") {
        try {
          const avoirsSnap = await getDocs(query(collection(db, "avoirs"), where("familyId", "==", child.familyId)));
          const avoirsActifs = avoirsSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter((a: any) => a.status === "actif" && (a.remainingAmount || 0) > 0)
            .sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
          const totalAvoirDispo = avoirsActifs.reduce((s: number, a: any) => s + (a.remainingAmount || 0), 0);

          if (totalAvoirDispo <= 0) {
            // Pas d'avoir → annuler le paiement paid et le repasser en pending
            await updateDoc(doc(db, "payments", payRefId), {
              paidAmount: 0,
              status: "pending",
              paymentMode: "",
            });
            // Pas d'encaissement à créer
            throw new Error("NO_AVOIR");
          }

          let remaining = Math.round(finalPriceTTC * 100) / 100;
          let totalDeduit = 0;
          for (const a of avoirsActifs) {
            if (remaining <= 0) break;
            const deduction = Math.min(remaining, a.remainingAmount || 0);
            remaining -= deduction;
            totalDeduit += deduction;
            await updateDoc(doc(db, "avoirs", a.id), {
              usedAmount: (a.usedAmount || 0) + deduction,
              remainingAmount: Math.max(0, (a.remainingAmount || 0) - deduction),
              status: (a.remainingAmount || 0) - deduction <= 0 ? "utilise" : "actif",
              usageHistory: [...(a.usageHistory || []), {
                date: new Date().toISOString(), amount: deduction, invoiceRef: payRefId.slice(-6).toUpperCase(),
              }],
              updatedAt: serverTimestamp(),
            });
          }
          if (remaining > 0) {
            // Avoir insuffisant → partial avec le montant réellement déduit
            await updateDoc(doc(db, "payments", payRefId), {
              paidAmount: Math.round(totalDeduit * 100) / 100,
              status: "partial",
            });
          }
          // Encaissement uniquement du montant réellement déduit
          await createEncaissement({
            paymentId: payRefId, familyId: child.familyId, familyName: child.familyName,
            montant: Math.round(totalDeduit * 100) / 100, mode: "avoir",
            modeLabel: "Avoir",
            ref: "", activityTitle: `${c.activityTitle} — ${child.childName}`,
          });
        } catch (e: any) {
          if (e?.message !== "NO_AVOIR") console.error("Erreur déduction avoir:", e);
        }
      } else {

      await createEncaissement({
        paymentId: payRefId, familyId: child.familyId, familyName: child.familyName,
        montant: Math.round(finalPriceTTC * 100) / 100, mode: payMode,
        modeLabel: payMode === "cb_terminal" ? "CB (terminal)" : payMode === "especes" ? "Espèces" : payMode === "cheque" ? "Chèque" : payMode || "",
        ref: "", activityTitle: `${c.activityTitle} — ${child.childName}`,
      });

      // Points de fidélité (1 point par euro encaissé)
      try {
        const fidSettingsSnap = await getDoc(doc(db, "settings", "fidelite"));
        const fidEnabled = fidSettingsSnap.exists() ? (fidSettingsSnap.data()?.enabled !== false) : false;
        if (fidEnabled && finalPriceTTC > 0) {
          const pts = Math.floor(finalPriceTTC);
          const fidRef = doc(db, "fidelite", child.familyId);
          const fidSnap = await getDoc(fidRef);
          const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1);
          const entry = { date: new Date().toISOString(), points: pts, type: "gain", label: `${c.activityTitle} — ${child.childName}`, expiry: expiry.toISOString(), montant: finalPriceTTC };
          if (fidSnap.exists()) {
            const cur = fidSnap.data() || {};
            await updateDoc(fidRef, { points: ((cur.points as number) || 0) + pts, history: [...((cur.history as any[]) || []), entry], updatedAt: serverTimestamp() });
          } else {
            await setDoc(fidRef, { familyId: child.familyId, familyName: child.familyName, points: pts, history: [entry], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          }
        }
      } catch (e) { console.error("Erreur fidélité planning:", e); }

      } // fin else avoir
    } else {
      // Paiement en attente → fusionner dans la commande ouverte la plus récente
      const existingSnap = await getDocs(query(collection(db, "payments"), where("familyId", "==", child.familyId), where("status", "==", "pending")));
      // Filtrage : fusion seulement si pending < 7 jours (hors échéances de forfait)
      const MERGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const pendingDocs = existingSnap.docs
        .filter(d => !(d.data().echeancesTotal > 1))
        .filter(d => {
          const dt = d.data().date;
          if (!dt) return false;
          const ms = dt.seconds ? dt.seconds * 1000 : new Date(dt).getTime();
          if (isNaN(ms)) return false;
          return now - ms <= MERGE_WINDOW_MS;
        })
        .sort((a, b) => {
          const da = a.data().date?.seconds || 0;
          const db2 = b.data().date?.seconds || 0;
          return db2 - da;
        });
      if (pendingDocs.length > 1) {
        console.warn(`⚠️ ${pendingDocs.length} commandes pending récentes pour famille ${child.familyId} — fusion dans la plus récente`);
      }
      const openOrder = pendingDocs.length > 0 ? pendingDocs[0] : null;

      if (openOrder) {
        const existData = openOrder.data();
        const mergedItems = [...(existData.items || []), newItem];
        const mergedTotal = Math.round(mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0) * 100) / 100;
        await updateDoc(doc(db, "payments", openOrder.id), {
          items: mergedItems,
          totalTTC: mergedTotal,
          updatedAt: serverTimestamp(),
        });
        payRefId = openOrder.id;
      } else {
        const payRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
          familyId: child.familyId, familyName: child.familyName,
          items: [newItem],
          totalTTC: Math.round(finalPriceTTC * 100) / 100,
          paymentMode: "",
          paymentRef: "",
          status: "pending",
          paidAmount: 0,
          date: serverTimestamp(),
        });
        payRefId = payRef.id;
      }
    }
  }
  // Email confirmation cours (skip pour les stages multi-jours — email envoyé séparément)
  if (!options?.skipEmail) {
    const fam = families.find(f => f.firestoreId === child.familyId);
    if (fam?.parentEmail && c.activityType !== "stage" && c.activityType !== "stage_journee") {
    try {
      const emailData = emailTemplates.confirmationCours({
        parentName: fam.parentName || "", childName: child.childName,
        coursTitle: c.activityTitle,
        date: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        horaire: `${c.startTime}–${c.endTime}`, prix: priceTTC,
        // Inscription au bureau sans encaissement : le montant reste du.
        // Sans ce drapeau, l'email disait « confirmee » avec le prix, et la
        // famille comprenait qu'elle n'avait rien a payer.
        regle: options?.skipPayment === true || payMode === "deja_paye"
          ? true
          : Boolean(payMode && payMode !== "impaye" && payMode !== "a_regler"),
      });
      authFetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: fam.parentEmail,
          ...emailData,
          context: "admin_confirmation_cours",
          template: "confirmationCours",
          familyId: fam.firestoreId,
          creneauId: cid,
        }),
      }).catch(e => console.warn("Email:", e));
    } catch (e) { console.error("Email confirmation cours:", e); }
    }
  }
  // ── Refresh des donnees apres inscription ─────────────────────────
  // Skip si demande (boucle d'inscription annuelle ou batch) : le refresh
  // sera fait une seule fois a la fin. Sinon, chaque iteration retelecharge
  // tous les creneaux + tous les forfaits = ~2-3s d'attente par appel, qui
  // se cumulent (114 seances * 3s = ~6 minutes pour une saison 3x/sem).
  if (!options?.skipRefresh) {
    const fresh = await refreshCreneaux(); const upd = fresh.find(x => x.id === cid); if (upd) setSelectedCreneau(upd);
    // Recharger allForfaits pour que rangEnfantFamille soit correct pour le prochain enfant
    try {
      const forfaitsSnap = await getDocs(query(collection(db, "forfaits"), where("status", "==", "actif")));
      setAllForfaits(forfaitsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch(e) { console.error("Erreur refresh forfaits:", e); }
  }
  // Identifiant de la commande créée (ou fusionnée). L'appelant en a besoin
  // pour encaisser plusieurs cavaliers en UN seul règlement : il inscrit sans
  // mode de paiement — les enfants tombent alors dans la même commande — puis
  // encaisse cette commande une fois.
  return payRefId || true;
  } catch (error) {
    console.error("Erreur handleEnroll, rollback:", error);
    try {
      // 1. Retirer l'enfant du créneau
      await removeChildFromCreneau(cid, child.childId);
      // 2. Supprimer la réservation si elle a été créée
      if (reservationCreated) await deleteReservations(cid, child.childId);
      // 3. Re-créditer la carte si elle a été débitée — usedCardId capturé AVANT le débit
      if (usedCardId) {
        const carteRef = doc(db, "cartes", usedCardId);
        const carteSnap = await getDoc(carteRef);
        if (carteSnap.exists()) {
          const cd = carteSnap.data();
          await updateDoc(carteRef, {
            remainingSessions: (cd.remainingSessions || 0) + 1,
            usedSessions: Math.max(0, (cd.usedSessions || 0) - 1),
            status: "active",
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e2) { console.error("Rollback partiel échoué:", e2); }
    toast("Erreur lors de l'inscription. L'opération a été annulée.", "error");
  }
};

export async function desinscrireCavalier(ctx: ContexteInscription, cid: string, childId: string) {
  const {
    creneaux, families, payments, allForfaits,
    refreshCreneaux, fetchData, setAllForfaits, setSelectedCreneau, toast,
  } = ctx;
  const cSnap = await getDoc(doc(db, "creneaux", cid));
  if (!cSnap.exists()) return;
  const c = { id: cSnap.id, ...cSnap.data() } as any;
  const isStageType = c.activityType === "stage" || c.activityType === "stage_journee";
  const child = (c.enrolled || []).find((e: any) => e.childId === childId);
  if (!child) return;

  // ── Détection inscription via forfait annuel ────────────────────────
  // Si l'enfant est inscrit via un forfait annuel actif couvrant CE
  // créneau, le paiement annuel a déjà été encaissé et reste valable
  // pour tous les autres créneaux de l'année. Une désinscription d'UN
  // créneau ne doit JAMAIS générer d'avoir : on crée seulement un
  // rattrapage que la famille pourra utiliser sur un autre créneau,
  // et on retire l'enfant uniquement de ce créneau-ci.
  //
  // Bug historique : avant cette correction, handleUnenroll trouvait
  // le paiement annuel via findLinkedPayment et créait un avoir au
  // prorata du restant (ex: 303€ sur 388€), désinscrivant l'enfant
  // alors qu'il aurait juste dû avoir un rattrapage. Détection robuste
  // qui marche aussi pour les enfants inscrits AVANT cette correction
  // (sans paymentSource=forfait sur l'enrolled).
  const forfaitActif = (() => {
    if (isStageType) return null; // les stages ne sont jamais couverts par un forfait annuel
    // Heuristique 1 : marqueur explicite sur l'enrolled (futures inscriptions)
    if (child.paymentSource === "forfait" && child.forfaitId) {
      return allForfaits.find((f: any) => f.id === child.forfaitId) || null;
    }
    // Heuristique 2 : recherche d'un forfait actif compatible (rétrocompat)
    // Match : même enfant + même activité + même jour de la semaine + même heure
    const dayOfWeek = new Date(c.date + "T12:00:00").getDay();
    const dayMap = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    const dayLabel = dayMap[dayOfWeek];
    return allForfaits.find((f: any) => {
      if (f.childId !== childId) return false;
      if (f.status !== "actif" && f.status !== "active") return false;
      // Le forfait doit cibler ce créneau (matche activité + jour + heure)
      const matchActivity = (f.activityTitle || "").toLowerCase() === (c.activityTitle || "").toLowerCase();
      const matchDay = (f.dayLabel || "").toLowerCase() === dayLabel;
      const matchTime = (f.startTime || "") === (c.startTime || "");
      return matchActivity && matchDay && matchTime;
    }) || null;
  })();

  // ── BIFURCATION : forfait actif → rattrapage, pas d'avoir ──────────
  if (forfaitActif) {
    const dateStr = new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const msgForfait =
      `${child.childName} est inscrit(e) via le forfait annuel.\n\n` +
      `Désinscrire pour le ${dateStr} ?\n\n` +
      `✓ Un rattrapage sera créé (à utiliser plus tard)\n` +
      `✓ Le forfait annuel et le paiement restent intacts\n` +
      `✓ L'enfant reste inscrit aux autres séances`;
    if (!confirm(msgForfait)) return;

    // Désinscrire d'une séance ne touche pas au forfait — c'est le bon
    // comportement pour une absence. Mais après une inscription faite par
    // erreur ou pour un test, le forfait survit et continue de compter dans
    // les réductions famille de la fratrie, sans que rien ne le montre.
    // On propose donc de l'annuler, sans jamais le faire d'office.
    const annulerForfait = confirm(
      `Annuler AUSSI le forfait annuel de ${child.childName} ?\n\n` +
      `OK = le forfait est annulé (inscription faite par erreur ou abandon\n` +
      `définitif). Il ne comptera plus dans les réductions famille.\n\n` +
      `Annuler = le forfait reste actif (simple absence sur cette séance).`
    );

    try {
      // 1. Retirer l'enfant de CE créneau uniquement
      await removeChildFromCreneau(cid, childId);
      await deleteReservations(cid, childId);

      if (annulerForfait) {
        await updateDoc(doc(db, "forfaits", forfaitActif.id), {
          status: "annule",
          annuleAt: new Date().toISOString(),
          annuleMotif: "Désinscription — forfait annulé par l'administrateur",
        });
        toast(`Forfait annuel de ${child.childName} annulé`, "info");
      }

      // 2. Anti-doublon : éviter de créer plusieurs rattrapages pour le même créneau
      const existingSnap = await getDocs(query(
        collection(db, "rattrapages"),
        where("childId", "==", childId),
        where("sourceCreneauId", "==", cid),
      ));

      if (existingSnap.empty) {
        const absMonth = (c.date || "").slice(5, 7);
        if (absMonth === "07" || absMonth === "08") {
          toast(`${child.childName} désinscrit(e) du ${dateStr} — pas de rattrapage en juillet/août (hors saison)`, "info");
        } else {
        // Limite de 5 rattrapages par saison (hors situation médicale).
        const seasonStartStr = (() => { const n = new Date(); const y = n.getMonth() >= 8 ? n.getFullYear() : n.getFullYear() - 1; return `${y}-09-01`; })();
        const allRSnap = await getDocs(query(collection(db, "rattrapages"), where("childId", "==", childId)));
        const nbNonMedical = allRSnap.docs.filter(d => { const r: any = d.data(); return r.medical !== true && (r.sourceDate || "") >= seasonStartStr; }).length;
        let medical = false;
        if (nbNonMedical >= 5) {
          const ok = window.confirm(`${child.childName} a déjà 5 rattrapages cette saison (hors médical).\n\nS'agit-il d'une situation médicale ?\nOK = accorder un rattrapage médical (exempté de la limite)\nAnnuler = ne pas accorder de rattrapage`);
          if (!ok) { medical = null as any; }
          else medical = true;
        }
        if (medical !== null) {
        // 3. Calcul de la date d'expiration : date d'absence + 3 mois.
        //    Politique métier : un cavalier qui rate une séance a 3 mois
        //    à partir de la date de cette séance pour utiliser son rattrapage.
        //    Bien plus adapté qu'un calcul "fin de trimestre civil" qui
        //    pouvait expirer le rattrapage AVANT même la date de l'absence
        //    (cas typique : absence en novembre, calcul donnait fin juin).
        const absenceDate = new Date(c.date + "T12:00:00");
        const expiry = new Date(absenceDate);
        expiry.setMonth(expiry.getMonth() + 3);
        // toISOString avec midi local évite tout décalage UTC qui ferait
        // basculer la date d'un jour (ex 29 vs 30 selon le fuseau).
        const expiryDateStr = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}`;

        await addDoc(collection(db, "rattrapages"), {
          childId,
          childName: child.childName,
          familyId: child.familyId,
          familyName: child.familyName,
          forfaitId: forfaitActif.id,
          sourceCreneauId: cid,
          sourceDate: c.date,
          sourceActivity: c.activityTitle,
          sourceTime: `${c.startTime}–${c.endTime}`,
          status: "pending",
          medical: medical === true,
          usedOnCreneauId: null,
          usedOnDate: null,
          expiryDate: expiryDateStr,
          createdAt: serverTimestamp(),
          source: "unenroll_admin", // pour distinguer des rattrapages du montoir
        });
        toast(`${child.childName} désinscrit(e) du ${dateStr} — Rattrapage créé`, "success");
        } else {
          toast(`${child.childName} désinscrit(e) du ${dateStr} — limite de rattrapages atteinte, aucun rattrapage accordé`, "info");
        }
        }
      } else {
        toast(`${child.childName} désinscrit(e) du ${dateStr} — Rattrapage déjà existant`, "info");
      }

      await fetchData();
    } catch (e: any) {
      console.error("[handleUnenroll forfait]", e);
      toast("Erreur lors de la désinscription", "error");
    }
    return;
  }

  // Trouver les créneaux à désinscrire (stage = tous les jours par défaut)
  let creneauxIds = [cid];
  let isPartialStageUnenroll = false; // true si on désinscrit 1 jour seulement d'un stage
  let skipAvoir = false; // true si l'admin a choisi "sans avoir" (absence tardive, le montant reste dû)
  if (isStageType) {
    const stageCreneaux = await findStageCreneaux(c.activityTitle, c.date);
    const allCreneauxIds = stageCreneaux.map((sc: any) => sc.id);

    // Si le stage a plusieurs jours, proposer le choix
    if (allCreneauxIds.length > 1) {
      const dateStr = new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      // window.confirm n'offre que 2 choix (OK/Annuler). On utilise un prompt avec 3 options.
      const choice = window.prompt(
        `${child.childName} est inscrit(e) au stage "${c.activityTitle}" (${allCreneauxIds.length} jours).\n\n` +
        `Que veux-tu désinscrire ?\n\n` +
        `  1 → Tout le stage (${allCreneauxIds.length} jours, avoir plein)\n` +
        `  2 → Seulement ce jour (${dateStr}) — avoir au prorata\n` +
        `  3 → Seulement ce jour (${dateStr}) — SANS avoir (absence tardive, le stage reste dû)\n` +
        `  (Annuler pour abandonner)\n\n` +
        `Saisis 1, 2 ou 3 :`,
        "1"
      );
      if (choice === null) return; // Annulé
      const trimmed = choice.trim();
      if (trimmed === "2") {
        creneauxIds = [cid]; // juste ce jour
        isPartialStageUnenroll = true;
      } else if (trimmed === "3") {
        creneauxIds = [cid]; // juste ce jour
        isPartialStageUnenroll = true;
        skipAvoir = true; // pas d'avoir : le montant reste dû (ex: absence tardive non prévue)
      } else if (trimmed === "1") {
        creneauxIds = allCreneauxIds;
      } else {
        alert("Choix invalide — désinscription annulée.");
        return;
      }
    } else {
      creneauxIds = allCreneauxIds;
    }
  }

  const nbJours = creneauxIds.length;
  const msg = isStageType && !isPartialStageUnenroll
    ? `Désinscrire ${child.childName} du stage "${c.activityTitle}" (${nbJours} jour${nbJours > 1 ? "s" : ""}) ?\n\nSi un paiement a été encaissé, un avoir sera créé automatiquement.`
    : isPartialStageUnenroll && skipAvoir
      ? `Désinscrire ${child.childName} du stage "${c.activityTitle}" UNIQUEMENT pour le ${new Date(c.date).toLocaleDateString("fr-FR")} ?\n\n⚠️ AUCUN avoir ne sera créé (absence tardive).\nLe stage reste dû en totalité.`
      : isPartialStageUnenroll
        ? `Désinscrire ${child.childName} du stage "${c.activityTitle}" UNIQUEMENT pour le ${new Date(c.date).toLocaleDateString("fr-FR")} ?\n\nUn avoir au prorata sera créé si un paiement a été encaissé.`
        : `Désinscrire ${child.childName} de "${c.activityTitle}" le ${new Date(c.date).toLocaleDateString("fr-FR")} ?\n\nSi un paiement a été encaissé, un avoir sera créé automatiquement.`;
  if (!confirm(msg)) return;

  console.log("[handleUnenroll] Démarrage", {
    childName: child.childName,
    childId,
    isStageType,
    isPartialStageUnenroll,
    creneauxIdsÀTraiter: creneauxIds,
    nbJours,
  });

  // 1. Retirer l'enfant de tous les créneaux + réservations
  for (const crId of creneauxIds) {
    await removeChildFromCreneau(crId, childId);
    await deleteReservations(crId, childId);
  }

  // ── Vérification post-désinscription ──
  // Refait une lecture des créneaux du stage pour s'assurer que l'enfant
  // n'apparaît plus nulle part. Si c'est le cas, on log une alerte (et on
  // pourra ajouter un nettoyage automatique plus tard si le bug réapparaît).
  if (isStageType) {
    try {
      const verif = await findStageCreneaux(c.activityTitle, c.date);
      const tracesRestantes = verif
        .map((vc: any) => ({
          id: vc.id,
          date: vc.date,
          startTime: vc.startTime,
          stillEnrolled: (vc.enrolled || []).some((e: any) => e.childId === childId),
        }))
        .filter((x: any) => x.stillEnrolled);
      if (tracesRestantes.length > 0) {
        console.error(
          "[handleUnenroll] ⚠️ BUG : l'enfant apparaît encore dans certains créneaux stage après désinscription !",
          {
            childName: child.childName,
            childId,
            activityTitle: c.activityTitle,
            tracesRestantes,
            creneauxIdsTraités: creneauxIds,
            creneauxIdsOubliés: tracesRestantes.map((t: any) => t.id).filter((id: string) => !creneauxIds.includes(id)),
          }
        );
      } else {
        console.log("[handleUnenroll] ✓ Désinscription propre, aucune trace restante dans les créneaux du stage");
      }
    } catch (err) {
      console.warn("[handleUnenroll] Impossible de vérifier les traces restantes :", err);
    }
  }

  // 1bis. Cas "absence tardive" : désinscription sans avoir ni recrédit
  // On garde le paiement et la carte intacts (le stage reste dû), on retire
  // juste l'enfant du créneau. Cas typique : cavalier annule la veille sans
  // préavis → place libérée mais montant reste dû, carte non recréditée.
  // Ce check doit être AVANT le bloc carte pour que la carte ne soit pas
  // recréditée automatiquement.
  if (skipAvoir) {
    toast(
      `${child.childName} désinscrit(e) du ${new Date(c.date).toLocaleDateString("fr-FR")} — Aucun avoir (absence tardive)`,
      "success"
    );
    // Journal d'audit pour garder une trace de cette décision
    console.log("[handleUnenroll] Désinscription sans avoir", {
      childName: child.childName,
      date: c.date,
      activityTitle: c.activityTitle,
      paymentSource: child.paymentSource,
      reason: "absence tardive — montant reste dû, carte non recréditée",
    });
    await fetchData();
    return;
  }

  // 2. Si payé par carte → recréditer la carte
  if (child.paymentSource === "card" && child.cardId) {
    try {
      const carteRef = doc(db, "cartes", child.cardId);
      const carteSnap = await getDoc(carteRef);
      if (carteSnap.exists()) {
        const carteData = carteSnap.data();
        const newHistory = [...(carteData.history || []), {
          date: new Date().toISOString(),
          activityTitle: `Recrédit — ${c.activityTitle}`,
          childName: child.childName,
          creneauId: cid,
          credit: true,
        }];
        await updateDoc(carteRef, {
          remainingSessions: (carteData.remainingSessions || 0) + 1,
          usedSessions: Math.max(0, (carteData.usedSessions || 0) - 1),
          history: newHistory,
          status: "active",
          updatedAt: serverTimestamp(),
        });
      }
    } catch (e) { console.error("Erreur recrédit carte:", e); }
    await fetchData();
    return;
  }

  // 2bis. (déplacé en 1bis)

  // 3. Gestion financière (paiement classique)
  try {
    const linked = await findLinkedPayment(child.familyId, childId, c.activityTitle);
    if (linked) {
      const { paymentDoc, paymentData, matchItem } = linked;
      const originalTotalTTC = paymentData.originalTotalTTC || paymentData.totalTTC || 0;

      // Pour un désinscription PARTIELLE d'un stage (1 jour sur N),
      // on ne supprime pas l'item mais on réduit son prix au prorata.
      // Le total du stage complet est récupéré via findStageCreneaux pour
      // connaître le nombre total de jours.
      let montantAvoir: number;
      let newItems: any[];
      let newTotal: number;

      if (isPartialStageUnenroll) {
        // On retrouve combien de jours avait le stage complet
        const stageAll = await findStageCreneaux(c.activityTitle, c.date);
        const totalJours = stageAll.length || 1;
        const prixParJour = (matchItem.priceTTC || 0) / totalJours;
        const prixHTParJour = (matchItem.priceHT || 0) / totalJours;
        const tvaParJour = ((matchItem.priceTTC || 0) - (matchItem.priceHT || 0)) / totalJours;

        montantAvoir = Math.round(prixParJour * 100) / 100;

        // Remplacer l'item par une version avec prix réduit
        newItems = (paymentData.items || []).map((i: any) => {
          if (i !== matchItem) return i;
          const joursRestants = totalJours - 1;
          return {
            ...i,
            priceTTC: Math.round((i.priceTTC - prixParJour) * 100) / 100,
            priceHT: Math.round((i.priceHT - prixHTParJour) * 100) / 100,
            activityTitle: `${i.activityTitle} (${joursRestants}j)`,
            _originalPriceTTC: i._originalPriceTTC || i.priceTTC, // historique
            _originalJours: i._originalJours || totalJours,
            _joursRestants: joursRestants,
          };
        });
        newTotal = newItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);

        console.log("[handleUnenroll partiel]", {
          prixParJour,
          totalJours,
          montantAvoir,
          newTotal,
        });
      } else {
        // Désinscription complète : on supprime l'item entier
        montantAvoir = matchItem.priceTTC || 0;
        newItems = (paymentData.items || []).filter((i: any) => i !== matchItem);
        newTotal = newItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);
      }

      if (newItems.length === 0) {
        await updateDoc(doc(db, "payments", paymentDoc.id), {
          status: "cancelled", cancelledAt: serverTimestamp(),
          cancelReason: `Désinscription ${child.childName}`, updatedAt: serverTimestamp(),
          originalTotalTTC,
        });
      } else {
        const newPaid = Math.min(paymentData.paidAmount || 0, newTotal);
        await updateDoc(doc(db, "payments", paymentDoc.id), {
          items: newItems, totalTTC: Math.round(newTotal * 100) / 100,
          paidAmount: Math.round(newPaid * 100) / 100,
          status: newPaid >= newTotal ? "paid" : newPaid > 0 ? "partial" : "pending",
          updatedAt: serverTimestamp(),
          originalTotalTTC,
        });
      }

      // Avoir si trop-perçu
      if (montantAvoir > 0) {
        const tropPercu = await computeTropPercu(paymentDoc.id, newTotal);
        if (tropPercu > 0) {
          const avoirMontant = Math.min(tropPercu, montantAvoir);
          const raison = isPartialStageUnenroll
            ? `Désinscription partielle ${child.childName} — ${c.activityTitle} (${new Date(c.date).toLocaleDateString("fr-FR")})`
            : `Désinscription ${child.childName} — ${c.activityTitle}`;
          const ref = await createAvoir(child.familyId, child.familyName, avoirMontant,
            raison, paymentDoc.id, "desinscription");
          const toastMsg = isPartialStageUnenroll
            ? `${child.childName} désinscrit(e) du ${new Date(c.date).toLocaleDateString("fr-FR")} — Avoir au prorata : ${avoirMontant.toFixed(2)}€`
            : `${child.childName} désinscrit(e)${isStageType ? ` (${nbJours} jours)` : ""} — Avoir : ${avoirMontant.toFixed(2)}€`;
          toast(toastMsg, "success");
          // Email notification avoir
          const fam2 = families.find(f => f.firestoreId === child.familyId);
          if (fam2?.parentEmail) {
            try {
              const emailData = emailTemplates.desinscriptionAvoir({
                parentName: fam2.parentName || "", childName: child.childName,
                activite: isPartialStageUnenroll ? `${c.activityTitle} (${new Date(c.date).toLocaleDateString("fr-FR")})` : c.activityTitle,
                montantAvoir: avoirMontant, refAvoir: ref,
              });
              authFetch("/api/send-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: fam2.parentEmail,
                  ...emailData,
                  context: "admin_desinscription_avoir",
                  template: "desinscriptionAvoir",
                  familyId: fam2.firestoreId,
                  paymentId: paymentDoc.id,
                  creneauId: cid,
                }),
              }).catch(e => console.warn("Email avoir:", e));
            } catch (e) { console.error("Email avoir:", e); }
          }
        } else {
          toast(`${child.childName} désinscrit(e)${isStageType ? (isPartialStageUnenroll ? " (1 jour)" : ` (${nbJours} jours)`) : ""} — Paiement ajusté`, "success");
        }
      } else {
        toast(`${child.childName} désinscrit(e)${isStageType ? (isPartialStageUnenroll ? " (1 jour)" : ` (${nbJours} jours)`) : ""}`, "success");
      }
    } else {
      toast(`${child.childName} désinscrit(e)${isStageType ? (isPartialStageUnenroll ? " (1 jour)" : ` (${nbJours} jours)`) : ""}`, "success");
    }

    // ── Nettoyage : annuler tous les paiements pending orphelins ──────────
    // (cas où l'enfant a été inscrit/désinscrit plusieurs fois)
    try {
      const allPaysSnap = await getDocs(query(
        collection(db, "payments"),
        where("familyId", "==", child.familyId),
        where("status", "==", "pending"),
      ));
      for (const pd of allPaysSnap.docs) {
        const pdata = pd.data();
        // Si ce paiement pending concerne cet enfant + cette activité
        const hasItem = (pdata.items || []).some((i: any) =>
          i.childId === childId &&
          (i.activityTitle?.includes(c.activityTitle) || c.activityTitle.includes(i.activityTitle || ""))
        );
        if (hasItem && pd.id !== linked?.paymentDoc?.id) {
          await updateDoc(doc(db, "payments", pd.id), {
            status: "cancelled", cancelledAt: serverTimestamp(),
            cancelReason: `Nettoyage désinscription ${child.childName}`, updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) { console.error("Nettoyage paiements orphelins:", e); }
  } catch (e) {
    console.error("Erreur gestion paiement/avoir:", e);
    toast(`${child.childName} désinscrit(e) — erreur ajustement paiement`, "warning");
  }

  // ── Waitlist automatique : notifier le premier en attente si place libérée ──
  try {
    const freshCSnap = await getDoc(doc(db, "creneaux", cid));
    if (freshCSnap.exists()) {
      const freshC = freshCSnap.data() as any;
      const placesLibres = (freshC.maxPlaces || 0) - (freshC.enrolledCount || (freshC.enrolled || []).length);
      if (placesLibres > 0) {
        // Entrées « cours » (creneauId) + entrées « stage » (creneauIds
        // contient tous les jours de la semaine). Statut filtré en mémoire
        // côté array-contains : évite un nouvel index composite.
        const [waitById, waitByDays] = await Promise.all([
          getDocs(query(
            collection(db, "waitlist"),
            where("creneauId", "==", cid),
            where("status", "==", "waiting"),
          )),
          getDocs(query(collection(db, "waitlist"), where("creneauIds", "array-contains", cid))),
        ]);
        const waitMap = new Map<string, any>();
        waitById.docs.forEach(d => waitMap.set(d.id, { id: d.id, ...d.data() }));
        waitByDays.docs.forEach(d => {
          const data = d.data() as any;
          if (data.status === "waiting") waitMap.set(d.id, { id: d.id, ...data });
        });
        const waiting = [...waitMap.values()]
          .sort((a: any, b: any) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

        // ── Règle métier : une attente de STAGE ne se notifie que si la
        // SEMAINE ENTIÈRE redevient disponible. Sur un stage ouvert à la
        // journée, la libération d'un seul jour ne doit prévenir personne :
        // ces cas sont traités manuellement. Prévenir une famille pour une
        // place qu'elle ne peut pas prendre serait pire que se taire.
        const eligibles: any[] = [];
        for (const w of waiting) {
          const jours: string[] = Array.isArray(w.creneauIds) ? w.creneauIds : [];
          // Entrée « cours » (ou stage d'un seul jour) : comportement inchangé.
          if (!w.isStage || jours.length <= 1) { eligibles.push(w); continue; }
          const snaps = await Promise.all(jours.map(id => getDoc(doc(db, "creneaux", id))));
          const semaineLibre = snaps.every(sn => {
            if (!sn.exists()) return false;
            const d = sn.data() as any;
            return ((d.maxPlaces || 0) - (d.enrolledCount || (d.enrolled || []).length)) > 0;
          });
          if (semaineLibre) eligibles.push(w);
        }

        if (eligibles.length > 0) {
          const first = eligibles[0] as any;
          // ── Réserver la place 24h pour cette famille (hold) ──
          // Pendant 24h, cette place n'est plus proposée aux autres familles
          // côté client. Le hold expire automatiquement (vérifié à la lecture)
          // ou disparaît dès que l'enfant concerné est inscrit.
          const holdUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const hold = {
            familyId: first.familyId, childId: first.childId,
            childName: first.childName, until: holdUntil,
            waitlistEntryId: first.id,
          };
          // Stage : on réserve TOUS les jours de la semaine, sinon une autre
          // famille pourrait prendre le mercredi pendant les 24h accordées.
          const joursHold: string[] = first.isStage && Array.isArray(first.creneauIds) && first.creneauIds.length > 1
            ? first.creneauIds
            : [cid];
          await Promise.all(joursHold.map(id => updateDoc(doc(db, "creneaux", id), { waitlistHold: hold })));
          authFetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: first.familyEmail,
              subject: `Une place s'est libérée — ${c.activityTitle}`,
              context: "admin_place_liberee",
              template: "placeLibereeNotif",
              familyId: first.familyId,
              creneauId: cid,
              html: emailLayout([
                emailTitre("Une place s'est libérée"),
                P(`Bonjour <strong>${first.familyName}</strong>,`),
                P(`Une place s'est libérée pour <strong>${first.childName}</strong>.`),
                emailPanneau(c.activityTitle, [
                  emailLigne(first.isStage && first.dateFin && first.dateFin !== first.date ? "Dates" : "Date",
                    first.isStage && first.dateFin && first.dateFin !== first.date
                      ? `du ${new Date(first.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} au ${new Date(first.dateFin).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${first.nbJours ? ` (${first.nbJours} jours)` : ""}`
                      : new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })),
                  emailLigne("Horaire", `${c.startTime}–${c.endTime}`),
                ].join("")),
                P(`<strong>Cette place vous est réservée pendant 24 h</strong>, jusqu'au ${new Date(holdUntil).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} à ${new Date(holdUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Passé ce délai, elle sera proposée aux autres familles.`),
                emailButton("Confirmer l'inscription", `${typeof window !== "undefined" ? window.location.origin : "https://centre-equestre-agon.vercel.app"}/espace-cavalier/reserver?creneau=${encodeURIComponent(cid)}`),
                P("Un souci pour réserver en ligne, ou une question ? Appelez-nous au <strong>02 44 84 99 96</strong> ou répondez à ce message — nous prendrons l'inscription avec vous.", 13),
                encadreConditionsPourType(c.activityType),
                emailSignature(),
              ].join("\n"), `Place disponible — ${c.activityTitle}`),
            }),
          }).catch(() => {});
          await updateDoc(doc(db, "waitlist", first.id), { status: "notified", notifiedAt: new Date().toISOString(), holdUntil });
          toast(`🔔 ${first.childName} (liste d'attente) notifié(e) — ${first.isStage ? "semaine" : "place"} réservée 24h`, "success");
        }
      }
    }
  } catch (e) { console.error("Erreur waitlist auto:", e); }

  const fresh = await refreshCreneaux();
  const upd = fresh.find(x => x.id === cid);
  if (upd) setSelectedCreneau(upd);
};
