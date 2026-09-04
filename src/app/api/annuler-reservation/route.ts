/**
 * POST /api/annuler-reservation   { paymentId }
 *
 * Permet à une famille d'abandonner une réservation qu'elle n'a PAS payée.
 *
 * ── Pourquoi cette route existe ──────────────────────────────────────────
 *
 * Le parcours de réservation crée l'inscription (place tenue), la réservation
 * et le paiement AVANT d'envoyer vers la banque. Une famille qui renonce en
 * cours de route — elle ferme l'onglet, revient en arrière, change d'avis —
 * laissait derrière elle :
 *
 *   • une place tenue, libérée au bout de 30 min par le cron de purge ;
 *   • un `payments` en « pending » que RIEN ne nettoyait, affiché
 *     indéfiniment comme « reste à régler » dans son espace ;
 *   • une `reservations` en « pending_payment », affichée indéfiniment
 *     comme « paiement à finaliser » ;
 *   • une facture fantôme dans les impayés de l'administration.
 *
 * Et aucun bouton pour annuler : la seule issue était d'appeler le club.
 *
 * ── Ce que la route autorise, et ce qu'elle refuse ───────────────────────
 *
 * Uniquement l'abandon d'une commande dont RIEN n'a été encaissé. Dès qu'un
 * centime est entré — acompte compris — l'annulation relève des conditions
 * d'annulation (avoir, remboursement, retenue) et reste la décision de
 * l'administration : la route refuse et invite à contacter le club.
 *
 * Elle ne supprime rien : le paiement passe à « cancelled » et garde sa
 * trace. Les places tenues, elles, sont libérées immédiatement plutôt que
 * d'attendre la purge — la place repart tout de suite à la vente.
 */

import { NextRequest, NextResponse } from "next/server";
import { champsNiveauApresRetrait } from "@/lib/promenade-niveau";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { FieldValue } from "firebase-admin/firestore";
import type { Paiement } from "@/types/argent";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const uid: string = auth.uid;

  try {
    const { paymentId } = await req.json().catch(() => ({}));
    if (!paymentId) {
      return NextResponse.json({ error: "paymentId requis" }, { status: 400 });
    }

    const payRef = adminDb.collection("payments").doc(String(paymentId));
    const paySnap = await payRef.get();
    if (!paySnap.exists) {
      return NextResponse.json({ error: "Cette commande n'existe plus." }, { status: 404 });
    }
    const p = paySnap.data() as Paiement;

    // ── Contrôles ────────────────────────────────────────────────────────
    if (p.familyId !== uid) {
      // On ne dit pas « ce paiement appartient à quelqu'un d'autre » : ça
      // confirmerait l'existence d'une commande à qui devine un identifiant.
      return NextResponse.json({ error: "Cette commande n'existe plus." }, { status: 404 });
    }
    if (p.status === "cancelled") {
      return NextResponse.json({ ok: true, dejaAnnule: true });
    }
    if (p.status === "paid" || (p.paidAmount || 0) > 0 || p.invoiceNumber) {
      return NextResponse.json(
        {
          error: "Cette réservation a déjà donné lieu à un règlement. Contacte le club pour l'annuler : les conditions d'annulation s'appliquent.",
          code: "DEJA_REGLE",
        },
        { status: 409 }
      );
    }

    // Filet supplémentaire : un encaissement enregistré au comptoir n'apparaît
    // pas toujours immédiatement dans `paidAmount`.
    const encs = await adminDb.collection("encaissements")
      .where("paymentId", "==", payRef.id).limit(1).get();
    if (!encs.empty) {
      return NextResponse.json(
        {
          error: "Un règlement a été enregistré pour cette réservation. Contacte le club pour l'annuler.",
          code: "DEJA_REGLE",
        },
        { status: 409 }
      );
    }

    // ── Créneaux et enfants concernés ────────────────────────────────────
    const cibles = new Map<string, Set<string>>(); // creneauId → childIds
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

    // ── Libération immédiate des places TENUES ───────────────────────────
    // Uniquement les entrées `pending` de cette famille : une place déjà
    // confirmée (payée autrement, ou posée par le club) n'est jamais retirée
    // par cette route.
    let placesLiberees = 0;
    const creneauxLiberes: string[] = [];
    for (const [creneauId, childIds] of cibles) {
      const ref = adminDb.collection("creneaux").doc(creneauId);
      try {
        const retire = await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists) return 0;
          const list: any[] = (snap.data() as any).enrolled || [];
          const conserves = list.filter(
            (e) => !(e?.pending === true && e.familyId === uid && childIds.has(e.childId))
          );
          const n = list.length - conserves.length;
          if (n > 0) tx.update(ref, { enrolled: conserves, enrolledCount: conserves.length, ...champsNiveauApresRetrait(snap.data() as any, conserves) });
          return n;
        });
        if (retire > 0) { placesLiberees += retire; creneauxLiberes.push(creneauId); }
      } catch (e) {
        console.error(`[annuler-reservation] créneau ${creneauId}:`, e);
      }
    }

    // ── Réservations en attente de règlement ─────────────────────────────
    let reservationsAnnulees = 0;
    try {
      const resaSnap = await adminDb.collection("reservations")
        .where("familyId", "==", uid).get();
      const batch = adminDb.batch();
      resaSnap.docs.forEach((d) => {
        const r = d.data() as any;
        if (r.status !== "pending_payment") return;
        const ids: string[] = Array.isArray(r.creneauIds) && r.creneauIds.length
          ? r.creneauIds
          : r.creneauId ? [r.creneauId] : [];
        if (!ids.some((c) => cibles.has(c))) return;
        batch.update(d.ref, {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          cancelledBy: "famille",
        });
        reservationsAnnulees++;
      });
      if (reservationsAnnulees > 0) await batch.commit();
    } catch (e) {
      console.error("[annuler-reservation] réservations:", e);
    }

    // ── Le paiement passe à « annulé » — jamais supprimé ─────────────────
    await payRef.update({
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: "famille",
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(
      `[annuler-reservation] paiement ${payRef.id} annulé par la famille ${uid} — ` +
      `${placesLiberees} place(s) libérée(s), ${reservationsAnnulees} réservation(s)`
    );

    // ── Liste d'attente : la place repart tout de suite ──────────────────
    // Non bloquant : l'annulation est déjà actée, une proposition ratée ne
    // doit pas la faire échouer.
    const origin = req.nextUrl.origin;
    const secret = process.env.CRON_SECRET || "";
    for (const creneauId of creneauxLiberes) {
      fetch(`${origin}/api/waitlist/propose-interne`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": secret },
        body: JSON.stringify({ creneauId }),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, placesLiberees, reservationsAnnulees });
  } catch (e) {
    console.error("[annuler-reservation]", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
