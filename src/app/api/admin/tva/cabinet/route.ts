/**
 * /api/admin/tva/cabinet — la CA3 déposée par le cabinet, trimestre par
 * trimestre (collection `tva-declarations-cabinet`, id « AAAA-Tn »).
 *
 *   GET  ?id=2026-T3 → { declaration | null }
 *   POST { id, libelle, cabinet, application, base, ecartExplique }
 *        → enregistre les montants du cabinet et le dernier calcul de
 *          l'application ; l'écart est recalculé ici (lib/tva-declaree).
 *
 * Auth admin obligatoire. Rien n'est jamais effacé (collection fiscale).
 */
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { messageErreur } from "@/lib/message-erreur";
import { comparerDeclaration, lireSaisie } from "@/lib/tva-declaree";

export const dynamic = "force-dynamic";
const ID_RE = /^\d{4}-T[1-4]$/;
const COLLECTION = "tva-declarations-cabinet";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const id = String(req.nextUrl.searchParams.get("id") || "");
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Trimestre invalide" }, { status: 400 });
  try {
    const snap = await adminDb.collection(COLLECTION).doc(id).get();
    return NextResponse.json({ declaration: snap.exists ? { id, ...(snap.data() as any) } : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: messageErreur(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Trimestre invalide" }, { status: 400 });
  const cabinet = lireSaisie(body?.cabinet || {});
  const application = lireSaisie(body?.application || {});
  const ecartsImportants = comparerDeclaration(cabinet, application).filter((l) => l.important).length;
  try {
    await adminDb.collection(COLLECTION).doc(id).set({
      libelle: String(body?.libelle || id).slice(0, 80),
      cabinet, application,
      base: body?.base === "factures" ? "factures" : "encaissements",
      ecartsImportants,
      ecartExplique: String(body?.ecartExplique || "").slice(0, 500),
      majLe: FieldValue.serverTimestamp(),
      majPar: (auth as any)?.email || (auth as any)?.uid || null,
    }, { merge: true });
    return NextResponse.json({ ok: true, ecartsImportants });
  } catch (e) {
    return NextResponse.json({ error: messageErreur(e) }, { status: 500 });
  }
}
