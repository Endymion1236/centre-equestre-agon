import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import snapshot from "@/data/familles-prod-snapshot.json";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/copy-prod-to-test
 *
 * Recopie le snapshot des familles PROD (exporté en lecture seule) dans la
 * base TEST, pour tester l'import juillet/août en conditions réelles.
 *
 * SÉCURITÉ :
 *   - verifyAuth adminOnly.
 *   - GARDE-FOU : refuse de s'exécuter si la base n'est PAS test.
 *   - DRY-RUN par défaut (?apply=true pour écrire).
 *   - Idempotent : skip une famille si un de ses enfants (prénom+nom) existe
 *     déjà en base test (évite de recopier plusieurs fois).
 *   - Marqueur importSource="prod-snapshot" pour retrouver/nettoyer.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  if (!projectId.includes("test")) {
    return NextResponse.json({
      error: "Refusé : copie autorisée uniquement vers la base TEST.",
      projectId,
    }, { status: 403 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const familles = (snapshot as any).familles as any[];

  const norm = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  const nameKey = (first: string, last: string) => `${norm(first)}|${norm(last)}`;

  // Index des enfants déjà en base test (par prénom+nom).
  const existingSnap = await adminDb.collection("families").get();
  const existingChildren = new Set<string>();
  existingSnap.forEach(d => {
    for (const c of (d.data().children || [])) {
      existingChildren.add(nameKey(c.firstName || "", c.lastName || ""));
    }
  });

  const parseBirth = (s: string | null): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const rapport = {
    projectId,
    mode: apply ? "APPLY (écriture réelle)" : "DRY-RUN (aucune écriture)",
    total_snapshot: familles.length,
    a_copier: 0,
    skip_existant: 0,
    enfants_copies: 0,
  };

  for (const fam of familles) {
    const childKeys = (fam.children || []).map((c: any) => nameKey(c.firstName, c.lastName));
    if (childKeys.some((k: string) => existingChildren.has(k))) {
      rapport.skip_existant++;
      continue;
    }

    const children = (fam.children || []).map((c: any) => ({
      id: c.id || `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      birthDate: parseBirth(c.birthDate),
      galopLevel: c.galopLevel || "—",
      sanitaryForm: c.sanitaryForm ?? null,
    }));

    const doc: any = {
      civilite: fam.civilite ?? null,
      parentName: fam.parentName ?? null,
      lastName: fam.lastName ?? null,
      firstName: fam.firstName ?? null,
      parentEmail: fam.parentEmail || "",
      parentPhone: fam.parentPhone || "",
      address: fam.address || "",
      zipCode: fam.zipCode || "",
      city: fam.city || "",
      accountType: fam.accountType || "particulier",
      // On NE recopie PAS authUid : pas de compte connectable en test.
      authProvider: "admin",
      authUid: "",
      children,
      importSource: "prod-snapshot",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    rapport.a_copier++;
    rapport.enfants_copies += children.length;

    if (apply) {
      await adminDb.collection("families").add(doc);
      for (const k of childKeys) existingChildren.add(k);
    }
  }

  return NextResponse.json(rapport);
}
