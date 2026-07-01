import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // export complet : on laisse de la marge

const RETENTION_JOURS = 30;

/**
 * CRON — Sauvegarde quotidienne complète de Firestore.
 *
 * Fréquence : tous les jours (≈ minuit Paris, voir vercel.json).
 * - Exporte TOUTES les collections (listées automatiquement) en un seul JSON.
 * - Écrit le fichier dans Firebase Storage : backups/AAAA-MM-JJ.json
 * - Purge les sauvegardes de plus de 30 jours (rétention glissante).
 * - Le LUNDI (ou avec ?email=1), envoie une copie off-site par email (Resend).
 *
 * Déclenchable à la main pour test : GET avec l'en-tête
 *   Authorization: Bearer <CRON_SECRET>   (ajoute ?email=1 pour forcer l'email)
 */

/** Convertit récursivement les Timestamps Firestore en ISO pour un JSON lisible et réimportable. */
function sanitize(v: any): any {
  if (v === null || typeof v !== "object") return v;
  if (typeof v.toDate === "function") {
    try { return v.toDate().toISOString(); } catch { return null; }
  }
  if (typeof v._seconds === "number" && typeof v._nanoseconds === "number") {
    return new Date(v._seconds * 1000 + Math.floor(v._nanoseconds / 1e6)).toISOString();
  }
  if (Array.isArray(v)) return v.map(sanitize);
  const out: Record<string, any> = {};
  for (const k of Object.keys(v)) out[k] = sanitize(v[k]);
  return out;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dateParis = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now); // AAAA-MM-JJ

  try {
    // ── 1. Export de toutes les collections racine ──────────────────────────
    const collections = await adminDb.listCollections();
    const data: Record<string, any[]> = {};
    let totalDocs = 0;
    for (const col of collections) {
      const snap = await col.get();
      data[col.id] = snap.docs.map((d) => sanitize({ id: d.id, ...d.data() }));
      totalDocs += snap.size;
    }

    const payload = {
      _meta: {
        generatedAt: now.toISOString(),
        date: dateParis,
        project: process.env.GCLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
        collections: Object.keys(data).length,
        totalDocs,
      },
      ...data,
    };
    const json = JSON.stringify(payload);
    const sizeKo = Math.round(json.length / 1024);
    const filePath = `backups/${dateParis}.json`;

    // ── 2. Écriture dans Firebase Storage ───────────────────────────────────
    const bucket = adminStorage.bucket();
    await bucket.file(filePath).save(json, {
      contentType: "application/json",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0" },
    });

    // ── 3. Purge des sauvegardes de plus de 30 jours ────────────────────────
    let purged = 0;
    try {
      const [files] = await bucket.getFiles({ prefix: "backups/" });
      const limite = new Date(now);
      limite.setDate(limite.getDate() - RETENTION_JOURS);
      for (const f of files) {
        const m = f.name.match(/backups\/(\d{4}-\d{2}-\d{2})\.json$/);
        if (m && new Date(m[1] + "T12:00:00Z") < limite) {
          await f.delete().catch(() => {});
          purged++;
        }
      }
    } catch (e) {
      console.error("[backup] purge KO", e);
    }

    // ── 4. Copie off-site hebdomadaire (lundi) ──────────────────────────────
    let emailed = false;
    const jour = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(now);
    const forceEmail = req.nextUrl.searchParams.get("email") === "1";
    if ((jour === "Mon" || forceEmail) && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const from = process.env.RESEND_FROM_EMAIL || "noreply@ce-agon.fr";
        const to = process.env.RESEND_BCC || "ceagon50@gmail.com";
        await resend.emails.send({
          from,
          to,
          subject: `Sauvegarde hebdomadaire — ${dateParis} (${totalDocs} docs)`,
          html: `<p>Sauvegarde complète de la base du <strong>${dateParis}</strong>.</p>
<p>${Object.keys(data).length} collections · ${totalDocs} documents · ${sizeKo} Ko.</p>
<p>Le fichier est également conservé dans Firebase Storage sous <code>${filePath}</code> (30 derniers jours).</p>
<p style="color:#888;font-size:12px">Copie de sécurité automatique — à conserver hors-ligne.</p>`,
          attachments: [{ filename: `sauvegarde-${dateParis}.json`, content: Buffer.from(json).toString("base64") }],
        });
        emailed = true;
      } catch (e) {
        console.error("[backup] email KO", e);
      }
    }

    return NextResponse.json({
      ok: true,
      date: dateParis,
      collections: Object.keys(data).length,
      totalDocs,
      sizeKo,
      file: filePath,
      purged,
      emailed,
    });
  } catch (e: any) {
    console.error("[backup] échec", e);
    return NextResponse.json({ ok: false, error: e?.message || "Échec de la sauvegarde" }, { status: 500 });
  }
}
