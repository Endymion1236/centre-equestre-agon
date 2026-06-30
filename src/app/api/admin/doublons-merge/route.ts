/**
 * Fusion de deux comptes famille — admin (Phase 2).
 * POST /api/admin/doublons-merge  body: { keepId, mergeId, dryRun?, confirm? }
 *
 * Déplace les données du compte absorbé (mergeId) vers le compte conservé (keepId) :
 *   - enfants ajoutés au compte conservé
 *   - réaffectation familyId/familyName : payments, forfaits, avoirs, fidelite,
 *     reservations, devis (collections mutables)
 *   - créneaux : entrées `enrolled` du compte absorbé repointées vers le conservé
 *   - ENCAISSEMENTS : NON touchés (immuables NF525 ; ils sont rattachés par
 *     paymentId, donc l'historique financier suit les payments réaffectés)
 *   - compte absorbé marqué { status:"merged", mergedInto:keepId } (non supprimé)
 *   - trace dans `family-merges`
 *
 * dryRun=true : ne modifie rien, renvoie le décompte de ce qui serait déplacé.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// Collections mutables réaffectées par familyId (NF525 : encaissements exclus).
const REASSIGN = ["payments", "forfaits", "avoirs", "fidelite", "reservations", "devis"] as const;

async function commitInBatches(ops: { ref: FirebaseFirestore.DocumentReference; data: any }[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = adminDb.batch();
    ops.slice(i, i + 450).forEach(o => batch.set(o.ref, o.data, { merge: true }));
    await batch.commit();
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const keepId = String(body?.keepId || "");
    const mergeId = String(body?.mergeId || "");
    const dryRun = !!body?.dryRun;
    if (!keepId || !mergeId || keepId === mergeId) {
      return NextResponse.json({ error: "keepId/mergeId invalides" }, { status: 400 });
    }

    const keepSnap = await adminDb.collection("families").doc(keepId).get();
    const mergeSnap = await adminDb.collection("families").doc(mergeId).get();
    if (!keepSnap.exists || !mergeSnap.exists) return NextResponse.json({ error: "compte introuvable" }, { status: 404 });
    const keep = keepSnap.data() as any;
    const merge = mergeSnap.data() as any;
    const keepName = keep.parentName || "";

    // Décompte par collection
    const counts: Record<string, number> = {};
    const reassignOps: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];
    for (const coll of REASSIGN) {
      const snap = await adminDb.collection(coll).where("familyId", "==", mergeId).get();
      counts[coll] = snap.size;
      snap.docs.forEach(d => reassignOps.push({ ref: d.ref, data: { familyId: keepId, familyName: keepName } }));
    }

    // Enfants à ajouter (dédoublonnage par id)
    const keepChildIds = new Set((keep.children || []).map((c: any) => c.id));
    const childrenToAdd = (merge.children || []).filter((c: any) => !keepChildIds.has(c.id));

    // Créneaux contenant le compte absorbé dans enrolled
    const crSnap = await adminDb.collection("creneaux").get();
    const creneauOps: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];
    let creneauxTouches = 0;
    crSnap.docs.forEach(d => {
      const c = d.data() as any;
      const enrolled = Array.isArray(c.enrolled) ? c.enrolled : [];
      if (!enrolled.some((e: any) => e?.familyId === mergeId)) return;
      creneauxTouches++;
      const newEnrolled = enrolled.map((e: any) => e?.familyId === mergeId ? { ...e, familyId: keepId, familyName: keepName } : e);
      creneauOps.push({ ref: d.ref, data: { enrolled: newEnrolled } });
    });

    const apercu = {
      keep: { id: keepId, name: keep.parentName, email: keep.parentEmail },
      merge: { id: mergeId, name: merge.parentName, email: merge.parentEmail },
      enfantsAjoutes: childrenToAdd.length,
      reassign: counts,
      creneauxTouches,
    };

    if (dryRun) return NextResponse.json({ dryRun: true, apercu });
    if (!body?.confirm) return NextResponse.json({ error: "confirmation requise" }, { status: 400 });

    // ── Exécution ──────────────────────────────────────────────────────────
    await commitInBatches(reassignOps);
    await commitInBatches(creneauOps);

    // Enfants -> compte conservé
    if (childrenToAdd.length > 0) {
      await adminDb.collection("families").doc(keepId).set(
        { children: [...(keep.children || []), ...childrenToAdd] }, { merge: true },
      );
    }
    // Continuité de connexion : si le conservé n'a pas d'auth et l'absorbé oui,
    // on repointe l'email de connexion vers le conservé.
    if (!keep.authUid && merge.authUid && merge.parentEmail) {
      await adminDb.collection("families").doc(keepId).set({ parentEmail: merge.parentEmail }, { merge: true });
    }
    // Marquer l'absorbé comme fusionné (réversible, non supprimé)
    await adminDb.collection("families").doc(mergeId).set(
      { status: "merged", mergedInto: keepId, mergedAt: new Date(), children: [] }, { merge: true },
    );
    // Trace
    await adminDb.collection("family-merges").add({
      keepId, mergeId, keepName: keep.parentName || "", mergeName: merge.parentName || "",
      counts, enfantsAjoutes: childrenToAdd.length, creneauxTouches,
      mergedBy: (auth as any)?.email || "admin", mergedAt: new Date(),
    });

    return NextResponse.json({ ok: true, apercu });
  } catch (e: any) {
    console.error("doublons-merge:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
