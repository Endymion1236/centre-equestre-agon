import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

// GET /api/challenges — liste tous les challenges
// GET /api/challenges?id=xxx — charge un challenge précis
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      const snap = await adminDb.collection("challenges").doc(id).get();
      if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ id: snap.id, ...snap.data() });
    }
    const snap = await adminDb.collection("challenges").orderBy("updatedAt", "desc").get();
    const list = snap.docs.map(d => ({
      id: d.id,
      title: d.data().title || d.id,
      date: d.data().date || "",
      status: d.data().status || "active",
      updatedAt: d.data().updatedAt?.toDate?.()?.toISOString() || "",
      riderCount: (d.data().riders || []).length,
    }));
    return NextResponse.json(list);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/challenges — crée un nouveau challenge
export async function POST(req: NextRequest) {
  // 🔒 Auth obligatoire — route admin
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { title, date, disciplines } = body;
    if (!title) return NextResponse.json({ error: "title requis" }, { status: 400 });
    const id = `challenge-${date || new Date().toISOString().slice(0, 10)}-${title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 20)}`;
    const existing = await adminDb.collection("challenges").doc(id).get();
    if (existing.exists) return NextResponse.json({ error: "Un challenge avec cet identifiant existe déjà" }, { status: 409 });
    const data = {
      title, date: date || new Date().toISOString().slice(0, 10),
      disciplines: disciplines || ["cso50", "cso70", "equifun"],
      status: "active",
      riders: [], results: {}, nextId: 1,
      createdAt: new Date(), updatedAt: new Date(),
    };
    await adminDb.collection("challenges").doc(id).set(data);
    return NextResponse.json({ id, ...data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/challenges — sauvegarde les données d'un challenge (riders + results)
export async function PUT(req: NextRequest) {
  const auth = await verifyAuth(req, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const { id, riders, results, nextId, status } = body;
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    const update: any = { updatedAt: new Date() };
    if (riders !== undefined) update.riders = riders;
    if (results !== undefined) update.results = results;
    if (nextId !== undefined) update.nextId = nextId;
    if (status !== undefined) update.status = status;
    await adminDb.collection("challenges").doc(id).update(update);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
