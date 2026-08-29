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

    // ── Appariement des cavaliers ─────────────────────────────────────────
    // Les deux fiches d'un doublon portent souvent les MÊMES enfants sous des
    // ids différents (fiche recréée à la connexion du parent, enfant re-saisi).
    // Les additionner donnerait « Garance » et « Aurèle » en double. On
    // reconnaît un même cavalier par prénom (sans accents ni majuscules) +
    // date de naissance identiques — le NOM peut différer (coquille, nom de
    // l'autre parent). Un enfant apparié n'est pas dupliqué : toutes ses
    // références (créneaux, forfaits, réservations, paiements…) sont
    // repointées vers le cavalier conservé.
    const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const dateKey = (b: any): string => {
      if (!b) return "";
      const d = typeof b?.toDate === "function" ? b.toDate() : new Date(b);
      return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    };
    const keepChildren: any[] = keep.children || [];
    const keepChildIds = new Set(keepChildren.map((c: any) => c.id));
    const childMap = new Map<string, any>(); // id absorbé -> enfant conservé
    const childrenToAdd: any[] = [];
    for (const c of (merge.children || []) as any[]) {
      if (keepChildIds.has(c.id)) continue; // strictement le même enregistrement
      const candidats = keepChildren.filter((k: any) => norm(k.firstName) && norm(k.firstName) === norm(c.firstName));
      // Date identique d'abord ; à défaut, prénom seul quand une date manque
      // d'un côté. Deux dates renseignées et DIFFÉRENTES = deux enfants.
      const exact = candidats.find((k: any) => dateKey(k.birthDate) && dateKey(k.birthDate) === dateKey(c.birthDate));
      const souple = candidats.find((k: any) => !dateKey(k.birthDate) || !dateKey(c.birthDate));
      const cible = exact || souple;
      if (cible && c.id) childMap.set(c.id, cible);
      else childrenToAdd.push(c);
    }
    const nomCible = (k: any) => `${k.firstName || ""} ${k.lastName || ""}`.trim();

    // Décompte par collection — avec re-pointage childId des enfants appariés
    const counts: Record<string, number> = {};
    const reassignOps: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];
    for (const coll of REASSIGN) {
      const snap = await adminDb.collection(coll).where("familyId", "==", mergeId).get();
      counts[coll] = snap.size;
      snap.docs.forEach(d => {
        const dd = d.data() as any;
        const cible = dd.childId ? childMap.get(dd.childId) : null;
        reassignOps.push({ ref: d.ref, data: {
          familyId: keepId, familyName: keepName,
          ...(cible ? { childId: cible.id, childName: nomCible(cible) || dd.childName || "" } : {}),
        } });
      });
    }

    // Créneaux contenant le compte absorbé dans enrolled
    const crSnap = await adminDb.collection("creneaux").get();
    const creneauOps: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];
    let creneauxTouches = 0;
    crSnap.docs.forEach(d => {
      const c = d.data() as any;
      const enrolled = Array.isArray(c.enrolled) ? c.enrolled : [];
      if (!enrolled.some((e: any) => e?.familyId === mergeId)) return;
      creneauxTouches++;
      const newEnrolled = enrolled.map((e: any) => {
        if (e?.familyId !== mergeId) return e;
        const cible = e.childId ? childMap.get(e.childId) : null;
        return {
          ...e, familyId: keepId, familyName: keepName,
          ...(cible ? { childId: cible.id, childName: nomCible(cible) || e.childName || "" } : {}),
        };
      });
      creneauOps.push({ ref: d.ref, data: { enrolled: newEnrolled } });
    });

    // On NOMME les cavaliers de part et d'autre : annoncer « 2 enfant(s) »
    // avant un geste irréversible n'a jamais rassuré personne.
    const nomEnfant = (c: any) => `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "sans nom";
    const apercu = {
      keep: { id: keepId, name: keep.parentName, email: keep.parentEmail },
      merge: { id: mergeId, name: merge.parentName, email: merge.parentEmail },
      enfantsConserves: (keep.children || []).map(nomEnfant),
      enfantsDeplaces: childrenToAdd.map(nomEnfant),
      enfantsAjoutes: childrenToAdd.length,
      // Cavaliers reconnus IDENTIQUES (même prénom + date de naissance) :
      // non dupliqués, leurs inscriptions sont repointées vers « vers ».
      enfantsFusionnes: [...childMap.entries()].map(([id, k]) => {
        const src = (merge.children || []).find((c: any) => c.id === id);
        return { de: nomEnfant(src || {}), vers: nomEnfant(k) };
      }),
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
      // Paires d'ids appariés (absorbé -> conservé) : indispensable pour
      // comprendre, après coup, où sont passées les références d'un cavalier.
      enfantsApparies: [...childMap.entries()].map(([de, k]) => ({ de, vers: k.id })),
      mergedBy: (auth as any)?.email || "admin", mergedAt: new Date(),
    });

    return NextResponse.json({ ok: true, apercu });
  } catch (e: any) {
    console.error("doublons-merge:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
