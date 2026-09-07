import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { doublonPossible, groupesDoublons } from "@/lib/doublons-depenses";
import type { DepenseCandidate } from "@/lib/justificatifs";
export const dynamic = "force-dynamic";
const archive = () => adminDb.collection("depenses-doublons-archives");
const valide = (s: unknown): s is string => typeof s === "string" && /^[\w-]{1,150}$/.test(s);
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const mois = req.nextUrl.searchParams.get("mois") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  try {
    const [ds, ar] = await Promise.all([adminDb.collection("depenses").where("mois", "==", mois).limit(2001).get(), archive().where("mois", "==", mois).limit(2001).get()]);
    const lignes = ds.docs.map(d => ({ ...d.data(), id: d.id })) as DepenseCandidate[];
    return NextResponse.json({ groupes: groupesDoublons(lignes), archives: ar.docs.map(d => ({ id: d.id, ...d.data().original, conserveId: d.data().conserveId })), limite: ds.size > 2000 || ar.size > 2000 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Lecture impossible" }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    if (!valide(body.id) || !["archiver", "restaurer"].includes(body.action)) throw new Error("Action invalide");
    const ref = adminDb.collection("depenses").doc(body.id), ar = archive().doc(body.id);
    await adminDb.runTransaction(async tx => {
      const [doc, ancien] = await tx.getAll(ref, ar);
      if (body.action === "restaurer") {
        if (!ancien.exists || doc.exists) throw new Error("Archive absente ou dépense déjà active");
        tx.create(ref, ancien.data()!.original); tx.delete(ar);
      } else {
        if (!valide(body.conserveId) || body.conserveId === body.id) throw new Error("Choisissez une autre ligne à conserver");
        const garde = await tx.get(adminDb.collection("depenses").doc(body.conserveId));
        const lien = await tx.get(adminDb.collection("justificatifs-liens").doc(body.id));
        const pieces = await tx.get(adminDb.collection("justificatifs").where("depenseId", "==", body.id).limit(1));
        if (!doc.exists || !garde.exists || ancien.exists) throw new Error("Lignes modifiées : actualisez la liste");
        if (lien.exists || !pieces.empty) throw new Error("Cette dépense est associée à un justificatif. Annulez d’abord l’association ou conservez cette ligne.");
        if (!doublonPossible({ ...doc.data(), id: doc.id } as DepenseCandidate, { ...garde.data(), id: garde.id } as DepenseCandidate)) throw new Error("Ces lignes ne sont pas des doublons compatibles");
        tx.create(ar, { original: doc.data(), mois: doc.data()!.mois, conserveId: garde.id, uid: auth.uid, at: FieldValue.serverTimestamp() });
        tx.delete(ref);
      }
      tx.create(adminDb.collection("depenses-doublons-historique").doc(), { action: body.action, id: body.id, conserveId: body.conserveId || null, uid: auth.uid, at: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error && !("code" in e) ? e.message : "Opération impossible ; actualisez la liste" }, { status: 409 }); }
}
