import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Inscriptions occupant une place sans avoir jamais été réglées.
 *
 * Origine : jusqu'au correctif « place tenue », la page de réservation
 * inscrivait dans le créneau AVANT d'envoyer vers le paiement. Qui abandonnait
 * restait dans le planning, sans encaissement et sans email. Ces entrées n'ont
 * pas de date d'expiration : le cron de purge les ignore volontairement, elles
 * se traitent ici, une par une, sous contrôle humain.
 *
 * GET  → liste les paiements sans le moindre euro encaissé, avec les créneaux
 *        à venir réellement occupés par l'enfant concerné.
 * POST → { paymentId } libère les places de ce paiement et le passe en
 *        "cancelled". Aucune suppression : le document reste consultable.
 */

interface PlaceOccupee {
  creneauId: string;
  date: string;
  startTime: string;
  endTime: string;
  activityTitle: string;
  pending: boolean;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const aujourdhui = new Date().toISOString().split("T")[0];

  // Les créneaux à venir : c'est là que des places sont encore récupérables.
  const creneauxSnap = await adminDb
    .collection("creneaux")
    .where("date", ">=", aujourdhui)
    .get();

  // Index enfant → créneaux occupés
  const parEnfant = new Map<string, PlaceOccupee[]>();
  for (const d of creneauxSnap.docs) {
    const c = d.data() as any;
    for (const e of c.enrolled || []) {
      if (!e?.childId) continue;
      const cle = `${e.familyId}|${e.childId}`;
      if (!parEnfant.has(cle)) parEnfant.set(cle, []);
      parEnfant.get(cle)!.push({
        creneauId: d.id,
        date: c.date || "",
        startTime: c.startTime || "",
        endTime: c.endTime || "",
        activityTitle: c.activityTitle || "",
        pending: !!e.pending,
      });
    }
  }

  // Déclarations en attente de réception (chèque, espèces, virement).
  // Ce ne sont PAS des abandons : la famille s'est engagée et apporte son
  // règlement. Elles doivent être visibles, mais jamais libérables d'un clic.
  const declParPaiement = new Map<string, any>();
  try {
    const declSnap = await adminDb
      .collection("payment_declarations")
      .where("status", "==", "pending_confirmation")
      .get();
    for (const d of declSnap.docs) {
      const dd = d.data() as any;
      if (dd.paymentId) declParPaiement.set(dd.paymentId, dd);
    }
  } catch (e) {
    console.error("[impayes] lecture des déclarations impossible", e);
  }

  const paySnap = await adminDb.collection("payments").get();
  const impayes: any[] = [];

  for (const d of paySnap.docs) {
    const p = d.data() as any;
    if ((p.paidAmount || 0) > 0) continue;               // un euro encaissé = pas un fantôme
    if (p.status === "cancelled") continue;
    if (p.status === "paid" || p.status === "partial") continue;

    // Places encore occupées, sur des créneaux à venir uniquement.
    const places: PlaceOccupee[] = [];
    for (const item of p.items || []) {
      const ids: string[] = Array.isArray(item?.creneauIds) && item.creneauIds.length
        ? item.creneauIds
        : item?.creneauId ? [item.creneauId] : [];
      const occupees = parEnfant.get(`${p.familyId}|${item.childId}`) || [];
      for (const o of occupees) {
        if (ids.includes(o.creneauId) && !places.some(x => x.creneauId === o.creneauId)) {
          places.push(o);
        }
      }
    }
    if (places.length === 0) continue; // plus aucune place occupée → rien à récupérer

    places.sort((a, b) => a.date.localeCompare(b.date));
    const decl = declParPaiement.get(d.id);
    impayes.push({
      /** Déclaration de règlement différé en attente : dossier à encaisser,
       *  surtout pas une place à récupérer. */
      declaration: decl
        ? {
            mode: decl.mode || p.paymentMode || "",
            declareLe: decl.createdAt?.toDate?.()?.toISOString?.() || null,
          }
        : null,
      paymentId: d.id,
      familyId: p.familyId || "",
      familyName: p.familyName || "",
      familyEmail: p.familyEmail || "",
      totalTTC: p.totalTTC || 0,
      status: p.status || "",
      source: p.source || "",
      creeLe: p.date?.toDate?.()?.toISOString?.() || null,
      enfants: [...new Set((p.items || []).map((i: any) => i.childName).filter(Boolean))],
      activites: [...new Set((p.items || []).map((i: any) => i.activityTitle).filter(Boolean))],
      places,
      /** true si toutes les places sont des holds récents (mécanisme actuel) */
      toutesTenues: places.every(pl => pl.pending),
    });
  }

