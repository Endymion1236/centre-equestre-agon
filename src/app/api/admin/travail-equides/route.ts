/**
 * /api/admin/travail-equides — feuille de travail des poneys (lib/travail-equides).
 *
 *   GET  ?du=AAAA-MM-JJ&au=AAAA-MM-JJ           → { seances }
 *   POST { action: "dicter", texte }              → { seances, remarques } (rien n'est écrit)
 *   POST { action: "enregistrer", seances: [...] } → { ok, ids }
 *   POST { action: "supprimer", id }              → { ok }
 *
 * Collection `travail-equides` (pas une pièce comptable). Staff : admin ou
 * moniteur. Écritures par le serveur : aucune règle Firestore à déployer.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { MODELE_LEGER, texteReponse } from "@/lib/ia-modeles";
import { toParisDateString } from "@/lib/date-local";
import { consigneDicteeTravail, lireDicteeTravail, seanceValide, TYPES_TRAVAIL } from "@/lib/travail-equides";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const COLLECTION = "travail-equides";
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

const lireEquides = async () => (await adminDb.collection("equides").get()).docs
  .map((d) => ({ id: d.id, name: String((d.data() as any).name || ""), status: (d.data() as any).status }))
  .filter((e) => e.name && e.status !== "sorti" && e.status !== "deces");

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;
  const du = String(req.nextUrl.searchParams.get("du") || ""), au = String(req.nextUrl.searchParams.get("au") || "");
  if (!JOUR.test(du) || !JOUR.test(au)) return NextResponse.json({ error: "Période invalide" }, { status: 400 });
  const snap = await adminDb.collection(COLLECTION).where("date", ">=", du).where("date", "<=", au).get();
  return NextResponse.json({ seances: snap.docs.map((d) => ({ id: d.id, ...(d.data() as any), createdAt: undefined })) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({} as any));
  try {
    if (body.action === "dicter") {
      const texte = String(body.texte || "").trim();
      if (!texte) return NextResponse.json({ error: "Dictée vide" }, { status: 400 });
      if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "IA non configurée (ANTHROPIC_API_KEY)." }, { status: 503 });
      const equides = await lireEquides();
      const aujourdhui = toParisDateString(new Date());
      const moi = String(body.moi || "").trim().slice(0, 60);
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45000, maxRetries: 1 });
      const rep = await client.messages.create({
        model: MODELE_LEGER, max_tokens: 4000, output_config: { effort: "low" },
        messages: [{ role: "user", content: consigneDicteeTravail(texte, equides.map((e) => e.name), aujourdhui, moi) }],
      } as any);
      const lu = lireDicteeTravail(texteReponse(rep as any), equides, aujourdhui, moi);
      if (!lu) return NextResponse.json({ error: "Dictée non comprise : reformulez (jour, nom du poney, ce qui a été fait)." }, { status: 422 });
      return NextResponse.json({ ...lu, texte });
    }
    if (body.action === "enregistrer") {
      const equides = new Map((await lireEquides()).map((e) => [e.id, e.name]));
      const types = new Set<string>(TYPES_TRAVAIL.map((t) => t.id));
      const aEcrire = (Array.isArray(body.seances) ? body.seances : []).slice(0, 60)
        .map((s: any) => ({
          date: String(s?.date || ""), equideId: String(s?.equideId || ""), equideNom: equides.get(String(s?.equideId || "")) || "",
          type: types.has(String(s?.type)) ? String(s.type) : "autre",
          duree: Number(s?.duree) > 0 && Number(s.duree) <= 300 ? Math.round(Number(s.duree)) : null,
          qui: String(s?.qui || "").slice(0, 60), notes: String(s?.notes || "").slice(0, 300),
        }))
        .filter((s: any) => seanceValide(s) && s.equideNom);
      if (!aEcrire.length) return NextResponse.json({ error: "Aucune séance complète (poney, qui l'a travaillé, date, type)." }, { status: 400 });
      const batch = adminDb.batch();
      const ids: string[] = [];
      for (const s of aEcrire) {
        const ref = adminDb.collection(COLLECTION).doc();
        ids.push(ref.id);
        batch.set(ref, { ...s, dictee: body.texte ? String(body.texte).slice(0, 4000) : null, createdAt: FieldValue.serverTimestamp(), createdBy: (auth as any).email || (auth as any).uid || null });
      }
      await batch.commit();
      return NextResponse.json({ ok: true, ids });
    }
    if (body.action === "supprimer") {
      const id = String(body.id || "");
      if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
      await adminDb.collection(COLLECTION).doc(id).delete();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e: any) {
    console.error("[travail-equides]", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
