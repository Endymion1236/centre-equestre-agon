/**
 * Analyse des réinscriptions — admin.
 * GET /api/admin/reinscriptions?saison=N
 *   N = année de début de la saison de référence (déf. saison en cours).
 *   Compare les forfaits de la saison N à ceux de N+1.
 *
 * Catégorise les cavaliers de la saison N qui n'ont pas (encore) de forfait actif
 * en N+1 :
 *   - "pas_encore"  : avant la rentrée (21/09 de N+1) — normal
 *   - "a_risque"    : on a atteint/dépassé la rentrée
 *   - "parti"       : forfait annulé en cours de saison N (cancelled), pas d'actif
 *
 * Enrichit chaque cavalier : contact, moniteur(s) de la saison, galop, ancienneté,
 * avoirs € non utilisés, points fidélité. (L'avis annuel viendra avec le
 * questionnaire de fin de saison.)
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const ENROLLED = new Set(["active", "actif", "completed"]);
const parisDate = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function handle(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const saisonParam = Number(req.nextUrl.searchParams.get("saison"));
    const moisParis = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", month: "numeric" }).format(now));
    const anneeParis = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" }).format(now));
    const N = Number.isFinite(saisonParam) && saisonParam > 2000 ? saisonParam : (moisParis >= 9 ? anneeParis : anneeParis - 1);
    const rentree = `${N + 1}-09-21`;
    const today = parisDate(now);
    const apresRentree = today >= rentree;

    // ── Forfaits : par enfant, saisons inscrites + statut en N et N+1 ────────
    type Info = {
      childId: string; childName: string; familyId: string; familyName: string;
      seasonsEnrolled: Set<number>; activeN: boolean; cancelledN: boolean; activeN1: boolean;
    };
    const byChild = new Map<string, Info>();
    const forfaitsSnap = await adminDb.collection("forfaits").get();
    forfaitsSnap.forEach(d => {
      const f = d.data() as any;
      const cid = f.childId; if (!cid) return;
      const s = Number(f.seasonStartYear); const st = String(f.status || "");
      if (!byChild.has(cid)) byChild.set(cid, { childId: cid, childName: f.childName || "", familyId: f.familyId || "", familyName: f.familyName || "", seasonsEnrolled: new Set(), activeN: false, cancelledN: false, activeN1: false });
      const info = byChild.get(cid)!;
      if (!info.childName) info.childName = f.childName || "";
      if (!info.familyId) info.familyId = f.familyId || "";
      if (!info.familyName) info.familyName = f.familyName || "";
      if (ENROLLED.has(st)) info.seasonsEnrolled.add(s);
      if (s === N) { if (ENROLLED.has(st)) info.activeN = true; if (st === "cancelled") info.cancelledN = true; }
      if (s === N + 1 && ENROLLED.has(st)) info.activeN1 = true;
    });

    // ── Familles : contact + galop par enfant ───────────────────────────────
    const famContact = new Map<string, { email: string; phone: string }>();
    const childGalop = new Map<string, string>();
    const famSnap = await adminDb.collection("families").get();
    famSnap.forEach(d => {
      const fam = d.data() as any;
      famContact.set(d.id, { email: fam.email || "", phone: fam.phone || fam.tel || "" });
      for (const ch of (fam.children || [])) childGalop.set(ch.id, ch.galopLevel || ch.niveau || "");
    });

    // ── Avoirs € disponibles par famille (statut actif) ─────────────────────
    const avoirByFam = new Map<string, number>();
    try {
      const avSnap = await adminDb.collection("avoirs").where("status", "==", "actif").get();
      avSnap.forEach(d => {
        const a = d.data() as any;
        const solde = (a.montant || 0) - (a.usedAmount || 0);
        if (a.familyId && solde > 0) avoirByFam.set(a.familyId, (avoirByFam.get(a.familyId) || 0) + solde);
      });
    } catch { /* collection/règle absente : on ignore */ }

    // ── Points fidélité par famille ─────────────────────────────────────────
    const fidByFam = new Map<string, number>();
    try {
      const fSnap = await adminDb.collection("fidelite").get();
      fSnap.forEach(d => {
        const fd = d.data() as any;
        if (fd.familyId) fidByFam.set(fd.familyId, (fd.points || 0) - (fd.pointsUtilises || 0));
      });
    } catch { /* ignore */ }

    // ── Moniteur(s) de la saison N : créneaux 'cours' où l'enfant est inscrit ─
    const monByChild = new Map<string, Set<string>>();
    const seasonStart = `${N}-09-01`, seasonEnd = `${N + 1}-06-30`;
    const crSnap = await adminDb.collection("creneaux").where("date", ">=", seasonStart).where("date", "<=", seasonEnd).get();
    crSnap.forEach(d => {
      const c = d.data() as any;
      if (c.activityType !== "cours") return;
      const mon = c.monitor || "";
      for (const e of (c.enrolled || [])) {
        if (!e?.childId) continue;
        if (!monByChild.has(e.childId)) monByChild.set(e.childId, new Set());
        if (mon) monByChild.get(e.childId)!.add(mon);
      }
    });

    const enrich = (info: Info, statut: string) => ({
      childId: info.childId,
      childName: info.childName,
      familyId: info.familyId,
      familyName: info.familyName,
      statut,
      email: famContact.get(info.familyId)?.email || "",
      phone: famContact.get(info.familyId)?.phone || "",
      moniteurs: [...(monByChild.get(info.childId) || [])],
      galop: childGalop.get(info.childId) || "",
      anciennete: info.seasonsEnrolled.size,
      avoirEur: Math.round((avoirByFam.get(info.familyId) || 0) * 100) / 100,
      fidelite: fidByFam.get(info.familyId) || 0,
    });

    let totalN = 0, reinscrits = 0;
    const nonReinscrits: any[] = [];
    const partis: any[] = [];
    for (const info of byChild.values()) {
      if (info.activeN) { totalN++; if (info.activeN1) { reinscrits++; continue; } }
      if (info.activeN && !info.activeN1) {
        nonReinscrits.push(enrich(info, apresRentree ? "a_risque" : "pas_encore"));
      } else if (!info.activeN && info.cancelledN && !info.activeN1) {
        partis.push(enrich(info, "parti"));
      }
    }
    nonReinscrits.sort((a, b) => (a.moniteurs[0] || "zzz").localeCompare(b.moniteurs[0] || "zzz") || a.childName.localeCompare(b.childName));
    partis.sort((a, b) => a.childName.localeCompare(b.childName));

    return NextResponse.json({
      saison: N, prochaine: N + 1, rentree, today, apresRentree,
      totalN, reinscrits, nonReinscritsCount: nonReinscrits.length, partisCount: partis.length,
      retentionPct: totalN ? Math.round((reinscrits / totalN) * 100) : null,
      nonReinscrits, partis,
    });
  } catch (e: any) {
    console.error("reinscriptions:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
