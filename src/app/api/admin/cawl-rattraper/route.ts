/**
 * POST /api/admin/cawl-rattraper  { reference: "CE-…" }
 *
 * Un paiement réussi chez CAWL mais jamais enregistré dans l'application :
 * la famille a fermé la page avant le retour sur le site, et la notification
 * de CAWL n'est pas arrivée. Octobre 2026 : 30 € payés par lien le 02/10
 * (« Paiement demandé » chez CAWL), absents du journal.
 *
 * On rejoue le retour de la famille (/api/cawl/status) avec les éléments
 * gardés à l'ouverture du paiement (cawl_sessions). Cette route ne décide
 * rien elle-même : /api/cawl/status interroge CAWL et n'enregistre que ce que
 * CAWL confirme, une seule fois (verrou), avec les mêmes emails et mises à
 * jour qu'un retour normal. Admin uniquement.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REF_RE = /^CE-\d{10,}-[a-z0-9]{3,10}$/i;

async function encaissementDe(hostedCheckoutId: string) {
  const snap = await adminDb.collection("encaissements").where("ref", "==", `CAWL-${hostedCheckoutId}`).limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as any);
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const reference = String(body?.reference || "").trim();
  if (!REF_RE.test(reference)) {
    return NextResponse.json({ error: "Référence attendue : celle de la colonne « Référence commerçant » de CAWL, par exemple CE-1790940007421-olz1b." }, { status: 400 });
  }
  const sessions = await adminDb.collection("cawl_sessions").where("merchantRef", "==", reference).limit(1).get();
  if (sessions.empty) {
    return NextResponse.json({ error: "Cette référence CAWL n'a pas été ouverte depuis l'application (ou ses informations ne sont plus là) : la vérification automatique est impossible. Notez la référence et signalez-la." }, { status: 404 });
  }
  const s = sessions.docs[0].data() as any;
  const id = String(s.hostedCheckoutId || sessions.docs[0].id);
  const deja = await encaissementDe(id);
  if (deja) return NextResponse.json({ ok: true, deja: true, message: `Déjà enregistré : ${Number(deja.montant).toFixed(2)} € pour ${deja.familyName || "la famille"}.` });
  if (!s.returnMac) return NextResponse.json({ error: "Session CAWL incomplète : impossible de la vérifier automatiquement." }, { status: 409 });

  const params = new URLSearchParams({
    hostedCheckoutId: id, RETURNMAC: String(s.returnMac), ref: reference,
    paymentId: String(s.paymentId || ""), familyId: String(s.familyId || ""),
    deposit: String(s.isDeposit ? s.depositPercent || 0 : 0),
  });
  const res = await fetch(`${req.nextUrl.origin}/api/cawl/status?${params.toString()}`, { redirect: "manual" }).catch(() => null);
  const enc = await encaissementDe(id);
  if (enc) return NextResponse.json({ ok: true, message: `Paiement retrouvé et enregistré : ${Number(enc.montant).toFixed(2)} € pour ${enc.familyName || "la famille"}.` });
  const destination = res?.headers.get("location") || "";
  const motif = /refused|cancelled|annul/i.test(destination) ? "CAWL indique que ce paiement n'a pas abouti (refusé ou annulé)."
    : /pending|attente/i.test(destination) ? "CAWL n'a pas encore confirmé ce paiement : réessayez plus tard."
    : "CAWL ne confirme pas de paiement encaissé pour cette référence.";
  return NextResponse.json({ ok: false, message: motif }, { status: 200 });
}
