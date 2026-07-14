import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/inbox-create-family  (admin uniquement)
//
// Étape 4 de l'assistant boîte : créer une NOUVELLE famille à partir de la
// fiche pré-remplie par l'IA et RELUE/CORRIGÉE par l'admin dans /admin/boite.
// La création n'est jamais automatique : elle exige le clic de l'admin.
//
// Sûreté :
//   - Doublon : si une famille existe déjà avec cet email → 409 avec le
//     familyId existant (l'UI bascule dessus, on ne crée pas de doublon).
//   - Structure identique à CreateFamilyModal (accountType particulier,
//     children avec id généré, galopLevel par défaut "—").
//   - AUCUN email envoyé (pas de bienvenue automatique — contrôle explicite).
//
// Body    : { parentEmail, parentName?, lastName?, firstName?, parentPhone?,
//             flechage?: "cavalier_annee"|"stage"|"passage",
//             children: [{ firstName, lastName?, birthDate? (YYYY-MM-DD), galopLevel? }] }
// Réponse : { ok, familyId, familyName, children: [{ id, firstName }] }
//           ou 409 { error, status: "exists", familyId }
// ═══════════════════════════════════════════════════════════════════

const FLECHAGES = new Set(["cavalier_annee", "stage", "passage"]);

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const parentEmail = (body?.parentEmail || "").trim().toLowerCase();
    const parentNameRaw = (body?.parentName || "").trim();
    const lastName = (body?.lastName || "").trim().toUpperCase();
    const firstName = (body?.firstName || "").trim();
    const parentPhone = (body?.parentPhone || "").trim();
    const flechage = FLECHAGES.has(body?.flechage) ? body.flechage : "stage";
    const childrenIn: any[] = Array.isArray(body?.children) ? body.children : [];

    if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      return NextResponse.json({ error: "Email parent invalide.", status: "badRequest" }, { status: 400 });
    }
    const computedName =
      lastName && firstName ? `${lastName} ${firstName}` : lastName || firstName || parentNameRaw;
    if (!computedName) {
      return NextResponse.json({ error: "Nom du parent requis.", status: "badRequest" }, { status: 400 });
    }
    const children = childrenIn
      .filter((c) => (c?.firstName || "").trim())
      .slice(0, 8)
      .map((c) => ({
        id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        firstName: String(c.firstName).trim(),
        lastName: String(c.lastName || "").trim(),
        birthDate:
          typeof c.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.birthDate)
            ? new Date(c.birthDate + "T12:00:00Z")
            : null,
        galopLevel: String(c.galopLevel || "").trim() || "—",
        sanitaryForm: null,
      }));
    if (children.length === 0) {
      return NextResponse.json({ error: "Au moins un enfant (prénom) requis.", status: "badRequest" }, { status: 400 });
    }

    // ── Anti-doublon : une famille existe déjà avec cet email ? ──
    const dupSnap = await adminDb.collection("families").where("parentEmail", "==", parentEmail).limit(1).get();
    if (!dupSnap.empty) {
      const d = dupSnap.docs[0];
      return NextResponse.json(
        {
          error: "Une famille existe déjà avec cet email.",
          status: "exists",
          familyId: d.id,
          familyName: (d.data() as any).parentName || "",
        },
        { status: 409 }
      );
    }

    const ref = await adminDb.collection("families").add({
      civilite: null,
      parentName: computedName,
      lastName: lastName || null,
      firstName: firstName || null,
      parentEmail,
      parentPhone,
      parentPhone2: "",
      address: "",
      zipCode: "",
      city: "",
      accountType: "particulier",
      tags: [flechage],
      authProvider: "admin",
      authUid: "",
      children,
      source: "boite-ia",
      createdBy: auth.email || auth.uid || "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      familyId: ref.id,
      familyName: computedName,
      children: children.map((c) => ({ id: c.id, firstName: c.firstName })),
    });
  } catch (e: any) {
    console.error("[inbox-create-family]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
