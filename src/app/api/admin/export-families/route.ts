import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/export-families
 *
 * Exporte toutes les familles de la base courante en JSON (LECTURE SEULE).
 * Sert à récupérer les familles de PROD pour les recopier dans la base test
 * et tester l'import dans des conditions réelles.
 *
 * SÉCURITÉ :
 *   - verifyAuth adminOnly : réservé aux admins connectés.
 *   - AUCUNE écriture : cette route ne fait que lire. Sans danger pour la prod.
 *
 * Les dates (Timestamp Firestore) sont sérialisées en ISO pour rester lisibles
 * et réimportables. On exporte les champs utiles à la recréation d'une fiche,
 * en conservant les enfants.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";

  const serializeDate = (v: any): string | null => {
    if (!v) return null;
    try {
      if (typeof v === "string") return v;
      if (typeof v.toDate === "function") return v.toDate().toISOString();
      if (v._seconds != null) return new Date(v._seconds * 1000).toISOString();
      if (v instanceof Date) return v.toISOString();
    } catch { /* ignore */ }
    return null;
  };

  const snap = await adminDb.collection("families").get();
  const familles: any[] = [];
  snap.forEach(d => {
    const data = d.data();
    familles.push({
      id: d.id,
      parentName: data.parentName ?? null,
      lastName: data.lastName ?? null,
      firstName: data.firstName ?? null,
      civilite: data.civilite ?? null,
      parentEmail: data.parentEmail ?? "",
      parentPhone: data.parentPhone ?? "",
      address: data.address ?? "",
      zipCode: data.zipCode ?? "",
      city: data.city ?? "",
      accountType: data.accountType ?? "particulier",
      authProvider: data.authProvider ?? "admin",
      authUid: data.authUid ?? "",
      children: (data.children || []).map((c: any) => ({
        id: c.id ?? null,
        firstName: c.firstName ?? "",
        lastName: c.lastName ?? "",
        birthDate: serializeDate(c.birthDate),
        galopLevel: c.galopLevel ?? "—",
        sanitaryForm: c.sanitaryForm ?? null,
      })),
    });
  });

  return NextResponse.json({
    projectId,
    count: familles.length,
    familles,
  });
}
