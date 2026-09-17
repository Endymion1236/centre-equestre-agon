/**
 * GET /api/admin/verifier-chaine
 *
 * Parcourt la chaîne d'empreintes des encaissements et rend un rapport
 * d'intégrité. Lecture seule : aucune écriture, aucun effet de bord.
 *
 * C'est la contrepartie du dispositif d'inaltérabilité (art. 286-I-3° bis du
 * CGI) : les empreintes étaient posées depuis le début, mais personne ne les
 * vérifiait jamais. Une chaîne qu'on ne contrôle pas ne prouve rien, et c'est
 * l'écran que présenter en cas de contrôle.
 *
 * Paramètre optionnel : ?depuis=YYYY-MM-DD pour limiter la période.
 *
 * Authentification : admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { verifierChaine, type EncaissementVerifiable } from "@/lib/verification-chaine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const depuis = req.nextUrl.searchParams.get("depuis") || "";

    const snap = await adminDb.collection("encaissements").get();
    const encaissements: EncaissementVerifiable[] = snap.docs
      .map((d) => {
        const v = d.data() as any;
        // dateIso est le champ qui a servi au calcul de l'empreinte. Pour les
        // écritures antérieures, on retombe sur le timestamp Firestore.
        const dateIso: string =
          v.dateIso ||
          (v.date?.toDate ? v.date.toDate().toISOString() : "");
        return {
          id: d.id,
          paymentId: v.paymentId,
          familyId: v.familyId,
          familyName: v.familyName,
          montant: Number(v.montant) || 0,
          mode: v.mode,
          modeLabel: v.modeLabel,
          ref: v.ref,
          activityTitle: v.activityTitle,
          raison: v.raison,
          correctionDe: v.correctionDe,
          dateIso,
          hash: v.hash,
          previousHash: v.previousHash,
        };
      })
      .filter((e) => !depuis || (e.dateIso || "") >= depuis);

    const rapport = await verifierChaine(encaissements);
    return NextResponse.json({ success: true, depuis: depuis || null, ...rapport });
  } catch (e: any) {
    console.error("verifier-chaine error:", e);
    return NextResponse.json({ success: false, error: "Erreur interne" }, { status: 500 });
  }
}
