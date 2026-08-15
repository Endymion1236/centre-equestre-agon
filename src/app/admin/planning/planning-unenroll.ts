/**
 * src/app/admin/planning/planning-unenroll.ts
 *
 * La DÉSINSCRIPTION d'un cavalier, vue admin — le pendant de planning-enroll :
 * elle rend de l'argent. Selon le cas, elle crée un rattrapage, un avoir au
 * prorata, recrédite une carte, ajuste ou annule un paiement, et prévient la
 * première famille en liste d'attente que la place est libre.
 *
 * Pourquoi ce fichier : 560 lignes de décisions financières qui, mélangées au
 * reste de la page, ne pouvaient se relire qu'en scrollant. Chacune des
 * bifurcations ci-dessous vient d'un cas réel du centre équestre et porte son
 * explication juste au-dessus. Les plus importantes :
 *
 *  - FORFAIT ANNUEL : jamais d'avoir. Le paiement annuel reste valable pour
 *    les autres séances ; on crée un rattrapage. (Bug historique documenté sur
 *    place : un avoir de 303 € avait été généré au prorata d'un forfait.)
 *  - STAGE : l'admin choisit entre tout le stage (avoir plein), un seul jour
 *    (avoir au prorata) ou un seul jour SANS avoir (absence tardive, le stage
 *    reste dû) — et ce dernier cas doit être traité AVANT le bloc carte pour
 *    que la carte ne soit pas recréditée.
 *  - LISTE D'ATTENTE : une attente de stage n'est notifiée que si la SEMAINE
 *    ENTIÈRE redevient libre, et la place est tenue 24 h pour la famille
 *    prévenue.
 *
 * ⚠️ Code DÉPLACÉ tel quel depuis page.tsx, ligne pour ligne, commentaires
 * compris. La fonction ne connaît pas l'état React : forfaits, familles,
 * toast et fonctions de rechargement lui sont passés dans `deps`.
 */

"use client";

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Family } from "@/types";
import { Creneau } from "./types";
import {
  findStageCreneaux, removeChildFromCreneau, deleteReservations,
  findLinkedPayment, computeTropPercu, createAvoir,
} from "@/lib/planning-services";
import { emailTemplates } from "@/lib/email-templates";
import { authFetch } from "@/lib/auth-fetch";

type Toast = (message: string, type?: "success" | "error" | "info" | "warning", duration?: number) => void;

/** Tout ce que la désinscription emprunte à la page, passé explicitement. */
export type DepsDesinscription = {
  families: (Family & { firestoreId: string })[];
  allForfaits: any[];
  toast: Toast;
  fetchData: () => Promise<void>;
  refreshCreneaux: () => Promise<(Creneau & { id: string })[]>;
  setSelectedCreneau: (c: any) => void;
};

export async function desinscrireCavalier(
  cid: string,
  childId: string,
  deps: DepsDesinscription,
): Promise<void> {
  const { families, allForfaits, toast, fetchData, refreshCreneaux, setSelectedCreneau } = deps;
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
                subject: `🎉 Une place s'est libérée — ${c.activityTitle}`,
                context: "admin_place_liberee",
                template: "placeLibereeNotif",
                familyId: first.familyId,
                creneauId: cid,
                html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                  <p>Bonjour <strong>${first.familyName}</strong>,</p>
                  <p>Une place s'est libérée pour <strong>${first.childName}</strong> dans :</p>
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                    <p style="margin:0;color:#166534;font-weight:600;">${c.activityTitle}</p>
                    <p style="margin:8px 0 0;color:#555;font-size:13px;">📅 ${first.isStage && first.dateFin && first.dateFin !== first.date
                      ? `du ${new Date(first.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })} au ${new Date(first.dateFin).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })}${first.nbJours ? ` (${first.nbJours} jours)` : ""}`
                      : new Date(c.date).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })} — ${c.startTime}–${c.endTime}</p>
                  </div>
                  <p><strong>Cette place vous est réservée pendant 24h</strong> (jusqu'au ${new Date(holdUntil).toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })} à ${new Date(holdUntil).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" })}). Passé ce délai, elle sera proposée aux autres familles.</p>
                  <p style="text-align:center;margin:24px 0;">
                    <a href="${typeof window !== "undefined" ? window.location.origin : "https://centre-equestre-agon.vercel.app"}/espace-cavalier/reserver?creneau=${encodeURIComponent(cid)}"
                       style="background:#16a34a;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">
                      Confirmer l'inscription
                    </a>
                  </p>
                  <p style="color:#555;font-size:13px;line-height:1.6;">Un souci pour réserver en ligne, ou une question ? Appelez-nous au
                    <strong>02 44 84 99 96</strong> ou répondez à ce message — nous prendrons l'inscription avec vous.</p>
                  <p style="color:#666;font-size:12px;">À bientôt au centre équestre !</p>
                </div>`,
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
}
