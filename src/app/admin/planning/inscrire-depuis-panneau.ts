"use client";

/**
 * src/app/admin/planning/inscrire-depuis-panneau.ts
 *
 * Ce que le bouton « Inscrire » du panneau de planning déclenche réellement :
 * commande, encaissement, carte de séances, forfait annuel, acompte de stage,
 * pré-inscription, courriels de confirmation.
 *
 * Neuf cent cinquante lignes qui décident de ce qui est facturé et de ce qui
 * part aux familles, écrites au milieu d'un composant de formulaire. Elles
 * sont ici, et surtout : ce dont elles dépendent est écrit noir sur blanc.
 *
 * Les quatre-vingt-cinq entrées ci-dessous ne sont pas une élégance, c'est un
 * constat — c'est exactement ce que la décision d'inscrire consulte
 * aujourd'hui. Les voir listées est le premier pas pour les réduire.
 *
 * Rien du traitement n'a changé : le corps est repris tel quel.
 */

/**
 * Tout ce que l'inscription lit du formulaire et de l'écran, et tout ce
 * qu'elle remet à zéro une fois l'inscription faite.
 */
import {
  collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { generateOrderId } from "@/lib/utils";
import { enregistrerEncaissement } from "@/lib/encaissement";
import { formatStageSchedule } from "@/lib/format-stage";
import { horairesStage } from "@/lib/email-prestations";
import { estSemaineAttendue, formatFrequence } from "@/lib/rythme";
import { ACOMPTE_PAR_ENFANT } from "@/lib/panier-reservation";
import { fmtDate, sameStage, type Creneau } from "./types";
import { programmerEnvoiConfirmation } from "./minuteries-confirmation";
import { verrouCommande } from "@/app/admin/paiements/commande-verrou";

export interface ContexteInscriptionPanneau {
  children: any[];
  panelToast: any;
  acompteMode: any;
  acompteRef: any;
  acompteReglement: any;
  adhesion: any;
  ajoutHeureAdmin: any;
  allCreneaux: any[];
  annualPayMode: any;
  assuranceOccasionnelle: any;
  checkAndAlertIfFull: any;
  compCoaching: any;
  compEpreuves: any[];
  conversion: any;
  creneau: any;
  dateFinSaisonEffective: any;
  extraSlots: string[];
  fam: any;
  familyDiscountAmount: any;
  familyDiscountPercent: any;
  freeEnroll: any;
  freeReason: any;
  freqCumuleeAdmin: any;
  frequenceCours: any;
  frequenceDejaInscrite: any;
  inscParams: any;
  inscriptionMode: any;
  isCompetition: any;
  isStage: any;
  licence: any;
  licenceType: any;
  onEnroll: any;
  onRefresh: any;
  payMode: any;
  payPlan: any;
  payments: any[];
  preinscription: any;
  priceTTC: any;
  prixAdhesionDegressif: any;
  prixForfait: any;
  prixForfaitAnnuel: any;
  prixLicence: any;
  prorata: any;
  quinzaine: any;
  rangEnfantFamille: any;
  remiseBaremePercent: any;
  remiseHorsBareme: any;
  remiseMotif: any;
  selChild: any;
  selectedChildren: string[];
  semainePaire: any;
  sessionsRestantes: any;
  showAcompte: any;
  showPay: any;
  stageAcompte: any;
  stageLines: any[];
  stageMode: any;
  stageSolde: any;
  stageTotalTTC: any;
  status: any;
  totalAnnuel: any;
  totalSessionsSaison: any;
  useRattrapage: any;
  weekCreneaux: any[];
  setAnnualPayMode: any;
  setConfirmationEnAttente: any;
  setEditRemise: any;
  setEnrolling: any;
  setEnvoiConfirmation: any;
  setExtraSlotSearch: any;
  setExtraSlots: any;
  setFreeEnroll: any;
  setFreeReason: any;
  setInscriptionFaite: any;
  setInscriptionMode: any;
  setJustEnrolled: any;
  setPreinscription: any;
  setRemiseMotif: any;
  setRemisePctManuel: any;
  setSearch: any;
  setSelChild: any;
  setSelFam: any;
  setSelectedChildren: any;
  setShowAddDays: any;
  setShowPay: any;
  setUseRattrapage: any;
}

export async function inscrireDepuisPanneau(ctx: ContexteInscriptionPanneau) {
  const {
    children,
    panelToast,
    acompteMode,
    acompteRef,
    acompteReglement,
    adhesion,
    ajoutHeureAdmin,
    allCreneaux,
    annualPayMode,
    assuranceOccasionnelle,
    checkAndAlertIfFull,
    compCoaching,
    compEpreuves,
    conversion,
    creneau,
    dateFinSaisonEffective,
    extraSlots,
    fam,
    familyDiscountAmount,
    familyDiscountPercent,
    freeEnroll,
    freeReason,
    freqCumuleeAdmin,
    frequenceCours,
    frequenceDejaInscrite,
    inscParams,
    inscriptionMode,
    isCompetition,
    isStage,
    licence,
    licenceType,
    onEnroll,
    onRefresh,
    payMode,
    payPlan,
    payments,
    preinscription,
    priceTTC,
    prixAdhesionDegressif,
    prixForfait,
    prixForfaitAnnuel,
    prixLicence,
    prorata,
    quinzaine,
    rangEnfantFamille,
    remiseBaremePercent,
    remiseHorsBareme,
    remiseMotif,
    selChild,
    selectedChildren,
    semainePaire,
    sessionsRestantes,
    showAcompte,
    showPay,
    stageAcompte,
    stageLines,
    stageMode,
    stageSolde,
    stageTotalTTC,
    status,
    totalAnnuel,
    totalSessionsSaison,
    useRattrapage,
    weekCreneaux,
    setAnnualPayMode,
    setConfirmationEnAttente,
    setEditRemise,
    setEnrolling,
    setEnvoiConfirmation,
    setExtraSlotSearch,
    setExtraSlots,
    setFreeEnroll,
    setFreeReason,
    setInscriptionFaite,
    setInscriptionMode,
    setJustEnrolled,
    setPreinscription,
    setRemiseMotif,
    setRemisePctManuel,
    setSearch,
    setSelChild,
    setSelFam,
    setSelectedChildren,
    setShowAddDays,
    setShowPay,
    setUseRattrapage,
  } = ctx;

  // Mode non-stage, non-compétition, ponctuel, 2+ enfants sélectionnés :
  // inscrire un par un avec un paiement séparé par enfant (plus simple pour
  // les avoirs/remboursements individuels).
  if (!isStage && !isCompetition && inscriptionMode === "ponctuel" && selectedChildren.length > 1 && fam) {
    setEnrolling(true);
    try {
      const childrenToEnroll = selectedChildren
        .map(cid => children.find((c: any) => c.id === cid))
        .filter(Boolean) as any[];

      const freeEnrollOptions = freeEnroll ? { freeReason, skipEmail: false } : undefined;
      const encaisseEnsemble = showPay && !freeEnroll && !useRattrapage && !preinscription;
      // Encaissement immédiat de plusieurs cavaliers : on inscrit SANS mode de
      // paiement, ce qui fait tomber tous les enfants dans la même commande
      // (fusion des impayés récents de la famille), puis on encaisse cette
      // commande une seule fois. Sinon chaque enfant produisait sa facture et
      // son encaissement : deux lignes de 57€ au journal pour une seule
      // transaction CB de 114€, que le rapprochement bancaire ne retrouve pas
      // (le match par combinaison est désactivé, cf. comptabilité).
      const payModeToUse = encaisseEnsemble
        ? undefined
        : (showPay && !freeEnroll && !useRattrapage ? payMode : undefined);

      const enrolledNames: string[] = [];
      const commandeIds = new Set<string>();
      for (const child of childrenToEnroll) {
        const firstName = child.firstName || "—";
        const lastName = child.lastName || "";
        const childName = lastName ? `${firstName} ${lastName}` : firstName;
        try {
          const resultat = await onEnroll(
            creneau.id!,
            {
              childId: child.id,
              childName,
              familyId: fam.firestoreId,
              familyName: fam.parentName || "—",
              enrolledAt: new Date().toISOString(),
              ...(preinscription ? { preinscription: true } : {}),
            } as any,
            preinscription ? undefined : payModeToUse,
            preinscription ? { skipPayment: true, skipEmail: true } : freeEnrollOptions,
          );
          if (typeof resultat === "string" && resultat) commandeIds.add(resultat);
          enrolledNames.push(firstName);
        } catch (err) {
          console.error(`[EnrollPanel] échec inscription ${firstName}:`, err);
          panelToast(`Erreur inscription ${firstName}`, "error");
        }
      }

      // Un seul règlement pour toute la commande : une ligne au journal, du
      // montant réellement passé sur le terminal.
      let encaisseOk = true;
      if (encaisseEnsemble && enrolledNames.length > 0) {
        if (commandeIds.size !== 1) {
          // Les enfants ne se sont pas retrouvés sur la même commande (fenêtre
          // de fusion dépassée, échec partiel). On ne devine pas : la commande
          // reste en impayé, à encaisser depuis Paiements.
          encaisseOk = false;
          console.warn(`[EnrollPanel] ${commandeIds.size} commande(s) pour ${enrolledNames.length} cavaliers — encaissement groupé abandonné`);
        } else {
          const paymentId = [...commandeIds][0];
          try {
            const paySnap = await getDoc(doc(db, "payments", paymentId));
            if (!paySnap.exists()) throw new Error("commande introuvable");
            const pData = paySnap.data() as any;

            // On encaisse ce qui vient d'être inscrit, PAS le total de la
            // commande : les impayés récents de la famille sont fusionnés
            // dans la même commande (fenêtre de 7 jours), et encaisser son
            // total prélèverait une dette antérieure que le terminal n'a pas
            // vue. Les lignes sont relues en base pour tenir compte des
            // remises appliquées à l'inscription.
            const childIds = new Set(childrenToEnroll.map(c => c.id));
            const montantInscrit = (pData.items || [])
              .filter((i: any) => i.creneauId === creneau.id && childIds.has(i.childId))
              .reduce((s: number, i: any) => s + (Number(i.priceTTC) || 0), 0);
            const restantDu = Math.round(((Number(pData.totalTTC) || 0) - (Number(pData.paidAmount) || 0)) * 100) / 100;
            // Jamais plus que ce qui reste dû sur la commande.
            const aEncaisser = Math.round(Math.min(montantInscrit, restantDu) * 100) / 100;
            if (aEncaisser <= 0) throw new Error("montant à encaisser nul");

            await enregistrerEncaissement(
              paymentId,
              pData,
              aEncaisser,
              payMode,
              "",
              creneau.activityTitle,
            );
          } catch (e) {
            encaisseOk = false;
            console.error("[EnrollPanel] encaissement groupé:", e);
            panelToast("Inscriptions créées, mais l'encaissement a échoué — à encaisser depuis Paiements", "error");
          }
        }
      }

      const totalEncaisse = priceTTC * enrolledNames.length;
      const payInfo = freeEnroll ? ` — 🎁 offert (${freeReason})`
        : encaisseEnsemble ? (encaisseOk ? ` — encaissé ✅ ${totalEncaisse.toFixed(2)}€` : " — à encaisser")
        : showPay ? " — encaissé ✅"
        : priceTTC > 0 ? " — paiement(s) en attente" : "";
      setJustEnrolled(`${enrolledNames.length} cavalier${enrolledNames.length > 1 ? "s" : ""} inscrit${enrolledNames.length > 1 ? "s" : ""} : ${enrolledNames.join(", ")}${payInfo}`);
      if (encaisseOk) {
        panelToast(`${enrolledNames.length} inscription${enrolledNames.length > 1 ? "s" : ""} créée${enrolledNames.length > 1 ? "s" : ""} — ${totalEncaisse.toFixed(2)}€ au total`, "success");
      }
      // Alerter si le creneau passe complet apres la salve d'inscriptions
      await checkAndAlertIfFull([creneau.id!]);
    } finally {
      setSelChild(""); setSelectedChildren([]); setSelFam(""); setSearch("");
      setEnrolling(false); setShowPay(false); setFreeEnroll(false); setFreeReason("Rattrapage");
      setUseRattrapage(null); setInscriptionMode("ponctuel");
      setTimeout(() => setJustEnrolled(""), 5000);
    }
    return;
  }

  // Mode stage : inscription multi-enfants
  if (isStage && selectedChildren.length > 0 && fam) {
    setEnrolling(true);
    try {
      // Trouver les créneaux à inscrire selon le mode choisi
      let creneauxAInscrire = [creneau];
      if (stageMode === "semaine") {
        const creneauDate = new Date(creneau.date);
        const dayOfWeek = creneauDate.getDay();
        const monday = new Date(creneauDate);
        monday.setDate(monday.getDate() - ((dayOfWeek + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        const monStr = monday.toISOString().split("T")[0];
        const sunStr = sunday.toISOString().split("T")[0];

        // `allCreneaux` n'est que la vue courante du planning : en vue jour,
        // il ne contient que le jour affiché. La semaine est donc TOUJOURS
        // relue en base, jamais déduite de ce qui est à l'écran.
        //
        // Le code se contentait auparavant d'une relecture « si on n'a
        // trouvé qu'un seul créneau ». Un stage à deux séances par jour en
        // trouvait deux dès le lundi : le garde-fou ne se déclenchait pas et
        // le cavalier n'était inscrit que sur la journée du lundi. Compter
        // les résultats ne dit pas si la vue est complète.
        const filtreStage = (liste: any[]) => liste
          .filter(c =>
            sameStage(c, creneau) &&
            (c.activityType === "stage" || c.activityType === "stage_journee") &&
            c.date >= monStr && c.date <= sunStr
          )
          .sort((a, b) => a.date.localeCompare(b.date));

        let stageCreneaux = filtreStage(allCreneaux);
        try {
          const weekSnap = await getDocs(query(
            collection(db, "creneaux"),
            where("date", ">=", monStr),
            where("date", "<=", sunStr)
          ));
          const depuisBase = filtreStage(weekSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]);
          // La base fait foi. On ne garde la liste locale que si la requête
          // n'a rien ramené — mieux vaut inscrire le jour affiché que rien.
          if (depuisBase.length > 0) stageCreneaux = depuisBase;
          console.log(`📋 Stage semaine : ${stageCreneaux.length} jour(s) pour "${creneau.activityTitle}" (${monStr} → ${sunStr})`);
        } catch (e) {
          console.error("Erreur chargement stage semaine:", e);
        }

        creneauxAInscrire = stageCreneaux.length > 0 ? stageCreneaux : [creneau];
      }
      // Mode "jour" → juste le créneau cliqué (déjà par défaut)

      // Calculer un stageKey STABLE pour ce stage : il est le même pour
      // tous les créneaux du stage (peu importe lequel on a cliqué dans
      // le planning). Format : "activityTitle_premierJourDuStage".
      // On le stocke dans chaque enrolled + dans l'item paiement, pour que
      // le filtre planning puisse matcher les badges paiement de manière
      // stricte (aucun risque de confusion entre deux stages de même titre
      // sur deux semaines différentes).
      const stageKey = `${creneau.activityTitle}_${creneauxAInscrire[0]?.date || creneau.date}`;

      // Inscrire chaque enfant dans TOUS les jours du stage (inscription technique seulement, pas de paiement par jour)
      const conflictsFound: string[] = [];
      for (const line of stageLines) {
        for (const sc of creneauxAInscrire) {
          const enrolled = sc.enrolled || [];
          if (enrolled.some((e: any) => e.childId === line.childId)) continue;
          // Vérifier conflit horaire avec un autre créneau ce jour
          const hasConflict = allCreneaux.find(other =>
            other.id !== sc.id &&
            other.date === sc.date &&
            (other.enrolled || []).some((e: any) => e.childId === line.childId) &&
            sc.startTime < other.endTime && other.startTime < sc.endTime
          );
          if (hasConflict) {
            conflictsFound.push(`${line.childName} (${sc.date} : conflit avec ${hasConflict.activityTitle})`);
            continue;
          }
          await onEnroll(sc.id!, {
            childId: line.childId, childName: line.childName,
            familyId: fam.firestoreId, familyName: fam.parentName || "—",
            enrolledAt: new Date().toISOString(),
            stageKey, // ← NOUVEAU : permet le matching paiement précis
            ...(preinscription ? { preinscription: true, preinscriptionMode: "stage" } : {}),
          } as any, undefined, { skipPayment: true, skipEmail: true });
        }
      }
      if (conflictsFound.length > 0) {
        panelToast(`Conflits horaires ignorés : ${conflictsFound.join(", ")}`, "warning");
      }

      // Alerter pour chaque jour du stage qui passe complet (demande Nicolas)
      await checkAndAlertIfFull(creneauxAInscrire.map(c => c.id!).filter(Boolean));

      // Pré-inscription : on s'arrête là. Les places sont retenues, aucun
      // panier n'est constitué — donc ni commande, ni facture, ni relance.
      if (preinscription) {
        panelToast(
          `${stageLines.length} cavalier(s) pré-inscrit(s) au stage — aucun paiement créé`,
          "success"
        );
        setSelectedChildren([]); setPreinscription(false); setInscriptionFaite(true);
        await onRefresh?.();
        setEnrolling(false);
        return;
      }

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
      // et les commandes dont la facture définitive est émise : une ligne ne
      // s'ajoute pas à une facture émise, il faut une nouvelle commande. Un
      // acompte déjà reçu, lui, ne bloque pas : le complément d'acompte du
      // deuxième enfant se calcule justement sur la commande entière.
      const pendingDocs = existingSnap.docs
        .filter(d => !(d.data().echeancesTotal > 1))
        .filter(d => verrouCommande(d.data()).motif !== "facture")
        .sort((a, b) => {
          const da = a.data().date?.seconds || 0;
          const db2 = b.data().date?.seconds || 0;
          return db2 - da;
        });
      if (pendingDocs.length > 1) {
        console.warn(`⚠️ ${pendingDocs.length} commandes pending pour famille ${fam.firestoreId} — fusion dans la plus récente`);
      }
      const openOrder = pendingDocs.length > 0 ? pendingDocs[0] : null;

      // Commande à laquelle ces stages sont rattachés : la confirmation
      // groupée la relit au moment de l'envoi pour savoir ce qui a déjà été
      // encaissé entre-temps.
      let commandeId = "";

      if (openOrder) {
        // Fusionner avec la commande existante
        commandeId = openOrder.id;
        const existingData = openOrder.data();
        const mergedItems = [...(existingData.items || []), ...newItems];
        const mergedTotal = Math.round(mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0) * 100) / 100;

        // Acompte de la commande ENTIÈRE, enfants déjà présents compris :
        // 30 € par enfant inscrit à un stage.
        const nbEnfantsStage = mergedItems.filter(
          (i: any) => i.activityType === "stage" || i.activityType === "stage_journee",
        ).length || stageLines.length;
        const acompteTotal = Math.min(ACOMPTE_PAR_ENFANT * nbEnfantsStage, mergedTotal);
        const soldeTotal = Math.round((mergedTotal - acompteTotal) * 100) / 100;

        await updateDoc(doc(db, "payments", openOrder.id), {
          items: mergedItems,
          totalTTC: mergedTotal,
          stageDate: existingData.stageDate || creneauxAInscrire[0]?.date || creneau.date,
          stageTitle: existingData.stageTitle || creneau.activityTitle,
          familyEmail: existingData.familyEmail || fam.parentEmail || "",
          acompteAmount: acompteTotal,
          soldeAmount: soldeTotal,
          updatedAt: serverTimestamp(),
        });

        // ── Lien de paiement du COMPLÉMENT d'acompte ────────────────────
        //
        // L'envoi n'existait que pour une commande neuve. Inscrire un second
        // enfant dans une commande déjà ouverte ne déclenchait donc aucun
        // email : la famille restait avec le lien du premier — 30 € et un
        // « solde de 150 € » devenus faux, alors que la commande en réclamait
        // 60 et 289,20. Rien n'était perdu, mais plus rien n'était juste.
        //
        // On ne redemande que ce qui manque : l'acompte de la commande
        // entière moins ce qui a déjà été réglé.
        const emailFamille = existingData.familyEmail || fam.parentEmail || "";
        if (showAcompte && acompteReglement === "lien" && emailFamille) {
          const dejaRegle = existingData.paidAmount || 0;
          const complement = Math.round(Math.max(0, acompteTotal - dejaRegle) * 100) / 100;
          if (complement > 0) {
            authFetch("/api/send-payment-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentId: openOrder.id,
                recipientEmail: emailFamille,
                amount: complement,
                familyId: fam.firestoreId,
                familyName: fam.parentName || "",
                message: `Bonjour,\n\nVotre inscription porte maintenant sur ${nbEnfantsStage} enfant${nbEnfantsStage > 1 ? "s" : ""}, pour un total de ${mergedTotal.toFixed(2)}€.\n\nL'acompte est de ${acompteTotal.toFixed(2)}€${dejaRegle > 0 ? `, dont ${dejaRegle.toFixed(2)}€ déjà réglés` : ""}. Voici le lien pour régler ${complement.toFixed(2)}€.\n\nCe message remplace le précédent. Le solde de ${soldeTotal.toFixed(2)}€ vous sera demandé 7 jours avant le stage.`,
              }),
            }).catch(e => console.warn("Lien complément acompte:", e));
          }
        }

        // Acompte réglé au comptoir : même écriture comptable que la caisse,
        // et même confirmation d'acompte que lorsqu'il est payé en ligne.
        if (showAcompte && acompteReglement === "sur_place") {
          await enregistrerEncaissement(
            openOrder.id,
            { ...existingData, items: mergedItems, totalTTC: Math.round(mergedTotal * 100) / 100 },
            stageAcompte,
            acompteMode,
            acompteRef,
            `Acompte ${creneau.activityTitle}`,
          );
          authFetch("/api/admin/stage-acompte-recu", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId: openOrder.id, montant: stageAcompte, mode: acompteMode }),
          }).catch(e => console.warn("Confirmation acompte:", e));
        }
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
        commandeId = newPayRef.id;

        // Acompte réglé au comptoir : on encaisse ici, sans lien de paiement.
        if (showAcompte && acompteReglement === "sur_place") {
          await enregistrerEncaissement(
            newPayRef.id,
            {
              familyId: fam.firestoreId,
              familyName: fam.parentName || "",
              items: newItems,
              totalTTC: stageTotalTTC,
            },
            stageAcompte,
            acompteMode,
            acompteRef,
            `Acompte ${creneau.activityTitle}`,
          );
          // Confirmation d'acompte — le pendant du webhook CAWL, qui ne se
          // déclenche pas quand l'argent est reçu au comptoir.
          authFetch("/api/admin/stage-acompte-recu", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId: newPayRef.id, montant: stageAcompte, mode: acompteMode }),
          }).catch(e => console.warn("Confirmation acompte:", e));
        }

        // Envoyer automatiquement le lien de paiement pour l'acompte
        if (showAcompte && acompteReglement === "lien" && fam.parentEmail) {
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

      const noms = stageLines.map(l => l.childName).join(", ");
      setJustEnrolled(`${noms} inscrit(s) dans ${creneauxAInscrire.length} jour(s) — ${stageTotalTTC.toFixed(2)}€${showAcompte ? ` (acompte ${stageAcompte}€ + solde ${stageSolde}€ J-7)` : ""}`);

      // Confirmation d'inscription — mise en file, pas envoi immédiat.
      //
      // Inscrire cinq enfants répartis sur trois stages, c'est trois
      // passages ici : la famille recevait trois lettres presque identiques
      // dans la même minute pour ce qui est, de son côté, une seule
      // inscription et un seul règlement. La confirmation attend donc
      // quelques minutes que les stages suivants de la même famille la
      // rejoignent (lib/stage-confirmations), puis part une seule fois —
      // un panneau par stage, un total unique.
      //
      // Sauf quand l'acompte vient d'être encaissé au comptoir : dans ce
      // cas /api/admin/stage-acompte-recu a déjà envoyé « Acompte confirmé —
      // la place est réservée », qui dit la même chose en mieux. La famille
      // recevait les deux à une seconde d'intervalle.
      const acompteEncaisseAuComptoir = showAcompte && acompteReglement === "sur_place";
      if (fam.parentEmail && !acompteEncaisseAuComptoir) {
        try {
          const dates = stageMode === "jour"
            ? new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
            : creneauxAInscrire.map(c => new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })).join(", ");
          const res = await authFetch("/api/admin/confirmation-stage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              familyId: fam.firestoreId,
              familyName: fam.parentName || "",
              email: fam.parentEmail,
              paymentId: commandeId,
              // L'acompte part dans un lien de paiement séparé
              // (send-payment-link) : la lettre ne porte pas de bouton.
              lienSepare: showAcompte && acompteReglement === "lien",
              stage: {
                stageKey,
                stageTitle: creneau.activityTitle,
                dates,
                // La lettre annonçait les jours sans l'heure : « lun. 26,
                // mar. 27 octobre » et rien sur quand se présenter.
                horaires: horairesStage([{ stageDates: creneauxAInscrire.map(c => ({ date: c.date, startTime: c.startTime, endTime: c.endTime })) }]),
                dateDebut: creneauxAInscrire[0]?.date || creneau.date,
                creneauId: creneau.id,
                enfants: stageLines.map(l => ({ name: l.childName, prix: l.prixReduit, remise: l.remiseEuros })),
                // Ce qui est réclamé maintenant : l'acompte quand il y en a
                // un, le prix entier sinon — l'inscription part alors aux
                // impayés et le lien de paiement suit. Dans les deux cas la
                // lettre annonce une place retenue, jamais une inscription
                // « confirmée » que rien n'a payée.
                aRegler: showAcompte ? stageAcompte : stageTotalTTC,
                solde: showAcompte ? stageSolde : 0,
              },
            }),
          });
          const fileConfirmation = await res.json().catch(() => null);
          if (fileConfirmation?.queued) {
            setConfirmationEnAttente({
              familyId: fam.firestoreId,
              familyName: fam.parentName || "",
              nbStages: fileConfirmation.nbStages || 1,
              envoiPrevuA: fileConfirmation.envoiPrevuA || "",
            });
            setEnvoiConfirmation("");
            programmerEnvoiConfirmation(fam.firestoreId, fileConfirmation.envoiPrevuA || "");
          }
        } catch (e) { console.error("Confirmation stage (mise en file):", e); }
      }

      // Notification push — hors du bloc email : elle doit partir aussi quand
      // l'acompte a été encaissé au comptoir, cas où l'email de confirmation
      // est volontairement omis. Son titre suit l'état réel de la place.
      {
        // « Confirmée » est réservé à ce qui est payé : tant que rien n'est
        // encaissé — le cas courant depuis l'administration, où le lien de
        // paiement part après l'inscription — la place est seulement retenue.
        const regleAuComptoir = showAcompte && acompteReglement === "sur_place";
        const enAttenteReglement = !regleAuComptoir;
        authFetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId: fam.firestoreId,
            title: enAttenteReglement ? "Inscription enregistrée — règlement à venir" : "Inscription confirmée",
            body: enAttenteReglement
              ? `${noms} : la place au stage ${creneau.activityTitle} est retenue jusqu'au règlement.`
              : `${noms} inscrit(s) au stage ${creneau.activityTitle}`,
            url: enAttenteReglement ? "/espace-cavalier/factures" : "/espace-cavalier/reservations",
          }),
        }).catch(() => {});
      }

      panelToast(`${noms} inscrit(s) — ${stageTotalTTC.toFixed(2)}€${showAcompte ? (acompteReglement === "sur_place" ? ` (acompte ${stageAcompte}€ encaissé + solde J-7)` : ` (acompte ${stageAcompte}€ + solde J-7)`) : " — paiement en attente"}`, "success");
    } catch (e) { console.error(e); panelToast("Erreur lors de l'inscription", "error"); }
    setSelectedChildren([]);
    setSelChild(""); setSelFam(""); setSearch(""); setEnrolling(false);
    setTimeout(() => setJustEnrolled(""), 6000);

    // Si mode jour : proposer d'inscrire dans d'autres jours du stage
    if (stageMode === "jour" && fam) {
      const creneauDate = new Date(creneau.date);
      const dow = creneauDate.getDay();
      const mon = new Date(creneauDate); mon.setDate(mon.getDate() - ((dow + 6) % 7));
      const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
      // Utiliser weekCreneaux (chargé depuis Firestore) plutôt qu'allCreneaux (limité à la vue)
      const source = weekCreneaux.length > 0 ? weekCreneaux : allCreneaux;
      const autresJours = source.filter(c =>
        c.activityTitle === creneau.activityTitle &&
        (c.activityType === "stage" || c.activityType === "stage_journee") &&
        new Date(c.date) >= mon && new Date(c.date) <= sun &&
        c.id !== creneau.id
      ).map(c => ({
        id: c.id!,
        date: c.date,
        label: new Date(c.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
      }));
      if (autresJours.length > 0) {
        setShowAddDays({
          familyId: fam.firestoreId,
          enfants: stageLines.map(l => ({ childId: l.childId, childName: l.childName })),
          joursRestants: autresJours,
          totalJoursStage: autresJours.length + 1, // tous les jours de la semaine pour ce stage
          joursInscrits: 1, // on vient d'en inscrire 1
          stageTitle: creneau.activityTitle,
          creneauRef: creneau, // pour accéder aux prix multi-jours
        });
      }
    }
    return;
  }

  // Mode cours/forfait : inscription simple
  if (!selChild || !fam) return;
  setEnrolling(true);
  const child = children.find((c: any) => c.id === selChild);
  const childFirstName = (child as any)?.firstName || "—";
  const childLastName = (child as any)?.lastName || "";
  const childName = childLastName ? `${childFirstName} ${childLastName}` : childFirstName;

  const createdPaymentIds: string[] = [];

  // ── PRÉ-INSCRIPTION ANNUELLE ────────────────────────────────────────
  // La branche annuelle ci-dessous crée le forfait, l'échéancier et le
  // paiement AVANT d'inscrire : elle ne peut pas être neutralisée par les
  // options passées à onEnroll. On la court-circuite donc entièrement.
  // Le cavalier est simplement posé sur le créneau, marqué pré-inscrit.
  if (inscriptionMode === "annuel" && preinscription) {
    if (!selChild || !fam) return;
    // childName (calculé plus haut) porte « Prénom Nom » : ne pas le
    // réécraser par le prénom seul — c'est lui qui est copié sur le créneau.
    setEnrolling(true);
    try {
      await onEnroll(creneau.id!, {
        childId: selChild,
        childName,
        familyId: fam.firestoreId,
        familyName: fam.parentName || "—",
        enrolledAt: new Date().toISOString(),
        preinscription: true,
        // Mémorisé pour la conversion : on saura qu'il s'agissait d'une
        // inscription à l'année, pas d'une séance isolée.
        preinscriptionMode: "annuel",
      } as any, undefined, { skipPayment: true, skipEmail: true });
      panelToast(`${childName} pré-inscrit(e) à l'année — aucun paiement créé`, "success");
      setSelChild(""); setSelectedChildren([]); setPreinscription(false);
      setInscriptionFaite(true);
      await onRefresh?.();
    } catch (err: any) {
      panelToast(`Échec : ${err?.message || err}`, "error");
    }
    setEnrolling(false);
    return;
  }

  if (inscriptionMode === "annuel") {
    // Inscription annuelle : créer le forfait + inscrire dans le créneau
    try {
      const slotKey = `${creneau.activityTitle} — ${new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long" })} ${creneau.startTime}`;
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
        remiseFamillePercent: familyDiscountPercent,
        ...(remiseHorsBareme ? { remiseHorsBareme: true, remiseBaremePercent, remiseMotif: remiseMotif.trim() || null } : {}),
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
      items.push({ activityTitle: ajoutHeureAdmin ? `Forfait — heure suppl. (${formatFrequence(frequenceDejaInscrite)}×→${formatFrequence(freqCumuleeAdmin)}×/sem) — ${creneau.activityTitle} (${slotKey})` : `Forfait ${creneau.activityTitle} (${slotKey})`, childId: selChild, childName, creneauId: creneau.id, activityType: creneau.activityType, priceHT: prixForfait / 1.055, tva: 5.5, priceTTC: prixForfait });
      // Créneaux supplémentaires (2ème, 3ème)
      const dayNames = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
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
        // Le motif figure sur la facture : une remise hors barème doit dire
        // pourquoi, sans quoi personne ne saura la justifier dans six mois.
        const motif = remiseMotif.trim();
        const libelleRemise = `Réduction famille (${rangEnfantFamille}ème enfant, -${familyDiscountPercent}%`
          + (remiseHorsBareme ? ` — ${motif || "remise exceptionnelle"}` : "")
          + ")";
        items.push({ activityTitle: libelleRemise, childId: selChild, childName, priceHT: -familyDiscountAmount / 1.055, tva: 5.5, priceTTC: -familyDiscountAmount,
          ...(remiseHorsBareme ? { remiseHorsBareme: true, remiseBaremePercent, remiseMotif: motif || null } : {}) });
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
            setEnrolling(false);
            return;
          }
          // Plusieurs mandats actifs (changement de banque sans révocation
          // de l'ancien) : sans tri, on rattachait les échéances à un mandat
          // ARBITRAIRE — donc possiblement au RIB que la famille n'utilise
          // plus, et le prélèvement serait rejeté. On prend le plus récent.
          const dateMandat = (m: any) => m?.createdAt?.seconds || 0;
          const mandatData = mandatSnap.docs
            .map(d => d.data())
            .sort((a: any, b: any) => dateMandat(b) - dateMandat(a))[0];
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
            sepaRestant: totalAnnuel,
            paidAmount: 0,
            echeance: 1,
            echeancesTotal: nbEcheances,
            echeanceDate: fmtDate(new Date()),
            forfaitRef: slotKey,
            date: serverTimestamp(),
          });
          createdPaymentIds.push(docRef.id);

          // Pré-notification : montant, dates et mandat. La famille doit
          // savoir ce qui sera prélevé et quand — les règles SEPA l'imposent
          // au créancier avant le premier prélèvement.
          authFetch("/api/admin/sepa-prenotification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paymentId: docRef.id }),
          }).catch(e => console.warn("Pré-notification SEPA:", e));
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
  }

  // Dans les 2 cas : inscrire dans le créneau
  // Pour les forfaits annuels : skipPayment car les échéances sont déjà créées
  // Une pre-inscription ne declenche RIEN : ni paiement, ni facture, ni email.
  const enrollOptions = preinscription
    ? { skipPayment: true, skipEmail: true }
    : inscriptionMode === "annuel" ? { skipPayment: true, skipEmail: true } : undefined;

  if (inscriptionMode === "annuel") {
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

    // Alerter pour chaque seance qui passe complete apres inscription annuelle
    await checkAndAlertIfFull(allSlotsToEnroll.map(s => s.id));
  } else {
    // ── Mode Compétition : un engagement par épreuve/passage + coaching global ──
    if (isCompetition) {
      const coachingTTC = parseFloat(compCoaching) || 0;
      const compItems: any[] = [];
      for (const ep of compEpreuves) {
        const montantTTC = parseFloat(ep.montant) || 0;
        if (montantTTC <= 0) continue;
        compItems.push({
          activityTitle: `Engagement — ${ep.epreuve || creneau.activityTitle}`,
          childId: selChild, childName, creneauId: creneau.id, activityType: "competition",
          description: ep.epreuve || "Engagement compétition",
          priceHT: montantTTC / 1.055, tva: 5.5, priceTTC: montantTTC,
        });
      }
      if (coachingTTC > 0) compItems.push({
        activityTitle: `Coaching — ${creneau.activityTitle}`,
        childId: selChild, childName, creneauId: creneau.id, activityType: "competition",
        description: "Coaching moniteur",
        priceHT: coachingTTC / 1.055, tva: 5.5, priceTTC: coachingTTC,
      });
      const compOptions = compItems.length > 0 ? { competitionItems: compItems, skipEmail: false } : undefined;
      await onEnroll(creneau.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString() }, showPay ? payMode : undefined, compOptions);
    } else {
      const freeEnrollOptions = freeEnroll ? { freeReason, skipEmail: false } : undefined;
      const rattrapageOptions = useRattrapage ? { rattrapageId: useRattrapage, skipEmail: false } : undefined;
      await onEnroll(creneau.id!, { childId: selChild, childName, familyId: fam.firestoreId, familyName: fam.parentName || "—", enrolledAt: new Date().toISOString(), ...(preinscription ? { preinscription: true } : {}) } as any, preinscription ? undefined : (inscriptionMode === "ponctuel" && showPay && !freeEnroll && !useRattrapage ? payMode : undefined), enrollOptions || freeEnrollOptions || rattrapageOptions);
    }
    // Alerter si le creneau (cours collectif ou competition) passe complet
    await checkAndAlertIfFull([creneau.id!]);
  }

  if (inscriptionMode === "annuel") {
    setJustEnrolled(`${childName} inscrit(e) en forfait annuel — ${sessionsRestantes} séances — ${totalAnnuel.toFixed(2)}€ en ${payPlan}`);
    panelToast(`Forfait créé — ${totalAnnuel.toFixed(2)}€ en ${payPlan}`, "success");
  } else {
    const payInfo = useRattrapage ? " — 🔄 rattrapage utilisé" : freeEnroll ? ` — 🎁 offert (${freeReason})` : showPay ? " — encaissé ✅" : priceTTC > 0 ? " — paiement en attente" : "";
    setJustEnrolled(`${childName}${payInfo}`);
  }
  // Reset complet du formulaire pour permettre une nouvelle inscription
  // dans la foulee (cas frequent : inscrire toute une fratrie l'un apres
  // l'autre sans fermer le panel).
  // CRITICAL : selectedChildren doit aussi etre vide, sinon en mode annuel
  // le re-clic sur un autre enfant additionne au precedent puis le
  // useEffect-like de cleanup garde le PREMIER (= l'ancien). Resultat :
  // l'inscription suivante reutilise l'ancien enfant. Bug rapporte par
  // Nicolas : a inscrit Suzanne puis click Marianne, mais Suzanne inscrite
  // 2x.
  setSelChild(""); setSelectedChildren([]); setSelFam(""); setSearch(""); setEnrolling(false); setShowPay(false); setFreeEnroll(false); setFreeReason("Rattrapage"); setUseRattrapage(null); setInscriptionMode("ponctuel"); setExtraSlots([]); setExtraSlotSearch(""); setAnnualPayMode("cb_terminal");
  // La remise ajustée vaut pour l'inscription qu'on vient de faire, pas pour
  // la suivante : on repart du barème.
  setRemisePctManuel(""); setRemiseMotif(""); setEditRemise(false);
  setTimeout(() => setJustEnrolled(""), 5000);
}
