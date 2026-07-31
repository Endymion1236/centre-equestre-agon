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

/**
 * Créneaux d'envoi, heure de Paris.
 *
 * On raisonne en HEURE ENTIÈRE, pas à la minute près : Vercel ne garantit le
 * déclenchement qu'à l'heure près (un cron de 11h30 peut partir jusqu'à
 * 12h30). Une fenêtre de ±20 min aurait silencieusement sauté l'envoi en cas
 * de retard. On accepte donc l'heure du créneau ET la suivante.
 *
 * Un double déclenchement est sans conséquence : la file est vidée après
 * chaque envoi, donc la seconde exécution ne trouve rien et n'envoie rien.
 */
const CRENEAUX = [
  { heures: [13, 14], label: "13h30" },
  { heures: [18, 19], label: "18h" },
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
  const creneau = CRENEAUX.find((c) => c.heures.includes(h));
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

    // ── 3. Destinataires, avec filtrage par rôle ────────────────────
    // Règle : un ADMIN reçoit le récapitulatif global ; une MONITRICE ne
    // reçoit que les changements qui touchent SES cours, et seulement pour
    // aujourd'hui ou demain (J/J+1). Un changement sur un créneau d'octobre
    // ne justifie pas une notification en août — c'était la source du bruit.
    const cleNom = (nom: string) => String(nom || "")
      .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[-'\s]+/g, " ").trim();

    const fmtParis = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
    const aujourdhui = fmtParis(new Date());
    const demain = fmtParis(new Date(Date.now() + 86400000));
    const estImminent = (dateISO: string) => dateISO === aujourdhui || dateISO === demain;

    // Fiches moniteurs : email → nom, pour rattacher un compte à ses cours.
    const emailVersNom = new Map<string, string>();
    try {
      const monSnap = await adminDb.collection("moniteurs").get();
      for (const doc of monSnap.docs) {
        const d = doc.data() as any;
        if (d.email && d.name) emailVersNom.set(String(d.email).toLowerCase(), String(d.name));
      }
    } catch {}

    const tokenSnap = await adminDb.collection("push_tokens").get();
    type Dest = { token: string; isAdmin: boolean; nomMoniteur: string | null };
    const resolus = await Promise.all(
      tokenSnap.docs.map(async (doc): Promise<Dest | null> => {
        // Personne ne reçoit le récapitulatif de ses PROPRES modifications :
        // on n'exclut donc que si l'agent est le seul auteur de la période.
        if (auteurs.size === 1 && auteurs.has(doc.id)) return null;
        const token = String(doc.data().token || "").trim();
        if (!token) return null;
        try {
          const user = await adminAuth.getUser(doc.id);
          const claims = user.customClaims || {};
          const email = (user.email || "").toLowerCase();
          const isAdmin = claims.admin === true || ADMIN_EMAILS.has(user.email || "");
          const isMoniteur = claims.moniteur === true;
          if (!isAdmin && !isMoniteur) return null;
          return { token, isAdmin, nomMoniteur: emailVersNom.get(email) || null };
        } catch {
          return null;
        }
      })
    );
    const destinataires = resolus.filter((d): d is Dest => Boolean(d));

    // ── 4. Envoi : global pour les admins, filtré pour chaque monitrice ──
    let result = { sent: 0, failed: 0 };
    const url = derniereDate
      ? `/admin/planning?date=${encodeURIComponent(derniereDate)}`
      : "/admin/planning";

    const tokensAdmins = [...new Set(destinataires.filter(d => d.isAdmin).map(d => d.token))];
    if (tokensAdmins.length > 0) {
      const r = await sendPushBatch(tokensAdmins, "📅 Planning mis à jour", corps, url);
      result.sent += r.sent; result.failed += r.failed;
    }

    for (const dest of destinataires.filter(d => !d.isAdmin)) {
      if (!dest.nomMoniteur) continue; // pas de fiche : impossible de cibler, on s'abstient
      const siens = items.filter((it: any) =>
        cleNom(it.monitor) === cleNom(dest.nomMoniteur!) && estImminent(String(it.date || "")));
      if (siens.length === 0) continue; // rien qui la concerne → aucune notification

      const corpsPerso = siens.length === 1 && siens[0].body
        ? String(siens[0].body)
        : `${siens.length} changement${siens.length > 1 ? "s" : ""} sur tes cours d'aujourd'hui ou demain`;
      const r = await sendPushBatch([dest.token], "📅 Ton planning a changé", corpsPerso, url);
      result.sent += r.sent; result.failed += r.failed;
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
      `[push-digest] ${creneau?.label || "forcé"} — ${items.length} changement(s) regroupé(s), ${result.sent} envoi(s), ${destinataires.length} destinataire(s)`
    );

    return NextResponse.json({
      creneau: creneau?.label || "forcé",
      changements: items.length,
      destinataires: destinataires.length,
      ...result,
      corps,
    });
  } catch (error: any) {
    console.error("[push-digest]", error?.message || error);
    return NextResponse.json({ error: "Digest impossible" }, { status: 500 });
  }
}
