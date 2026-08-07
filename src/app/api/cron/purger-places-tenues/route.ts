import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/purger-places-tenues
 *
 * Libère les places tenues pendant un paiement qui n'a jamais abouti.
 *
 * Au clic sur « payer », la famille est inscrite dans le créneau avec
 * `pending: true` et une date d'expiration (`holdUntil`) : la place est
 * protégée le temps de régler. Si le paiement aboutit, la route status ou le
 * webhook CAWL retire le marqueur et l'inscription devient définitive. Sinon,
 * ce cron remet la place en circulation.
 *
 * Garde-fou : on ne purge JAMAIS une entrée dont le paiement associé a
 * finalement été encaissé. Si un `payments` de la famille couvrant ce créneau
 * porte un montant réglé, on lève simplement le marqueur au lieu de
 * désinscrire — c'est le cas où la confirmation n'a pas pu s'exécuter (webhook
 * perdu, route interrompue). Mieux vaut une place occupée à tort qu'une
 * famille qui a payé et se retrouve désinscrite.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maintenant = new Date().toISOString();
  const aujourdhui = maintenant.split("T")[0];
  let creneauxExamines = 0;
  let placesLiberees = 0;
  let placesConfirmees = 0;
  const details: any[] = [];

  try {
    // Seuls les créneaux à venir peuvent encore avoir une place à libérer.
    const snap = await adminDb
      .collection("creneaux")
      .where("date", ">=", aujourdhui)
      .get();

    for (const doc of snap.docs) {
      const c = doc.data() as any;
      const list: any[] = c.enrolled || [];
      const expirees = list.filter(
        (e) => e?.pending && typeof e.holdUntil === "string" && e.holdUntil < maintenant
      );
      if (expirees.length === 0) continue;
      creneauxExamines++;

      // Pour chaque entrée expirée : le paiement a-t-il fini par aboutir ?
      const aPaye = new Map<string, boolean>();
      for (const e of expirees) {
        const cle = `${e.familyId}|${e.childId}`;
        if (aPaye.has(cle)) continue;
        let regle = false;
        try {
          const pays = await adminDb
            .collection("payments")
            .where("familyId", "==", e.familyId)
            .get();
          regle = pays.docs.some((p) => {
            const d = p.data() as any;
            if (!((d.paidAmount || 0) > 0)) return false;
            return (d.items || []).some((it: any) => {
              if (it?.childId !== e.childId) return false;
              const ids: string[] = Array.isArray(it.creneauIds) && it.creneauIds.length
                ? it.creneauIds
                : it.creneauId ? [it.creneauId] : [];
              return ids.includes(doc.id);
            });
          });
        } catch (err) {
          // En cas de doute, on ne touche à rien : ne jamais désinscrire
          // quelqu'un sur la foi d'une lecture qui a échoué.
          console.error("[purge-places] lecture paiements impossible", e.familyId, err);
          regle = true;
        }
        aPaye.set(cle, regle);
      }

      const conserves: any[] = [];
      for (const e of list) {
        const estExpiree = expirees.includes(e);
        if (!estExpiree) { conserves.push(e); continue; }
        if (aPaye.get(`${e.familyId}|${e.childId}`)) {
          // Payé malgré tout → on rend l'inscription définitive.
          const { pending, holdUntil, ...reste } = e;
          conserves.push(reste);
          placesConfirmees++;
        } else {
          placesLiberees++;
          details.push({
            creneauId: doc.id,
            date: c.date,
            activityTitle: c.activityTitle,
            childName: e.childName,
            familyName: e.familyName,
            holdUntil: e.holdUntil,
          });
        }
      }

      await doc.ref.update({ enrolled: conserves, enrolledCount: conserves.length });
    }
  } catch (e: any) {
    console.error("[purge-places] échec:", e);
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }

  console.log(
    `[purge-places] ${creneauxExamines} créneau(x) · ${placesLiberees} place(s) libérée(s) · ${placesConfirmees} confirmée(s)`
  );
  return NextResponse.json({
    ok: true,
    creneauxExamines,
    placesLiberees,
    placesConfirmees,
    details,
  });
}
