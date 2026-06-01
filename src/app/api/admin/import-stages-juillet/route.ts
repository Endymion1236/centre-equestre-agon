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

  // 3. Indexer les ENFANTS déjà présents en base, pour détecter les doublons
  //    sans dépendre de l'email (les familles existantes ont été créées sans
  //    email pendant les tests). Clé = prénom+nom normalisés + date de naissance.
  const norm = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
  // Extrait AAAA-MM-JJ quel que soit le format stocké (Date, Timestamp Firestore, string).
  const birthKey = (v: any): string => {
    if (!v) return "";
    try {
      if (typeof v === "string") return v.slice(0, 10);
      if (typeof v.toDate === "function") return v.toDate().toISOString().slice(0, 10); // Timestamp Firestore
      if (v._seconds != null) return new Date(v._seconds * 1000).toISOString().slice(0, 10);
      if (v instanceof Date) return v.toISOString().slice(0, 10);
    } catch { /* ignore */ }
    return "";
  };
  const childKey = (first: string, last: string, birth: string) =>
    `${norm(first)}|${norm(last)}|${birth}`;

  const existingSnap = await adminDb.collection("families").get();
  const existingChildren = new Set<string>();
  existingSnap.forEach(d => {
    const children = d.data().children || [];
    for (const c of children) {
      existingChildren.add(childKey(c.firstName || "", c.lastName || "", birthKey(c.birthDate)));
    }
  });

  const rapport = {
    projectId,
    mode: apply ? "APPLY (écriture réelle)" : "DRY-RUN (aucune écriture)",
    total_familles_fichier: familles.length,
    a_creer: 0,
    skip_enfant_existant: 0,
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
    // Calculer les clés enfant de cette famille (fichier).
    const famChildKeys = fam.enfants.map(e =>
      childKey(e.firstName, e.lastName, (e.birthDate || "").slice(0, 10))
    );
    // Skip TOUTE la famille si AU MOINS UN de ses enfants existe déjà en base.
    const dejaPresent = famChildKeys.find(k => existingChildren.has(k));
    if (dejaPresent) {
      rapport.skip_enfant_existant++;
      rapport.details_skip.push(`${fam.parentName} — ${fam.enfants.map(e => e.firstName).join(", ")} (enfant déjà en base)`);
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
      // Ajouter les enfants créés à l'index pour éviter un doublon dans le même run.
      for (const k of famChildKeys) existingChildren.add(k);
    }
  }

  return NextResponse.json(rapport);
}
