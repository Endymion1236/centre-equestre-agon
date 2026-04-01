import { NextRequest, NextResponse } from "next/server";
import { adminStorage, adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

// Images autorisées avec leur chemin Firebase Storage
const ALLOWED_KEYS = [
  "hero-plage",
  "hero-equestre",
  "hero-laserbay",
  "equipe-nicolas",
  "equipe-emmeline",
  "galerie-balades",
  "galerie-stages",
  "galerie-competitions",
  "galerie-miniferme",
  "galerie-club",
  "activite-baby",
  "activite-bronze",
  "activite-argent",
  "activite-or",
  "activite-galop34",
  "activite-balade-soleil",
  "activite-balade-jour",
  "activite-balade-privee",
  "activite-randonnee-jeunes",
  "activite-cours-loisir",
  "activite-cours-compet",
  "activite-cso",
  "activite-ponygames",
  "activite-equifun",
  "activite-anniversaire",
  "activite-ponyride",
] as const;

type ImageKey = typeof ALLOWED_KEYS[number];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const key = formData.get("key") as string | null;
    const adminEmail = formData.get("adminEmail") as string | null;

    if (!file || !key) {
      return NextResponse.json({ error: "file et key requis" }, { status: 400 });
    }

    // Vérifier que la clé est autorisée
    if (!ALLOWED_KEYS.includes(key as ImageKey)) {
      return NextResponse.json({ error: "Clé image non autorisée" }, { status: 400 });
    }

    // Vérifier que c'est bien un admin (double check côté serveur)
    const ADMIN_EMAILS = ["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"];
    if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // Vérifier le type de fichier
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Format non supporté. JPG, PNG ou WEBP uniquement." }, { status: 400 });
    }

    // Taille max 8 MB
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop lourd (max 8 MB)" }, { status: 400 });
    }

    // Upload vers Firebase Storage
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `vitrine/${key}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        cacheControl: "public, max-age=3600, must-revalidate",
      },
    });

    // Rendre le fichier public
    await fileRef.makePublic();

    // URL publique
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // Sauvegarder l'URL dans Firestore (settings/vitrineImages)
    await adminDb.doc("settings/vitrineImages").set(
      {
        [key]: publicUrl,
        [`${key}_updatedAt`]: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, url: publicUrl, key });
  } catch (error: any) {
    console.error("[upload-vitrine]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET : récupère toutes les URLs des images vitrine
export async function GET() {
  try {
    const snap = await adminDb.doc("settings/vitrineImages").get();
    const data = snap.exists ? snap.data() : {};
    return NextResponse.json({ ok: true, images: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
