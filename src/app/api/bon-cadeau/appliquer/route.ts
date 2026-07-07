import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { createEncaissementServer } from "@/lib/compta-encaissement-server";
import { FieldValue } from "firebase-admin/firestore";

// La famille applique un bon cadeau (par code) sur l'une de ses factures.
// Déduit en mode "avoir" (crédit, pas de nouvelle recette), met à jour la
// facture et décrémente le solde du bon.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const uid = (auth as any).uid;

  const err = (msg: string, code = 400) => NextResponse.json({ error: msg }, { status: code });

  try {
    const { code, paymentId } = await req.json();
    const codeClean = String(code || "").trim().toUpperCase();
    if (!codeClean || !paymentId) return err("Code et facture requis.");

    // 1) Charger et valider le bon
    const bonSnap = await adminDb.collection("bons-cadeaux").where("code", "==", codeClean).limit(1).get();
    if (bonSnap.empty) return err("Bon cadeau introuvable.");
    const bonRef = bonSnap.docs[0].ref;
    const bon = bonSnap.docs[0].data() as any;
    const solde = typeof bon.solde === "number" ? bon.solde : (bon.montant || 0);
    if (bon.statut && bon.statut !== "actif") return err(`Bon ${bon.statut}.`);
    if (solde <= 0) return err("Ce bon est déjà épuisé.");
    if (bon.validUntil) {
      const today = new Date().toISOString().split("T")[0];
      if (bon.validUntil < today) return err("Ce bon est expiré.");
    }

    // 2) Charger la facture et vérifier qu'elle appartient bien à la famille
    const paySnap = await adminDb.collection("payments").doc(String(paymentId)).get();
    if (!paySnap.exists) return err("Facture introuvable.");
    const p = paySnap.data() as any;
    if (p.familyId !== uid) return err("Accès refusé.", 403);
    if (p.status === "paid") return err("Cette facture est déjà réglée.");

    const restant = (p.totalTTC || 0) - (p.paidAmount || 0);
    if (restant <= 0) return err("Rien à régler sur cette facture.");

    const toUse = Math.round(Math.min(solde, restant) * 100) / 100;

    // 3) Enregistrer l'encaissement en mode "avoir" (NF525-safe)
    await createEncaissementServer({
      paymentId: String(paymentId),
      familyId: uid,
      familyName: p.familyName || "",
      montant: toUse,
      mode: "avoir",
      modeLabel: "Bon cadeau",
      ref: codeClean,
      activityTitle: (p.items || []).map((i: any) => i.activityTitle).join(", ") || "Facture",
      raison: `Bon cadeau ${codeClean}`,
    });

    // 4) Mettre à jour la facture
    const newPaid = Math.round(((p.paidAmount || 0) + toUse) * 100) / 100;
    const fullyPaid = newPaid >= (p.totalTTC || 0) - 0.01;
    await paySnap.ref.update({
      paidAmount: newPaid,
      status: fullyPaid ? "paid" : "partial",
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 5) Décrémenter le solde du bon
    const newSolde = Math.round((solde - toUse) * 100) / 100;
    await bonRef.update({
      solde: newSolde,
      statut: newSolde <= 0 ? "utilise" : "actif",
      usedFamilyId: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      applique: toUse,
      resteAPayer: Math.round((restant - toUse) * 100) / 100,
      soldeRestantBon: newSolde,
      facturePayee: fullyPaid,
    });
  } catch (e: any) {
    console.error("bon-cadeau appliquer:", e);
    return err("Erreur lors de l'application du bon.", 500);
  }
}
