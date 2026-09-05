/**
 * GET  /api/admin/depenses — toutes les factures saisies (une ligne = une facture).
 * POST /api/admin/depenses
 *   { action: "ajouter",  poste, mois: "AAAA-MM", montant, fournisseur?, note? }
 *   { action: "ajouter-lot", factures: [{ mois, poste, montant, fournisseur?, note?, date? }] }
 *       → débits d'un relevé. GARDE-FOU : une ligne déjà présente le même
 *         mois (même libellé, même montant) n'est pas réajoutée — le même
 *         relevé déposé deux fois ne double plus la matrice. Renvoie
 *         { ajoutees, doublons, invalides }.
 *   { action: "modifier", id, montant?, fournisseur?, note? }
 *   { action: "supprimer", id }
 *   { action: "supprimer-lot", ids: string[] }  → nettoyage des doublons.
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
import { empreinteDepense, filtrerNouvellesLignes } from "@/app/admin/comptabilite/depenses/depenses-utils";

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
        source: r.source || "",
        dateOperation: r.dateOperation || "",
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
      let invalides = 0;
      const valides: { mois: string; poste: string; montant: number; fournisseur: string; note: string; dateOperation: string }[] = [];
      for (const l of lignes) {
        const poste = String(l?.poste || "").trim().slice(0, 80);
        const mois = String(l?.mois || "");
        const montant = nbMontant(l?.montant);
        if (!MOIS_RE.test(mois) || !poste || montant === null) { invalides++; continue; }
        valides.push({
          mois, poste, montant,
          fournisseur: String(l?.fournisseur || "").trim().slice(0, 80),
          note: String(l?.note || "").slice(0, 500),
          dateOperation: String(l?.date || "").trim().slice(0, 12),
        });
      }

      // Garde-fou : ce qui existe déjà sur les mois concernés ne repasse pas.
      const moisConcernes = [...new Set(valides.map((l) => l.mois))];
      const existantes: { mois: string; fournisseur: string; montant: number }[] = [];
      for (let i = 0; i < moisConcernes.length; i += 10) {
        const snap = await adminDb.collection("depenses").where("mois", "in", moisConcernes.slice(i, i + 10)).get();
        for (const d of snap.docs) {
          const r = d.data() as any;
          existantes.push({ mois: r.mois || "", fournisseur: r.fournisseur || "", montant: Number(r.montant || 0) });
        }
      }
      const { aAjouter, doublons } = filtrerNouvellesLignes(existantes, valides);

      const batch = adminDb.batch();
      for (const l of aAjouter) {
        batch.set(adminDb.collection("depenses").doc(), {
          ...l,
          empreinte: empreinteDepense(l),
          source: "releve-bancaire",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (aAjouter.length > 0) await batch.commit();
      return NextResponse.json({ ok: true, ajoutees: aAjouter.length, doublons: doublons.length, invalides });
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

    // Nettoyage des doublons proposé par l'écran Dépenses (lignes en trop
    // d'un relevé importé deux fois avant le garde-fou).
    if (body.action === "supprimer-lot") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map((x: unknown) => String(x || "")).filter(Boolean);
      if (ids.length === 0 || ids.length > 200) {
        return NextResponse.json({ error: "Entre 1 et 200 identifiants" }, { status: 400 });
      }
      const batch = adminDb.batch();
      for (const id of ids) batch.delete(adminDb.collection("depenses").doc(id));
      await batch.commit();
      return NextResponse.json({ ok: true, supprimees: ids.length });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    console.error("[depenses] écriture", e);
    return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
  }
}
