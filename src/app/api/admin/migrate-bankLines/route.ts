/**
 * GET  /api/admin/migrate-bankLines  → dry-run (analyse sans modifier)
 * POST /api/admin/migrate-bankLines  → exécution réelle (avec confirm token)
 *
 * Scanne tous les documents `rapprochements/*` et redistribue chaque bankLine
 * dans le doc `rapprochements/{YYYY-MM}` correspondant à la date réelle de la
 * bankLine (extraite de bl.date au format DD/MM/YYYY).
 *
 * Idempotent : si toutes les bankLines sont déjà dans le bon doc, le POST ne
 * modifie rien et renvoie nbDeplacees: 0.
 *
 * Body POST : { confirm: "MIGRATE-BANKLINES" }
 *
 * Auth admin obligatoire (claim ou email admin connu).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAILS = [
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
];

const CONFIRM_TOKEN = "MIGRATE-BANKLINES";

export const dynamic = "force-dynamic";

async function checkAdmin(req: NextRequest): Promise<{ ok: boolean; email?: string; error?: string }> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { ok: false, error: "Token manquant" };
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const isAdmin = decoded.admin === true || ADMIN_EMAILS.includes(decoded.email || "");
    if (!isAdmin) return { ok: false, error: "Réservé admin" };
    return { ok: true, email: decoded.email };
  } catch (e) {
    return { ok: false, error: "Token invalide" };
  }
}

/**
 * Lit tous les docs rapprochements/* et calcule la redistribution attendue.
 *
 * Retourne :
 * - byNewMonth : Map { ym → bankLines[] } = ce que chaque doc devrait contenir
 * - stats : { nbDocs, nbBls, nbBlsMalRangees, nbBlsOrphelines }
 * - bls orphelines : celles dont la date est invalide (on ne sait pas où
 *   les ranger, on les laisse où elles sont)
 */
async function analyzeRedistribution() {
  const snap = await adminDb.collection("rapprochements").get();
  const docs: Array<{ id: string; bankLines: any[] }> = [];
  for (const d of snap.docs) {
    const data = d.data() as any;
    docs.push({ id: d.id, bankLines: Array.isArray(data.bankLines) ? data.bankLines : [] });
  }

  // Map de chaque bankLine vers le ym qu'elle doit avoir d'après sa date
  const keyOf = (bl: any) => `${bl.date}|${bl.label}|${Math.round((bl.amount || 0) * 100)}`;

  // newDocsMap : ym → Map<key, bankLine>  (Map pour dédupliquer en cas de doublons)
  const newDocsMap = new Map<string, Map<string, any>>();
  const orphans: Array<{ docId: string; bl: any; reason: string }> = [];

  let nbBls = 0;
  let nbBlsMalRangees = 0;

  for (const doc of docs) {
    for (const bl of doc.bankLines) {
      nbBls++;
      const m = bl.date?.match?.(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) {
        orphans.push({ docId: doc.id, bl, reason: "date invalide" });
        // On garde la bankLine dans son doc d'origine pour ne pas la perdre
        if (!newDocsMap.has(doc.id)) newDocsMap.set(doc.id, new Map());
        newDocsMap.get(doc.id)!.set(keyOf(bl), bl);
        continue;
      }
      const targetYm = `${m[3]}-${m[2].padStart(2, "0")}`;
      if (targetYm !== doc.id) nbBlsMalRangees++;
      if (!newDocsMap.has(targetYm)) newDocsMap.set(targetYm, new Map());
      // En cas de doublons (même bankLine dans plusieurs docs), on garde celui
      // qui est "matched" en priorité (on ne perd pas un pointage existant).
      // Sinon on garde le premier rencontré (ils devraient être identiques).
      const existing = newDocsMap.get(targetYm)!.get(keyOf(bl));
      if (!existing || (bl.matched && !existing.matched)) {
        newDocsMap.get(targetYm)!.set(keyOf(bl), bl);
      }
    }
  }

  // Convertir vers Record { ym → bankLines[] }
  const byNewMonth: Record<string, any[]> = {};
  for (const [ym, m] of newDocsMap.entries()) {
    byNewMonth[ym] = Array.from(m.values()).sort((a, b) => {
      // Tri par date pour propreté
      const da = a.date?.split("/").reverse().join("-") || "";
      const db = b.date?.split("/").reverse().join("-") || "";
      return da.localeCompare(db);
    });
  }

  return {
    docs: docs.map(d => ({ id: d.id, nbBls: d.bankLines.length })),
    byNewMonth,
    stats: {
      nbDocs: docs.length,
      nbBls,
      nbBlsMalRangees,
      nbOrphelines: orphans.length,
      nbDocsApresMigration: Object.keys(byNewMonth).length,
    },
    orphans: orphans.slice(0, 5).map(o => ({
      docId: o.docId,
      reason: o.reason,
      bl: { date: o.bl?.date, label: o.bl?.label, amount: o.bl?.amount },
    })),
  };
}

