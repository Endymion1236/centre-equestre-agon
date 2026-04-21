/**
 * Export JSON complet de la base de données (toutes les collections).
 * Utilisé comme sauvegarde avant un reset.
 *
 * Réservé admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Toutes les collections connues (pour export complet)
const ALL_COLLECTIONS = [
  "encaissements", "payments", "cloturesJournalieres", "fondsDeCaisse",
  "remises", "waitlist", "reservations", "avoirs", "emailsSent", "emailsReprise",
  "payment_declarations", "cheques-differes", "fidelite_transactions",
  "rattrapages", "devis", "cards", "sepa_mandats", "sepa_remises", "sepa_echeances",
  "forfaits", "creneaux", "indispos", "soins", "families", "equides", "activities",
  "emailTemplates", "settings", "resetLogs", "fidelite_soldes",
];

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

    // Récupération de toutes les collections en parallèle
    const backup: Record<string, any[]> = {};
    await Promise.all(
      ALL_COLLECTIONS.map(async (coll) => {
        try {
          const snap = await adminDb.collection(coll).get();
          backup[coll] = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          }));
        } catch (e) {
          console.warn(`[backup] échec sur ${coll}:`, e);
          backup[coll] = [];
        }
      })
    );

    const meta = {
      exportedAt: new Date().toISOString(),
      exportedBy: decoded.email || decoded.uid,
      totalDocuments: Object.values(backup).reduce((s, arr) => s + arr.length, 0),
      collections: Object.fromEntries(Object.entries(backup).map(([k, v]) => [k, v.length])),
    };

    const filename = `backup-centre-equestre-${new Date().toISOString().split("T")[0]}.json`;

    return new NextResponse(JSON.stringify({ _meta: meta, data: backup }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("[backup-json] erreur:", e);
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
