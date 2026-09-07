import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true }); if (auth instanceof NextResponse) return auth;
  try {
    const snap = await adminDb.collection("justificatifs").limit(2001).get();
    if (snap.size > 2000) return NextResponse.json({ error: "Plus de 2 000 pièces : réinitialisation globale indisponible." }, { status: 409 });
    return NextResponse.json({ pieces: snap.docs.filter(d => !d.data().retire).map(d => ({ id: d.id, nom: d.data().nom, version: d.updateTime.toMillis(), liee: !!d.data().depenseId })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Aperçu indisponible" }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true }); if (auth instanceof NextResponse) return auth;
  try {
    const b = await req.json();
    if (b.confirme !== true || !/^[a-f0-9]{64}$/.test(b.id || "") || !Number.isFinite(b.version)) throw new Error("Aperçu et confirmation requis");
    await adminDb.runTransaction(async tx => {
      const ref = adminDb.collection("justificatifs").doc(b.id), snap = await tx.get(ref), p = snap.data();
      if (!p) throw new Error("Pièce absente");
      if (p.retire && !p.depenseId) return;
      if (snap.updateTime!.toMillis() !== b.version) throw new Error("Pièce modifiée depuis l’aperçu : recommencez la prévisualisation.");
      const ids = [...new Set<string>([p.depenseId, ...(p.paiementsAssocies || []).map((a: { id: string }) => a.id)].filter(Boolean))];
      if (ids.length > 100 || ids.some(id => !/^[\w-]{1,150}$/.test(id))) throw new Error("Associations à contrôler manuellement");
      const locks = ids.length ? await tx.getAll(...ids.map(id => adminDb.collection("justificatifs-liens").doc(id))) : [];
      if (locks.some(l => l.exists && l.data()?.pieceId !== b.id)) throw new Error("Association incohérente : contrôle manuel requis");
      for (const l of locks) if (l.exists) tx.delete(l.ref);
      tx.create(ref.collection("historique").doc(), { action: "archiver-reinitialiser", avant: { depenseId: p.depenseId || null, paiementsAssocies: p.paiementsAssocies || [], modeRattachement: p.modeRattachement || null, associationDevise: p.associationDevise || null, operationAssociee: p.operationAssociee || null }, uid: auth.uid, at: FieldValue.serverTimestamp() });
      tx.update(ref, { retire: true, depenseId: null, paiementsAssocies: [], modeRattachement: null, associationDevise: null, operationAssociee: null, paieValidee: false, autoBloque: true, updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error && !("code" in e) ? e.message : "Archivage interrompu" }, { status: 409 }); }
}
