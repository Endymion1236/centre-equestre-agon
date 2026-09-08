/**
 * Compléter les dates d'opération manquantes, sans ressaisir le relevé.
 *
 * GET ?mois=AAAA-MM  → aperçu : ce qui peut être lu dans les libellés, ce qui
 *   ne peut l'être que par convention (dernier jour du mois), ce qui reste
 *   sans solution. Sans `mois`, l'aperçu couvre toute la base.
 * POST { mois?, appliquer: "lues" | "toutes" } → écrit les dates.
 *
 *   - « lues »   : uniquement les dates inscrites par la banque dans le
 *                  libellé. Aucune interprétation, on peut y aller les yeux
 *                  fermés.
 *   - « toutes » : ajoute les lignes sans date lisible, datées au dernier
 *                  jour de leur mois — la convention du relevé qui les
 *                  justifie. Ces lignes portent `dateEstimee: true`, pour
 *                  qu'une date de convention ne se confonde jamais avec une
 *                  date certaine.
 *
 * Une ligne déjà datée n'est jamais réécrite.
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { planifierCompletionDates, type LigneSansDate } from "@/lib/dates-libelles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 3000;
const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function lire(mois: string): Promise<LigneSansDate[]> {
  const base = adminDb.collection("depenses");
  const snap = await (mois ? base.where("mois", "==", mois) : base).limit(MAX).get();
  return snap.docs
    .filter(d => d.data().source === "releve-bancaire" && d.data().rapprochementExclu !== true)
    .map(d => ({ id: d.id, fournisseur: d.data().fournisseur, mois: d.data().mois, dateOperation: d.data().dateOperation, note: d.data().note }));
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const mois = req.nextUrl.searchParams.get("mois") || "";
  if (mois && !MOIS_RE.test(mois)) return NextResponse.json({ error: "Mois invalide." }, { status: 400 });
  try {
    const plan = planifierCompletionDates(await lire(mois));
    return NextResponse.json({
      ok: true, mois: mois || "tous les mois",
      lues: plan.lues.length, finDeMois: plan.finDeMois.length, sansSolution: plan.sansSolution.length,
      // Un échantillon suffit à juger : le gérant vérifie que les dates lues
      // correspondent bien à ce que dit son relevé.
      exemplesLus: plan.lues.slice(0, 10),
      exemplesFinDeMois: plan.finDeMois.slice(0, 5),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[depenses/dates-libelles] GET", message);
    return NextResponse.json({ error: `Aperçu impossible : ${message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const mois = String(body.mois || "");
  const appliquer = body.appliquer === "toutes" ? "toutes" : "lues";
  if (mois && !MOIS_RE.test(mois)) return NextResponse.json({ error: "Mois invalide." }, { status: 400 });

  try {
    const plan = planifierCompletionDates(await lire(mois));
    const aEcrire = appliquer === "toutes" ? [...plan.lues, ...plan.finDeMois] : plan.lues;
    let ecrites = 0;
    for (let i = 0; i < aEcrire.length; i += 400) {
      const lot = adminDb.batch();
      for (const d of aEcrire.slice(i, i + 400)) {
        lot.update(adminDb.collection("depenses").doc(d.id), {
          dateOperation: d.date,
          // La trace de l'origine reste dans la ligne : une date de
          // convention doit pouvoir être repérée et corrigée plus tard.
          dateOrigine: d.origine,
          dateEstimee: d.origine === "fin-de-mois",
          dateCompleteePar: auth.uid,
          dateCompleteeLe: FieldValue.serverTimestamp(),
        });
      }
      await lot.commit();
      ecrites += Math.min(400, aEcrire.length - i);
    }
    return NextResponse.json({
      ok: true, ecrites,
      lues: plan.lues.length,
      finDeMois: appliquer === "toutes" ? plan.finDeMois.length : 0,
      restantes: appliquer === "toutes" ? plan.sansSolution.length : plan.finDeMois.length + plan.sansSolution.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[depenses/dates-libelles] POST", message);
    return NextResponse.json({ error: `Complétion interrompue : ${message}. Les dates déjà écrites sont conservées.` }, { status: 500 });
  }
}
