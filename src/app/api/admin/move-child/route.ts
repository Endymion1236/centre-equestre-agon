import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/move-child
// Déplace un enfant d'une famille (source) vers une autre (cible) en
// CONSERVANT le même childId — pour ne jamais casser le lien avec les
// factures/paiements historisés.
//
// Ce qui est réaffecté (opérationnel) :
//   - families.children : retiré de la source, ajouté à la cible (même objet)
//   - reservations (childId + familyId source) → familyId/familyName cible
//   - creneaux.enrolled[] (childId + familyId source) → familyId/familyName cible
//   - families.linkedChildren pointant la source comme origine → cible
//
// Ce qui n'est JAMAIS touché (NF525 — encaissements immuables) :
//   - payments / encaissements / factures / avoirs
//   On se contente de COMPTER les paiements qui référencent l'enfant sous
//   l'ancienne famille et de le remonter, pour que l'admin traite une
//   éventuelle correction comptable séparément (avoir / refacturation).
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const { childId, fromFamilyId, toFamilyId } = await req.json();

    if (!childId || !fromFamilyId || !toFamilyId) {
      return NextResponse.json({ error: "childId, fromFamilyId et toFamilyId requis" }, { status: 400 });
    }
    if (fromFamilyId === toFamilyId) {
      return NextResponse.json({ error: "Famille source et cible identiques" }, { status: 400 });
    }

    const [fromSnap, toSnap] = await Promise.all([
      adminDb.collection("families").doc(fromFamilyId).get(),
      adminDb.collection("families").doc(toFamilyId).get(),
    ]);
    if (!fromSnap.exists) return NextResponse.json({ error: "Famille source introuvable" }, { status: 404 });
    if (!toSnap.exists) return NextResponse.json({ error: "Famille cible introuvable" }, { status: 404 });

    const fromData = fromSnap.data() as any;
    const toData = toSnap.data() as any;
    const fromChildren: any[] = fromData.children || [];
    const toChildren: any[] = toData.children || [];

    const child = fromChildren.find((c: any) => c.id === childId);
    if (!child) {
      return NextResponse.json({ error: "Enfant introuvable dans la famille source" }, { status: 404 });
    }
    if (toChildren.some((c: any) => c.id === childId)) {
      return NextResponse.json({ error: "Enfant déjà présent dans la famille cible" }, { status: 409 });
    }

    const fromName = fromData.parentName || "";
    const toName = toData.parentName || "";

    // ── 1. Déplacement de l'objet enfant (même id) ────────────────────
    const newFromChildren = fromChildren.filter((c: any) => c.id !== childId);
    const newToChildren = [...toChildren, child];

    // ── 2. Réservations de l'enfant sous l'ancienne famille ───────────
    const resSnap = await adminDb.collection("reservations").where("childId", "==", childId).get();
    const resToUpdate = resSnap.docs.filter((d) => (d.data() as any).familyId === fromFamilyId);

    // ── 3. Créneaux où l'enfant est inscrit sous l'ancienne famille ───
    const creSnap = await adminDb.collection("creneaux").get();
    const creToUpdate: { id: string; newEnrolled: any[] }[] = [];
    creSnap.forEach((d) => {
      const enrolled: any[] = (d.data() as any).enrolled || [];
      const concerned = enrolled.some((e) => e.childId === childId && e.familyId === fromFamilyId);
      if (concerned) {
        const newEnrolled = enrolled.map((e) =>
          e.childId === childId && e.familyId === fromFamilyId
            ? { ...e, familyId: toFamilyId, familyName: toName }
            : e
        );
        creToUpdate.push({ id: d.id, newEnrolled });
      }
    });

    // ── 4. linkedChildren pointant la source comme origine ────────────
    const famSnap = await adminDb.collection("families").get();
    const linkToUpdate: { id: string; newLinked: any[] }[] = [];
    famSnap.forEach((d) => {
      const lc: any[] = (d.data() as any).linkedChildren || [];
      const concerned = lc.some((l) => l.childId === childId && l.sourceFamilyId === fromFamilyId);
      if (concerned) {
        const newLinked = lc.map((l) =>
          l.childId === childId && l.sourceFamilyId === fromFamilyId
            ? { ...l, sourceFamilyId: toFamilyId, sourceFamilyName: toName }
            : l
        );
        linkToUpdate.push({ id: d.id, newLinked });
      }
    });

    // ── 5. Paiements référençant l'enfant sous l'ancienne famille ─────
    //      NON MODIFIÉS (NF525) — simplement comptés pour information.
    const paySnap = await adminDb.collection("payments").where("familyId", "==", fromFamilyId).get();
    const paymentsUntouched = paySnap.docs.filter((d) =>
      ((d.data() as any).items || []).some((it: any) => it.childId === childId)
    ).length;

    // ── Écriture (batches, dédup par document) ────────────────────────
    // On fusionne les writes par document pour éviter d'écraser un champ
    // quand la même famille est concernée par plusieurs modifications
    // (ex : famille cible qui a aussi un linkedChildren à corriger).
    const writeMap = new Map<string, { col: string; id: string; data: any }>();
    const addWrite = (col: string, id: string, data: any) => {
      const key = `${col}:${id}`;
      const existing = writeMap.get(key);
      if (existing) Object.assign(existing.data, data);
      else writeMap.set(key, { col, id, data: { ...data } });
    };

    addWrite("families", fromFamilyId, { children: newFromChildren, updatedAt: FieldValue.serverTimestamp() });
    addWrite("families", toFamilyId, { children: newToChildren, updatedAt: FieldValue.serverTimestamp() });
    for (const r of resToUpdate) addWrite("reservations", r.id, { familyId: toFamilyId, familyName: toName });
    for (const c of creToUpdate) addWrite("creneaux", c.id, { enrolled: c.newEnrolled });
    for (const l of linkToUpdate) addWrite("families", l.id, { linkedChildren: l.newLinked });

    const writes = Array.from(writeMap.values());
    for (let i = 0; i < writes.length; i += 400) {
      const batch = adminDb.batch();
      for (const w of writes.slice(i, i + 400)) {
        batch.update(adminDb.collection(w.col).doc(w.id), w.data);
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      childName: child.firstName || child.childName || "",
      fromName,
      toName,
      movedReservations: resToUpdate.length,
      movedEnrollments: creToUpdate.length,
      updatedLinks: linkToUpdate.length,
      paymentsUntouched,
    });
  } catch (e: any) {
    console.error("[move-child]", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
