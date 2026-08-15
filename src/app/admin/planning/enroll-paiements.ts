/**
 * src/app/admin/planning/enroll-paiements.ts
 *
 * Les écritures d'ARGENT déclenchées par une inscription : le panier d'un
 * stage, et la création d'un forfait annuel avec son échéancier.
 *
 * Pourquoi ce fichier existe : ce sont les seules opérations du panneau qui
 * créent des documents facturables. Les isoler permet de les lire d'un bout à
 * l'autre — quel document part, dans quel ordre, avec quel montant — sans les
 * chercher au milieu de la gestion de formulaire. Elles ne touchent aucun
 * état React : tout ce dont elles ont besoin leur est passé, tout ce qu'elles
 * apprennent est rendu à l'appelant.
 *
 * Règles à ne pas défaire :
 *  - PANIER UNIQUE par famille : on fusionne dans la commande ouverte la plus
 *    récente plutôt que d'empiler les commandes ; les échéances de forfait
 *    (echeancesTotal > 1) sont explicitement exclues de cette fusion, sinon
 *    un stage viendrait s'ajouter à une mensualité déjà planifiée ;
 *  - un forfait payé par prélèvement SEPA EXIGE un mandat actif : sans mandat,
 *    on abandonne AVANT d'avoir rien écrit, plutôt que de créer un échéancier
 *    que personne ne prélèvera jamais ;
 *  - le stageKey est STABLE (titre + premier jour du stage) : il ne dépend pas
 *    du jour sur lequel l'admin a cliqué, sans quoi deux stages homonymes de
 *    deux semaines différentes finiraient par se confondre au paiement.
 */

import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateOrderId } from "@/lib/utils";
import { authFetch } from "@/lib/auth-fetch";
import { formatStageSchedule } from "@/lib/format-stage";
import { fmtDate } from "./types";
import { slotKeyDuCreneau } from "./enroll-helpers";
import type { ParametresInscription } from "./enroll-constantes";

/**
 * Constitue (ou complète) la commande d'un stage pour une famille, et envoie
 * le lien de paiement de l'acompte le cas échéant.
 */
