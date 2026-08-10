import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 300;

/**
 * GET /api/public/poneys
 *
 * Poneys mis en avant sur la page Équipe, pour les visiteurs non connectés.
 *
 * La page lisait auparavant la collection `equides` directement depuis le
 * navigateur. Or les règles Firestore réservent cette lecture au staff : un
 * visiteur anonyme recevait une erreur, et la page affichait « Les portraits
 * arrivent bientôt » alors que les fiches existaient bel et bien.
 *
 * Cette route lit côté serveur (le SDK admin ne passe pas par les règles) et
 * ne renvoie QUE les champs destinés au public. Les données sensibles de la
 * cavalerie — santé, propriétaire, coûts, historique vétérinaire — ne quittent
 * jamais le serveur.
 */
export async function GET() {
  try {
    const snap = await adminDb
      .collection("equides")
      .where("featured", "==", true)
      .get();

    const poneys = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter(
        (h) =>
          h.status === "actif" &&
          typeof h.photo === "string" &&
          h.photo.trim()
      )
      .map((h) => ({
        id: h.id,
        name: String(h.surnom || h.name || "").trim(),
        type:
          h.type === "shetland" ? "Shetland"
          : h.type === "cheval" ? "Cheval"
          : h.type === "ane" ? "Âne"
          : "Poney",
        niveauCavalier: h.niveauCavalier || "Tous niveaux",
        publicDescription: h.publicDescription || "",
        photo: h.photo,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      { poneys },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e) {
    console.error("[api/public/poneys]", e);
    return NextResponse.json({ poneys: [] });
  }
}