  impayes.sort((a, b) => (b.creeLe || "").localeCompare(a.creeLe || ""));

  return NextResponse.json({
    nb: impayes.length,
    montantTotal: Math.round(impayes.reduce((s, i) => s + (i.totalTTC || 0), 0) * 100) / 100,
    impayes,
  });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const { paymentId } = await req.json().catch(() => ({} as any));
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId requis" }, { status: 400 });
  }

  const payRef = adminDb.collection("payments").doc(paymentId);
  const paySnap = await payRef.get();
  if (!paySnap.exists) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }
  const p = paySnap.data() as any;

  // Garde-fou : une déclaration de règlement en attente n'est pas un abandon.
  // Le refus vit ici et pas seulement dans l'affichage : la route est
  // appelable directement.
  const declEnCours = await adminDb
    .collection("payment_declarations")
    .where("paymentId", "==", paymentId)
    .where("status", "==", "pending_confirmation")
    .get();
  if (!declEnCours.empty) {
    return NextResponse.json(
      {
        error:
          "Cette famille a déclaré un règlement en attente de réception. " +
          "Traitez-le dans Paiements › Déclarations plutôt que de libérer la place.",
      },
      { status: 409 }
    );
  }

  // Garde-fou : on ne libère jamais une place réglée, même partiellement.
  if ((p.paidAmount || 0) > 0) {
    return NextResponse.json(
      { error: "Ce paiement a été encaissé — libération refusée." },
      { status: 409 }
    );
  }

  let liberees = 0;
  const cibles = new Map<string, Set<string>>();
  for (const item of p.items || []) {
    const ids: string[] = Array.isArray(item?.creneauIds) && item.creneauIds.length
      ? item.creneauIds
      : item?.creneauId ? [item.creneauId] : [];
    for (const cid of ids) {
      if (!cid) continue;
      if (!cibles.has(cid)) cibles.set(cid, new Set());
      if (item.childId) cibles.get(cid)!.add(item.childId);
    }
  }

  for (const [creneauId, childIds] of cibles) {
    const ref = adminDb.collection("creneaux").doc(creneauId);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const list: any[] = (snap.data() as any).enrolled || [];
      const restants = list.filter(
        (e) => !(childIds.has(e.childId) && e.familyId === p.familyId)
      );
      if (restants.length !== list.length) {
        liberees += list.length - restants.length;
        tx.update(ref, { enrolled: restants, enrolledCount: restants.length });
      }
    });
  }

  // Réservations associées (créées en pending_payment au checkout).
  let resaSupprimees = 0;
  try {
    const resaSnap = await adminDb
      .collection("reservations")
      .where("familyId", "==", p.familyId)
      .get();
    for (const r of resaSnap.docs) {
      const rd = r.data() as any;
      if (rd.status !== "pending_payment") continue;
      const concerne = [...cibles.keys()].includes(rd.creneauId);
      if (concerne) { await r.ref.delete(); resaSupprimees++; }
    }
  } catch (e) {
    console.error("[impayes] nettoyage réservations", e);
  }

  // Le paiement n'est pas supprimé : il reste consultable, statut explicite.
  await payRef.update({
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    cancelledBy: auth.email || auth.uid || "admin",
    cancelReason: "Inscription jamais réglée — place libérée depuis l'écran des impayés",
  });

  return NextResponse.json({ ok: true, liberees, resaSupprimees });
}
