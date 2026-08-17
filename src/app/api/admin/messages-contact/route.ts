/**
 * GET  /api/admin/messages-contact — liste les messages du formulaire de
 *      contact du site, les plus récents d'abord.
 * POST /api/admin/messages-contact — marque un message traité / non traité.
 *      Body : { id: string, traite: boolean }
 *
 * Pourquoi cet écran : chaque envoi du formulaire public est tracé en base
 * AVANT l'envoi de l'email (cf. /api/contact). C'est le filet de sécurité du
 * bug du 17 août — des messages partaient vers la mauvaise boîte sans laisser
 * de trace nulle part. Ici, on voit tout ce que le site a reçu, avec le
 * statut d'envoi de l'email et le destinataire réellement utilisé.
 *
 * Lecture par adminDb : la collection est écrite côté serveur, l'admin la lit
 * de même — aucune règle Firestore à publier pour que l'écran fonctionne.
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const snap = await adminDb
      .collection("messages-contact")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const messages = snap.docs.map((d) => {
      const m = d.data() as any;
      return {
        id: d.id,
        firstName: m.firstName || "",
        lastName: m.lastName || "",
        email: m.email || "",
        phone: m.phone || "",
        subject: m.subject || "",
        message: m.message || "",
        to: m.to || "",
        status: m.status || "recu",
        erreur: m.erreur || "",
        traite: !!m.traite,
        createdAt: m.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ messages });
  } catch (e) {
    console.error("[messages-contact]", e);
    return NextResponse.json({ error: "Erreur de lecture des messages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, traite } = await req.json();
    if (!id || typeof traite !== "boolean") {
      return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
    }
    await adminDb.collection("messages-contact").doc(String(id)).update({
      traite,
      ...(traite ? { traiteLe: FieldValue.serverTimestamp() } : { traiteLe: FieldValue.delete() }),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[messages-contact]", e);
    return NextResponse.json({ error: "Erreur de mise à jour" }, { status: 500 });
  }
}
