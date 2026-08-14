import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Restauration de créneaux depuis une sauvegarde de Firebase Storage.
 *
 * La route restore-backup existante attend le fichier dans le corps de la
 * requête : il faut donc le télécharger puis le re-téléverser, impossible
 * depuis un téléphone. Ici le serveur lit directement `backups/AAAA-MM-JJ.json`
 * dans Storage — aucun fichier ne transite par l'appareil.
 *
 * Ne restaure QUE les créneaux ABSENTS de la base. Un créneau encore présent
 * n'est jamais touché : on répare une suppression accidentelle, on ne rejoue
 * pas une sauvegarde par-dessus des données à jour.
 *
 * GET  → sauvegardes disponibles
 * GET  ?date=…&from=…&to=…       → aperçu des créneaux manquants
 * POST { date, from, to, confirm } → restauration effective
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

async function lireSauvegarde(date: string) {
  const bucket = adminStorage.bucket();
  const file = bucket.file(`backups/${date}.json`);
  const [existe] = await file.exists();
  if (!existe) return null;
  const [buf] = await file.download();
  return JSON.parse(buf.toString("utf-8"));
}

/** Créneaux de la sauvegarde absents de Firestore, sur la plage demandée. */
async function creneauxManquants(payload: any, from: string, to: string) {
  const collections = payload?.collections || payload || {};
  const source: any[] = collections.creneaux || [];

  const snap = await adminDb.collection("creneaux")
    .where("date", ">=", from).where("date", "<=", to).get();
  const presents = new Set(snap.docs.map(d => d.id));

  return source
    .filter((c: any) => {
      const d = c.date;
      return typeof d === "string" && d >= from && d <= to && !presents.has(c.__id__);
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const date = req.nextUrl.searchParams.get("date");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  // Liste des sauvegardes disponibles
  if (!date) {
    try {
      const [files] = await adminStorage.bucket().getFiles({ prefix: "backups/" });
      const dates = files
        .map(f => f.name.match(/backups\/(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
        .filter(Boolean)
        .sort()
        .reverse();
      return NextResponse.json({ sauvegardes: dates });
    } catch (e) {
      console.error("[restore-creneaux] liste", e);
      return NextResponse.json({ sauvegardes: [], error: "Storage inaccessible" });
    }
  }

  if (!from || !to) {
    return NextResponse.json({ error: "Paramètres from et to requis." }, { status: 400 });
  }

  const payload = await lireSauvegarde(date);
  if (!payload) {
    return NextResponse.json({ error: `Aucune sauvegarde au ${date}.` }, { status: 404 });
  }

  const manquants = await creneauxManquants(payload, from, to);
  return NextResponse.json({
    date, from, to,
    nb: manquants.length,
    creneaux: manquants.map((c: any) => ({
      id: c.__id__,
      date: c.date,
      activityTitle: c.activityTitle,
      startTime: c.startTime,
      endTime: c.endTime,
      monitor: c.monitor,
      nbInscrits: Array.isArray(c.enrolled) ? c.enrolled.length : 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const { date, from, to, confirm } = await req.json().catch(() => ({} as any));
  if (!date || !from || !to) {
    return NextResponse.json({ error: "date, from et to requis." }, { status: 400 });
  }
  if (confirm !== "RESTAURER") {
    return NextResponse.json({ error: "Confirmation manquante." }, { status: 400 });
  }

  const payload = await lireSauvegarde(date);
  if (!payload) {
    return NextResponse.json({ error: `Aucune sauvegarde au ${date}.` }, { status: 404 });
  }

  const manquants = await creneauxManquants(payload, from, to);
  let restaures = 0;
  for (const c of manquants) {
    const { __id__, ...donnees } = c;
    try {
      // create() et non set() : si le document est réapparu entre l'aperçu et
      // maintenant, on échoue plutôt que d'écraser.
      await adminDb.collection("creneaux").doc(__id__).create(deserialize(donnees));
      restaures++;
    } catch (e) {
      console.error("[restore-creneaux] échec", __id__, e);
    }
  }

  return NextResponse.json({ ok: true, restaures, total: manquants.length });
}
