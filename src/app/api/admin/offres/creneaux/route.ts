import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

// ═══════════════════════════════════════════════════════════════════
// GET /api/admin/offres/creneaux  (admin uniquement)
//
// Liste des offres POSSIBLES : créneaux à venir avec au moins une place,
// stages regroupés en SEMAINES (même clé que l'assistant boîte :
// stageGroupId + lundi), autres activités à l'unité.
// Fenêtre : aujourd'hui → +6 semaines.
// ═══════════════════════════════════════════════════════════════════

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
function jourFr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return isNaN(d.getTime()) ? "" : JOURS[d.getUTCDay()];
}
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + 42 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const snap = await adminDb
      .collection("creneaux")
      .where("date", ">=", today)
      .where("date", "<=", horizon)
      .get();

    const isStage = (t: string) => t === "stage" || t === "stage_journee";
    const rows: any[] = [];
    snap.forEach((d) => {
      const c = d.data() as any;
      const maxP = typeof c.maxPlaces === "number" ? c.maxPlaces : Infinity;
      const places = Math.max(0, (Number.isFinite(maxP) ? maxP : 0) - (Array.isArray(c.enrolled) ? c.enrolled.length : 0));
      rows.push({
        creneauId: d.id,
        titre: c.activityTitle || "",
        type: c.activityType || "cours",
        date: c.date,
        horaire: [c.startTime, c.endTime].filter(Boolean).join("-"),
        places,
        stageKey: (c.stageGroupId || c.activityId || "") + "",
      });
    });

    // Stages → groupes semaine ; autres → unitaires. On garde les offres
    // avec AU MOINS une place.
    const groups = new Map<string, any[]>();
    const items: any[] = [];
    rows.forEach((r) => {
      if (isStage(r.type)) {
        const key = `${r.stageKey}_${mondayOf(r.date)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
      } else if (r.places > 0) {
        items.push({
          id: r.creneauId,
          creneauIds: [r.creneauId],
          titre: r.titre,
          type: r.type,
          label: `${r.titre} — ${jourFr(r.date)} ${r.date}${r.horaire ? ` · ${r.horaire}` : ""} · ${r.places} pl.`,
          date: r.date,
          places: r.places,
        });
      }
    });
    groups.forEach((jours, key) => {
      jours.sort((a, b) => (a.date < b.date ? -1 : 1));
      const places = Math.min(...jours.map((j) => j.places));
      if (places <= 0) return;
      const first = jours[0];
      const last = jours[jours.length - 1];
      items.push({
        id: key,
        creneauIds: jours.map((j) => j.creneauId),
        titre: first.titre,
        type: first.type,
        label: `${first.titre} — du ${jourFr(first.date)} ${first.date} au ${jourFr(last.date)} ${last.date}${first.horaire ? ` · ${first.horaire}` : ""} · ${places} pl. (semaine ${jours.length}j)`,
        date: first.date,
        places,
      });
    });
    items.sort((a, b) => (a.date < b.date ? -1 : 1));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error("[offres/creneaux]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
