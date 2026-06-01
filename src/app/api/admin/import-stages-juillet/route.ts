import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import famillesData from "@/data/familles-juillet-2026.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/import-stages-juillet
 *
 * Importe les familles + enfants des stages de juillet 2026 (issus de Celeris),
 * SANS inscription aux stages ni paiement (fiches seulement).
 *
 * SÉCURITÉ (plusieurs garde-fous) :
 *   - verifyAuth adminOnly : réservé aux admins connectés.
 *   - GARDE-FOU BASE TEST : refuse de s'exécuter si le projet Firebase n'est
 *     PAS gestion-2026-test. Même déployée en prod, cette route ne peut donc
 *     rien écrire dans la vraie base.
 *   - DRY-RUN par défaut : sans ?apply=true, ne fait qu'un rapport (aucune
 *     écriture). Il faut ?apply=true pour écrire réellement.
 *   - SKIP DOUBLONS : une famille dont le parentEmail existe déjà en base
 *     n'est PAS recréée.
 *
 * Structure d'une famille créée (identique à CreateFamilyModal) :
 *   parentName, lastName, firstName, parentEmail, parentPhone, address,
 *   zipCode, city, accountType:"particulier", civilite:null,
 *   authProvider:"admin", authUid:"", children:[...], createdAt, updatedAt.
 */
export async function POST(req: NextRequest) {
  // 1. Auth admin
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  // 2. GARDE-FOU : base test uniquement
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  if (!projectId.includes("test")) {
    return NextResponse.json({
      error: "Import refusé : cette route ne s'exécute que sur la base TEST (gestion-2026-test).",
      projectId,
    }, { status: 403 });
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const familles = famillesData as Array<{
    email: string; parentName: string; responsable: string;
    tel: string; cp: string; ville: string; sans_email: boolean;
    enfants: Array<{ firstName: string; lastName: string; birthDate: string }>;
  }>;

  // 3. Récupérer les emails déjà présents (pour skip des doublons)
  const existingSnap = await adminDb.collection("families").get();
  const existingEmails = new Set<string>();
  existingSnap.forEach(d => {
    const e = (d.data().parentEmail || "").trim().toLowerCase();
    if (e) existingEmails.add(e);
  });

  const rapport = {
    projectId,
    mode: apply ? "APPLY (écriture réelle)" : "DRY-RUN (aucune écriture)",
    total_familles_fichier: familles.length,
    a_creer: 0,
    skip_email_existant: 0,
    sans_email_crees: 0,
    enfants_crees: 0,
    details_crees: [] as string[],
    details_skip: [] as string[],
  };

  const parseBirth = (s: string): Date | null => {
    // Format Celeris "AAAA-MM-JJ". Rejette les dates nulles "0000-00-00".
    if (!s || s.startsWith("0000")) return null;
    const d = new Date(s + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  };

  for (const fam of familles) {
    const email = (fam.email || "").trim().toLowerCase();
    // Skip si email déjà présent en base
    if (email && existingEmails.has(email)) {
      rapport.skip_email_existant++;
      rapport.details_skip.push(`${fam.parentName} (${email}) — déjà en base`);
      continue;
    }

    const children = fam.enfants.map(e => ({
      id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      firstName: e.firstName,
      lastName: e.lastName,
      birthDate: parseBirth(e.birthDate),
      galopLevel: "—",
      sanitaryForm: null,
    }));

    const lastName = (fam.parentName || "").toUpperCase();
    const familyDoc: any = {
      civilite: null,
      parentName: fam.parentName,
      lastName: lastName || null,
      firstName: null,
      parentEmail: fam.email || "",
      parentPhone: fam.tel || "",
      address: "",
      zipCode: fam.cp || "",
      city: fam.ville || "",
      accountType: "particulier",
      authProvider: "admin",
      authUid: "",
      children,
      // Marqueur d'import pour pouvoir retrouver/nettoyer ces fiches facilement.
      importSource: "celeris-juillet-2026",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    rapport.a_creer++;
    rapport.enfants_crees += children.length;
    if (fam.sans_email) rapport.sans_email_crees++;
    rapport.details_crees.push(`${fam.parentName} — ${children.map(c => c.firstName).join(", ")}${fam.sans_email ? " (sans email)" : ` (${fam.email})`}`);

    if (apply) {
      await adminDb.collection("families").add(familyDoc);
      // On ajoute l'email à l'index pour éviter un doublon dans le même run.
      if (email) existingEmails.add(email);
    }
  }

  return NextResponse.json(rapport);
}
