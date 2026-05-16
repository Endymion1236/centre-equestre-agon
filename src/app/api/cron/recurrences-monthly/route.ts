/**
 * GET /api/cron/recurrences-monthly
 *
 * Appelée par Vercel Cron le 1er de chaque mois à 8h00 UTC (= 9h ou 10h
 * locale selon DST). Pour chaque récurrence active dont la date du mois
 * en cours est arrivée (jourFacturation <= aujourd'hui), génère un
 * paiement pending si pas déjà fait pour ce mois.
 *
 * Idempotence : on vérifie `facturesGenerees[].mois === moisCourant`
 * avant de créer le paiement. Donc on peut appeler ce endpoint plusieurs
 * fois sans risque de doublons.
 *
 * 🔒 Sécurité : seul Vercel Cron peut appeler ce endpoint (vérification
 * du header Authorization avec CRON_SECRET défini en variable d'env).
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

export async function GET(req: NextRequest) {
  // 🔒 Vérifier que l'appel vient bien de Vercel Cron
  const authHeader = req.headers.get("authorization");
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const day = now.getDate();
  const moisKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const moisLabel = `${MOIS[month]} ${year}`;

  try {
    const recurrencesSnap = await adminDb
      .collection("recurrences")
      .where("statut", "==", "actif")
      .get();

    const generated: { recurrenceId: string; label: string; paymentId: string }[] = [];
    const skipped: { recurrenceId: string; reason: string }[] = [];

    for (const recDoc of recurrencesSnap.docs) {
      const r = recDoc.data();

      // Sauter si le jour de facturation n'est pas encore arrivé
      // (ex: récurrence facturée le 15, on est le 1er → on attend)
      if ((r.jourFacturation || 1) > day) {
        skipped.push({ recurrenceId: recDoc.id, reason: `Jour facturation ${r.jourFacturation} pas encore atteint (jour=${day})` });
        continue;
      }

      // Sauter si la date de début n'est pas encore atteinte
      const dateDebut = r.dateDebut || "";
      const todayStr = now.toISOString().split("T")[0];
      if (dateDebut > todayStr) {
        skipped.push({ recurrenceId: recDoc.id, reason: `Date début ${dateDebut} > aujourd'hui` });
        continue;
      }

      // Sauter si déjà résiliée et date passée
      if (r.dateFin && r.dateFin < todayStr) {
        skipped.push({ recurrenceId: recDoc.id, reason: `Résiliée le ${r.dateFin}` });
        continue;
      }

      // Idempotence : déjà facturée ce mois ?
      const dejaFact = (r.facturesGenerees || []).some((f: any) => f.mois === moisKey);
      if (dejaFact) {
        skipped.push({ recurrenceId: recDoc.id, reason: `Déjà facturée pour ${moisKey}` });
        continue;
      }

      // Création du paiement pending
      const tvaRate = r.tvaRate || 5.5;
      const montantTTC = r.montantTTC || 0;
      const priceHT = Math.round((montantTTC / (1 + tvaRate / 100)) * 100) / 100;

      const paymentRef = await adminDb.collection("payments").add({
        orderId: `REC-${Date.now().toString(36).toUpperCase()}-${generated.length}`,
        familyId: r.familyId,
        familyName: r.familyName,
        items: [{
          activityTitle: `${r.label} — ${moisLabel}`,
          childId: null,
          childName: null,
          priceHT,
          tva: tvaRate,
          priceTTC: montantTTC,
          type: "recurrence",
          recurrenceId: recDoc.id,
          moisFacture: moisKey,
        }],
        totalTTC: montantTTC,
        paymentMode: r.paymentMode || "virement",
        paymentRef: "",
        status: "pending",
        paidAmount: 0,
        recurrenceId: recDoc.id,
        date: new Date(),
      });

      // Mise à jour de la récurrence
      const newHistorique = [
        ...(r.facturesGenerees || []),
        { mois: moisKey, paymentId: paymentRef.id, generatedAt: new Date().toISOString() },
      ];
      // Limite : 12 dernières factures conservées dans l'historique
      if (newHistorique.length > 12) newHistorique.shift();

      await adminDb.collection("recurrences").doc(recDoc.id).update({
        facturesGenerees: newHistorique,
        updatedAt: new Date(),
      });

      generated.push({ recurrenceId: recDoc.id, label: r.label, paymentId: paymentRef.id });
    }

    console.log(`[cron/recurrences-monthly] ${generated.length} factures générées pour ${moisKey}, ${skipped.length} skipped`);

    return NextResponse.json({
      success: true,
      moisKey, moisLabel,
      generatedCount: generated.length,
      skippedCount: skipped.length,
      generated,
      skipped,
    });
  } catch (error: any) {
    console.error("[cron/recurrences-monthly] Erreur:", error);
    return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
  }
}