export async function constituerPanierStage(params: {
  creneau: any;
  fam: any;
  stageLines: any[];
  creneauxAInscrire: any[];
  stageKey: string;
  assuranceOccasionnelle: boolean;
  inscParams: ParametresInscription;
  ACOMPTE_PAR_ENFANT: number;
  stageTotalTTC: number;
  showAcompte: boolean;
  stageAcompte: number;
  stageSolde: number;
}): Promise<void> {
  const {
    creneau, fam, stageLines, creneauxAInscrire, stageKey, assuranceOccasionnelle,
    inscParams, ACOMPTE_PAR_ENFANT, stageTotalTTC, showAcompte, stageAcompte, stageSolde,
  } = params;
  // Ajouter les lignes au panier de la famille (1 seul paiement pending)
  const scheduleDesc = formatStageSchedule(creneauxAInscrire);
  const newItems = stageLines.map(l => ({
    activityTitle: `${creneau.activityTitle} (${creneauxAInscrire.length}j) — ${l.childName}${l.remiseEuros > 0 ? ` (-${l.remiseEuros}€)` : ""}`,
    childId: l.childId, childName: l.childName,
    stageKey, // ← maintenant STABLE (avant : dépendait du créneau cliqué)
    activityType: creneau.activityType,
    stageSchedule: scheduleDesc,
    stageDates: creneauxAInscrire.map(c => ({ date: c.date, startTime: c.startTime, endTime: c.endTime })),
    priceHT: l.prixReduit / 1.055, tva: 5.5, priceTTC: l.prixReduit,
  }));

  // Assurance occasionnelle si cochée
  if (assuranceOccasionnelle) {
    for (const line of stageLines) {
      newItems.push({
        activityTitle: `Assurance occasionnelle 1 mois — ${line.childName}`,
        childId: line.childId, childName: line.childName,
        stageKey: `${creneau.activityTitle}_${creneau.date}`,
        activityType: "option",
        stageSchedule: "",
        stageDates: [],
        priceHT: inscParams.assuranceOccasionnelle / 1.2, tva: 20,
        priceTTC: inscParams.assuranceOccasionnelle,
      });
    }
  }

  // Chercher un paiement pending existant pour cette famille (PANIER UNIQUE)
  const existingSnap = await getDocs(query(
    collection(db, "payments"),
    where("familyId", "==", fam.firestoreId),
    where("status", "==", "pending"),
  ));

  // Prendre la commande ouverte la plus récente — EXCLURE les échéances de forfait
  const pendingDocs = existingSnap.docs
    .filter(d => !(d.data().echeancesTotal > 1))
    .sort((a, b) => {
      const da = a.data().date?.seconds || 0;
      const db2 = b.data().date?.seconds || 0;
      return db2 - da;
    });
  if (pendingDocs.length > 1) {
    console.warn(`⚠️ ${pendingDocs.length} commandes pending pour famille ${fam.firestoreId} — fusion dans la plus récente`);
  }
  const openOrder = pendingDocs.length > 0 ? pendingDocs[0] : null;

  if (openOrder) {
    // Fusionner avec la commande existante
    const existingData = openOrder.data();
    const mergedItems = [...(existingData.items || []), ...newItems];
    const mergedTotal = mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);

    await updateDoc(doc(db, "payments", openOrder.id), {
      items: mergedItems,
      totalTTC: Math.round(mergedTotal * 100) / 100,
      stageDate: existingData.stageDate || creneauxAInscrire[0]?.date || creneau.date,
      stageTitle: existingData.stageTitle || creneau.activityTitle,
      familyEmail: existingData.familyEmail || fam.parentEmail || "",
      acompteAmount: ACOMPTE_PAR_ENFANT * (mergedItems.filter((i: any) => i.activityType === "stage" || i.activityType === "stage_journee").length || stageLines.length),
      soldeAmount: Math.round((mergedTotal - ACOMPTE_PAR_ENFANT * (mergedItems.filter((i: any) => i.activityType === "stage" || i.activityType === "stage_journee").length || stageLines.length)) * 100) / 100,
      updatedAt: serverTimestamp(),
    });
  } else {
    // Créer une nouvelle commande stage avec infos acompte
    const newPayRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
      familyId: fam.firestoreId,
      familyName: fam.parentName || "",
      familyEmail: fam.parentEmail || "",
      items: newItems,
      totalTTC: stageTotalTTC,
      paymentMode: "",
      paymentRef: "",
      status: "pending",
      paidAmount: 0,
      stageDate: creneauxAInscrire[0]?.date || creneau.date,
      stageTitle: creneau.activityTitle,
      ...(showAcompte ? { acompteAmount: stageAcompte, soldeAmount: stageSolde } : {}),
      date: serverTimestamp(),
    });

    // Envoyer automatiquement le lien de paiement pour l'acompte
    if (showAcompte && fam.parentEmail) {
      authFetch("/api/send-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: newPayRef.id,
          recipientEmail: fam.parentEmail,
          amount: stageAcompte,
          familyId: fam.firestoreId,
          familyName: fam.parentName || "",
          message: `Bonjour,\n\nVoici le lien de paiement pour l'acompte du stage "${creneau.activityTitle}" (${stageAcompte}€).\n\nLe solde de ${stageSolde}€ vous sera demandé 7 jours avant le stage.`,
        }),
      }).catch(e => console.warn("Lien paiement acompte:", e));
    }
  }
}

/**
 * Crée le forfait annuel du cavalier, ses items de facturation et le paiement
 * (ou l'échéancier, ou les prélèvements SEPA) correspondant.
 *
 * Rend `abandon: true` quand le mode SEPA a été choisi sans mandat actif :
 * l'appelant doit alors interrompre l'inscription.
 */
