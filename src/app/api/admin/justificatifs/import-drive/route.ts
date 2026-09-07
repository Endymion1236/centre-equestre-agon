/**
 * Import des justificatifs depuis un dossier Google Drive.
 *
 * GET  → le dossier mémorisé et l'état de la connexion Google.
 * POST { dossier } → importe les fichiers PDF/JPEG/PNG du dossier qui ne
 *   sont pas encore connus (identifiant Drive ou contenu identique), par
 *   lots de 25 pour tenir dans le délai d'une fonction ; renvoie ce qu'il
 *   reste, le navigateur rappelle jusqu'à zéro. Le fichier Drive n'est ni
 *   déplacé ni modifié : Storage reste la référence, Drive la source.
 *
 * Réutilise l'accès Google de l'assistant boîte mail (droit drive.readonly).
 * Un compte connecté avant l'ajout de ce droit doit être reconnecté.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { driveFolderId, driveGetFile, driveListFolder, gmailIsConnected } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIMES: Record<string, string> = { "application/pdf": "application/pdf", "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/png": "image/png" };
const LOT = 25;
const TAILLE_MAX = 10 * 1024 * 1024;
const reglages = () => adminDb.collection("settings").doc("justificatifs");

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const [snap, connecte] = await Promise.all([reglages().get(), gmailIsConnected().catch(() => false)]);
  return NextResponse.json({ dossier: snap.exists ? snap.data()?.driveFolderId || "" : "", dossierNom: snap.exists ? snap.data()?.driveFolderNom || "" : "", googleConnecte: connecte });
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const folderId = driveFolderId(String(body.dossier || ""));
    if (!folderId) return NextResponse.json({ error: "Collez le lien du dossier Drive (…/folders/…) ou son identifiant." }, { status: 400 });

    const fichiers = (await driveListFolder(folderId)).filter(f => MIMES[f.mimeType]);
    const connus = await adminDb.collection("justificatifs").limit(2001).get();
    const dejaDrive = new Set(connus.docs.map(d => d.data().driveFileId).filter(Boolean));
    const aFaire = fichiers.filter(f => !dejaDrive.has(f.id));
    await reglages().set({ driveFolderId: folderId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const importes: string[] = [], doublons: string[] = [], ignores: string[] = [];
    for (const f of aFaire.slice(0, LOT)) {
      if (f.size > TAILLE_MAX) { ignores.push(`${f.name} : plus de 10 Mo`); continue; }
      try {
        const { buffer, mimeType } = await driveGetFile(f.id);
        const mime = MIMES[mimeType] || MIMES[f.mimeType];
        const id = createHash("sha256").update(buffer).digest("hex");
        const ref = adminDb.collection("justificatifs").doc(id);
        const existant = await ref.get();
        if (existant.exists) {
          // Même contenu déjà déposé (à la main ou depuis un autre dossier) : on note l'origine Drive, sans doublon.
          await ref.set({ driveFileId: f.id, driveNom: f.name }, { merge: true });
          doublons.push(f.name); continue;
        }
        await adminStorage.bucket().file(`justificatifs-prives/${id}`).save(buffer, { resumable: false, contentType: mime, metadata: { cacheControl: "private, no-store" } });
        await ref.create({ nom: f.name.slice(0, 180), mime, taille: buffer.length, createdAt: FieldValue.serverTimestamp(), createdBy: auth.uid,
          source: "drive", driveFileId: f.id, driveNom: f.name, driveModifiedTime: f.modifiedTime || null });
        importes.push(id);
      } catch (e) {
        if (e instanceof Error && e.message === "DRIVE_SCOPE_MANQUANT") throw e;
        ignores.push(`${f.name} : ${e instanceof Error ? e.message : "lecture impossible"}`);
      }
    }
    return NextResponse.json({ ok: true, total: fichiers.length, importes, doublons, ignores, restants: Math.max(0, aFaire.length - LOT) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import impossible";
    if (msg === "DRIVE_SCOPE_MANQUANT" || /Gmail non connecté/.test(msg)) {
      return NextResponse.json({ error: "Accès Drive non accordé : dans Assistant boîte mail, reconnectez le compte Google (le droit de lecture Drive est demandé à la reconnexion), puis relancez l'import." }, { status: 409 });
    }
    console.error("[justificatifs/import-drive]", msg);
    return NextResponse.json({ error: msg.startsWith("Dossier Drive") ? msg : "Import Drive impossible pour le moment. Les pièces déjà importées sont conservées." }, { status: 500 });
  }
}
