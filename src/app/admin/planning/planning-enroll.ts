/**
 * src/app/admin/planning/planning-enroll.ts
 *
 * L'INSCRIPTION d'un cavalier sur un créneau, vue admin — c'est-à-dire
 * l'endroit du logiciel qui crée de l'argent : réservation, paiement (réglé
 * ou en attente), encaissement, déduction d'avoir, points de fidélité, ou au
 * contraire inscription offerte, en rattrapage, ou couverte par une carte.
 *
 * Pourquoi ce fichier : cette fonction faisait 480 lignes au milieu de la
 * page, entre deux morceaux de JSX. Une erreur ici ne casse pas l'écran, elle
 * facture une famille à tort — c'est le risque le plus cher du dépôt. Sortie
 * seule dans son fichier, elle se lit en entier d'un bout à l'autre, avec
 * l'ordre exact des écritures Firestore sous les yeux.
 *
 * ⚠️ Ce code a été DÉPLACÉ tel quel, ligne pour ligne, depuis page.tsx : ni
 * l'ordre des opérations, ni les arrondis, ni les libellés n'ont été touchés.
 * Toute modification future doit se demander d'abord ce qu'elle facture.
 *
 * Les garde-fous à ne jamais retirer, tous commentés en place ci-dessous :
 *  - sortie en échec explicite si l'ajout au créneau n'a pas eu lieu (sans
 *    quoi l'appelant croit l'inscription faite et facture deux fois) ;
 *  - refus d'inscrire sur un créneau SANS PRIX, avec annulation de ce qui
 *    vient d'être écrit (sinon le cavalier existe sans trace financière) ;
 *  - rollback complet dans le catch : retrait du créneau, suppression de la
 *    réservation, recrédit de la carte éventuellement débitée.
 *
 * La fonction ne connaît pas l'état React : tout ce dont elle a besoin (les
 * créneaux affichés, les familles, les barèmes de réduction, le toast et les
 * fonctions de rafraîchissement) lui est passé dans `deps`.
 */

"use client";

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Family } from "@/types";
import { Creneau, EnrolledChild } from "./types";
import {
  enrollChildInCreneau, createReservation, removeChildFromCreneau, deleteReservations,
} from "@/lib/planning-services";
import { emailTemplates } from "@/lib/email-templates";
import { createEncaissement } from "@/lib/compta-encaissement";
import { generateOrderId } from "@/lib/utils";
import { applyDiscounts, type VacationPeriod, type DiscountSettings } from "@/lib/discounts";
import { authFetch } from "@/lib/auth-fetch";

type Toast = (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;

/** Tout ce que l'inscription emprunte à la page, passé explicitement. */
export type DepsInscription = {
  creneaux: (Creneau & { id: string })[];
  families: (Family & { firestoreId: string })[];
  discountSettings: DiscountSettings;
  vacationPeriods: VacationPeriod[];
  toast: Toast;
  refreshCreneaux: () => Promise<(Creneau & { id: string })[]>;
  setSelectedCreneau: (c: any) => void;
  setAllForfaits: (f: any[]) => void;
};

export async function inscrireCavalier(
  cid: string,
  child: EnrolledChild,
  payMode: string | undefined,
  options: { skipPayment?: boolean; skipEmail?: boolean; freeReason?: string; rattrapageId?: string; competitionItems?: any[]; skipRefresh?: boolean } | undefined,
  deps: DepsInscription,
): Promise<boolean | void> {
  const { creneaux, families, discountSettings, vacationPeriods, toast, refreshCreneaux, setSelectedCreneau, setAllForfaits } = deps;
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
      const priceTTC = c.priceTTC || (c.priceHT || 0) * (1 + (c.tvaTaux || 5.5) / 100);

      // ⚠️ GARDE-FOU : créneau sans prix défini
      // Sans cette vérification, handleEnroll aurait sauté tout le bloc de
      // création de payment (ligne "if priceTTC > 0"), laissant le cavalier
      // inscrit au planning sans aucune trace financière. Nicolas nous a
      // confirmé que tous ses créneaux DOIVENT avoir un prix — un priceTTC
      // à 0 ou manquant est donc un oubli, pas un cas volontaire.
      if (!options?.skipPayment && !options?.freeReason && priceTTC <= 0) {
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

      let payRefId = "";

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
}
