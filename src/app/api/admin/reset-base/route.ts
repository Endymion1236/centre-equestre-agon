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
import { assertResetAllowed, isProdEnvironment, getActiveProjectId, PROD_UNLOCK_PHRASE } from "@/lib/reset-guard";

// Emails admin reconnus sans custom claim (aligne avec api-auth.ts).
// Permet le reset sur une base sans claims (ex: base de test).
const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"];
function isAdmin(d: any): boolean {
  return d.admin === true || ADMIN_EMAILS.includes(d.email || "");
}

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (Pro Vercel plan) pour laisser le temps aux suppressions

// ═════════════════════════════════════════════════════════════════════════
// GARDE-FOU TEMPOREL — DATE BUTOIR DE L'OUTIL
// ═════════════════════════════════════════════════════════════════════════
// Cet outil sert à vider la base de test AVANT la bascule en production
// officielle (prévue septembre 2026). Après cette date, l'outil ne doit
// plus être utilisable. La protection ci-dessous bloque toute utilisation
// après le 1er juillet 2026 (marge de sécurité par rapport à septembre).
//
// Pour être complet, l'idéal est de SUPPRIMER entièrement ce fichier après
// usage (voir docs/PROCEDURE_BASCULE_PROD.md). Cette date butoir est une
// protection supplémentaire au cas où la suppression serait oubliée.
const DATE_BUTOIR = new Date("2026-07-01T00:00:00Z");
// ═════════════════════════════════════════════════════════════════════════

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
    // ─── 0. Garde-fou temporel ────────────────────────────────────
    // Cet outil est réservé à la phase de pré-production (avant juillet 2026).
    // Après la date butoir, toute utilisation est refusée — même par l'admin.
    if (new Date() > DATE_BUTOIR) {
      return NextResponse.json({
        error: `Outil désactivé depuis le ${DATE_BUTOIR.toLocaleDateString("fr-FR")}. ` +
               `Cet outil était réservé à la phase de tests avant la mise en production. ` +
               `La comptabilité étant désormais en production, aucune réinitialisation n'est plus possible.`,
      }, { status: 410 }); // 410 Gone = ressource définitivement indisponible
    }

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
    if (!isAdmin(decoded)) {
      return NextResponse.json({ error: "Admin requis" }, { status: 403 });
    }

    // ─── 2. Validation du body ──────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { confirmation, collections, dryRun } = body as {
      confirmation?: string;
      collections?: string[];
      dryRun?: boolean;
    };

    // ─── 2bis. Garde-fou anti-reset-prod ─────────────────────────
    // Bloque si on est sur la base de prod (gestion-2026) sans deblocage
    // explicite. Protege contre une mauvaise config Vercel qui ferait
    // pointer la branche test vers la prod. Pas applique en dry-run (qui
    // ne supprime rien).
    if (!dryRun) {
      const guard = assertResetAllowed(body);
      if (guard) return guard;
    }

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
    // Pas plus d'un reset toutes les 30 secondes.
    // Note : on filtre uniquement par createdAt (1 condition) pour eviter
    // de necessiter un index composite Firestore. Le filtre dryRun est
    // applique cote JS apres recuperation des resultats.
    const cooldownAgo = new Date(Date.now() - 30 * 1000);
    const recentSnap = await adminDb
      .collection("resetLogs")
      .where("createdAt", ">=", cooldownAgo)
      .limit(20)
      .get();
    const realResetRecent = recentSnap.docs.some(d => d.data()?.dryRun === false);
    if (!dryRun && realResetRecent) {
      return NextResponse.json({
        error: "Un reset a déjà été effectué dans les 30 dernières secondes. Veuillez patienter.",
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
    // Garde-fou temporel (cohérent avec POST)
    if (new Date() > DATE_BUTOIR) {
      return NextResponse.json({
        error: `Outil désactivé depuis le ${DATE_BUTOIR.toLocaleDateString("fr-FR")}.`,
        dateButoir: DATE_BUTOIR.toISOString(),
      }, { status: 410 });
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!isAdmin(decoded)) {
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
      isProd: isProdEnvironment(),
      activeProjectId: getActiveProjectId(),
      prodUnlockPhrase: PROD_UNLOCK_PHRASE,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
