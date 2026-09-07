import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { analyserCeleris } from "@/lib/import-comptable-celeris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const collection = () => adminDb.collection("historiqueComptableCeleris");
const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const mois = req.nextUrl.searchParams.get("mois");
    if (mois) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
      const doc = await collection().doc(mois).get();
      if (!doc.exists) return NextResponse.json({ error: "Mois absent" }, { status: 404 });
      return NextResponse.json({ lignes: doc.data()!.lignes }, { headers });
    }
    const snapshot = await collection().orderBy("mois", "desc").select("mois", "nom", "nombre", "totaux").get();
    return NextResponse.json({ imports: snapshot.docs.map(d => d.data()) }, { headers });
  } catch { return NextResponse.json({ error: "Lecture de l’historique impossible" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    if (Number(req.headers.get("content-length")) > 4_100_000) throw new Error("Fichier trop volumineux");
    const form = await req.formData();
    const fichier = form.get("fichier");
    const action = form.get("action");
    if (action !== "apercu" && action !== "importer") throw new Error("Action invalide");
    if (!(fichier instanceof File) || !fichier.size || fichier.size > 4_000_000) throw new Error("Export TXT de 4 Mo maximum attendu");
    const bytes = new Uint8Array(await fichier.arrayBuffer());
    let texte: string;
    try { texte = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { texte = new TextDecoder("windows-1252").decode(bytes); }
    const analyse = analyserCeleris(texte);
    // Un document mensuel atomique reste largement sous la limite Firestore de 1 Mio.
    if (Buffer.byteLength(JSON.stringify(analyse)) > 700_000) throw new Error("Export trop volumineux pour cet import mensuel");
    const empreinte = createHash("sha256").update(JSON.stringify(analyse)).digest("hex");
    const ref = collection().doc(analyse.mois);
    const resume = { mois: analyse.mois, nombre: analyse.lignes.length, totaux: analyse.totaux };
    if (action === "apercu") {
      const doc = await ref.get();
      return NextResponse.json({ ...resume, doublon: doc.data()?.empreinte === empreinte, conflit: doc.exists && doc.data()?.empreinte !== empreinte }, { headers });
    }
    const doublon = await adminDb.runTransaction(async tx => {
      const doc = await tx.get(ref);
      if (doc.exists) {
        if (doc.data()?.empreinte === empreinte) return true;
        throw new Error("Un autre export existe déjà pour ce mois. Import bloqué pour éviter les doublons.");
      }
      tx.create(ref, { ...analyse, ...resume, empreinte, nom: fichier.name.slice(0, 180), createdBy: auth.uid, createdAt: FieldValue.serverTimestamp(), source: "celeris" });
      return false;
    });
    return NextResponse.json({ ...resume, doublon, ok: true }, { headers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error && !('code' in e) ? e.message : "Import impossible. Vous pouvez réessayer sans créer de doublon." }, { status: 400 });
  }
}
