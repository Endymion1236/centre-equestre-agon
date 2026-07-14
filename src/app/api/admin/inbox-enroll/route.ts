import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/inbox-enroll  (admin uniquement)
//
// Étape 2 de l'assistant boîte : inscrire EN 1 CLIC l'enfant d'une famille
// (celle qui a écrit le mail) sur un créneau proposé par l'assistant.
//
// Principe de sûreté (identique à l'audit `sourceFamilyId` corrigé) :
//   - Le serveur ne fait JAMAIS confiance au client pour le lien enfant↔famille.
//     Il re-résout la famille (`familyId`), puis vérifie que `childId` figure
//     bien dans `family.children`. Sinon → 403 (enfant non autorisé).
//   - L'écriture se fait dans une TRANSACTION sur le créneau : on relit la
//     capacité au dernier moment (place réellement dispo) et on refuse un
//     créneau complet. Pas de doublon (déjà inscrit = idempotent → "already").
//   - AUCUNE écriture financière ici. L'inscription est découplée du paiement
//     (le lien de paiement / la déclaration d'encaissement, c'est l'étape 3).
//     Mutation réversible : l'admin peut retirer l'entrée du créneau.
//
// Body    : { creneauId: string, childId: string, familyId: string }
// Réponse : { ok: true, status: "enrolled" | "already" }
//           ou { error, status: "full" | "missing" | "notOwned" | "badRequest" }
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth; // 401 / 403

  try {
    const body = await req.json().catch(() => ({}));
    const creneauId = typeof body?.creneauId === "string" ? body.creneauId.trim() : "";
    const childId = typeof body?.childId === "string" ? body.childId.trim() : "";
    const familyId = typeof body?.familyId === "string" ? body.familyId.trim() : "";

    if (!creneauId || !childId || !familyId) {
      return NextResponse.json(
        { error: "Paramètres manquants (creneauId, childId, familyId requis).", status: "badRequest" },
        { status: 400 }
      );
    }

    // ── 1. Re-résolution serveur : l'enfant appartient-il bien à la famille ? ──
    const famSnap = await adminDb.collection("families").doc(familyId).get();
    if (!famSnap.exists) {
      return NextResponse.json({ error: "Famille introuvable.", status: "notOwned" }, { status: 403 });
    }
    const family = famSnap.data() as any;
    const child = (family.children || []).find((c: any) => c?.id === childId);
    if (!child) {
      // Le childId fourni n'appartient pas à cette famille → on refuse.
      return NextResponse.json(
        { error: "Cet enfant n'appartient pas à la famille de l'expéditeur.", status: "notOwned" },
        { status: 403 }
      );
    }
    const childName = `${child.firstName || ""} ${child.lastName || ""}`.trim() || child.firstName || "";
    const familyName = family.parentName || "";

    // ── 2. Transaction : capacité relue au dernier moment, pas de doublon ──
    const creneauRef = adminDb.collection("creneaux").doc(creneauId);
    const outcome = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(creneauRef);
      if (!snap.exists) return { status: "missing" as const };
      const cr = snap.data() as any;
      const list: any[] = Array.isArray(cr.enrolled) ? cr.enrolled : [];

      // Déjà inscrit → idempotent, rien à faire.
      if (list.some((e: any) => e.childId === childId)) return { status: "already" as const };

      const maxP = typeof cr.maxPlaces === "number" ? cr.maxPlaces : Number.POSITIVE_INFINITY;
      if (list.length >= maxP) return { status: "full" as const };

      const entry = {
        childId,
        childName,
        familyId,
        familyName,
        enrolledAt: new Date().toISOString(),
        presence: null,
        // Traçabilité : inscription issue de l'assistant boîte, non encore réglée.
        source: "boite-ia",
        enrolledBy: auth.email || auth.uid || "",
      };
      tx.update(creneauRef, { enrolled: [...list, entry], enrolledCount: list.length + 1 });
      return { status: "enrolled" as const };
    });

    if (outcome.status === "missing") {
      return NextResponse.json({ error: "Créneau introuvable ou supprimé.", status: "missing" }, { status: 404 });
    }
    if (outcome.status === "full") {
      return NextResponse.json({ error: "Créneau complet.", status: "full" }, { status: 409 });
    }
    // "enrolled" ou "already" → succès
    return NextResponse.json({ ok: true, status: outcome.status, childName, creneauId });
  } catch (e: any) {
    console.error("[inbox-enroll]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
