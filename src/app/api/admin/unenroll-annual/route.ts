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

    // ── 1. Retirer l'enfant de tous les créneaux futurs ──────────────────────
    const creneauxSnap = await adminDb
      .collection("creneaux")
      .where("date", ">=", today)
      .get();

    let unenrolledCount = 0;
    const creneauxToUpdate: { ref: FirebaseFirestore.DocumentReference; newEnrolled: any[] }[] = [];

    for (const doc of creneauxSnap.docs) {
      const data = doc.data();
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
      // ── Calcul du nombre de séances effectuées vs retirées ──
      // Politique métier : un cavalier qui a déjà effectué N séances ne
      // récupère pas l'argent de ces séances. L'avoir = (séances restantes)
      // / (séances totales du forfait) × montant payé.
      //
      // Définitions :
      //  - seancesEffectuees = créneaux CLÔTURÉS (status === "closed") où
      //    l'enfant figure dans enrolled[] avec presence === "present".
      //    On ne se base PAS sur la date (un créneau futur peut être
      //    cloturé en simulation ; un créneau passé peut ne pas l'être).
      //    L'élément déterminant, c'est la clôture qui acte la séance.
      //  - seancesRetirees = créneaux d'où on vient de retirer l'enfant
      //    par cette désinscription (= unenrolledCount, déjà calculé)
      //  - seancesTotales = effectuees + retirees = ce que le forfait
      //    couvrait au moment de l'achat (en pratique : tout le reste
      //    de la saison + ce qui a déjà été consommé)
      const allCreneauxSnap = await adminDb.collection("creneaux").get();
      let seancesEffectuees = 0;
      for (const cd of allCreneauxSnap.docs) {
        const cdata = cd.data();
        if (cdata.activityType === "stage" || cdata.activityType === "stage_journee") continue;
        // Le créneau est-il clôturé ?
        if (cdata.status !== "closed") continue;
        // L'enfant y est-il enregistré comme présent ?
        const wasPresent = (cdata.enrolled || []).some((e: any) =>
          e.childId === childId && e.presence === "present"
        );
        if (wasPresent) seancesEffectuees++;
      }
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


      for (const doc of paidSnap.docs) {
        const p = doc.data();
        // Items concernant cet enfant ET liés à un forfait/adhésion
        const childForfaitItems = (p.items || []).filter((i: any) => {
          if (i.childId !== childId) return false;
          const title = (i.activityTitle || "").toLowerCase();
          // Filtrage strict : on ne compte que les items 'Forfait' ou 'Adhésion'
          // (pas les cours ponctuels, pas les stages, pas les bons d'amitié).
          return title.includes("forfait") || title.includes("adhésion") || title.includes("adhesion") || p.forfaitRef;
        });
        if (childForfaitItems.length === 0) continue;
        const paid = childForfaitItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0);
        if (paid <= 0) continue;
        // Avoir au prorata des séances retirées sur ce paiement
        const counted = Math.round(paid * prorata * 100) / 100;
        avoirAmount += counted;
        avoirDetails.push({
          paymentId: doc.id,
          total: paid,
          counted,
          reason: childForfaitItems.map((i: any) => i.activityTitle).join(", "),
        });
      }

      console.log("[unenroll-annual] Avoir details:", avoirDetails);

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

        await adminDb.collection("avoirs").add({
          familyId,
          familyName,
          type: "avoir",
          amount: avoirAmount,
          usedAmount: 0,
          remainingAmount: avoirAmount,
          reason: `Désinscription annuelle — ${childName} (prorata ${Math.round(prorata * 100)}%)`,
          reference: `AV-${Date.now().toString(36).toUpperCase()}`,
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
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
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
