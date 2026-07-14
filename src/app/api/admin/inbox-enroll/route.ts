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
// Body    : { creneauIds: string[], childId: string, familyId: string }
//           (rétro-compat : creneauId string unique accepté)
//           Un stage semaine = TOUS ses creneauIds → inscription tout-ou-rien.
// Réponse : { ok: true, status: "enrolled" | "already", enrolledCount }
//           ou { error, status: "full" | "missing" | "notOwned" | "badRequest" }
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth; // 401 / 403

  try {
    const body = await req.json().catch(() => ({}));
    const creneauIds: string[] = Array.isArray(body?.creneauIds)
      ? body.creneauIds.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim())
      : typeof body?.creneauId === "string" && body.creneauId.trim()
      ? [body.creneauId.trim()]
      : [];
    const childId = typeof body?.childId === "string" ? body.childId.trim() : "";
    const familyId = typeof body?.familyId === "string" ? body.familyId.trim() : "";

    if (creneauIds.length === 0 || !childId || !familyId) {
      return NextResponse.json(
        { error: "Paramètres manquants (creneauIds, childId, familyId requis).", status: "badRequest" },
        { status: 400 }
      );
    }
    if (creneauIds.length > 10) {
      return NextResponse.json(
        { error: "Trop de créneaux en une fois (max 10).", status: "badRequest" },
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

    // ── 2. Transaction TOUT-OU-RIEN sur l'ensemble des créneaux (semaine de
    //    stage = tous les jours, ou un créneau simple). On vérifie TOUT avant
    //    d'écrire quoi que ce soit : si un seul jour est complet → rien n'est
    //    inscrit (pas d'inscription partielle qu'il faudrait facturer à tort).
    const refs = creneauIds.map((cid) => adminDb.collection("creneaux").doc(cid));
    const outcome = await adminDb.runTransaction(async (tx) => {
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      // Phase 1 — vérifications (aucune écriture)
      let toWrite = 0;
      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];
        if (!snap.exists) return { status: "missing" as const, cid: creneauIds[i] };
        const cr = snap.data() as any;
        const list: any[] = Array.isArray(cr.enrolled) ? cr.enrolled : [];
        if (list.some((e: any) => e.childId === childId)) continue; // déjà inscrit ce jour → ok
        const maxP = typeof cr.maxPlaces === "number" ? cr.maxPlaces : Number.POSITIVE_INFINITY;
        if (list.length >= maxP) return { status: "full" as const, cid: creneauIds[i] };
        toWrite++;
      }
      if (toWrite === 0) return { status: "already" as const, count: 0 };

      // Phase 2 — écritures (tout est validé)
      const nowIso = new Date().toISOString();
      for (let i = 0; i < snaps.length; i++) {
        const cr = snaps[i].data() as any;
        const list: any[] = Array.isArray(cr.enrolled) ? cr.enrolled : [];
        if (list.some((e: any) => e.childId === childId)) continue;
        const entry = {
          childId,
          childName,
          familyId,
          familyName,
          enrolledAt: nowIso,
          presence: null,
          // Traçabilité : inscription issue de l'assistant boîte, non encore réglée.
          source: "boite-ia",
          enrolledBy: auth.email || auth.uid || "",
        };
        tx.update(refs[i], { enrolled: [...list, entry], enrolledCount: list.length + 1 });
      }
      return { status: "enrolled" as const, count: toWrite };
    });

    if (outcome.status === "missing") {
      return NextResponse.json(
        { error: "Un des créneaux est introuvable ou supprimé.", status: "missing", cid: outcome.cid },
        { status: 404 }
      );
    }
    if (outcome.status === "full") {
      return NextResponse.json(
        { error: creneauIds.length > 1 ? "Un jour de la semaine est complet — rien n'a été inscrit." : "Créneau complet.", status: "full", cid: outcome.cid },
        { status: 409 }
      );
    }
    // "enrolled" ou "already" → succès
    return NextResponse.json({
      ok: true,
      status: outcome.status,
      childName,
      creneauIds,
      enrolledCount: outcome.count ?? 0,
    });
  } catch (e: any) {
    console.error("[inbox-enroll]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
