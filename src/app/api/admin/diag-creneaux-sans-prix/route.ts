/**
 * GET /api/admin/diag-creneaux-sans-prix?secret=xxx
 *
 * Liste tous les créneaux actifs dont priceTTC est absent ou à 0.
 *
 * Contexte : Nicolas a constaté des cavaliers "non réglés" au planning mais
 * sans payment pending correspondant. Cause : si un créneau a priceTTC=0,
 * le code handleEnroll saute silencieusement la création du payment, donc
 * l'inscription marche visuellement mais aucune trace financière n'existe.
 *
 * Cet endpoint aide Nicolas à trouver les créneaux concernés pour les
 * corriger (soit leur donner un prix, soit les supprimer si obsolètes).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Route non configurée" }, { status: 500 });
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  try {
    const snap = await adminDb.collection("creneaux").get();

    const creneauxSansPrix: Array<{
      id: string;
      date: string;
      activityTitle: string;
      activityType: string;
      startTime: string;
      endTime: string;
      monitor: string;
      priceTTC: number | null | undefined;
      priceHT: number | null | undefined;
      nbInscrits: number;
      inscrits: Array<{ childId: string; childName: string; familyName: string; paymentSource: string | null }>;
    }> = [];

    for (const d of snap.docs) {
      const c = d.data();
      const priceTTC = c.priceTTC;
      const priceHT = c.priceHT;
      // On considère "sans prix" si priceTTC manquant/0 ET priceHT manquant/0
      const hasNoPrice = (!priceTTC || priceTTC === 0) && (!priceHT || priceHT === 0);

      if (hasNoPrice) {
        const enrolled = c.enrolled || [];
        creneauxSansPrix.push({
          id: d.id,
          date: c.date || "—",
          activityTitle: c.activityTitle || "—",
          activityType: c.activityType || "—",
          startTime: c.startTime || "—",
          endTime: c.endTime || "—",
          monitor: c.monitor || "—",
          priceTTC: priceTTC ?? null,
          priceHT: priceHT ?? null,
          nbInscrits: enrolled.length,
          inscrits: enrolled.map((e: any) => ({
            childId: e.childId || "—",
            childName: e.childName || "—",
            familyName: e.familyName || "—",
            paymentSource: e.paymentSource || null,
          })),
        });
      }
    }

    // Tri : ceux avec le plus d'inscrits d'abord (plus urgent à corriger)
    creneauxSansPrix.sort((a, b) => b.nbInscrits - a.nbInscrits);

    const totalCreneaux = snap.size;
    const totalConcernes = creneauxSansPrix.length;
    const totalInscritsImpactes = creneauxSansPrix.reduce((s, c) => s + c.nbInscrits, 0);

    return NextResponse.json({
      summary: {
        totalCreneaux,
        creneauxSansPrix: totalConcernes,
        inscritsImpactes: totalInscritsImpactes,
        pourcentage: totalCreneaux > 0 ? Math.round((totalConcernes / totalCreneaux) * 100) : 0,
      },
      creneauxSansPrix,
      hint: totalConcernes === 0
        ? "✅ Tous les créneaux ont un prix défini. Le bug d'inscription sans payment vient d'ailleurs."
        : `⚠️ ${totalConcernes} créneau(x) sans prix, impactant ${totalInscritsImpactes} inscription(s). Corrige leur priceTTC depuis le planning, ou s'ils sont obsolètes, supprime-les.`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Erreur serveur", message: e.message || String(e) },
      { status: 500 }
    );
  }
}
