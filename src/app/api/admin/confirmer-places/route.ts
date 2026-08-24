import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { confirmerPlacesTenues } from "@/lib/places-tenues";

/**
 * POST /api/admin/confirmer-places  { paymentId }
 *
 * Lève les « places tenues » d'un paiement encaissé AU COMPTOIR.
 *
 * Seuls le webhook et la route status CAWL appelaient confirmerPlacesTenues :
 * une inscription payée en espèces ou par chèque au bureau gardait son
 * marqueur `pending` + `holdUntil`, et la purge des places tenues finissait
 * par DÉSINSCRIRE un enfant dont le stage était pourtant réglé. Appelée par
 * enregistrerEncaissement après chaque encaissement.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const { paymentId } = await req.json().catch(() => ({}));
  if (!paymentId) return NextResponse.json({ error: "paymentId requis" }, { status: 400 });

  const confirmees = await confirmerPlacesTenues(String(paymentId));
  return NextResponse.json({ ok: true, confirmees });
}
