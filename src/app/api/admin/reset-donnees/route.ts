import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/reset-donnees
 *
 * Remise à zéro des DONNÉES en conservant la STRUCTURE métier.
 *
 * Pourquoi une route serveur (et pas le nettoyage client existant) :
 *   le nettoyage de la page Paramètres s'exécute côté navigateur et est soumis
 *   aux règles Firestore. Or certaines collections (ex. "encaissements") ont
 *   `allow delete: if false` (immuabilité comptable NF525) : le deleteDoc client
 *   échoue SILENCIEUSEMENT. Le SDK Admin (adminDb) contourne les règles et peut
 *   donc réellement tout effacer.
 *
 * SÉCURITÉ :
 *   - verifyAuth adminOnly.
 *   - GARDE-FOU : refuse si la base n'est PAS gestion-2026-test.
 *   - DRY-RUN par défaut (?apply=true pour effacer réellement).
 *   - LISTE BLANCHE EXPLICITE : on n'efface QUE les collections listées dans
 *     COLLECTIONS_A_EFFACER. Toute collection non listée (= structure) est
 *     intouchée par construction, même si elle est ajoutée plus tard.
 */

// Collections de STRUCTURE et DONNÉES CONSERVÉES — jamais touchées par cette route.
const COLLECTIONS_STRUCTURE = [
  // Structure métier
  "activities", "creneaux", "settings", "saisons", "vacationPeriods",
  "equides", "moniteurs", "salaries", "modeles", "modeles-planning",
  "modeles_stages", "themes-stage", "taches-type", "email-templates",
  "doc_templates", "marees", "recurrences", "databases", "challenges",
  "rate_limits",
  // Données conservées (decision Nicolas) : familles, suivi cavalier, presences
  "families", "progressions", "pedagogie", "notes-seance", "passages", "soins",
];

// Collections de DONNÉES FINANCIÈRES uniquement — effacées.
// Tout le reste (structure, familles, suivi, réservations, planning) est conservé.
const COLLECTIONS_A_EFFACER = [
  "paiements", "payments",
  "encaissements", "comptabilite", "cartes", "fidelite", "avoirs", "forfaits",
  "remises", "rapprochements", "cloturesJournalieres", "fondsDeCaisse",
  "mouvements_registre", "invoice_audit", "devis", "bons-cadeaux",
  "payment_declarations", "cheques-differes",
  "mandats-sepa", "echeances-sepa", "remises-sepa",
  "cawl_confirmations", "cawl_sessions",
];

async function deleteCollection(colName: string): Promise<number> {
  const col = adminDb.collection(colName);
  let deleted = 0;
  // Suppression par lots de 400 (limite batch Firestore = 500).
  while (true) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;
    const batch = adminDb.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return deleted;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  if (!projectId.includes("test")) {
    return NextResponse.json({
      error: "Refusé : remise à zéro autorisée uniquement sur la base TEST (gestion-2026-test).",
      projectId,
    }, { status: 403 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";

  const rapport: any = {
    projectId,
    mode: apply ? "APPLY (effacement réel)" : "DRY-RUN (comptage seul)",
    structure_conservee: COLLECTIONS_STRUCTURE,
    par_collection: {} as Record<string, number>,
    total_documents: 0,
  };

  for (const colName of COLLECTIONS_A_EFFACER) {
    try {
      if (apply) {
        const n = await deleteCollection(colName);
        rapport.par_collection[colName] = n;
        rapport.total_documents += n;
      } else {
        // Dry-run : on compte sans supprimer.
        const snap = await adminDb.collection(colName).count().get();
        const n = snap.data().count;
        rapport.par_collection[colName] = n;
        rapport.total_documents += n;
      }
    } catch (e: any) {
      rapport.par_collection[colName] = `ERREUR: ${e?.message || e}`;
    }
  }

  // NB : on conserve les réservations ET les inscrits des créneaux (enrolled).
  // Seul le financier pur est effacé. Le planning reste intact et cohérent.

  return NextResponse.json(rapport);
}
