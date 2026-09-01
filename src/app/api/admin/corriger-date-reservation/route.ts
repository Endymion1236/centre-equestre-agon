/**
 * POST /api/admin/corriger-date-reservation  { reservationId }
 *
 * Recale une réservation sur la date de son créneau.
 *
 * Une réservation prise en ligne pour un créneau hors de la fenêtre affichée
 * retombait sur la date du jour : la séance de Loucia Rozier, réservée pour le
 * 23 octobre, était écrite au 31 août — donc affichée comme passée, et absente
 * de ses séances à venir. La cause est corrigée ; cette route répare celles
 * qui portent encore la mauvaise date.
 *
 * Ne touche QUE la date et les horaires, et seulement s'ils diffèrent de ceux
 * du créneau. Ni le prix, ni le statut, ni l'inscription au planning.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { messageErreur } from "@/lib/message-erreur";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { reservationId } = await req.json().catch(() => ({} as any));
    if (!reservationId) return NextResponse.json({ error: "reservationId requis" }, { status: 400 });

    const ref = adminDb.collection("reservations").doc(String(reservationId));
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Réservation introuvable" }, { status: 404 });
    const r = snap.data() as any;

    if (!r.creneauId) {
      return NextResponse.json(
        { error: "Cette réservation n'est rattachée à aucun créneau : sa date ne peut pas être déduite." },
        { status: 409 },
      );
    }
    const crSnap = await adminDb.collection("creneaux").doc(String(r.creneauId)).get();
    if (!crSnap.exists) {
      return NextResponse.json(
        { error: "Le créneau de cette réservation n'existe plus : à traiter à la main." },
        { status: 409 },
      );
    }
    const c = crSnap.data() as any;
    if (!c.date) return NextResponse.json({ error: "Le créneau n'a pas de date." }, { status: 409 });

    if (r.date === c.date) {
      return NextResponse.json({ deja: true, date: c.date });
    }

    await ref.update({
      date: c.date,
      ...(c.startTime ? { startTime: c.startTime } : {}),
      ...(c.endTime ? { endTime: c.endTime } : {}),
      dateCorrigeeLe: new Date().toISOString(),
      dateAvantCorrection: r.date || null,
    });

    return NextResponse.json({ ok: true, avant: r.date || null, apres: c.date });
  } catch (e) {
    console.error("[corriger-date-reservation]", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
