/**
 * POST /api/admin/justificatifs/rapprochement-auto
 *
 * Associe d'un coup les justificatifs déjà importés aux débits qu'ils
 * justifient sans le moindre doute : montant identique au centime, débit dans
 * les sept jours suivant la pièce, un seul candidat des deux côtés, nom du
 * fournisseur non contradictoire (cf. lib/matching-automatique).
 *
 * Body : { mois: "AAAA-MM", apply?: boolean }
 *
 *   - sans `apply` : aperçu seul, aucune écriture ;
 *   - avec `apply: true` : pose les associations et renvoie ce qui a été fait.
 *
 * Chaque association est écrite dans sa propre transaction, avec les mêmes
 * contrôles que l'association manuelle (pièce libre, débit libre, débit issu
 * d'un relevé). Une association devenue impossible entre l'aperçu et
 * l'écriture est signalée, elle n'interrompt pas les autres.
 *
 * L'écriture porte `associationMode: "automatique"` : le tableau des
 * opérations peut ainsi distinguer ce qui a été posé seul de ce qui a été
 * choisi à la main, et « Dissocier ce paiement » défait l'un comme l'autre.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { nettoyerPiece, type DepenseCandidate } from "@/lib/justificatifs";
import { diagnostiquerDebit, planifierRapprochementAuto, resumerRefus, type PieceMatching } from "@/lib/matching-automatique";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Garde-fous de volume : au-delà, on demande de travailler mois par mois. */
const MAX_PIECES = 800;
const MAX_DEBITS = 2000;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const mois = String(body.mois || "");
  const apply = body.apply === true;

  // Diagnostic d'UNE ligne : « le justificatif est là, pourquoi ne s'est-il
  // pas rattaché ? » Le rapport global part des pièces et ne répond pas à
  // cette question-là ; ici on part du débit.
  const depenseId = typeof body.depenseId === "string" ? body.depenseId : "";
  if (depenseId) {
    if (!/^[\w-]{1,150}$/.test(depenseId)) return NextResponse.json({ error: "Dépense invalide." }, { status: 400 });
    try {
      const [depSnap, piecesSnap, lienSnap] = await Promise.all([
        adminDb.collection("depenses").doc(depenseId).get(),
        adminDb.collection("justificatifs").limit(MAX_PIECES + 1).get(),
        adminDb.collection("justificatifs-liens").doc(depenseId).get(),
      ]);
      if (!depSnap.exists) return NextResponse.json({ error: "Débit introuvable." }, { status: 404 });
      if (piecesSnap.size > MAX_PIECES) return NextResponse.json({ error: "Trop de pièces pour un diagnostic. Archivez les pièces traitées." }, { status: 413 });
      const pieces: PieceMatching[] = piecesSnap.docs.map(d => {
        const v = d.data();
        return {
          id: d.id, nom: v.nom || v.driveNom || "",
          extraction: v.extraction ? nettoyerPiece(v.extraction) : null,
          retire: v.retire === true, depenseId: v.depenseId || null,
          decisionAssociation: v.controleManuel === true || v.paieValidee === true,
          paiementsAssocies: v.paiementsAssocies || [],
        };
      });
      const depense = { ...depSnap.data(), id: depSnap.id } as DepenseCandidate & { rapprochementExclu?: boolean };
      return NextResponse.json({ ok: true, mode: "diagnostic", ...diagnostiquerDebit(depense, pieces, lienSnap.exists) });
    } catch (e) {
      console.error("[justificatifs/rapprochement-auto] diagnostic", e);
      return NextResponse.json({ error: "Diagnostic indisponible pour le moment." }, { status: 500 });
    }
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
    return NextResponse.json({ error: "Mois invalide." }, { status: 400 });
  }

  try {
    const [piecesSnap, depensesSnap] = await Promise.all([
      adminDb.collection("justificatifs").limit(MAX_PIECES + 1).get(),
      adminDb.collection("depenses").where("mois", "==", mois).limit(MAX_DEBITS + 1).get(),
    ]);
    if (piecesSnap.size > MAX_PIECES || depensesSnap.size > MAX_DEBITS) {
      return NextResponse.json({ error: "Trop de pièces ou de débits à traiter en une fois. Archivez les pièces traitées, puis relancez." }, { status: 413 });
    }

    const pieces: PieceMatching[] = piecesSnap.docs.map(d => {
      const v = d.data();
      return {
        id: d.id,
        nom: v.nom || v.driveNom || "",
        extraction: v.extraction ? nettoyerPiece(v.extraction) : null,
        retire: v.retire === true,
        depenseId: v.depenseId || null,
        // Seule une décision d'ASSOCIATION met la pièce hors circuit : le
        // gérant l'a mise de côté pour la traiter lui-même, ou c'est un
        // bulletin de paie déjà classé. Une correction de lecture, elle, sert
        // précisément à rendre le rapprochement possible — s'en servir pour
        // l'interdire mettait hors jeu toutes les pièces qu'on venait de
        // corriger. (L'ancien `autoBloque` était posé jusque par la lecture
        // automatique : s'y fier bloquait tout.)
        decisionAssociation: v.controleManuel === true || v.paieValidee === true,
        paiementsAssocies: v.paiementsAssocies || [],
      };
    });

    const depenses: DepenseCandidate[] = depensesSnap.docs
      .filter(d => d.data().source === "releve-bancaire" && d.data().rapprochementExclu !== true)
      .map(d => ({ ...d.data(), id: d.id }) as DepenseCandidate);

    // Les liens portent l'identifiant du débit : seuls ceux des débits du
    // mois nous intéressent. Lire la collection entière (jusqu'à cinq mille
    // documents) pour n'en utiliser que quelques dizaines coûtait autant de
    // lectures Firestore à chaque aperçu comme à chaque écriture.
    const depensesLiees = new Set<string>();
    for (let i = 0; i < depenses.length; i += 300) {
      const refs = depenses.slice(i, i + 300).map(d => adminDb.collection("justificatifs-liens").doc(d.id));
      if (!refs.length) continue;
      for (const snap of await adminDb.getAll(...refs)) if (snap.exists) depensesLiees.add(snap.id);
    }
    // Le mois borne les pièces examinées : sans lui, une facture d'août
    // comptait comme « restant à associer » dans le rapport de juillet.
    const plan = planifierRapprochementAuto(pieces, depenses, depensesLiees, mois);

    if (!apply) {
      return NextResponse.json({
        ok: true, mois, mode: "aperçu",
        associations: plan.associations,
        ignorees: plan.ignorees.filter(i => i.famille !== "hors-periode").slice(0, 100),
        nbIgnorees: plan.ignorees.length,
        resume: resumerRefus(plan.ignorees),
        note: plan.associations.length
          ? `${plan.associations.length} association(s) possibles sans ambiguïté. Rien n'est encore écrit.`
          : "Aucune association certaine. Les pièces restent à associer à la main.",
      });
    }

    const posees: typeof plan.associations = [];
    const refusees: { pieceId: string; nom?: string; motif: string }[] = [];

    for (const a of plan.associations) {
      const pieceRef = adminDb.collection("justificatifs").doc(a.pieceId);
      const lienRef = adminDb.collection("justificatifs-liens").doc(a.depenseId);
      const depenseRef = adminDb.collection("depenses").doc(a.depenseId);
      try {
        await adminDb.runTransaction(async tx => {
          const [piece, lien, depense] = await tx.getAll(pieceRef, lienRef, depenseRef);
          const p = piece.data();
          if (!piece.exists || !p) throw new Error("Pièce absente.");
          if (p.retire) throw new Error("Pièce archivée entre-temps.");
          if (p.depenseId) throw new Error("Pièce déjà associée entre-temps.");
          if (p.paiementsAssocies?.length) throw new Error("Pièce à rattachements multiples.");
          if (p.controleManuel || p.paieValidee) throw new Error("Pièce mise de côté pour un traitement manuel entre-temps.");
          if (!depense.exists) throw new Error("Débit absent.");
          if (depense.data()?.rapprochementExclu) throw new Error("Débit exclu du rapprochement.");
          if (depense.data()?.source !== "releve-bancaire") throw new Error("Débit hors relevé bancaire.");
          if (lien.exists) throw new Error("Débit déjà justifié entre-temps.");
          tx.set(lienRef, { pieceId: a.pieceId });
          tx.update(pieceRef, {
            depenseId: a.depenseId, associationMode: "automatique", autoBloque: true,
            associationDevise: null, operationAssociee: null,
          });
          tx.create(pieceRef.collection("historique").doc(), {
            action: "associer-automatique", avant: null, apres: a.depenseId,
            concordance: a.concordance, uid: auth.uid, at: FieldValue.serverTimestamp(),
          });
        });
        posees.push(a);
      } catch (e) {
        refusees.push({ pieceId: a.pieceId, nom: a.nom, motif: e instanceof Error ? e.message : "Écriture impossible." });
      }
    }

    return NextResponse.json({
      ok: true, mois, mode: "appliqué",
      associations: posees,
      refusees,
      ignorees: plan.ignorees.filter(i => i.famille !== "hors-periode").slice(0, 100),
      nbIgnorees: plan.ignorees.length,
      resume: resumerRefus(plan.ignorees),
      note: `${posees.length} justificatif(s) rattaché(s) automatiquement. Chaque association reste défaisable depuis le tableau (« Dissocier ce paiement »).`,
    });
  } catch (e) {
    console.error("[justificatifs/rapprochement-auto]", e);
    return NextResponse.json({ error: "Rapprochement automatique indisponible pour le moment. Aucune association n'a été laissée à moitié posée." }, { status: 500 });
  }
}
