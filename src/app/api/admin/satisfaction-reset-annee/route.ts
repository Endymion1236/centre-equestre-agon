import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Réinitialise les invitations du questionnaire de fin de saison `annee_${N}`.
 * Supprime UNIQUEMENT les invitations sans réponse (repondu !== true).
 * Utile pour repartir propre avant l'envoi réel (ex. après des envois de test).
 * Les invitations ayant reçu une réponse ne sont JAMAIS supprimées.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const isProd = !projectId.includes("test");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const N = Number(body?.saison);
  if (!Number.isFinite(N) || N < 2000) {
    return NextResponse.json({ error: "Paramètre 'saison' invalide (ex. 2025)." }, { status: 400 });
  }
  const dryRun = body?.dryRun !== false; // aperçu par défaut
  const confirmProd = String(body?.confirmProd || "");

  if (!dryRun && isProd && confirmProd !== "RESET-ANNEE-PROD") {
    return NextResponse.json(
      { error: "Suppression réelle en PRODUCTION refusée : confirmProd=RESET-ANNEE-PROD requis.", projectId },
      { status: 403 },
    );
  }

  const stageKey = `annee_${N}`;
  const snap = await adminDb
    .collection("satisfaction-invitations")
    .where("stageKey", "==", stageKey)
    .get();

  const toDelete: FirebaseFirestore.DocumentReference[] = [];
  let avecReponse = 0;
  snap.forEach((d) => {
    const inv = d.data() as any;
    if (inv.repondu === true) { avecReponse++; return; } // jamais supprimer une réponse
    toDelete.push(d.ref);
  });

  let deleted = 0;
  if (!dryRun) {
    for (let i = 0; i < toDelete.length; i += 400) {
      const chunk = toDelete.slice(i, i + 400);
      const batch = adminDb.batch();
      for (const ref of chunk) batch.delete(ref);
      await batch.commit();
      deleted += chunk.length;
    }
  }

  return NextResponse.json({
    projectId, isProd, dryRun, saison: N, stageKey,
    total: snap.size,
    aSupprimer: toDelete.length,
    deleted,
    avecReponse,
  });
}
