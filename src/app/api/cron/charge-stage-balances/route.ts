import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Cron job — Prélèvement automatique des soldes de stage
 * 
 * Appelé quotidiennement par Vercel Cron.
 * Cherche les payments avec :
 *   - status "partial" (acompte payé, solde dû)
 *   - stageDate dans les 3 prochains jours
 *   - stripeCustomerId renseigné
 * 
 * Pour chaque, prélève le solde via /api/stripe/charge-balance
 * 
 * Configuration Vercel : ajouter dans vercel.json :
 * {
 *   "crons": [{
 *     "path": "/api/cron/charge-stage-balances",
 *     "schedule": "0 8 * * *"
 *   }]
 * }
 */
export async function GET(req: NextRequest) {
  // Vérifier l'auth (Vercel cron envoie un header Authorization)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Importer Firebase client-side n'est pas possible ici (API route)
    // On va utiliser l'API REST Firestore ou firebase-admin
    // Pour l'instant, on retourne les instructions
    return NextResponse.json({
      message: "Cron charge-stage-balances — à implémenter avec firebase-admin",
      instructions: [
        "1. Installer firebase-admin",
        "2. Chercher payments avec status=partial et stageDate <= J+3",
        "3. Pour chaque, appeler /api/stripe/charge-balance",
        "4. Mettre à jour le payment avec status=paid",
        "5. Créer un encaissement dans le journal",
        "6. Envoyer un email de confirmation au parent",
      ],
      note: "En attendant, le prélèvement peut être déclenché manuellement depuis la page Paiements",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
