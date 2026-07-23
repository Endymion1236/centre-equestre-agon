/**
 * GET /api/cron/push-digest — récapitulatif des notifications push.
 *
 * Les modifications du planning ne déclenchent plus de notification
 * instantanée (cf. /api/planning/notify-staff, qui les empile dans
 * `push_queue`). Ce cron les regroupe et envoie UN SEUL push par créneau
 * horaire, à 13h30 et 18h heure de Paris.
 *
 * ── Pourquoi une garde sur l'heure de Paris ? ──────────────────────────
 * Les crons Vercel s'exécutent en UTC. Paris est UTC+2 en été, UTC+1 en
 * hiver : une heure UTC fixe dériverait d'une heure entre les saisons.
 * On planifie donc les DEUX heures UTC possibles (11h30/12h30 et 16h/17h)
 * et on sort immédiatement si l'heure de Paris ne correspond pas au
 * créneau attendu. Contrôle explicite plutôt que dérive silencieuse.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { sendPushBatch } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAILS = new Set([
  "ceagon@orange.fr",
  "ceagon50@gmail.com",
  "emmelinelagy@gmail.com",
]);

/** Créneaux d'envoi autorisés, heure de Paris. */
const CRENEAUX = [
  { h: 13, m: 30, label: "13h30" },
  { h: 18, m: 0, label: "18h" },
];

/** Heure et minute courantes à Paris (le serveur Vercel tourne en UTC). */
function heureParis(): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { h: get("hour"), m: get("minute") };
}

export async function GET(request: NextRequest) {
  // Auth cron : même convention que les autres crons du projet.
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { h, m } = heureParis();
  // Tolérance de 20 min : le déclenchement Vercel n'est pas à la seconde.
  const creneau = CRENEAUX.find((c) => c.h === h && Math.abs(c.m - m) <= 20);
  if (!creneau && !force) {
    return NextResponse.json({
      skipped: true,
      reason: `Hors créneau (Paris ${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}) — envois à 13h30 et 18h`,
    });
  }

  try {
    // ── 1. Changements en attente ───────────────────────────────────
    const snap = await adminDb
      .collection("push_queue")
      .where("sentAt", "==", null)
      .limit(500)
      .get();

    if (snap.empty) {
      return NextResponse.json({ sent: 0, pending: 0, creneau: creneau?.label || "forcé" });
    }

    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // ── 2. Agrégation par type d'action ─────────────────────────────
    const compte = { created: 0, updated: 0, deleted: 0, duplicated: 0 };
    const auteurs = new Set<string>();
    let derniereDate = "";
    for (const it of items) {
      const n = Math.max(1, Number(it.count) || 1);
      if (it.action in compte) compte[it.action as keyof typeof compte] += n;
      if (it.authorUid) auteurs.add(it.authorUid);
      if (it.date && it.date > derniereDate) derniereDate = it.date;
    }

    const morceaux: string[] = [];
    const ajouts = compte.created + compte.duplicated;
    if (ajouts > 0) morceaux.push(`${ajouts} créneau${ajouts > 1 ? "x" : ""} ajouté${ajouts > 1 ? "s" : ""}`);
    if (compte.updated > 0) morceaux.push(`${compte.updated} modifié${compte.updated > 1 ? "s" : ""}`);
    if (compte.deleted > 0) morceaux.push(`${compte.deleted} supprimé${compte.deleted > 1 ? "s" : ""}`);

    // Un seul changement : on garde le détail d'origine, plus parlant
    // qu'un compteur ("Modification : Stage galop 3 · mar. 4 août · 10:00").
    const corps = items.length === 1 && items[0].body
      ? String(items[0].body)
      : morceaux.join(" · ") || "Le planning a été mis à jour.";

    // ── 3. Destinataires (résolus maintenant, pas à la mise en file) ──
    const tokenSnap = await adminDb.collection("push_tokens").get();
    const resolus = await Promise.all(
      tokenSnap.docs.map(async (doc) => {
        // Personne ne reçoit le récapitulatif de ses PROPRES modifications :
        // on n'exclut donc que si l'agent est le seul auteur de la période.
        if (auteurs.size === 1 && auteurs.has(doc.id)) return null;
        const token = String(doc.data().token || "").trim();
        if (!token) return null;
        try {
          const user = await adminAuth.getUser(doc.id);
          const claims = user.customClaims || {};
          const isStaff =
            claims.admin === true ||
            claims.moniteur === true ||
            ADMIN_EMAILS.has(user.email || "");
          return isStaff ? token : null;
        } catch {
          return null;
        }
      })
    );
    const tokens = [...new Set(resolus.filter((t): t is string => Boolean(t)))];

    // ── 4. Envoi + purge de la file ─────────────────────────────────
    let result = { sent: 0, failed: 0 };
    if (tokens.length > 0) {
      const url = derniereDate
        ? `/admin/planning?date=${encodeURIComponent(derniereDate)}`
        : "/admin/planning";
      result = await sendPushBatch(tokens, "📅 Planning mis à jour", corps, url);
    }

    // La file est vidée même sans destinataire : sinon les changements
    // s'accumuleraient indéfiniment et le récap du soir répéterait ceux
    // du midi.
    const now = new Date();
    const batch = adminDb.batch();
    for (const it of items) {
      batch.update(adminDb.collection("push_queue").doc(it.id), { sentAt: now });
    }
    await batch.commit();

    console.log(
      `[push-digest] ${creneau?.label || "forcé"} — ${items.length} changement(s) regroupé(s), ${result.sent} envoi(s), ${tokens.length} destinataire(s)`
    );

    return NextResponse.json({
      creneau: creneau?.label || "forcé",
      changements: items.length,
      destinataires: tokens.length,
      ...result,
      corps,
    });
  } catch (error: any) {
    console.error("[push-digest]", error?.message || error);
    return NextResponse.json({ error: "Digest impossible" }, { status: 500 });
  }
}
