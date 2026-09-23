/**
 * POST /api/avoir/next-number
 *
 * Attribue une référence d'avoir séquentielle et continue (AV-YYYY-NNNN),
 * en transaction Firestore atomique.
 *
 * Pendant longtemps, chaque écran fabriquait sa propre référence à partir de
 * l'horloge. Un avoir étant une facture au sens fiscal, il lui faut une
 * séquence : c'est elle qui rend visible la disparition d'une pièce.
 *
 * Authentification : staff only (admin ou moniteur).
 *
 * Payload : { paymentId?: string, familyId?: string, motif?: string }
 * Retour  : { reference: "AV-2026-0042", sequence: 42, year: 2026 }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { attribuerNumeroAvoir } from "@/lib/invoice-number";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const res = await attribuerNumeroAvoir({
      paymentId: body?.paymentId,
      familyId: body?.familyId,
      motif: body?.motif,
      attributedBy: auth.email || auth.uid,
    });
    return NextResponse.json(res);
  } catch (error: any) {
    console.error("avoir/next-number error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
