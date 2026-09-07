/**
 * GET  /api/admin/depenses — toutes les factures saisies (une ligne = une facture).
 * POST /api/admin/depenses
 *   { action: "ajouter",  poste, mois: "AAAA-MM", montant, fournisseur?, note? }
 *   { action: "modifier", id, montant?, fournisseur?, note? }
 *   { action: "supprimer", id }
 *
 * Le pendant « charges » de la trésorerie : le bilan n'arrive qu'une fois par
 * an, six mois après la clôture — ici, les postes qui dérapent (entretien,
 * fournitures, véto…) se voient au fil de l'eau, comparés au dernier exercice
 * validé par le cabinet. Chaque facture est une ligne (fournisseur, montant) ;
 * la matrice affiche la somme du poste sur le mois. Même parti pris que
 * tresorerie-releves : écrit et lu par adminDb (aucune règle Firestore à
 * publier), ce n'est PAS une écriture comptable — un outil de pilotage,
 * corrigible à tout moment.
 *
 * Collection `depenses`, id auto par facture. (Les tout premiers documents,
 * créés quand l'écran ne gérait qu'un montant par mois, ont un id
 * `{mois}__{poste}` et pas de fournisseur : ils restent lisibles et
 * supprimables comme n'importe quelle ligne.)
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { dateValide } from "@/lib/justificatifs";
import { completerDates, type LigneDate } from "@/lib/depenses-dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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
        fournisseur: r.fournisseur || "",
        montant: Number(r.montant || 0),
        note: r.note || "",
        dateOperation: r.dateOperation || "",
        source: r.source || "",
      };
    }).filter((l) => MOIS_RE.test(l.mois) && l.poste);
    return NextResponse.json({ depenses });
  } catch (e) {
    console.error("[depenses] lecture", e);
    return NextResponse.json({ error: "Erreur de lecture des dépenses" }, { status: 500 });
  }
}

function nbMontant(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    // Relecture d'un ancien relevé : enrichir uniquement, jamais ajouter de dépenses.
    if (body.action === "completer-dates") {
      if (!Array.isArray(body.factures) || !body.factures.length || body.factures.length > 200) return NextResponse.json({ error: "Entre 1 et 200 lignes" }, { status: 400 });
      const lignes: LigneDate[] = body.factures.map((l: any) => ({ mois: String(l?.mois || ""), fournisseur: String(l?.fournisseur || "").slice(0, 80), montant: nbMontant(l?.montant) ?? NaN, date: dateValide(l?.date) }));
      if (lignes.some(l => !MOIS_RE.test(l.mois) || !Number.isFinite(l.montant))) return NextResponse.json({ error: "Mois ou montant invalide" }, { status: 400 });
      const bilan = { completees: 0, ambigues: 0, absentes: 0, dejaDatees: 0, invalides: 0 };
      for (const mois of [...new Set(lignes.map(l => l.mois))]) {
        const resultat = await adminDb.runTransaction(async tx => {
          const snap = await tx.get(adminDb.collection("depenses").where("mois", "==", mois));
          const existantes = snap.docs.filter(d => d.data().source === "releve-bancaire").map(d => ({ ...d.data(), id: d.id })) as LigneDate[];
          const r = completerDates(existantes, lignes.filter(l => l.mois === mois));
          for (const m of r.modifications) tx.update(adminDb.collection("depenses").doc(m.id), { dateOperation: m.dateOperation, dateCompleteePar: auth.uid, dateCompleteeLe: FieldValue.serverTimestamp() });
          return r;
        });
        bilan.completees += resultat.modifications.length;
        for (const k of ["ambigues", "absentes", "dejaDatees", "invalides"] as const) bilan[k] += resultat[k];
      }
      return NextResponse.json({ ok: true, ...bilan });
    }

    if (body.action === "ajouter") {
      const poste = String(body.poste || "").trim().slice(0, 80);
      const mois = String(body.mois || "");
      const montant = nbMontant(body.montant);
      if (!MOIS_RE.test(mois) || !poste || montant === null) {
        return NextResponse.json({ error: "Mois, poste ou montant invalide" }, { status: 400 });
      }
      const ref = await adminDb.collection("depenses").add({
        mois, poste, montant,
        fournisseur: String(body.fournisseur || "").trim().slice(0, 80),
        note: String(body.note || "").slice(0, 500),
        source: "saisie",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true, id: ref.id });
    }

    // Lot de factures d'un coup — typiquement les débits catégorisés d'un
    // relevé de compte validés depuis l'écran Trésorerie.
    if (body.action === "ajouter-lot") {
      const lignes = Array.isArray(body.factures) ? body.factures : [];
      if (lignes.length === 0 || lignes.length > 200) {
        return NextResponse.json({ error: "Entre 1 et 200 factures" }, { status: 400 });
      }
      let ajoutees = 0, invalides = 0;
      for (const l of lignes) {
        const poste = String(l?.poste || "").trim().slice(0, 80);
        const mois = String(l?.mois || "");
        const montant = nbMontant(l?.montant);
        if (!MOIS_RE.test(mois) || !poste || montant === null) { invalides++; continue; }
        await adminDb.collection("depenses").add({
          mois, poste, montant,
          fournisseur: String(l?.fournisseur || "").trim().slice(0, 80),
          note: String(l?.note || "").slice(0, 500),
          source: "releve-bancaire",
          dateOperation: dateValide(l?.date),
          updatedAt: FieldValue.serverTimestamp(),
        });
        ajoutees++;
      }
      return NextResponse.json({ ok: true, ajoutees, invalides });
    }

    if (body.action === "modifier") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ error: "Id manquant" }, { status: 400 });
      const maj: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (body.montant !== undefined) {
        const montant = nbMontant(body.montant);
        if (montant === null) return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
        maj.montant = montant;
      }
      if (body.fournisseur !== undefined) maj.fournisseur = String(body.fournisseur || "").trim().slice(0, 80);
      if (body.note !== undefined) maj.note = String(body.note || "").slice(0, 500);
      await adminDb.collection("depenses").doc(id).update(maj);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "supprimer") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ error: "Id manquant" }, { status: 400 });
      await adminDb.collection("depenses").doc(id).delete();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    console.error("[depenses] écriture", e);
    return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
  }
}
