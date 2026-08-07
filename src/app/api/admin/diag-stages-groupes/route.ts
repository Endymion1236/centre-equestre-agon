import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/diag-stages-groupes?date=2026-08-10
 *
 * Diagnostic de FRAGMENTATION des stages sur une semaine.
 *
 * Contexte : dans l'admin, les jours d'un même stage sont regroupés par la
 * fonction sameStage() (admin/planning/types.ts), qui se base en priorité sur
 * le champ `stageGroupId`. Si deux jours d'un même stage portent des
 * stageGroupId différents, l'application les considère comme DEUX stages
 * distincts. Conséquences observées :
 *   - la modale d'édition ne propose qu'une partie des jours ;
 *   - une inscription "semaine complète" n'inscrit que les jours d'un groupe ;
 *   - un changement de moniteur/horaire ne s'applique qu'à une partie.
 *
 * Cette route regroupe les créneaux de type stage en "familles" (ce qu'un
 * humain considère comme un même stage : même titre + même type + même heure
 * de début), puis compte le nombre de stageGroupId distincts dans chaque
 * famille. Plus d'un = stage fragmenté.
 *
 * LECTURE SEULE — aucune écriture Firestore.
 */

const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

type Jour = {
  id: string;
  date: string;
  jourFr: string;
  startTime: string;
  endTime: string;
  monitor: string;
  maxPlaces: number | null;
  nbInscrits: number;
  allowDayBooking: boolean;
  priceTTC: number | null;
  priceTTCDay: number | null;
  stageGroupId: string | null;
  activityId: string | null;
};

type Groupe = {
  stageGroupId: string | null;
  /** Libellé court pour l'affichage (A, B, C…) */
  label: string;
  jours: Jour[];
};

type Famille = {
  cle: string;
  activityTitle: string;
  activityType: string;
  startTime: string;
  endTime: string;
  nbJours: number;
  nbGroupes: number;
  fragmente: boolean;
  /** true si au moins un jour n'a aucun stageGroupId */
  aDesJoursSansGroupe: boolean;
  groupes: Groupe[];
};

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const dateParam = req.nextUrl.searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json(
      { error: "Paramètre 'date' requis au format YYYY-MM-DD (n'importe quel jour de la semaine)." },
      { status: 400 }
    );
  }

  // Calcul du lundi → dimanche en UTC midi (aucun décalage de fuseau possible).
  const d = new Date(dateParam + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = dimanche
  const lundi = new Date(d);
  lundi.setUTCDate(lundi.getUTCDate() - ((dow + 6) % 7));
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  const monStr = lundi.toISOString().split("T")[0];
  const sunStr = dimanche.toISOString().split("T")[0];

  const snap = await adminDb
    .collection("creneaux")
    .where("date", ">=", monStr)
    .where("date", "<=", sunStr)
    .get();

  const familles = new Map<string, Famille>();

  for (const doc of snap.docs) {
    const c = doc.data() as any;
    const type = c.activityType || "";
    if (type !== "stage" && type !== "stage_journee") continue;

    const title = c.activityTitle || "(sans titre)";
    const start = c.startTime || "—";
    // Une "famille" = ce qu'un humain appelle un même stage.
    const cle = `${title}__${type}__${start}`;

    if (!familles.has(cle)) {
      familles.set(cle, {
        cle,
        activityTitle: title,
        activityType: type,
        startTime: start,
        endTime: c.endTime || "—",
        nbJours: 0,
        nbGroupes: 0,
        fragmente: false,
        aDesJoursSansGroupe: false,
        groupes: [],
      });
    }
    const fam = familles.get(cle)!;

    const dateStr = c.date || "—";
    const jourFr =
      /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? JOURS_FR[new Date(dateStr + "T12:00:00Z").getUTCDay()]
        : "—";

    const jour: Jour = {
      id: doc.id,
      date: dateStr,
      jourFr,
      startTime: start,
      endTime: c.endTime || "—",
      monitor: c.monitor || "—",
      maxPlaces: typeof c.maxPlaces === "number" ? c.maxPlaces : null,
      nbInscrits: Array.isArray(c.enrolled) ? c.enrolled.length : 0,
      allowDayBooking: !!c.allowDayBooking,
      priceTTC: typeof c.priceTTC === "number" ? c.priceTTC : null,
      priceTTCDay: typeof c.priceTTCDay === "number" ? c.priceTTCDay : null,
      stageGroupId: c.stageGroupId || null,
      activityId: c.activityId || null,
    };

    const gid = jour.stageGroupId;
    let grp = fam.groupes.find(g => g.stageGroupId === gid);
    if (!grp) {
      grp = { stageGroupId: gid, label: "", jours: [] };
      fam.groupes.push(grp);
    }
    grp.jours.push(jour);
    if (!gid) fam.aDesJoursSansGroupe = true;
  }

  const resultat: Famille[] = [];
  for (const fam of familles.values()) {
    // Tri des jours dans chaque groupe, puis des groupes par 1re date.
    fam.groupes.forEach(g => g.jours.sort((a, b) => a.date.localeCompare(b.date)));
    fam.groupes.sort((a, b) =>
      (a.jours[0]?.date || "").localeCompare(b.jours[0]?.date || "")
    );
    fam.groupes.forEach((g, i) => {
      g.label = String.fromCharCode(65 + i); // A, B, C…
    });
    fam.nbJours = fam.groupes.reduce((n, g) => n + g.jours.length, 0);
    fam.nbGroupes = fam.groupes.length;
    fam.fragmente = fam.nbGroupes > 1;
    resultat.push(fam);
  }

  // Les stages cassés d'abord, puis par heure de début.
  resultat.sort((a, b) =>
    Number(b.fragmente) - Number(a.fragmente) ||
    a.startTime.localeCompare(b.startTime) ||
    a.activityTitle.localeCompare(b.activityTitle)
  );

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";

  return NextResponse.json({
    projectId,
    lundi: monStr,
    dimanche: sunStr,
    nb_familles: resultat.length,
    nb_fragmentes: resultat.filter(f => f.fragmente).length,
    familles: resultat,
  });
}
