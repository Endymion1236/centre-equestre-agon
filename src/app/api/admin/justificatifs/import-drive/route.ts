/**
 * Import des justificatifs depuis un dossier Google Drive.
 *
 * GET  → le dossier mémorisé et l'état de la connexion Google.
 * POST { dossier } → importe les fichiers PDF/JPEG/PNG du dossier qui ne
 *   sont pas encore connus (identifiant Drive ou contenu identique), par
 *   lots qui tiennent dans le délai d'une fonction ; renvoie ce qu'il reste,
 *   le navigateur rappelle jusqu'à zéro. Le fichier Drive n'est ni déplacé ni
 *   modifié : Storage reste la référence, Drive la source.
 *
 * Réutilise l'accès Google de l'assistant boîte mail (droit drive.readonly).
 * Un compte connecté avant l'ajout de ce droit doit être reconnecté.
 *
 * ── Pourquoi les erreurs sont détaillées ici ──────────────────────────────
 *
 * La route répondait « Import Drive impossible pour le moment » à toute
 * panne. Or la cause la plus fréquente n'est pas passagère : le jeton de
 * rafraîchissement Google a expiré ou été révoqué, et il faut reconnecter le
 * compte. Sans le dire, l'écran invite à réessayer indéfiniment. La route est
 * réservée à l'administration : elle peut donc nommer la cause et l'action.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { driveFolderId, driveGetFile, driveListFolder, gmailAccount, gmailIsConnected } from "@/lib/gmail";
import { diagnosticImportDrive } from "@/lib/diagnostic-import-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIMES: Record<string, string> = { "application/pdf": "application/pdf", "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/png": "image/png" };
const LOT = 25;
/** On rend la main avant que la fonction ne soit coupée : mieux vaut un lot
 *  plus court et un rapport exact qu'une coupure sans message. */
const BUDGET_MS = 45_000;
const TAILLE_MAX = 10 * 1024 * 1024;
const reglages = () => adminDb.collection("settings").doc("justificatifs");

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const [snap, connecte, compte] = await Promise.all([
      reglages().get(),
      gmailIsConnected().catch(() => false),
      // L'adresse connectée est LA information qui manquait : le Drive
      // personnel du gérant et le compte de l'assistant peuvent être deux
      // comptes Google différents, et le second ne voit pas les dossiers du
      // premier tant qu'ils ne lui sont pas partagés.
      gmailAccount().then(a => a.email).catch(() => null),
    ]);
    return NextResponse.json({ dossier: snap.exists ? snap.data()?.driveFolderId || "" : "", dossierNom: snap.exists ? snap.data()?.driveFolderNom || "" : "", googleConnecte: connecte, compteGoogle: compte });
  } catch (e) {
    // Sans ce filet, un incident Firestore renvoyait un 500 sans corps :
    // l'écran affichait « erreur » sans jamais dire laquelle.
    const message = e instanceof Error ? e.message : String(e);
    console.error("[justificatifs/import-drive] GET", message);
    return NextResponse.json({ error: `Réglages de l'import Drive illisibles : ${message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const debut = Date.now();
  let etape = "lecture de la demande";
  try {
    const body = await req.json().catch(() => ({}));
    const folderId = driveFolderId(String(body.dossier || ""));
    if (!folderId) return NextResponse.json({ error: "Collez le lien du dossier Drive (…/folders/…) ou son identifiant." }, { status: 400 });

    etape = "lecture du dossier Drive";
    const fichiers = (await driveListFolder(folderId)).filter(f => MIMES[f.mimeType]);

    etape = "lecture des pièces déjà importées";
    const connus = await adminDb.collection("justificatifs").limit(2001).get();
    const dejaDrive = new Set(connus.docs.map(d => d.data().driveFileId).filter(Boolean));
    const aFaire = fichiers.filter(f => !dejaDrive.has(f.id));
    await reglages().set({ driveFolderId: folderId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const importes: string[] = [], doublons: string[] = [], ignores: string[] = [];
    let traites = 0;
    for (const f of aFaire.slice(0, LOT)) {
      // Rendre la main avant la coupure plutôt que de perdre le rapport.
      if (Date.now() - debut > BUDGET_MS) break;
      traites++;
      if (f.size > TAILLE_MAX) { ignores.push(`${f.name} : plus de 10 Mo`); continue; }
      try {
        etape = `import de « ${f.name} »`;
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
        const message = e instanceof Error ? e.message : "lecture impossible";
        // Une panne d'accès Google touche tous les fichiers : inutile de la
        // répéter vingt-cinq fois, on remonte et on explique une seule fois.
        const diag = diagnosticImportDrive(message);
        if (diag && diag.statut === 409) throw e;
        ignores.push(`${f.name} : ${diag?.erreur || message}`);
      }
    }
    return NextResponse.json({
      ok: true, total: fichiers.length, importes, doublons, ignores,
      restants: Math.max(0, aFaire.length - traites),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import impossible";
    const diag = diagnosticImportDrive(message);
    if (diag) {
      // Dossier introuvable ou refusé : dire AVEC QUEL COMPTE on a cherché.
      const compte = diag.statut === 404 || diag.statut === 409
        ? await gmailAccount().then(a => a.email).catch(() => null)
        : null;
      const precision = compte && (diag.statut === 404 || /refusé l'accès à ce dossier/.test(diag.erreur))
        ? ` Le compte connecté est ${compte} : partagez le dossier avec cette adresse, ou déplacez-le dans son Drive.`
        : "";
      return NextResponse.json({ error: diag.erreur + precision }, { status: diag.statut });
    }
    console.error("[justificatifs/import-drive]", message);
    // Message réel plutôt que « impossible pour le moment » : sans lui,
    // la panne n'est diagnosticable que dans les journaux Vercel.
    return NextResponse.json({
      error: `Import Drive interrompu — ${etape} : ${message}. Les pièces déjà importées sont conservées ; relancez pour reprendre où ça s'est arrêté.`,
    }, { status: 500 });
  }
}
