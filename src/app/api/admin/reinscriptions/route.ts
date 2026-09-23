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
import { messageErreur } from "@/lib/message-erreur";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const ENROLLED = new Set(["active", "actif", "completed"]);
const parisDate = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

type ChildMeta = { childName: string; familyId: string; familyName: string };
/** Créneau qui porte la pré-inscription : une pré-inscription annuelle n'est
 *  posée que sur UN créneau (celui cliqué), c'est lui qu'on montre pour
 *  permettre de vérifier la liste nom par nom. */
type PreinscritMeta = ChildMeta & { creneauDate: string; creneauTitre: string; creneauHeure: string };

async function coursDeSaison(start: string, end: string) {
  const snap = await adminDb.collection("creneaux").where("date", ">=", start).where("date", "<=", end).get();
  const enrolled = new Map<string, ChildMeta>();
  // Pre-inscrits : places retenues sans inscription definitive. Les compter
  // comme reinscrits gonflerait le taux de retention avec des dossiers qui
  // ne sont ni payes ni confirmes.
  const preinscrits = new Map<string, PreinscritMeta>();
  // Places tenues (`pending`) : posées par une famille depuis son espace, en
  // attente d'encaissement. Pas définitives non plus, mais purgées d'elles-
  // mêmes si rien n'est réglé — on les distingue pour le diagnostic.
  // Une place tenue n'est pas une inscription : elle ne compte pas dans
  // `enrolled`, sinon une famille qui a commencé un paiement en ligne sans
  // aller au bout passait « réinscrite ».
  const placesTenues = new Map<string, PreinscritMeta>();
  // Séances définitives par cavalier (dates), pour dire POURQUOI un cavalier
  // est compté réinscrit : un forfait, ou seulement quelques séances isolées.
  const seances = new Map<string, string[]>();
  // Places de cours par cavalier : un « cours » = même activité, même jour
  // de semaine, même heure. Un cavalier inscrit à l'année sur le mercredi
  // 14h compte 1 place (pas 35 séances) ; s'il est aussi au samedi 10h, 2.
  const slotsFermes = new Map<string, Set<string>>();
  const slotsPreinscrits = new Map<string, Set<string>>();
  const slotsTenus = new Map<string, Set<string>>();
  const ajouterSlot = (m: Map<string, Set<string>>, childId: string, c: any) => {
    const dow = c.date ? new Date(`${c.date}T12:00:00Z`).getUTCDay() : -1;
    const cle = `${dow}|${c.startTime || ""}|${c.activityTitle || ""}`;
    if (!m.has(childId)) m.set(childId, new Set());
    m.get(childId)!.add(cle);
  };
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
      const meta = { childName: e.childName || "", familyId: e.familyId || "", familyName: e.familyName || "" };
      const porteur = { ...meta, creneauDate: c.date || "", creneauTitre: c.activityTitle || "", creneauHeure: c.startTime || "" };
      if (e.preinscription) {
        if (!preinscrits.has(e.childId)) preinscrits.set(e.childId, porteur);
        ajouterSlot(slotsPreinscrits, e.childId, c);
      } else if (e.pending) {
        if (!placesTenues.has(e.childId)) placesTenues.set(e.childId, porteur);
        ajouterSlot(slotsTenus, e.childId, c);
      } else {
        if (!enrolled.has(e.childId)) enrolled.set(e.childId, meta);
        ajouterSlot(slotsFermes, e.childId, c);
        if (!seances.has(e.childId)) seances.set(e.childId, []);
        seances.get(e.childId)!.push(`${c.date || ""}|${c.activityTitle || ""}|${c.startTime || ""}`);
      }
      if (mon) { if (!monByChild.has(e.childId)) monByChild.set(e.childId, new Set()); monByChild.get(e.childId)!.add(mon); }
    }
  });
  for (const l of seances.values()) l.sort();
  const total = (m: Map<string, Set<string>>) => [...m.values()].reduce((n, set) => n + set.size, 0);
  const places = { fermes: total(slotsFermes), preinscrites: total(slotsPreinscrits), tenues: total(slotsTenus) };
  return { enrolled, preinscrits, placesTenues, seances, slotsFermes, slotsPreinscrits, slotsTenus, places, monByChild, nbCreneaux, nbCours };
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
    const forfaitActiveN1 = new Map<string, { id: string; titre: string; statut: string; source: string }>();
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
        if (s === N + 1 && ENROLLED.has(st) && !forfaitActiveN1.has(cid)) {
          forfaitActiveN1.set(cid, { id: d.id, titre: f.slotKey || f.activityTitle || "", statut: st, source: f.source || "admin" });
        }
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

    const enrich = (childId: string, meta: ChildMeta, statut: string, extra: Record<string, unknown> = {}) => ({
      ...extra,
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

    // Pourquoi ce cavalier est compté réinscrit : forfait actif N+1 et/ou
    // séances définitives dans des cours de N+1. Une séance isolée (cours
    // d'essai, séance à l'unité) suffit à le compter — c'est volontaire, mais
    // il faut pouvoir le voir, sinon « 3 réinscrits » alors qu'aucun forfait
    // n'a été signé ressemble à une erreur.
    const raisonReinscrit = (childId: string) => {
      const f = forfaitActiveN1.get(childId);
      const dates = (sN1.seances.get(childId) || []).map(x => x.split("|"));
      return {
        forfait: f ? { id: f.id, titre: f.titre, statut: f.statut, source: f.source } : null,
        nbSeances: dates.length,
        premieresSeances: dates.slice(0, 3).map(([date, titre, heure]) => ({ date, titre, heure })),
      };
    };

    let totalN = 0, reinscrits = 0;
    const nonReinscrits: any[] = [];
    const preinscritsListe: any[] = [];
    const reinscritsListe: any[] = [];
    for (const [childId, meta] of sN.enrolled) {
      totalN++;
      if (enrolledN1.has(childId) || forfaitActiveN1.has(childId)) {
        reinscrits++;
        reinscritsListe.push(enrich(childId, meta, "reinscrit", raisonReinscrit(childId)));
        continue;
      }
      // Entre les deux : la place est retenue, mais rien n'est acquis. Relance
      // assuree par l'ecran Pre-inscrits, pas par celui-ci — pas de doublon.
      if (sN1.preinscrits.has(childId)) {
        const p = sN1.preinscrits.get(childId)!;
        preinscritsListe.push(enrich(childId, meta, "preinscrit", { via: "preinscription", creneau: { date: p.creneauDate, titre: p.creneauTitre, heure: p.creneauHeure } }));
        continue;
      }
      // Place tenue en ligne (réservation famille, paiement pas encore
      // confirmé) : retenue mais pas acquise, même logique.
      if (sN1.placesTenues.has(childId)) {
        const p = sN1.placesTenues.get(childId)!;
        preinscritsListe.push(enrich(childId, meta, "preinscrit", { via: "place_tenue", creneau: { date: p.creneauDate, titre: p.creneauTitre, heure: p.creneauHeure } }));
        continue;
      }
      nonReinscrits.push(enrich(childId, meta, apresRentree ? "a_risque" : "pas_encore"));
    }
    reinscritsListe.sort((a, b) => (a.childName || "").localeCompare(b.childName || ""));
    // Places de cours des cavaliers comptés dans chaque carte (1 cavalier
    // dans 2 cours = 2), pour lire les cartes en « places » et non en têtes.
    const placesDe = (liste: any[], ...maps: Map<string, Set<string>>[]) =>
      liste.reduce((n, c) => n + maps.reduce((k, m) => k + (m.get(c.childId)?.size || 0), 0), 0);
    const placesPreinscrits = placesDe(preinscritsListe, sN1.slotsPreinscrits, sN1.slotsTenus);
    const placesReinscrits = placesDe(reinscritsListe, sN1.slotsFermes);

    // Pré-inscrits de N+1 qui ne faisaient PAS partie de l'effectif N (nouveaux
    // cavaliers, ou cavaliers de N inscrits ailleurs qu'en cours). Ils ne sont
    // pas comptés dans la carte « Pré-inscrits » — c'est l'écran Pré-inscrits
    // qui les relance — mais les nommer évite de croire le compteur faux quand
    // on le compare à cet écran.
    const preinscritsNouveaux: any[] = [];
    for (const [childId, p] of sN1.preinscrits) {
      if (sN.enrolled.has(childId) || enrolledN1.has(childId) || forfaitActiveN1.has(childId)) continue;
      preinscritsNouveaux.push({ childId, childName: p.childName, familyName: p.familyName, creneau: { date: p.creneauDate, titre: p.creneauTitre, heure: p.creneauHeure } });
    }
    preinscritsNouveaux.sort((a, b) => (a.childName || "").localeCompare(b.childName || ""));
    preinscritsListe.sort((a, b) => (a.childName || "").localeCompare(b.childName || ""));

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
      reinscritsListe, placesReinscrits,
      preinscritsCount: preinscritsListe.length, preinscrits: preinscritsListe, placesPreinscrits,
      // Vue « places » des deux saisons, tous cavaliers confondus (nouveaux compris).
      placesN: sN.places, placesN1: sN1.places,
      cavaliersN1: { fermes: sN1.enrolled.size, preinscrits: sN1.preinscrits.size, tenus: sN1.placesTenues.size },
      preinscritsNouveauxCount: preinscritsNouveaux.length, preinscritsNouveaux,
      retentionPct: totalN ? Math.round((reinscrits / totalN) * 100) : null,
      nonReinscrits, partis,
      diag: {
        creneauxSaisonN: sN.nbCreneaux, coursSaisonN: sN.nbCours, inscritsCoursN: sN.enrolled.size,
        creneauxSaisonN1: sN1.nbCreneaux, coursSaisonN1: sN1.nbCours, inscritsCoursN1: sN1.enrolled.size,
        preinscritsCoursN1: sN1.preinscrits.size, placesTenuesN1: sN1.placesTenues.size,
        nbForfaits,
      },
    });
  } catch (e: any) {
    console.error("reinscriptions:", e);
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
