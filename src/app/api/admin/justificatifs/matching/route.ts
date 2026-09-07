import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { nettoyerPiece, type DepenseCandidate } from "@/lib/justificatifs";
import { planifierMatching } from "@/lib/matching-automatique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const resultat = await adminDb.runTransaction(async tx => {
      const ps = await tx.get(adminDb.collection("justificatifs").limit(1001));
      const ds = await tx.get(adminDb.collection("depenses").where("source", "==", "releve-bancaire").limit(2001));
      const ls = await tx.get(adminDb.collection("justificatifs-liens").limit(2001));
      if (ps.size > 1000 || ds.size > 2000 || ls.size > 2000) return { associes: 0, limite: true, analyseIncomplete: false, reste: false };
      const pieces = ps.docs.map(d => { const p = d.data(); return { id: d.id, retire: p.retire === true, depenseId: p.depenseId,
        autoBloque: p.autoBloque === true, extraction: p.extraction ? nettoyerPiece(p.extraction) : null }; });
      const depenses = ds.docs.map(d => ({ ...d.data(), id: d.id })) as DepenseCandidate[];
      const lies = new Set([...ls.docs.map(d => d.id), ...pieces.flatMap(p => p.depenseId ? [p.depenseId as string] : [])]);
      const plan = planifierMatching(pieces, depenses, lies);
      const lot = plan.associations.slice(0, 100);
      for (const a of lot) {
        const ref = adminDb.collection("justificatifs").doc(a.pieceId);
        tx.update(ref, { depenseId: a.depenseId, associationMode: "automatique", associatedAt: FieldValue.serverTimestamp() });
        tx.create(adminDb.collection("justificatifs-liens").doc(a.depenseId), { pieceId: a.pieceId });
        tx.create(ref.collection("historique").doc(), { action: "associer-automatiquement", apres: a.depenseId, uid: auth.uid,
          regle: "achat-ttc-fournisseur-exact-date-7j-unicite-v1", at: FieldValue.serverTimestamp() });
      }
      return { associes: lot.length, limite: false, analyseIncomplete: plan.analyseIncomplete, reste: plan.associations.length > lot.length };
    });
    return NextResponse.json(resultat, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Rapprochement non terminé. Relancez : les associations déjà enregistrées seront conservées." }, { status: 409 });
  }
}
