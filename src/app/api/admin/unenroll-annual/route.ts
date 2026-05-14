import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire — route admin
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { childId, childName, familyId } = await req.json();

    if (!childId || !familyId) {
      return NextResponse.json({ error: "childId et familyId requis" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // ── 0. Calcul du prorata AVANT toute modification ──────────────────
    // On compte les séances déjà effectuées (= créneaux clôturés avec
    // presence='present') AVANT de retirer l'enfant des futurs créneaux.
    // Sinon, l'étape 1 efface ces enrolled et le calcul retombe à 0.
    let seancesEffectuees = 0;
    const allCreneauxSnap = await adminDb.collection("creneaux").get();
    for (const cd of allCreneauxSnap.docs) {
      const cdata = cd.data();
      if (cdata.activityType === "stage" || cdata.activityType === "stage_journee") continue;
      if (cdata.status !== "closed") continue;
      const wasPresent = (cdata.enrolled || []).some((e: any) =>
        e.childId === childId && e.presence === "present"
      );
      if (wasPresent) seancesEffectuees++;
    }

    // ── 1. Retirer l'enfant des créneaux futurs NON-CLÔTURÉS ────────────
    // On épargne les créneaux clôturés : la séance a eu lieu (présence
    // attestée), retirer Eliot effacerait l'historique pédagogique et
    // fausserait les statistiques de fréquentation.
    const creneauxSnap = await adminDb
      .collection("creneaux")
      .where("date", ">=", today)
      .get();

    let unenrolledCount = 0;
    const creneauxToUpdate: { ref: FirebaseFirestore.DocumentReference; newEnrolled: any[] }[] = [];

    for (const doc of creneauxSnap.docs) {
      const data = doc.data();
      // On ignore les créneaux clôturés : la trace de la séance reste
      if (data.status === "closed") continue;
      const enrolled = data.enrolled || [];
      if (enrolled.some((e: any) => e.childId === childId)) {
        const newEnrolled = enrolled.filter((e: any) => e.childId !== childId);
        creneauxToUpdate.push({ ref: doc.ref, newEnrolled });
        unenrolledCount++;
      }
    }

    for (let i = 0; i < creneauxToUpdate.length; i += 450) {
      const batch = adminDb.batch();
      const chunk = creneauxToUpdate.slice(i, i + 450);
      for (const item of chunk) {
        batch.update(item.ref, { enrolled: item.newEnrolled, enrolledCount: item.newEnrolled.length });
      }
      await batch.commit();
    }

    // ── 2. Annuler les réservations futures (tous types) ─────────────────────
    const reservationsSnap = await adminDb
      .collection("reservations")
      .where("childId", "==", childId)
      .where("familyId", "==", familyId)
      .get();

    let cancelledReservations = 0;
    if (!reservationsSnap.empty) {
      const resBatch = adminDb.batch();
      for (const doc of reservationsSnap.docs) {
        const r = doc.data();
        // Annuler toutes les réservations futures confirmées (peu importe le type)
        if (r.status === "confirmed" && r.date >= today) {
          resBatch.update(doc.ref, { status: "cancelled", cancelledAt: new Date().toISOString() });
          cancelledReservations++;
        }
      }
      await resBatch.commit();
    }

    // ── 3. Annuler les paiements en attente liés à ce forfait ────────────────
    // Inclut : payments (pending/sepa_scheduled), echeances-sepa (pending non remises)
    let cancelledPayments = 0;

    const paymentsSnap = await adminDb
      .collection("payments")
      .where("familyId", "==", familyId)
      .get();

    const payBatch = adminDb.batch();
    let payBatchCount = 0;

    for (const doc of paymentsSnap.docs) {
      const p = doc.data();
      if (p.status === "paid" || p.status === "cancelled") continue;

      // Est-ce un paiement lié à un forfait annuel de cet enfant ?
      const isForfaitOfChild =
        // Paiement de référence SEPA (sepa_scheduled)
        p.status === "sepa_scheduled" && (p.items || []).some((i: any) => i.childId === childId) ||
        // Échéances classiques (pending, 3x/10x)
        (p.status === "pending" || p.status === "partial") && (
          // Via items
          (p.items || []).some((i: any) =>
            i.childId === childId &&
            (i.activityTitle?.includes("Forfait") || i.activityTitle?.includes("Adhésion") || i.activityTitle?.includes("Licence"))
          ) ||
          // Via echeancesTotal (échéance d'un plan 3x/10x)
          (p.echeancesTotal > 1 && (p.items || []).some((i: any) =>
            i.childId === childId || (i.childName === childName)
          )) ||
          // Paiement dont le forfaitRef existe (créé par EnrollPanel annuel)
          (p.forfaitRef && (p.items || []).some((i: any) => i.childId === childId))
        );

      if (!isForfaitOfChild) continue;

      payBatch.update(doc.ref, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: "Désinscription annuelle",
      });
      cancelledPayments++;
      payBatchCount++;
    }
    if (payBatchCount > 0) await payBatch.commit();

    // ── 4b. Créer un avoir au PRORATA des séances restantes ─────────────────
    // ⚠️ HISTORIQUE BUG : avant cette correction, le code additionnait
    // aveuglément TOUS les paiements 'paid' concernant l'enfant. Si l'enfant
    // avait été inscrit/réinscrit plusieurs fois, ou si plusieurs forfaits
    // existaient, l'avoir pouvait largement dépasser le montant réellement
    // dû (cas Eliot : avoir de 1518€ pour un forfait de 735€).
    //
    // Nouvelle logique :
    //   1. Identifier les paiements 'paid' liés au FORFAIT (items contenant
    //      "Forfait" ou "Adhésion" ou ayant un forfaitRef), pas tous les
    //      paiements de l'enfant
    //   2. Calculer un prorata = séances retirées / séances totales depuis
    //      le début de l'inscription
    //   3. Plafonner à la somme effectivement payée ET au prix du forfait
    let avoirCreated = 0;
    let avoirAmount = 0;
    const avoirDetails: { paymentId: string; total: number; counted: number; reason: string }[] = [];
    try {
      // ── Reprend le calcul du prorata fait en début (avant retrait) ──
      // seancesEffectuees a été calculé à la phase 0 (status='closed' +
      // presence='present'), avant que les enrolled ne soient modifiés.
      const seancesRetirees = unenrolledCount;
      const seancesTotales = seancesEffectuees + seancesRetirees;
      // Prorata = part de l'argent à rembourser = retirees / totales
      // (les seances effectuees n'ouvrent droit à aucun avoir).
      const prorata = seancesTotales > 0 ? seancesRetirees / seancesTotales : 0;

      console.log("[unenroll-annual] Prorata calcul:", {
        childId, childName, seancesTotales, seancesEffectuees, seancesRetirees, prorata,
      });

      const paidSnap = await adminDb.collection("payments")
        .where("familyId", "==", familyId)
        .where("status", "==", "paid")
        .get();


      // ── 1. Identifier les paiements forfait et sommer la somme payée ──
      // On somme TOUS les paiements 'paid' contenant un item forfait/adhésion
      // pour cet enfant. Le prorata ne s'applique qu'UNE FOIS sur le total,
      // pas paiement par paiement (sinon des paiements dupliqués gonflaient
      // l'avoir : 2 paiements 735€ → avoir 2×735×0.93 = 1368€ au lieu de 684€).
      const paymentLines: { paymentId: string; total: number; reason: string }[] = [];
      for (const doc of paidSnap.docs) {
        const p = doc.data();
        const childForfaitItems = (p.items || []).filter((i: any) => {
          if (i.childId !== childId) return false;
          const title = (i.activityTitle || "").toLowerCase();
          // Filtrage strict : forfait, adhésion, licence
          return title.includes("forfait") || title.includes("adhésion") || title.includes("adhesion") || title.includes("licence") || p.forfaitRef;
        });
        if (childForfaitItems.length === 0) continue;
        const paid = childForfaitItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);
        if (paid <= 0) continue;
        paymentLines.push({
          paymentId: doc.id,
          total: paid,
          reason: childForfaitItems.map((i: any) => i.activityTitle).join(", "),
        });
      }

      // Total réellement payé par la famille pour ce forfait
      const totalPayeForfait = paymentLines.reduce((s, l) => s + l.total, 0);

      // ── 2. Lecture du prix officiel du forfait depuis la collection ──
      // Sert de plafond : l'avoir ne peut JAMAIS dépasser ce que coûte
      // le forfait, même si des paiements en double existent en base.
      let prixForfaitOfficiel = 0;
      try {
        const forfaitsActifsSnap = await adminDb.collection("forfaits")
          .where("childId", "==", childId)
          .where("familyId", "==", familyId)
          .get();
        for (const fd of forfaitsActifsSnap.docs) {
          const fdata = fd.data();
          // On prend le prix le plus récent / le plus élevé (cas multi-forfaits)
          const prix = fdata.forfaitPriceTTC || 0;
          if (prix > prixForfaitOfficiel) prixForfaitOfficiel = prix;
        }
      } catch (e) {
        console.warn("[unenroll-annual] Lecture prix forfait:", e);
      }

      // ── 3. Calcul de l'avoir : prorata appliqué UNE fois sur le total ──
      // On plafonne d'abord au prix officiel du forfait (anti-doublons),
      // puis on applique le prorata.
      const basePourAvoir = prixForfaitOfficiel > 0
        ? Math.min(totalPayeForfait, prixForfaitOfficiel)
        : totalPayeForfait;
      avoirAmount = Math.round(basePourAvoir * prorata * 100) / 100;

      // Pour la traçabilité, on enregistre chaque ligne avec sa quote-part
      // calculée (proportionnelle au montant payé).
      for (const line of paymentLines) {
        const counted = totalPayeForfait > 0
          ? Math.round((line.total / totalPayeForfait) * avoirAmount * 100) / 100
          : 0;
        avoirDetails.push({
          paymentId: line.paymentId,
          total: line.total,
          counted,
          reason: line.reason,
        });
      }

      console.log("[unenroll-annual] Avoir details:", {
        totalPayeForfait,
        prixForfaitOfficiel,
        basePourAvoir,
        prorata,
        avoirAmount,
        details: avoirDetails,
      });

      // ── Garde-fou final ───────────────────────────────────────────
      // Ne JAMAIS créer un avoir plus gros que la somme effectivement
      // payée par la famille pour le forfait. C'est notre dernier rempart
      // contre un calcul foireux.
      const totalForfaitsPaid = avoirDetails.reduce((s, d) => s + d.total, 0);
      if (avoirAmount > totalForfaitsPaid) {
        console.warn("[unenroll-annual] Avoir plafonne au paiement reel:", { avoirAmount, totalForfaitsPaid });
        avoirAmount = totalForfaitsPaid;
      }
      // Arrondi final au centime
      avoirAmount = Math.round(avoirAmount * 100) / 100;

      if (avoirAmount > 0) {
        // Récupérer infos famille
        const familyDoc = await adminDb.collection("families").doc(familyId).get();
        const familyData = familyDoc.data();
        const familyName = familyData?.parentName || familyData?.name || familyId;

        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        const newRef = `AV-${Date.now().toString(36).toUpperCase()}`;

        // ── Fusion silencieuse avec les avoirs actifs existants ─────────
        // Cohérent avec createAvoir() côté client : on ne laisse jamais
        // 2 avoirs actifs sur la même famille pour éviter la dispersion.
        let mergedAmount = 0;
        const toMerge: { id: string; data: any }[] = [];
        try {
          const activeSnap = await adminDb.collection("avoirs")
            .where("familyId", "==", familyId)
            .where("status", "in", ["actif", "actif_partiel"])
            .get();
          for (const d of activeSnap.docs) {
            const data = d.data();
            const remaining = Math.round((data.remainingAmount || 0) * 100) / 100;
            if (remaining <= 0) continue;
            mergedAmount += remaining;
            toMerge.push({ id: d.id, data });
          }
        } catch (e) {
          console.warn("[unenroll-annual] Lecture avoirs actifs:", e);
        }

        const finalAmount = Math.round((avoirAmount + mergedAmount) * 100) / 100;

        const avoirDocData: any = {
          familyId,
          familyName,
          type: "avoir",
          amount: finalAmount,
          usedAmount: 0,
          remainingAmount: finalAmount,
          reason: `Désinscription annuelle — ${childName} (prorata ${Math.round(prorata * 100)}%)`,
          reference: newRef,
          expiryDate: expiryDate.toISOString(),
          status: "actif",
          usageHistory: [],
          // Audit trail pour pouvoir retrouver d'où vient le calcul
          _audit: {
            seancesTotales,
            seancesEffectuees,
            seancesRetirees,
            prorata,
            details: avoirDetails,
            // Si fusion : conserver l'origine des montants additionnels
            ...(toMerge.length > 0 ? {
              mergedAt: new Date().toISOString(),
              mergedAmount,
              newAmount: avoirAmount,
              mergedFrom: toMerge.map(m => ({
                avoirId: m.id,
                reference: m.data.reference || "",
                remaining: m.data.remainingAmount || 0,
                reason: m.data.reason || "",
              })),
            } : {}),
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const newAvoirRef = await adminDb.collection("avoirs").add(avoirDocData);

        // Marquer les anciens avoirs comme fusionnés
        for (const m of toMerge) {
          try {
            await adminDb.collection("avoirs").doc(m.id).update({
              status: "fusionne",
              remainingAmount: 0,
              mergedInto: newAvoirRef.id,
              mergedIntoRef: newRef,
              mergedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          } catch (e) {
            console.warn("[unenroll-annual] Marquage fusionne:", m.id, e);
          }
        }

        avoirCreated = 1;
      }
    } catch (e) {
      console.error("Erreur création avoir:", e);
    }


    let cancelledSepa = 0;
    try {
      const sepaSnap = await adminDb
        .collection("echeances-sepa")
        .where("familyId", "==", familyId)
        .where("status", "==", "pending")
        .get();

      if (!sepaSnap.empty) {
        const sepaBatch = adminDb.batch();
        for (const doc of sepaSnap.docs) {
          // Vérifier que c'est bien lié à cet enfant via la description
          const d = doc.data();
          const concernsChild = d.description?.includes(childName) || !childName;
          if (concernsChild) {
            sepaBatch.delete(doc.ref);
            cancelledSepa++;
          }
        }
        await sepaBatch.commit();
      }
    } catch (e) {
      console.error("Erreur annulation SEPA:", e);
    }

    // ── 5. Annuler les souscriptions CAWL actives (Stripe supprimé) ──────────
    const cancelledSubscriptions = 0;
    // Les paiements récurrents sont désormais gérés via CAWL/SEPA

    // ── 6. Marquer le forfait comme annulé ───────────────────────────────────
    const forfaitsSnap = await adminDb
      .collection("forfaits")
      .where("childId", "==", childId)
      .where("familyId", "==", familyId)
      .get();

    if (!forfaitsSnap.empty) {
      const fBatch = adminDb.batch();
      for (const doc of forfaitsSnap.docs) {
        const f = doc.data();
        if (f.status === "active" || f.status === "actif" || f.status === "suspended") {
          fBatch.update(doc.ref, {
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
            cancelReason: "Désinscription en masse",
          });
        }
      }
      await fBatch.commit();
    }

    return NextResponse.json({
      success: true,
      unenrolledCount,
      cancelledReservations,
      cancelledPayments,
      cancelledSepa,
      cancelledSubscriptions,
      avoirCreated,
      avoirAmount,
      message: [
        `${childName || childId} désinscrit(e) de ${unenrolledCount} séance(s)`,
        cancelledReservations > 0 ? `${cancelledReservations} réservation(s) annulée(s)` : "",
        cancelledPayments > 0 ? `${cancelledPayments} paiement(s) annulé(s)` : "",
        cancelledSepa > 0 ? `${cancelledSepa} échéance(s) SEPA supprimée(s)` : "",
        avoirCreated > 0 ? `✅ Avoir de ${avoirAmount.toFixed(2)}€ créé` : "",
      ].filter(Boolean).join(" · "),
    });
  } catch (error: any) {
    console.error("Erreur désinscription en masse:", error);
    console.error("API error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
