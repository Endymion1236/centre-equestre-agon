import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/diag-stages-semaine?semaine=2026-07-06
 *
 * Liste les STAGES de la semaine demandée (lundi → dimanche), regroupés par
 * stage multi-jours, avec leurs IDs de créneaux. Sert à mapper les libellés
 * de l'import Celeris (ex. "Stage galop de bronze 6/7 ans") vers les vrais
 * créneaux Firestore (qui peuvent porter un libellé légèrement différent,
 * ex. "...6/7 ans (copie)"), AVANT l'inscription sans paiement.
 *
 * Lecture seule (aucune écriture). Réservé aux admins connectés.
 *
 * Un stage = tous les créneaux activityType "stage"/"stage_journee" partageant
 * le même activityTitle sur la semaine. stageKey = activityTitle_premierJour.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const semaine = req.nextUrl.searchParams.get("semaine") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine)) {
    return NextResponse.json({
      error: "Paramètre 'semaine' requis au format YYYY-MM-DD (lundi de la semaine), ex. 2026-07-06.",
    }, { status: 400 });
  }

  // La semaine fournie EST le lundi. On calcule le dimanche (= +6 jours).
  // Calcul en UTC midi pour éviter tout décalage de fuseau côté serveur Vercel.
  const lundi = new Date(semaine + "T12:00:00Z");
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  const monStr = semaine;
  const sunStr = dimanche.toISOString().split("T")[0];

  // Requête bornée sur la semaine (date est une chaîne "YYYY-MM-DD", triable).
  const snap = await adminDb
    .collection("creneaux")
    .where("date", ">=", monStr)
    .where("date", "<=", sunStr)
    .get();

  type Jour = { id: string; date: string; startTime: string; endTime: string; nbInscrits: number };
  type StageGroup = {
    activityTitle: string;
    activityType: string;
    monitor: string;
    startTime: string;
    endTime: string;
    priceTTC: number | null;
    stageKey: string;
    jours: Jour[];
    creneauIds: string[];
    dates: string[];
    nbInscritsMax: number;
  };

  const groupes = new Map<string, StageGroup>();

  for (const d of snap.docs) {
    const c = d.data() as any;
    const type = c.activityType || "";
    if (type !== "stage" && type !== "stage_journee") continue;

    const title = c.activityTitle || "(sans titre)";
    // Clé de regroupement : titre + type (un même titre peut exister en stage
    // ET stage_journee — on les sépare proprement).
    const key = `${title}__${type}`;
    if (!groupes.has(key)) {
      groupes.set(key, {
        activityTitle: title,
        activityType: type,
        monitor: c.monitor || "—",
        startTime: c.startTime || "—",
        endTime: c.endTime || "—",
        priceTTC: c.priceTTC ?? null,
        stageKey: "", // calculé après tri des jours
        jours: [],
        creneauIds: [],
        dates: [],
        nbInscritsMax: 0,
      });
    }
    const g = groupes.get(key)!;
    const nbInscrits = (c.enrolled || []).length;
    g.jours.push({
      id: d.id,
      date: c.date || "—",
      startTime: c.startTime || "—",
      endTime: c.endTime || "—",
      nbInscrits,
    });
    if (nbInscrits > g.nbInscritsMax) g.nbInscritsMax = nbInscrits;
  }

  // Finaliser chaque groupe : trier les jours par date, déduire IDs/dates/stageKey.
  const stages: StageGroup[] = [];
  for (const g of groupes.values()) {
    g.jours.sort((a, b) => a.date.localeCompare(b.date));
    g.creneauIds = g.jours.map(j => j.id);
    g.dates = g.jours.map(j => j.date);
    g.stageKey = `${g.activityTitle}_${g.dates[0] || monStr}`;
    stages.push(g);
  }
  // Tri d'affichage : par heure de début puis titre.
  stages.sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.activityTitle.localeCompare(b.activityTitle)
  );

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";

  return NextResponse.json({
    projectId,
    semaine,
    lundi: monStr,
    dimanche: sunStr,
    nb_stages: stages.length,
    stages,
  });
}