export async function creerForfaitEtPaiementAnnuel(params: {
  creneau: any;
  fam: any;
  selChild: string;
  childName: string;
  quinzaine: boolean;
  semainePaire: boolean;
  sessionsRestantes: number;
  totalSessionsSaison: number;
  licence: boolean;
  licenceType: "moins18" | "plus18";
  adhesion: boolean;
  prixForfaitAnnuel: number;
  prorata: number;
  totalAnnuel: number;
  payPlan: "1x" | "3x" | "10x";
  frequenceCours: 1 | 2 | 3;
  ajoutHeureAdmin: boolean;
  freqCumuleeAdmin: number;
  frequenceDejaInscrite: number;
  rangEnfantFamille: number;
  prixAdhesionDegressif: number;
  prixLicence: number;
  prixForfait: number;
  extraSlots: string[];
  familyDiscountAmount: number;
  familyDiscountPercent: number;
  annualPayMode: string;
  dayNames: string[];
  panelToast: (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;
}): Promise<{ abandon: boolean; createdPaymentIds: string[] }> {
  const {
    creneau, fam, selChild, childName, quinzaine, semainePaire, sessionsRestantes,
    totalSessionsSaison, licence, licenceType, adhesion, prixForfaitAnnuel, prorata,
    totalAnnuel, payPlan, frequenceCours, ajoutHeureAdmin, freqCumuleeAdmin,
    frequenceDejaInscrite, rangEnfantFamille, prixAdhesionDegressif, prixLicence,
    prixForfait, extraSlots, familyDiscountAmount, familyDiscountPercent,
    annualPayMode, dayNames, panelToast,
  } = params;
  const createdPaymentIds: string[] = [];
  try {
    const slotKey = slotKeyDuCreneau(creneau);
    await addDoc(collection(db, "forfaits"), {
      familyId: fam.firestoreId,
      familyName: fam.parentName || "",
      childId: selChild,
      childName,
      slotKey,
      activityTitle: creneau.activityTitle,
      dayLabel: new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" }),
      startTime: creneau.startTime,
      endTime: creneau.endTime,
      totalSessions: quinzaine ? Math.ceil(sessionsRestantes / 2) : sessionsRestantes,
      // Rythme : "hebdo" par défaut, "quinzaine" pour une semaine sur deux.
      // semainePaire indique les semaines concernées (numéro ISO).
      rythme: quinzaine ? "quinzaine" : "hebdo",
      ...(quinzaine ? { semainePaire } : {}),
      totalSessionsSaison,
      attendedSessions: 0,
      licenceFFE: licence,
      licenceType,
      adhesion,
      prixForfaitAnnuel,
      prorata: Math.round(prorata * 100),
      forfaitPriceTTC: totalAnnuel,
      totalPaidTTC: 0,
      paymentPlan: payPlan,
      status: "actif",
      frequence: frequenceCours,
      // Forfait "complément" : heures ajoutées à un forfait existant la
      // même saison (facturé au différentiel), aligné sur l'espace famille.
      ...(ajoutHeureAdmin ? { complement: true, frequenceDejaInscrite } : {}),
      // Saison FFE du forfait (1er sept Y → 30 juin Y+1).
      // Déduite de la date du créneau cliqué : si mois >= sept,
      // saison Y/Y+1 → on stocke Y. Sinon (janv-août), Y-1/Y → Y-1.
      // Permet de filtrer rangEnfantFamille par saison côté admin
      // pour ne pas confondre forfaits saison passée et saison nouvelle.
      seasonStartYear: (() => {
        const d = new Date(creneau.date);
        return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
      })(),
      createdAt: serverTimestamp(),
    });
    // Créer les items pour cet enfant
    const items: any[] = [];
    if (adhesion) items.push({ activityTitle: `Adhésion annuelle (enfant ${rangEnfantFamille})`, childId: selChild, childName, priceHT: prixAdhesionDegressif / 1.055, tva: 5.5, priceTTC: prixAdhesionDegressif });
    if (licence) items.push({ activityTitle: `Licence FFE ${licenceType === "moins18" ? "-18ans" : "+18ans"}`, childId: selChild, childName, priceHT: prixLicence, tva: 0, priceTTC: prixLicence });
    // Créneau principal
    items.push({ activityTitle: ajoutHeureAdmin ? `Forfait — heure suppl. (${frequenceDejaInscrite}×→${freqCumuleeAdmin}×/sem) — ${creneau.activityTitle} (${slotKey})` : `Forfait ${creneau.activityTitle} (${slotKey})`, childId: selChild, childName, creneauId: creneau.id, activityType: creneau.activityType, priceHT: prixForfait / 1.055, tva: 5.5, priceTTC: prixForfait });
    // Créneaux supplémentaires (2ème, 3ème)
    for (const esKey of extraSlots) {
      const firstDash = esKey.indexOf("-");
      const secondDash = esKey.indexOf("-", firstDash + 1);
      const esDow = parseInt(esKey.substring(0, firstDash));
      const esTime = esKey.substring(firstDash + 1, secondDash);
      const esTitle = esKey.substring(secondDash + 1);
      const esSlotLabel = `${esTitle} — ${dayNames[esDow]} ${esTime}`;
      items.push({ activityTitle: `Forfait ${esTitle} (${esSlotLabel})`, childId: selChild, childName, activityType: creneau.activityType, priceHT: 0, tva: 5.5, priceTTC: 0 });
    }
    // Ligne de réduction famille si applicable
    if (familyDiscountAmount > 0) {
      items.push({ activityTitle: `Réduction famille (${rangEnfantFamille}ème enfant, -${familyDiscountPercent}%)`, childId: selChild, childName, priceHT: -familyDiscountAmount / 1.055, tva: 5.5, priceTTC: -familyDiscountAmount });
    }

    // Chercher un paiement annuel pending existant pour cette famille (pour regrouper la fratrie)
    const existingPaySnap = await getDocs(query(
      collection(db, "payments"),
      where("familyId", "==", fam.firestoreId),
      where("status", "==", "pending"),
    ));
    // Trouver un paiement forfait annuel non échelonné (écheance 1 ou pas d'écheance)
    const existingForfaitPay = existingPaySnap.docs.find(d => {
      const data = d.data();
      return (data.items || []).some((i: any) => i.activityTitle?.includes("Forfait")) &&
        (!data.echeancesTotal || data.echeancesTotal <= 1) &&
        (!data.echeance || data.echeance <= 1);
    });

    if (existingForfaitPay && payPlan === "1x") {
      // Ajouter les items à la commande existante
      const existingData = existingForfaitPay.data();
      const mergedItems = [...(existingData.items || []), ...items];
      const newTotal = mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);
      await updateDoc(doc(db, "payments", existingForfaitPay.id), {
        items: mergedItems,
        totalTTC: Math.round(newTotal * 100) / 100,
        updatedAt: serverTimestamp(),
      });
      createdPaymentIds.push(existingForfaitPay.id);
      console.log(`📋 Items ajoutés à la commande existante ${existingForfaitPay.id} (${newTotal.toFixed(2)}€)`);
    } else {
      // Créer une nouvelle commande (ou paiement échelonné)
      const nbEcheances = payPlan === "10x" ? 10 : payPlan === "3x" ? 3 : 1;
      const montantEcheance = Math.round((totalAnnuel / nbEcheances) * 100) / 100;
      const montantDerniereEcheance = Math.round((totalAnnuel - montantEcheance * (nbEcheances - 1)) * 100) / 100;

      if (annualPayMode === "prelevement_sepa") {
        // ── Mode SEPA : chercher le mandat actif, créer dans echeances-sepa ──
        const mandatSnap = await getDocs(query(
          collection(db, "mandats-sepa"),
          where("familyId", "==", fam.firestoreId),
          where("status", "==", "active")
        ));
        if (mandatSnap.empty) {
          panelToast("⚠️ Aucun mandat SEPA actif pour cette famille. Créez-en un dans Prélèvements SEPA.", "error");
          // Abandon AVANT toute écriture : l'appelant remet le bouton en état.
          return { abandon: true, createdPaymentIds };
        }
        const mandatData = mandatSnap.docs[0].data();
        const orderId = generateOrderId();
        for (let i = 0; i < nbEcheances; i++) {
          const echeanceDate = new Date();
          echeanceDate.setMonth(echeanceDate.getMonth() + i);
          const montant = i === nbEcheances - 1 ? montantDerniereEcheance : montantEcheance;
          await addDoc(collection(db, "echeances-sepa"), {
            familyId: fam.firestoreId,
            familyName: fam.parentName || "",
            mandatId: mandatData.mandatId,
            montant,
            dateEcheance: fmtDate(echeanceDate),
            status: "pending",
            reference: "",
            description: `Forfait ${creneau.activityTitle} — ${childName} — ${i + 1}/${nbEcheances}`,
            remiseId: null,
            paymentId: null,
            orderId,
            echeance: i + 1,
            echeancesTotal: nbEcheances,
            forfaitRef: slotKey,
            createdAt: serverTimestamp(),
          });
        }
        // Créer un paiement de référence (informatif uniquement — géré via module SEPA)
        const docRef = await addDoc(collection(db, "payments"), {
          orderId,
          familyId: fam.firestoreId,
          familyName: fam.parentName || "",
          items,
          totalTTC: totalAnnuel,
          paymentMode: "prelevement_sepa",
          paymentRef: `${nbEcheances}× SEPA · ${mandatData.mandatId}`,
          status: "sepa_scheduled",
          paidAmount: 0,
          echeance: 1,
          echeancesTotal: nbEcheances,
          echeanceDate: fmtDate(new Date()),
          forfaitRef: slotKey,
          date: serverTimestamp(),
        });
        createdPaymentIds.push(docRef.id);
      } else {
        for (let i = 0; i < nbEcheances; i++) {
          const echeanceDate = new Date();
          echeanceDate.setMonth(echeanceDate.getMonth() + i);
          const montant = i === nbEcheances - 1 ? montantDerniereEcheance : montantEcheance;

          const docRef = await addDoc(collection(db, "payments"), { orderId: generateOrderId(),
            familyId: fam.firestoreId,
            familyName: fam.parentName || "",
            items: i === 0 ? items : [{ activityTitle: `Échéance ${i + 1}/${nbEcheances} — ${childName}`, childId: selChild, childName, priceHT: montant / 1.055, tva: 5.5, priceTTC: montant }],
            totalTTC: montant,
            paymentMode: annualPayMode,
            paymentRef: "",
            status: "pending",
            paidAmount: 0,
            echeance: i + 1,
            echeancesTotal: nbEcheances,
            echeanceDate: fmtDate(echeanceDate),
            forfaitRef: slotKey,
            date: serverTimestamp(),
          });
          createdPaymentIds.push(docRef.id);
        }
      }
    }
  } catch (e) { console.error(e); }
  return { abandon: false, createdPaymentIds };
}
