/**
 * GET  /api/admin/reset-test-data?secret=xxx
 * POST /api/admin/reset-test-data?secret=xxx&apply=true&confirm=I_KNOW_WHAT_IM_DOING
 *
 * Nettoie les données TRANSACTIONNELLES de la base (phase test) pour repartir
 * sur une base propre avant la mise en production de septembre 2026.
 *
 * PÉRIMÈTRE — validé explicitement par Nicolas :
 *
 * ✅ GARDÉ (intouché) :
 *   - families (cavaliers + parents + adresses)
 *   - reservations (historique complet passé + futur)
 *   - forfaits (engagements annuels en cours)
 *   - creneaux + leurs enrolled[] (activité équestre intacte)
 *   - pedagogie, progressions (suivi pédago)
 *   - Toute la cavalerie : equides, soins, mouvements_registre,
 *     documents_equide, passages (historique médical utile)
 *   - Config : activities, moniteurs, themes-stage, taches-type,
 *     email-templates, doc_templates, modeles, modeles-planning, settings,
 *     challenges, emailsReprise, indisponibilites, taches-planifiees
 *   - RH : salaries, salaries-management, management
 *   - Technique : push_tokens, audit_log, rate_limits
 *
 * 🗑️ VIDÉ :
 *   Finances : payments, paiements (legacy FR), encaissements,
 *              payment_declarations, avoirs, fidelite, cartes, bonsRecup,
 *              bons-cadeaux, mandats-sepa, echeances-sepa, remises-sepa,
 *              remises, rapprochements, invoice_audit, comptabilite,
 *              cawl_sessions, cawl_confirmations
 *   Secondaires : waitlist, rattrapages, avis-satisfaction, satisfaction,
 *                 communications, devis, rdv_pro
 *
 * SÉCURITÉ :
 *   - CRON_SECRET obligatoire
 *   - GET force toujours dry-run (même avec ?apply=true)
 *   - POST + ?apply=true + ?confirm=I_KNOW_WHAT_IM_DOING pour exécution
 *   - Journal d'audit dans audit_log
 *
 * ⚠️ OPÉRATION IRRÉVERSIBLE — aucune sauvegarde avant, à utiliser
 * uniquement pour passer de test à production.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max pour traiter toutes les collections

// Collections à vider entièrement (tous les docs, peu importe le propriétaire)
const COLLECTIONS_TO_WIPE = [
  // Finances
  "payments",
  "paiements",
  "encaissements",
  "payment_declarations",
  "avoirs",
  "fidelite",
  "cartes",
  "bonsRecup",
  "bons-cadeaux",
  "mandats-sepa",
  "echeances-sepa",
  "remises-sepa",
  "remises",
  "rapprochements",
  "invoice_audit",
  "comptabilite",
  "cawl_sessions",
  "cawl_confirmations",
  // Secondaires
  "waitlist",
  "rattrapages",
  "avis-satisfaction",
  "satisfaction",
  "communications",
  "devis",
  "rdv_pro",
];

interface ResetReport {
  mode: "dry-run" | "apply";
  counts: Record<string, number>;
  totalDocsAffected: number;
  errors: { collection: string; error: string }[];
  warnings: string[];
}

async function handleReset(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Route non configurée" }, { status: 500 });
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const confirm = req.nextUrl.searchParams.get("confirm");

  // Safety : apply nécessite la phrase de confirmation explicite
  if (apply && confirm !== "I_KNOW_WHAT_IM_DOING") {
    return NextResponse.json(
      {
        error:
          "Pour exécuter vraiment la suppression, il faut ajouter &confirm=I_KNOW_WHAT_IM_DOING",
        hint: "C'est une sécurité pour éviter les suppressions accidentelles.",
      },
      { status: 400 }
    );
  }

  const report: ResetReport = {
    mode: apply ? "apply" : "dry-run",
    counts: {},
    totalDocsAffected: 0,
    errors: [],
    warnings: [],
  };

  for (const collName of COLLECTIONS_TO_WIPE) {
    try {
      const snap = await adminDb.collection(collName).get();
      if (snap.empty) continue;

      report.counts[collName] = snap.size;
      report.totalDocsAffected += snap.size;

      if (apply) {
        // Batch par 400 (limite Firestore 500 opérations par batch)
        const BATCH_SIZE = 400;
        for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
          const chunk = snap.docs.slice(i, i + BATCH_SIZE);
          const batch = adminDb.batch();
          for (const doc of chunk) batch.delete(doc.ref);
          await batch.commit();
        }
      }
    } catch (e: any) {
      report.errors.push({
        collection: collName,
        error: e.message || String(e),
      });
    }
  }

  // Journal d'audit en mode apply
  if (apply) {
    try {
      await adminDb.collection("audit_log").add({
        type: "reset-test-data",
        totalDocsAffected: report.totalDocsAffected,
        counts: report.counts,
        errors: report.errors.length,
        performedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error("audit_log write failed:", e);
    }
  }

  return NextResponse.json({
    ...report,
    hint: apply
      ? `✅ Reset effectué. ${report.totalDocsAffected} docs supprimés dans ${Object.keys(report.counts).length} collections.`
      : "Dry-run terminé. Pour exécuter : POST + ?apply=true&confirm=I_KNOW_WHAT_IM_DOING",
    preserved: {
      note: "Les collections suivantes N'ONT PAS été touchées (contenu préservé)",
      families: "cavaliers + parents + adresses",
      activity: "reservations, forfaits, creneaux (enrolled[] inclus)",
      pedagogie: "pedagogie, progressions",
      cavalerie: "equides, soins, mouvements_registre, documents_equide, passages",
      config: "activities, moniteurs, themes-stage, taches-type, email-templates, doc_templates, modeles, modeles-planning, settings, challenges",
    },
  });
}

// GET : toujours dry-run (sécurité supplémentaire — une destruction se fait en POST)
export async function GET(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.search);
  params.delete("apply");
  const newUrl = new URL(
    req.nextUrl.pathname + "?" + params.toString(),
    req.nextUrl.origin
  );
  const dryRunReq = new NextRequest(newUrl, { headers: req.headers });
  return handleReset(dryRunReq);
}

export async function POST(req: NextRequest) {
  return handleReset(req);
}
