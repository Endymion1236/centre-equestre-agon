/**
 * /api/enroll — Inscription sécurisée d'un enfant dans un ou plusieurs créneaux.
 *
 * Objectif (audit P0 #3 + #7) : ne plus laisser le navigateur réécrire
 * directement le tableau `enrolled` d'un créneau (ce qui permettait de
 * supprimer les inscrits d'autres familles ou de dépasser la capacité).
 *
 * Garanties :
 *   - Auth obligatoire (verifyAuth), familyId forcé à auth.uid.
 *   - L'enfant doit appartenir à la famille connectée (sauf réservation liée
 *     explicite via sourceFamilyId — cas conservé pour ne rien casser).
 *   - Transaction par créneau : vérifie la capacité (maxPlaces) et les doublons.
 *   - Nom de l'enfant/famille pris depuis la fiche famille (pas depuis le client).
 *
 * Body : { enrollments: [{ childId, creneauIds: string[], sourceFamilyId?, childName? }] }
 * Réponse : { ok, enrolled: string[], full: string[], notOwned: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

interface EnrollItem {
  childId: string;
  creneauIds: string[];
  sourceFamilyId?: string;
  childName?: string;
  paymentSource?: string;      // ex. "forfait" pour une inscription annuelle
  forfaitId?: string | null;
  pending?: boolean;           // place tenue mais non confirmée (paiement différé)
  paymentMethod?: string;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth.uid;

  try {
    const body = await req.json();
    const items: EnrollItem[] = Array.isArray(body.enrollments) ? body.enrollments : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Aucune inscription fournie" }, { status: 400 });
    }

    // Source d'autorité : la fiche famille (jamais le client).
    const famSnap = await adminDb.collection("families").doc(uid).get();
    if (!famSnap.exists) {
      return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    }
    const family = famSnap.data() as any;
    const childrenMap = new Map<string, string>();
    (family.children || []).forEach((c: any) => childrenMap.set(c.id, c.firstName || c.prenom || ""));
    const familyName = family.parentName || "";

    const enrolled: string[] = [];
    const full: string[] = [];
    const notOwned: string[] = [];

    for (const item of items) {
      if (!item?.childId || !Array.isArray(item.creneauIds)) continue;

      const owned = childrenMap.has(item.childId);
      // On autorise l'enfant s'il appartient à la famille, OU si une réservation
      // liée explicite est demandée (sourceFamilyId) — cas rare conservé.
      if (!owned && !item.sourceFamilyId) {
        notOwned.push(item.childId);
        continue;
      }
      const childName = owned ? (childrenMap.get(item.childId) || "") : (item.childName || "");

      for (const cid of item.creneauIds) {
        if (!cid) continue;
        try {
          const outcome = await adminDb.runTransaction(async (tx) => {
            const crRef = adminDb.collection("creneaux").doc(cid);
            const crSnap = await tx.get(crRef);
            if (!crSnap.exists) return "missing";
            const cr = crSnap.data() as any;
            const list: any[] = cr.enrolled || [];
            if (list.some((e: any) => e.childId === item.childId)) return "already";
            const maxP = typeof cr.maxPlaces === "number" ? cr.maxPlaces : Number.POSITIVE_INFINITY;
            if (list.length >= maxP) return "full";
            const entry: any = {
              childId: item.childId,
              childName,
              familyId: uid,
              familyName,
              enrolledAt: new Date().toISOString(),
            };
            if (item.sourceFamilyId) entry.sourceFamilyId = item.sourceFamilyId;
            if (item.paymentSource) entry.paymentSource = item.paymentSource;
            if ("forfaitId" in item) entry.forfaitId = item.forfaitId ?? null;
            if (item.pending) { entry.pending = true; if (item.paymentMethod) entry.paymentMethod = item.paymentMethod; }
            tx.update(crRef, { enrolled: [...list, entry], enrolledCount: list.length + 1 });
            return "ok";
          });
          if (outcome === "ok" || outcome === "already") enrolled.push(cid);
          else if (outcome === "full") full.push(cid);
        } catch (e) {
          console.error(`/api/enroll — échec créneau ${cid}:`, e);
        }
      }
    }

    // Si tout ce qui était demandé est complet (rien inscrit), on le signale.
    if (enrolled.length === 0 && full.length > 0) {
      return NextResponse.json({ error: "Créneau(x) complet(s)", full, notOwned }, { status: 409 });
    }
    if (enrolled.length === 0 && notOwned.length > 0) {
      return NextResponse.json({ error: "Enfant non autorisé", notOwned }, { status: 403 });
    }

    return NextResponse.json({ ok: true, enrolled, full, notOwned });
  } catch (e: any) {
    console.error("/api/enroll — erreur:", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur" }, { status: 500 });
  }
}
