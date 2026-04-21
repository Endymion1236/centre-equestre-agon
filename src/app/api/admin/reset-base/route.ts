/**
 * Route API de réinitialisation sélective de la base de données.
 *
 * RÉSERVÉ À L'ADMIN UNIQUEMENT.
 *
 * Permet de vider certaines collections (typiquement les données
 * transactionnelles de test) tout en conservant la configuration.
 *
 * Garde-fous :
 * 1. Authentification admin obligatoire (vérif du custom claim)
 * 2. Phrase de confirmation exacte requise dans le body
 * 3. Log d'audit inaltérable dans la collection `resetLogs`
 * 4. Utilise adminDb pour bypass légitime des règles d'inaltérabilité
 *    Firestore (c'est le seul usage légitime de ce bypass)
 *
 * Ce n'est PAS une opération de conformité comptable — c'est une
 * opération de gestion technique avant mise en prod. La chaîne de
 * hashs repartira proprement après le reset.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (Pro Vercel plan) pour laisser le temps aux suppressions

// Collections que l'utilisateur peut choisir d'effacer
const RESETTABLE_COLLECTIONS = [
  // ─── Transactionnel ─────────────────────────────────
  "encaissements",
  "payments",
  "cloturesJournalieres",
  "fondsDeCaisse",
  "remises",
  "waitlist",
  "reservations",
  "avoirs",
  "emailsSent",
  "emailsReprise",
  "payment_declarations",
  "cheques-differes",
  "fidelite_transactions",
  "rattrapages",
  "devis",
  "cards", // cartes cadeau / carnets
  "sepa_mandats",
  "sepa_remises",
  "sepa_echeances",
  // ─── Métier (optionnel) ─────────────────────────────
  "forfaits",
  "creneaux",
  "indispos",
  "soins",
  "families", // ⚠️ supprime aussi les enfants imbriqués
  "equides",
  "activities",
] as const;

type ResettableCollection = typeof RESETTABLE_COLLECTIONS[number];

const CONFIRMATION_PHRASE = "SUPPRIMER-DONNEES-TEST";

export async function POST(req: NextRequest) {
  try {
    // ─── 1. Authentification ─────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }
    if (!decoded.admin) {
      return NextResponse.json({ error: "Admin requis" }, { status: 403 });
    }

    // ─── 2. Validation du body ──────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { confirmation, collections, dryRun } = body as {
      confirmation?: string;
      collections?: string[];
      dryRun?: boolean;
    };

    if (!dryRun && confirmation !== CONFIRMATION_PHRASE) {
      return NextResponse.json({
        error: `Phrase de confirmation incorrecte. Attendu : "${CONFIRMATION_PHRASE}"`,
      }, { status: 400 });
    }

    if (!Array.isArray(collections) || collections.length === 0) {
      return NextResponse.json({ error: "Aucune collection sélectionnée" }, { status: 400 });
    }

    // Validation : seules les collections autorisées peuvent être effacées
    const invalid = collections.filter(c => !RESETTABLE_COLLECTIONS.includes(c as ResettableCollection));
    if (invalid.length > 0) {
      return NextResponse.json({
        error: `Collections non autorisées : ${invalid.join(", ")}`,
      }, { status: 400 });
    }

    // ─── 3. Rate limit ──────────────────────────────────────────
    // Pas plus d'un reset toutes les 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentSnap = await adminDb
      .collection("resetLogs")
      .where("createdAt", ">=", tenMinAgo)
      .where("dryRun", "==", false)
      .limit(1)
      .get();
    if (!dryRun && !recentSnap.empty) {
      return NextResponse.json({
        error: "Un reset a déjà été effectué dans les 10 dernières minutes. Veuillez patienter.",
      }, { status: 429 });
    }

    // ─── 4. Suppression (ou simulation) ─────────────────────────
    const results: Record<string, { countBefore: number; countAfter: number; deleted: number }> = {};
    const startTime = Date.now();

    for (const coll of collections) {
      const snap = await adminDb.collection(coll).get();
      const countBefore = snap.size;
      let deleted = 0;

      if (!dryRun) {
        // Suppression par batchs de 500 (limite Firestore)
        const BATCH_SIZE = 500;
        for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
          const batch = adminDb.batch();
          const slice = snap.docs.slice(i, i + BATCH_SIZE);
          slice.forEach(d => batch.delete(d.ref));
          await batch.commit();
          deleted += slice.length;
        }
      }

      results[coll] = {
        countBefore,
        countAfter: dryRun ? countBefore : 0,
        deleted: dryRun ? 0 : deleted,
      };
    }

    const durationMs = Date.now() - startTime;

    // ─── 5. Log d'audit inaltérable ─────────────────────────────
    await adminDb.collection("resetLogs").add({
      dryRun: !!dryRun,
      collections: collections,
      results,
      durationMs,
      byUid: decoded.uid,
      byEmail: decoded.email || "",
      ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
      userAgent: req.headers.get("user-agent") || "",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      dryRun: !!dryRun,
      results,
      durationMs,
      totalDeleted: Object.values(results).reduce((s, r) => s + r.deleted, 0),
    });
  } catch (e: any) {
    console.error("[reset-base] erreur:", e);
    return NextResponse.json({
      error: e?.message || "Erreur interne",
    }, { status: 500 });
  }
}

// GET : liste des collections disponibles et leur comptage actuel
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.admin) {
      return NextResponse.json({ error: "Admin requis" }, { status: 403 });
    }

    const counts: Record<string, number> = {};
    await Promise.all(
      RESETTABLE_COLLECTIONS.map(async (coll) => {
        try {
          const snap = await adminDb.collection(coll).count().get();
          counts[coll] = snap.data().count;
        } catch {
          counts[coll] = 0;
        }
      })
    );

    return NextResponse.json({
      collections: RESETTABLE_COLLECTIONS,
      counts,
      confirmationPhrase: CONFIRMATION_PHRASE,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
