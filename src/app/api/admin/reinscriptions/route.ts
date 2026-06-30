/**
 * Analyse des réinscriptions — admin.
 * GET /api/admin/reinscriptions?saison=N
 *
 * Source de vérité = la présence réelle dans les créneaux `cours` (le planning),
 * pas les forfaits (qui peuvent être vides). Un cavalier "de la saison N" = inscrit
 * (enrolled) dans au moins un cours daté dans la saison N (1/9/N → 30/6/N+1).
 *   - réinscrit   : présent aussi dans un cours de la saison N+1 (ou forfait actif N+1)
 *   - non réinscrit: présent en N, absent en N+1
 *       · "pas_encore" avant la rentrée (21/09 de N+1)
 *       · "a_risque"   après la rentrée
 *   - "parti"      : forfait annulé en cours de saison N (cancelled)
 *
 * Enrichit: moniteur(s) de la saison, galop, ancienneté (forfaits), contact,
 * avoirs € non utilisés, points fidélité.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const ENROLLED = new Set(["active", "actif", "completed"]);
const parisDate = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

type ChildMeta = { childName: string; familyId: string; familyName: string };

async function coursDeSaison(start: string, end: string) {
  const snap = await adminDb.collection("creneaux").where("date", ">=", start).where("date", "<=", end).get();
  const enrolled = new Map<string, ChildMeta>();
  const monByChild = new Map<string, Set<string>>();
  let nbCreneaux = 0, nbCours = 0;
  snap.forEach(d => {
    nbCreneaux++;
    const c = d.data() as any;
    if (c.activityType !== "cours") return;
    nbCours++;
    const mon = c.monitor || "";
    for (const e of (c.enrolled || [])) {
      if (!e?.childId) continue;
      if (!enrolled.has(e.childId)) enrolled.set(e.childId, { childName: e.childName || "", familyId: e.familyId || "", familyName: e.familyName || "" });
      if (mon) { if (!monByChild.has(e.childId)) monByChild.set(e.childId, new Set()); monByChild.get(e.childId)!.add(mon); }
    }
  });
  return { enrolled, monByChild, nbCreneaux, nbCours };
}

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

    // Présence réelle dans les cours, saison N et N+1
    const sN = await coursDeSaison(`${N}-09-01`, `${N + 1}-06-30`);
    const sN1 = await coursDeSaison(`${N + 1}-09-01`, `${N + 2}-06-30`);
    const enrolledN1 = new Set(sN1.enrolled.keys());

    // Forfaits : ancienneté (saisons non annulées) + forfait actif N+1 + annulés N
    const forfaitSeasons = new Map<string, Set<number>>();
    const forfaitActiveN1 = new Set<string>();
    const cancelledN = new Map<string, ChildMeta>();
    let nbForfaits = 0;
    try {
      const fSnap = await adminDb.collection("forfaits").get();
      fSnap.forEach(d => {
        nbForfaits++;
        const f = d.data() as any;
        const cid = f.childId; if (!cid) return;
        const s = Number(f.seasonStartYear); const st = String(f.status || "");
        if (ENROLLED.has(st)) { if (!forfaitSeasons.has(cid)) forfaitSeasons.set(cid, new Set()); forfaitSeasons.get(cid)!.add(s); }
        if (s === N + 1 && ENROLLED.has(st)) forfaitActiveN1.add(cid);
        if (s === N && st === "cancelled") cancelledN.set(cid, { childName: f.childName || "", familyId: f.familyId || "", familyName: f.familyName || "" });
      });
    } catch { /* pas de forfaits : on continue */ }

    // Familles : contact + galop
    const famContact = new Map<string, { email: string; phone: string }>();
    const childGalop = new Map<string, string>();
    const famSnap = await adminDb.collection("families").get();
    famSnap.forEach(d => {
      const fam = d.data() as any;
      famContact.set(d.id, { email: fam.email || "", phone: fam.phone || fam.tel || "" });
      for (const ch of (fam.children || [])) childGalop.set(ch.id, ch.galopLevel || ch.niveau || "");
    });

    // Avoirs € actifs par famille
    const avoirByFam = new Map<string, number>();
    try {
      const avSnap = await adminDb.collection("avoirs").where("status", "==", "actif").get();
      avSnap.forEach(d => { const a = d.data() as any; const solde = (a.montant || 0) - (a.usedAmount || 0); if (a.familyId && solde > 0) avoirByFam.set(a.familyId, (avoirByFam.get(a.familyId) || 0) + solde); });
    } catch { /* ignore */ }

    // Points fidélité par famille
    const fidByFam = new Map<string, number>();
    try {
      const fSnap = await adminDb.collection("fidelite").get();
      fSnap.forEach(d => { const fd = d.data() as any; if (fd.familyId) fidByFam.set(fd.familyId, (fd.points || 0) - (fd.pointsUtilises || 0)); });
    } catch { /* ignore */ }

    // Avis annuel (questionnaire de fin de saison N) par enfant — pour le ciblage
    const avisByChild = new Map<string, { note: number; commentaire: string; recommande?: boolean }>();
    try {
      const aSnap = await adminDb.collection("avis-satisfaction").where("source", "==", "annee").get();
      aSnap.forEach(d => {
        const a = d.data() as any;
        if (Number(a.saison) !== N || !a.childId) return;
        const prev = avisByChild.get(a.childId);
        const at = a.createdAt?.toMillis?.() || 0;
        if (!prev || at >= ((prev as any)._at || 0)) {
          avisByChild.set(a.childId, { note: a.globalNote || 0, commentaire: (a.commentaire || "").trim(), recommande: a.recommande, _at: at } as any);
        }
      });
    } catch { /* ignore */ }

    const enrich = (childId: string, meta: ChildMeta, statut: string) => ({
      childId,
      childName: meta.childName,
      familyName: meta.familyName,
      statut,
      email: famContact.get(meta.familyId)?.email || "",
      phone: famContact.get(meta.familyId)?.phone || "",
      moniteurs: [...(sN.monByChild.get(childId) || [])],
      galop: childGalop.get(childId) || "",
      anciennete: forfaitSeasons.get(childId)?.size || 0,
      avoirEur: Math.round((avoirByFam.get(meta.familyId) || 0) * 100) / 100,
      fidelite: fidByFam.get(meta.familyId) || 0,
      avisAnnuel: avisByChild.get(childId) ? { note: avisByChild.get(childId)!.note, commentaire: avisByChild.get(childId)!.commentaire, recommande: avisByChild.get(childId)!.recommande } : null,
    });

    let totalN = 0, reinscrits = 0;
    const nonReinscrits: any[] = [];
    for (const [childId, meta] of sN.enrolled) {
      totalN++;
      if (enrolledN1.has(childId) || forfaitActiveN1.has(childId)) { reinscrits++; continue; }
      nonReinscrits.push(enrich(childId, meta, apresRentree ? "a_risque" : "pas_encore"));
    }

    // Partis en cours : forfait annulé en N, et pas présents (ni N ni N+1)
    const partis: any[] = [];
    for (const [childId, meta] of cancelledN) {
      if (sN.enrolled.has(childId) || enrolledN1.has(childId)) continue;
      partis.push(enrich(childId, meta, "parti"));
    }

    nonReinscrits.sort((a, b) => (a.moniteurs[0] || "zzz").localeCompare(b.moniteurs[0] || "zzz") || (a.childName || "").localeCompare(b.childName || ""));
    partis.sort((a, b) => (a.childName || "").localeCompare(b.childName || ""));

    return NextResponse.json({
      saison: N, prochaine: N + 1, rentree, today, apresRentree,
      totalN, reinscrits, nonReinscritsCount: nonReinscrits.length, partisCount: partis.length,
      retentionPct: totalN ? Math.round((reinscrits / totalN) * 100) : null,
      nonReinscrits, partis,
      diag: {
        creneauxSaisonN: sN.nbCreneaux, coursSaisonN: sN.nbCours, inscritsCoursN: sN.enrolled.size,
        creneauxSaisonN1: sN1.nbCreneaux, coursSaisonN1: sN1.nbCours, inscritsCoursN1: sN1.enrolled.size,
        nbForfaits,
      },
    });
  } catch (e: any) {
    console.error("reinscriptions:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
