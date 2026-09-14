import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { adminDb } from "@/lib/firebase-admin";
import { toParisDateString } from "@/lib/date-local";
import { construireTableauDuJour, heureParis, type CreneauBrut } from "@/lib/borne-tableau";

export const dynamic = "force-dynamic";

/**
 * GET /api/borne/tableau — les cours du jour avec les prénoms des cavaliers,
 * pour le « tableau du jour » de la borne (voir lib/borne-tableau).
 *
 * Réservé à une tablette connectée (comme le reste de la borne), limité en
 * débit. Lecture seule ; ne renvoie que titre, horaire, moniteur et prénoms.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rl = await checkRateLimit({ uid: auth.uid, routeKey: "borne_tableau", limit: 12, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const aujourdhui = toParisDateString();
    // Heure de Paris, en cycle 0–23 explicite : `hour12: false` donnait
    // « 00:15 » à midi et quart sur Vercel (cycle h11), ce qui envoyait tous
    // les cours de l'après-midi dans « plus tard » et effaçait ceux du matin.
    const heure = heureParis(new Date());
    const snap = await adminDb.collection("creneaux").where("date", "==", aujourdhui).get();
    const creneaux: CreneauBrut[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CreneauBrut, "id">) }));
    const cartes = construireTableauDuJour(creneaux, heure);
    return NextResponse.json({ date: aujourdhui, heure, cartes });
  } catch (e) {
    console.error("[borne/tableau]", e);
    return NextResponse.json({ error: "Tableau indisponible" }, { status: 500 });
  }
}