export async function GET(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const result = await analyzeRedistribution();

  return NextResponse.json({
    success: true,
    confirmToken: CONFIRM_TOKEN,
    ...result,
    docsApresMigration: Object.entries(result.byNewMonth).map(([ym, bls]) => ({
      ym,
      nbBls: bls.length,
      nbMatched: bls.filter((b: any) => b.matched).length,
    })).sort((a, b) => a.ym.localeCompare(b.ym)),
  });
}

export async function POST(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== CONFIRM_TOKEN) {
    return NextResponse.json({ error: `confirm token invalide, attendu '${CONFIRM_TOKEN}'` }, { status: 400 });
  }

  const result = await analyzeRedistribution();

  // Réécriture des docs : on met à jour chaque doc cible avec la nouvelle liste
  // de bankLines. Les docs anciens dont l'id n'existe plus dans byNewMonth
  // (cas rare : un doc qui ne contient QUE des bankLines mal rangées) sont
  // vidés (bankLines: [], totalLines: 0).
  const targetYms = new Set(Object.keys(result.byNewMonth));
  const oldDocIds = new Set(result.docs.map(d => d.id));

  let nbDocsModifies = 0;
  let nbBlsDeplacees = result.stats.nbBlsMalRangees;
  const errors: any[] = [];

  // 1. Écrire les nouveaux docs (ou rééécrire les existants avec la liste correcte)
  for (const [ym, bls] of Object.entries(result.byNewMonth)) {
    try {
      await adminDb.collection("rapprochements").doc(ym).set({
        period: ym,
        bankLines: bls,
        totalLines: bls.length,
        totalMatched: bls.filter((b: any) => b.matched).length,
        totalAmount: Math.round(bls.reduce((s: number, b: any) => s + (b.amount || 0), 0) * 100) / 100,
        updatedAt: new Date().toISOString(),
        migratedAt: new Date().toISOString(), // marqueur traceabilite
      });
      nbDocsModifies++;
    } catch (e: any) {
      errors.push({ ym, error: e?.message || String(e) });
    }
  }

  // 2. Vider les docs orphelins (existants mais qui ne sont plus dans byNewMonth)
  //    Ce sont les docs qui ne contenaient QUE des bankLines mal rangées
  //    (toutes leurs bankLines sont maintenant dans d'autres docs).
  for (const oldId of oldDocIds) {
    if (!targetYms.has(oldId)) {
      try {
        await adminDb.collection("rapprochements").doc(oldId).set({
          period: oldId,
          bankLines: [],
          totalLines: 0,
          totalMatched: 0,
          totalAmount: 0,
          updatedAt: new Date().toISOString(),
          migratedAt: new Date().toISOString(),
          emptiedByMigration: true,
        });
        nbDocsModifies++;
      } catch (e: any) {
        errors.push({ ym: oldId, error: e?.message || String(e) });
      }
    }
  }

  // Audit log
  await adminDb.collection("audit_log").add({
    action: "migrate_banklines_par_mois",
    nbDocsAvant: result.stats.nbDocs,
    nbDocsApres: nbDocsModifies,
    nbBlsTotal: result.stats.nbBls,
    nbBlsDeplacees,
    nbOrphelines: result.stats.nbOrphelines,
    nbErrors: errors.length,
    executedAt: new Date().toISOString(),
    executedBy: auth.email,
  }).catch(() => {/* best effort */});

  return NextResponse.json({
    success: errors.length === 0,
    nbDocsModifies,
    nbBlsDeplacees,
    nbOrphelines: result.stats.nbOrphelines,
    errors,
    message: errors.length === 0
      ? `Migration OK : ${nbBlsDeplacees} bankLine(s) déplacée(s) dans le bon doc.`
      : `Migration partielle : ${errors.length} erreur(s).`,
  });
}
