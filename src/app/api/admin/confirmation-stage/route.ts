/**
 * Confirmations de stage en attente — mise en file et envoi manuel.
 *
 * POST { action?: "enfiler" | "envoyer" | "annuler", ... }
 *   - "enfiler" (défaut) : met une inscription de stage en attente d'envoi
 *     groupé. Le panneau d'inscription du planning appelle ceci à la place de
 *     /api/send-email : la famille reçoit UNE lettre pour tous les stages
 *     inscrits dans la foulée, pas une par stage.
 *   - "envoyer"  { familyId, force? } : envoie la file d'une famille. Par
 *     défaut sans attendre l'échéance ; force: false ne l'envoie que si
 *     l'échéance est atteinte (minuterie du navigateur).
 *   - "annuler"  { familyId } : abandonne la confirmation en attente.
 *
 * GET → files en attente (pour l'écran d'inscription).
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import {
  enfilerConfirmationStage,
  envoyerConfirmationFamille,
  annulerConfirmation,
  listerConfirmationsEnAttente,
  DELAI_MINUTES,
} from "@/lib/stage-confirmations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const familyId = req.nextUrl.searchParams.get("familyId") || "";
  const files = await listerConfirmationsEnAttente();
  return NextResponse.json({
    delaiMinutes: DELAI_MINUTES,
    files: familyId ? files.filter((f) => f.familyId === familyId) : files,
  });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({} as any));
  const action = body.action || "enfiler";
  const uid = (auth as any)?.uid || "admin";

  if (action === "envoyer") {
    if (!body.familyId) return NextResponse.json({ error: "familyId requis" }, { status: 400 });
    // force: false — l'appel vient de la minuterie du navigateur, qui ne doit
    // pas couper un regroupement qu'une inscription de dernière minute vient
    // de prolonger. Le bouton « Envoyer maintenant », lui, force.
    const r = await envoyerConfirmationFamille(body.familyId, {
      force: body.force !== false,
      declenchePar: uid,
    });
    return NextResponse.json(r);
  }

  if (action === "annuler") {
    if (!body.familyId) return NextResponse.json({ error: "familyId requis" }, { status: 400 });
    const annule = await annulerConfirmation(body.familyId);
    return NextResponse.json({ annule });
  }

  // ── Mise en file ────────────────────────────────────────────────────────
  const { familyId, familyName, email, paymentId, lienSepare, stage } = body;
  if (!familyId || !email || !stage?.stageKey) {
    return NextResponse.json(
      { error: "Champs requis : familyId, email, stage.stageKey" },
      { status: 400 },
    );
  }

  const r = await enfilerConfirmationStage({
    familyId,
    familyName: familyName || "",
    email,
    paymentId,
    lienSepare: !!lienSepare,
    stage: {
      stageKey: String(stage.stageKey),
      stageTitle: stage.stageTitle || "Stage",
      dates: stage.dates || "",
      dateDebut: stage.dateDebut || "",
      creneauId: stage.creneauId || "",
      enfants: Array.isArray(stage.enfants) ? stage.enfants : [],
      aRegler: Number(stage.aRegler) || 0,
      solde: Number(stage.solde) || 0,
    },
  });

  return NextResponse.json({ queued: true, delaiMinutes: DELAI_MINUTES, ...r });
}
