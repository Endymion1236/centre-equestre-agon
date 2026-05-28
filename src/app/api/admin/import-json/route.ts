/**
 * POST /api/admin/import-json
 *
 * Importe un backup JSON (genere par /api/admin/backup-json sur la prod)
 * dans la base ACTIVE. Destine a peupler la base de TEST avec un instantane
 * des donnees metier de prod, pour tester de facon realiste.
 *
 * ⚠️ Cette route ne doit exister QUE sur la branche test. Garde-fou
 * supplementaire : elle REFUSE de s'executer si la base active est la prod
 * (gestion-2026), pour ne jamais ecraser la prod avec un import.
 *
 * Filtrage : seules les collections "metier durables" sont importees :
 *   - families   (clients + enfants + pedagogie)
 *   - equides    (cavalerie)
 *   - activities (activites)
 *   - settings   (parametres + contenu site vitrine/miniferme/actus)
 *   - creneaux   (planning) -- avec inscriptions VIDEES (enrolled: [])
 *
 * Tout le transactionnel (paiements, encaissements, remises, SEPA, avoirs,
 * devis...) est IGNORE meme s'il est present dans le fichier.
 *
 * Body : le contenu du fichier backup, soit { _meta, data: {...} } soit
 *        directement { families: [...], equides: [...], ... }
 *
 * Reponse : { ok, imported: { collection: count }, skipped: [...] }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getActiveProjectId, isProdEnvironment } from "@/lib/reset-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Collections autorisees a l'import (metier durable uniquement)
const ALLOWED_COLLECTIONS = ["families", "equides", "activities", "settings", "creneaux"];

export async function POST(req: NextRequest) {
  // ─── 1. Auth admin ───
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!decoded.admin && !["ceagon@orange.fr", "ceagon50@gmail.com", "emmelinelagy@gmail.com"].includes(decoded.email || "")) {
      return NextResponse.json({ error: "Admin requis" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }

  // ─── 2. Garde-fou anti-prod ───
  // Cette route ecrit en masse. Si la base active est la prod, on refuse.
  if (isProdEnvironment()) {
    return NextResponse.json({
      error: "Import interdit sur la PRODUCTION.",
      details: `Base active : "${getActiveProjectId()}". Cette route ne peut peupler qu'une base de test. Utilise-la depuis l'URL de preview de la branche test.`,
    }, { status: 403 });
  }

  try {
    // ─── 3. Parser le body ───
    const raw = await req.json();
    // Le backup peut etre { _meta, data: {...} } ou directement {...}
    const data: Record<string, any[]> = raw?.data && typeof raw.data === "object" ? raw.data : raw;

    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Format de fichier invalide" }, { status: 400 });
    }

    const imported: Record<string, number> = {};
    const skipped: string[] = [];

    // ─── 4. Importer collection par collection ───
    for (const coll of Object.keys(data)) {
      if (!ALLOWED_COLLECTIONS.includes(coll)) {
        skipped.push(coll);
        continue;
      }
      const docs = Array.isArray(data[coll]) ? data[coll] : [];
      if (docs.length === 0) { imported[coll] = 0; continue; }

      // Ecriture par batches de 400 (limite Firestore : 500 ops/batch)
      let count = 0;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = adminDb.batch();
        for (const docData of docs.slice(i, i + 400)) {
          const { id, ...fields } = docData;
          if (!id) continue;

          // Cas special creneaux : on vide les inscriptions pour repartir
          // propre cote inscriptions (tu testeras les inscriptions a neuf).
          if (coll === "creneaux") {
            fields.enrolled = [];
            fields.enrolledCount = 0;
            // On marque comme planifie (au cas ou la prod avait des creneaux
            // clotures -> on les rouvre dans l'env de test)
            if (fields.status === "closed") fields.status = "planned";
          }

          batch.set(adminDb.collection(coll).doc(String(id)), fields);
          count++;
        }
        await batch.commit();
      }
      imported[coll] = count;
    }

    return NextResponse.json({
      ok: true,
      projectId: getActiveProjectId(),
      imported,
      skipped,
      message: `Import terminé sur ${getActiveProjectId()}. ${Object.values(imported).reduce((s, n) => s + n, 0)} documents importés.`,
    });
  } catch (e: any) {
    console.error("[import-json] erreur:", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
