import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/restore-backup
 *
 * Restaure un backup JSON (produit par /api/admin/backup-all) dans Firestore.
 * Permet de revenir en arrière après une remise à zéro.
 *
 * Le backup est envoyé dans le CORPS de la requête (JSON). On ne le stocke pas
 * dans le repo (données personnelles) : il vient du fichier que l'admin a
 * téléchargé puis re-sélectionné.
 *
 * SÉCURITÉ :
 *   - verifyAuth adminOnly.
 *   - Mot-clé de confirmation requis pour l'écriture réelle (RESTAURER).
 *   - DRY-RUN par défaut (compte ce qui serait restauré, sans écrire).
 *   - PAR DÉFAUT : ne restaure QUE les collections demandées (paramètre
 *     `collections`), sinon TOUTES celles du backup.
 *   - Restaure chaque document avec son ID d'origine (__id__) en MERGE, pour
 *     ne pas écraser des champs ajoutés depuis (set merge).
 *
 * Désérialise les dates {__ts__: ISO} -> Timestamp Firestore.
 */

function deserialize(v: any): any {
  if (v == null) return v;
  if (typeof v === "object" && typeof v.__ts__ === "string") {
    const d = new Date(v.__ts__);
    return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
  }
  if (Array.isArray(v)) return v.map(deserialize);
  if (typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = deserialize(v[k]);
    return out;
  }
  return v;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const confirm = req.nextUrl.searchParams.get("confirm") || "";
  if (apply && confirm !== "RESTAURER") {
    return NextResponse.json({
      error: "Confirmation requise : pour restaurer réellement, fournir ?confirm=RESTAURER.",
      projectId,
    }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide ou absent (envoyer le fichier de backup)." }, { status: 400 });
  }

  const collectionsData: Record<string, any[]> = body?.collections || {};
  // Filtre optionnel : ne restaurer que certaines collections.
  const only: string[] | null = Array.isArray(body?.only) && body.only.length ? body.only : null;

  if (!collectionsData || typeof collectionsData !== "object" || Object.keys(collectionsData).length === 0) {
    return NextResponse.json({ error: "Backup vide ou mal formé (champ 'collections' attendu)." }, { status: 400 });
  }

  const rapport: any = {
    projectId,
    backup_date: body?.date || "?",
    backup_projectId: body?.projectId || "?",
    mode: apply ? "APPLY (restauration réelle)" : "DRY-RUN (comptage seul)",
    par_collection: {} as Record<string, number>,
    total_restaure: 0,
  };

  for (const [col, docs] of Object.entries(collectionsData)) {
    if (only && !only.includes(col)) continue;
    if (!Array.isArray(docs)) continue;
    let n = 0;
    if (apply) {
      let batch = adminDb.batch();
      let inBatch = 0;
      for (const raw of docs) {
        const { __id__, ...rest } = raw;
        const data = deserialize(rest);
        const ref = __id__ ? adminDb.collection(col).doc(__id__) : adminDb.collection(col).doc();
        batch.set(ref, data, { merge: true });
        n++; inBatch++;
        if (inBatch >= 400) { await batch.commit(); batch = adminDb.batch(); inBatch = 0; }
      }
      if (inBatch > 0) await batch.commit();
    } else {
      n = docs.length;
    }
    rapport.par_collection[col] = n;
    rapport.total_restaure += n;
  }

  return NextResponse.json(rapport);
}
