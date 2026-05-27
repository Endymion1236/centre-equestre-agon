/**
 * POST /api/admin/send-activation
 *
 * Genere un lien magique Firebase Auth et l'envoie par email a une (ou
 * plusieurs) famille pilote(s). Phase 1 de la bascule prod septembre 2026.
 *
 * Pattern :
 *   1. Pour chaque familyId fourni, on recupere le doc famille -> email
 *   2. On verifie/cree le user Firebase Auth (sans mot de passe, juste email)
 *   3. adminAuth.generateSignInWithEmailLink() -> URL avec token unique
 *   4. Email Resend personnalise avec le lien
 *   5. Log de chaque envoi dans Firestore (collection 'activation-emails')
 *
 * Securite :
 *   - Auth admin obligatoire (verifyAuth)
 *   - dryRun: true par defaut -> n'envoie rien, retourne juste le plan
 *
 * Body :
 *   { familyIds: string[], dryRun?: boolean }
 *
 * Reponse :
 *   { results: [{ familyId, email, status: 'sent'|'skipped'|'failed', reason? }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { sendMagicLink } from "@/lib/magic-link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SendResult {
  familyId: string;
  parentName?: string;
  email?: string;
  status: "sent" | "skipped" | "failed" | "dryrun";
  reason?: string;
}

export async function POST(req: NextRequest) {
  // 🔒 Auth admin obligatoire
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { familyIds, dryRun = true } = await req.json();

    if (!Array.isArray(familyIds) || familyIds.length === 0) {
      return NextResponse.json(
        { error: "familyIds doit etre un tableau non vide" },
        { status: 400 },
      );
    }

    // Garde-fou : pas plus de 10 familles a la fois pour la phase pilote
    if (familyIds.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 familles par envoi en phase pilote (envoi en masse viendra plus tard)" },
        { status: 400 },
      );
    }

    const results: SendResult[] = [];

    for (const familyId of familyIds) {
      try {
        // ── 1. Recuperer la famille
        const famSnap = await adminDb.collection("families").doc(familyId).get();
        if (!famSnap.exists) {
          results.push({ familyId, status: "failed", reason: "Famille introuvable" });
          continue;
        }
        const fam = famSnap.data() as any;
        const email = (fam.parentEmail || "").trim().toLowerCase();
        const parentName = fam.parentName || "—";

        if (!email || !email.includes("@")) {
          results.push({ familyId, parentName, status: "skipped", reason: "Pas d'email valide" });
          continue;
        }

        // ── 2. Dry-run : on simule, on n'envoie rien
        if (dryRun) {
          results.push({
            familyId,
            parentName,
            email,
            status: "dryrun",
            reason: "Dry-run actif (aucun email envoye)",
          });
          continue;
        }

        // ── 3. Envoi via helper centralise (creation user Firebase auto,
        //      generation magic link, template HTML, envoi Resend, log,
        //      trace dans magic-link-events)
        const result = await sendMagicLink({
          email,
          parentName,
          context: "activation_pilote",
          familyId,
          sentBy: (auth as any)?.uid || "admin",
        });

        if (result.status === "failed") {
          results.push({ familyId, parentName, email, status: "failed", reason: result.error });
          continue;
        }

        results.push({ familyId, parentName, email, status: "sent" });

        // Trace dediee phase pilote (en plus de magic-link-events, qui
        // est general). Permet de filtrer specifiquement les envois
        // d'activation initiale dans le reporting bascule prod.
        await adminDb.collection("activation-emails").add({
          familyId,
          parentName,
          email,
          sentAt: new Date().toISOString(),
          sentBy: (auth as any)?.uid || "admin",
          phase: "pilote",
        });
      } catch (e: any) {
        console.error(`send-activation [${familyId}]:`, e);
        results.push({
          familyId,
          status: "failed",
          reason: e?.message || "Erreur inconnue",
        });
      }
    }

    const sent = results.filter(r => r.status === "sent").length;
    const failed = results.filter(r => r.status === "failed").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const dryruns = results.filter(r => r.status === "dryrun").length;

    return NextResponse.json({
      dryRun,
      summary: { total: familyIds.length, sent, failed, skipped, dryruns },
      results,
    });
  } catch (e: any) {
    console.error("send-activation fatal:", e);
    return NextResponse.json(
      { error: e?.message || "Erreur interne" },
      { status: 500 },
    );
  }
}
