import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/admin/backup-all
 *
 * Sauvegarde COMPLÈTE de toutes les collections en un seul JSON (LECTURE SEULE).
 * À lancer avant toute opération destructive (ex. reset financier) pour pouvoir
 * restaurer en cas de problème.
 *
 * SÉCURITÉ : verifyAuth adminOnly. Aucune écriture. Sans danger en prod.
 *
 * Les Timestamps Firestore sont sérialisés en {__ts__: ISO} pour être
 * réimportables sans perte. Les autres types (string, number, bool, array,
 * map) passent tels quels via JSON.
 */

// Toutes les collections connues du projet (issues des règles Firestore +
// quelques-unes hors règles). On lit tout ce qui existe ; une collection vide
// renvoie simplement [].
const COLLECTIONS = [
  "activities", "audit_log", "avis-satisfaction", "avoirs", "bons-cadeaux",
  "bonsRecup", "cartes", "cawl_confirmations", "cawl_sessions", "challenges",
  "cloturesJournalieres", "communications", "comptabilite", "creneaux",
  "databases", "devis", "doc_templates", "documents_equide", "echeances-sepa",
  "email-templates", "emailsReprise", "emailsSent", "cheques-differes",
  "encaissements", "equides", "families", "fidelite", "fondsDeCaisse",
  "forfaits", "galerie_photos", "indisponibilites", "invoice_audit",
  "management", "mandats-sepa", "marees", "modeles", "modeles-planning",
  "modeles_stages", "moniteurs", "mouvements_registre", "notes-seance",
  "paiements", "passages", "payment_declarations", "payments", "pedagogie",
  "progressions", "push_tokens", "rapprochements", "rate_limits", "rattrapages",
  "rdv_pro", "recurrences", "remises", "remises-sepa", "reservations",
  "resetLogs", "saisons", "salaries", "salaries-management", "satisfaction",
  "settings", "soins", "taches-planifiees", "taches-type", "themes-stage",
  "vacationPeriods", "waitlist",
];

// Sérialise récursivement une valeur Firestore en JSON réimportable.
function serialize(v: any): any {
  if (v == null) return v;
  if (typeof v.toDate === "function") return { __ts__: v.toDate().toISOString() };
  if (v._seconds != null && v._nanoseconds != null) return { __ts__: new Date(v._seconds * 1000).toISOString() };
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = serialize(v[k]);
    return out;
  }
  return v;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";

  const backup: Record<string, any[]> = {};
  const compteur: Record<string, number> = {};

  for (const col of COLLECTIONS) {
    try {
      const snap = await adminDb.collection(col).get();
      const docs: any[] = [];
      snap.forEach(d => docs.push({ __id__: d.id, ...serialize(d.data()) }));
      backup[col] = docs;
      compteur[col] = docs.length;
    } catch (e: any) {
      backup[col] = [];
      compteur[col] = -1; // -1 = erreur de lecture
    }
  }

  const total = Object.values(compteur).reduce((a, b) => a + (b > 0 ? b : 0), 0);

  return NextResponse.json({
    projectId,
    date: new Date().toISOString(),
    total_documents: total,
    compteur,
    collections: backup,
  });
}
