/**
 * GET  /api/admin/depenses — toutes les dépenses mensuelles par poste.
 * POST /api/admin/depenses
 *   { action: "saisir", poste, mois: "AAAA-MM", montant: number | null, note? }
 *       → pose (ou efface si null) la dépense d'un poste pour un mois.
 *
 * Le pendant « charges » de la trésorerie : le bilan n'arrive qu'une fois par
 * an, six mois après la clôture — ici, les postes qui dérapent (entretien,
 * fournitures, véto…) se voient au fil de l'eau, comparés au dernier exercice
 * validé par le cabinet. Même parti pris que tresorerie-releves : écrit et lu
 * par adminDb (aucune règle Firestore à publier), ce n'est PAS une écriture
 * comptable — un outil de pilotage, corrigible à tout moment.
 *
 * Un document par (mois, poste) : `depenses/{AAAA-MM}__{cléPoste}`.
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "Vétérinaire & santé" → "veterinaire-sante" (id de document stable). */
function clePoste(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const snap = await adminDb.collection("depenses").get();
    const depenses = snap.docs.map((d) => {
      const r = d.data() as any;
      return {
        id: d.id,
        mois: r.mois || "",
        poste: r.poste || "",
        montant: Number(r.montant || 0),
        note: r.note || "",
      };
    }).filter((l) => MOIS_RE.test(l.mois) && l.poste);
    return NextResponse.json({ depenses });
  } catch (e) {
    console.error("[depenses] lecture", e);
    return NextResponse.json({ error: "Erreur de lecture des dépenses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    if (body.action === "saisir") {
      const poste = String(body.poste || "").trim().slice(0, 80);
      const mois = String(body.mois || "");
      if (!MOIS_RE.test(mois) || !poste) {
        return NextResponse.json({ error: "Mois ou poste invalide" }, { status: 400 });
      }
      const ref = adminDb.collection("depenses").doc(`${mois}__${clePoste(poste)}`);
      if (body.montant === null || body.montant === "") {
        await ref.delete();
        return NextResponse.json({ ok: true, efface: true });
      }
      const montant = Number(String(body.montant).replace(",", "."));
      if (!Number.isFinite(montant) || montant < 0) {
        return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
      }
      await ref.set({
        mois, poste,
        montant: Math.round(montant * 100) / 100,
        note: String(body.note || "").slice(0, 500),
        source: "saisie",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    console.error("[depenses] écriture", e);
    return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
  }
}
