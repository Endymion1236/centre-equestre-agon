/**
 * GET /api/admin/coherence
 *
 * Passe en revue ce que la machine peut vérifier seule : commandes soldées
 * sans numéro de facture, argent encaissé sans inscription au planning,
 * journal en désaccord avec la commande, réservations mal datées, prélèvements
 * sans écriture, places tenues jamais libérées, compteurs faux, cartes non
 * réglées.
 *
 * Lecture seule, strictement : cette route ne corrige rien. Les réparations
 * restent des gestes explicites, depuis les écrans concernés.
 *
 * La fenêtre de lecture des créneaux est bornée (30 jours en arrière, un an en
 * avant) : au-delà, le rapprochement n'apprend plus rien et la lecture coûte.
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { analyserCoherence, grouperAnomalies } from "@/lib/coherence";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const maintenant = new Date();
    const depuis = new Date(maintenant); depuis.setDate(depuis.getDate() - 30);
    const jusqua = new Date(maintenant); jusqua.setFullYear(jusqua.getFullYear() + 1);

    const [paySnap, crSnap, resaSnap, encSnap, sepaSnap, cartesSnap] = await Promise.all([
      adminDb.collection("payments").get(),
      adminDb.collection("creneaux")
        .where("date", ">=", ymd(depuis))
        .where("date", "<=", ymd(jusqua))
        .get(),
      adminDb.collection("reservations").get(),
      adminDb.collection("encaissements").get(),
      adminDb.collection("echeances-sepa").get(),
      adminDb.collection("cartes").get(),
    ]);

    const lire = (snap: FirebaseFirestore.QuerySnapshot) =>
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const anomalies = analyserCoherence({
      paiements: lire(paySnap),
      creneaux: lire(crSnap),
      reservations: lire(resaSnap),
      encaissements: lire(encSnap),
      echeancesSepa: lire(sepaSnap),
      cartes: lire(cartesSnap),
      maintenant,
    });

    const groupes = grouperAnomalies(anomalies);
    return NextResponse.json({
      analyseLe: maintenant.toISOString(),
      fenetre: { du: ymd(depuis), au: ymd(jusqua) },
      examines: {
        commandes: paySnap.size,
        creneaux: crSnap.size,
        reservations: resaSnap.size,
        encaissements: encSnap.size,
        echeancesSepa: sepaSnap.size,
        cartes: cartesSnap.size,
      },
      nb: anomalies.length,
      nbBloquants: anomalies.filter((a) => a.gravite === "bloquant").length,
      groupes,
    });
  } catch (e: any) {
    console.error("[coherence]", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Analyse interrompue : ${message}` }, { status: 500 });
  }
}
