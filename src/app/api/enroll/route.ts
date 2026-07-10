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
      const creneauIds = item.creneauIds.filter(Boolean);
      if (creneauIds.length === 0) continue;

      // ── Autorisation de l'enfant (nom pris à la source, jamais du client) ──
      // - soit l'enfant appartient à la famille connectée ;
      // - soit une réservation liée : l'enfant doit RÉELLEMENT appartenir à la
      //   famille source (on la charge et on vérifie). La simple présence de
      //   sourceFamilyId ne suffit plus (faille corrigée).
      let childName: string;
      if (childrenMap.has(item.childId)) {
        childName = childrenMap.get(item.childId) || "";
      } else if (item.sourceFamilyId) {
        const srcSnap = await adminDb.collection("families").doc(item.sourceFamilyId).get();
        const srcChild = srcSnap.exists
          ? ((srcSnap.data() as any).children || []).find((c: any) => c.id === item.childId)
          : null;
        if (!srcChild) { notOwned.push(item.childId); continue; }
        childName = srcChild.firstName || srcChild.prenom || "";
      } else {
        notOwned.push(item.childId);
        continue;
      }

      // ── Inscription ATOMIQUE de l'item : on lit TOUS les créneaux, on vérifie
      // que chacun a de la place (ou l'enfant déjà inscrit), puis on inscrit
      // PARTOUT ou NULLE PART. Évite qu'un stage soit inscrit à moitié mais
      // facturé en entier (faille corrigée).
      try {
        const outcome = await adminDb.runTransaction(async (tx) => {
          const refs = creneauIds.map((cid) => adminDb.collection("creneaux").doc(cid));
          const snaps = await Promise.all(refs.map((r) => tx.get(r)));
          // 1) Vérifier tous les créneaux avant toute écriture
          for (let i = 0; i < snaps.length; i++) {
            const s = snaps[i];
            if (!s.exists) return { status: "missing" as const, cid: creneauIds[i] };
            const cr = s.data() as any;
            const list: any[] = cr.enrolled || [];
            if (list.some((e: any) => e.childId === item.childId)) continue; // déjà inscrit = ok
            const maxP = typeof cr.maxPlaces === "number" ? cr.maxPlaces : Number.POSITIVE_INFINITY;
            if (list.length >= maxP) return { status: "full" as const, cid: creneauIds[i] };
          }
          // 2) Tout est bon → inscrire partout
          for (let i = 0; i < snaps.length; i++) {
            const cr = snaps[i].data() as any;
            const list: any[] = cr.enrolled || [];
            if (list.some((e: any) => e.childId === item.childId)) continue;
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
            tx.update(refs[i], { enrolled: [...list, entry], enrolledCount: list.length + 1 });
          }
          return { status: "ok" as const };
        });
        if (outcome.status === "ok") enrolled.push(...creneauIds);
        else if (outcome.status === "full") full.push(outcome.cid);
        // "missing" : on ignore (créneau introuvable)
      } catch (e) {
        console.error(`/api/enroll — échec item (child ${item.childId}):`, e);
        full.push(creneauIds[0]);
      }
    }

    // Un item n'a pas pu être inscrit entièrement (complet) → on refuse, pour que
    // le client n'aille pas facturer une inscription partielle.
    if (full.length > 0) {
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
