/**
 * POST /api/invoice/next-number
 *
 * Attribue un numéro de facture séquentiel et continu, en transaction
 * Firestore atomique — zéro risque de doublon même si plusieurs paiements
 * se soldent simultanément.
 *
 * Conformité fiscale française (CGI art. 242 nonies A) :
 *   - Numérotation chronologique et continue
 *   - Pas de rupture de séquence
 *   - Compteur par année, format F-YYYY-NNNN
 *
 * Authentification : staff only (admin ou moniteur).
 * Le paymentId est passé en body pour traçabilité dans les logs.
 *
 * Payload:
 *   { paymentId?: string }
 * Retour:
 *   { invoiceNumber: "F-2026-0042", sequence: 42, year: 2026 }
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { attribuerNumeroFacture } from "@/lib/invoice-number";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { staffOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const paymentId: string | undefined = body?.paymentId;
    const res = await attribuerNumeroFacture({ paymentId, attributedBy: auth.email || auth.uid });
    return NextResponse.json(res);
  } catch (error: any) {
    console.error("invoice/next-number error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur interne" },
      { status: 500 }
    );
  }
}
