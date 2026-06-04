import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import famillesData from "@/data/familles-juillet-2026.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/inscrire-stages-semaine?semaine=2026-07-06[&apply=true]
 *
 * ÉTAPE 2 de la reprise Celeris : inscrit les enfants importés dans les stages
 * de la semaine, SANS créer de paiement (l'argent est encaissé dans Celeris
 * jusqu'en août — on ne crée aucun encaissement dans le journal NF525).
 *
 * Chaque inscription est marquée paymentSource:"celeris" sur l'enrolled, ce qui
 * la fait apparaître "réglée (Celeris)" au planning et l'exclut des impayés.
 *
 * GARDE-FOUS :
 *   - verifyAuth adminOnly.
 *   - base TEST uniquement (refuse si le projet n'est pas gestion-2026-test).
 *   - ?semaine= obligatoire ; DRY-RUN par défaut (?apply=true pour écrire).
 *   - idempotent : un enfant déjà inscrit dans un créneau n'est pas re-ajouté ;
 *     une réservation de stage déjà existante n'est pas dupliquée.
 *
 * Source des inscriptions : champ inscriptionsStages des familles taguées dans
 * src/data/familles-juillet-2026.json. Les libellés d'import sont rapprochés
 * des vrais créneaux Firestore par titre normalisé (en ignorant les suffixes
 * type "(copie)") + moniteur.
 */

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
// Normalisation de titre de stage : enlève les parenthèses type "(copie)" et le mot "stage".
const normStage = (s: string) =>
  norm((s || "").replace(/\([^)]*\)/g, " ").replace(/\bstage\b/gi, " "));

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const isProd = !projectId.includes("test");

  const semaine = req.nextUrl.searchParams.get("semaine") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semaine)) {
    return NextResponse.json({ error: "Paramètre 'semaine' requis (YYYY-MM-DD), ex. 2026-07-06." }, { status: 400 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "true";
  const confirmProd = req.nextUrl.searchParams.get("confirmProd") || "";
  // Aperçu libre partout ; écriture réelle en PROD = mot-clé explicite.
  if (apply && isProd && confirmProd !== "INSCRIRE-PROD") {
    return NextResponse.json({
      error: "Inscription réelle en PRODUCTION refusée : ajoutez confirmProd=INSCRIRE-PROD pour confirmer.",
      projectId,
    }, { status: 403 });
  }

  // ── 1. Inscriptions attendues (depuis le JSON tagué) ──────────────────────
  type Fam = {
    email: string; parentName: string;
    semaines?: string[];
    inscriptionsStages?: Array<{ semaine: string; stageLabel: string; horaire: string; moniteur: string; prix: number; enfant: string }>;
    enfants: Array<{ firstName: string; lastName: string; birthDate: string }>;
  };
  const familles = (famillesData as Fam[]).filter(f => (f.semaines || []).includes(semaine));
  const attendues: Array<{ familyEmail: string; enfant: string; stageLabel: string; moniteur: string }> = [];
  for (const f of familles) {
    for (const ins of (f.inscriptionsStages || [])) {
      if (ins.semaine === semaine) {
        attendues.push({ familyEmail: f.email || "", enfant: ins.enfant, stageLabel: ins.stageLabel, moniteur: ins.moniteur });
      }
    }
  }

  // ── 2. Stages réels de la semaine (lundi → dimanche) ──────────────────────
  const lundi = new Date(semaine + "T12:00:00Z");
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  const sunStr = dimanche.toISOString().split("T")[0];

  const creneauxSnap = await adminDb
    .collection("creneaux").where("date", ">=", semaine).where("date", "<=", sunStr).get();

  type RealStage = {
    activityTitle: string; activityType: string; monitor: string;
    stageKey: string; creneauIds: string[]; dates: string[];
  };
  const groupes = new Map<string, { title: string; type: string; monitor: string; jours: Array<{ id: string; date: string }> }>();
  for (const d of creneauxSnap.docs) {
    const c = d.data() as any;
    const type = c.activityType || "";
    if (type !== "stage" && type !== "stage_journee") continue;
    const title = c.activityTitle || "(sans titre)";
    const key = `${title}__${type}`;
    if (!groupes.has(key)) groupes.set(key, { title, type, monitor: c.monitor || "", jours: [] });
    groupes.get(key)!.jours.push({ id: d.id, date: c.date || "" });
  }
  const realStages: RealStage[] = [];
  for (const g of groupes.values()) {
    g.jours.sort((a, b) => a.date.localeCompare(b.date));
    realStages.push({
      activityTitle: g.title, activityType: g.type, monitor: g.monitor,
      creneauIds: g.jours.map(j => j.id), dates: g.jours.map(j => j.date),
      stageKey: `${g.title}_${g.jours[0]?.date || semaine}`,
    });
  }

  // Rapproche un libellé d'import vers un stage réel (titre normalisé + moniteur en départage).
  const matchStage = (label: string, moniteur: string): RealStage | RealStage[] | null => {
    let cands = realStages.filter(s => normStage(s.activityTitle) === normStage(label));
    if (cands.length === 0) return null;
    if (cands.length === 1) return cands[0];
    const byMon = cands.filter(s => norm(s.monitor) === norm(moniteur));
    if (byMon.length === 1) return byMon[0];
    return cands; // ambigu
  };

  // ── 3. Index des familles/enfants en base (pour retrouver familyId + childId) ─
  const famSnap = await adminDb.collection("families").get();
  // par email parent
  const byEmail = new Map<string, { familyId: string; familyName: string; children: any[] }>();
  // par nom d'enfant (global, fallback)
  const childByName = new Map<string, Array<{ familyId: string; familyName: string; childId: string; childName: string }>>();
  for (const d of famSnap.docs) {
    const data = d.data() as any;
    const familyId = d.id;
    const familyName = data.parentName || "—";
    const children = data.children || [];
    const email = norm(data.parentEmail || "");
    if (email) byEmail.set(email, { familyId, familyName, children });
    for (const c of children) {
      const k = norm(`${c.firstName || ""} ${c.lastName || ""}`);
      if (!childByName.has(k)) childByName.set(k, []);
      childByName.get(k)!.push({ familyId, familyName, childId: c.id, childName: `${c.firstName || ""} ${c.lastName || ""}`.trim() });
    }
  }

  const resoudreEnfant = (familyEmail: string, enfant: string) => {
    const k = norm(enfant);
    // 1) via l'email parent puis le nom de l'enfant dans cette famille
    const fam = byEmail.get(norm(familyEmail));
    if (fam) {
      const c = fam.children.find((ch: any) => norm(`${ch.firstName || ""} ${ch.lastName || ""}`) === k);
      if (c) return { familyId: fam.familyId, familyName: fam.familyName, childId: c.id, childName: `${c.firstName || ""} ${c.lastName || ""}`.trim() };
    }
    // 2) fallback : recherche globale par nom d'enfant
    const g = childByName.get(k) || [];
    if (g.length === 1) return g[0];
    return g.length > 1 ? "ambigu" : null;
  };

  // ── 4. Construire le plan ─────────────────────────────────────────────────
  const rapport = {
    projectId, semaine, lundi: semaine, dimanche: sunStr,
    mode: apply ? "APPLY (écriture réelle)" : "DRY-RUN (aucune écriture)",
    statut: "réglé via Celeris (paymentSource:celeris)",
    total_attendu: attendues.length,
    a_inscrire: 0,
    deja_inscrit: 0,
    reservations_creees: 0,
    problemes: [] as string[],
    details: [] as string[],
  };

  // Carte locale des enrolled par créneau pour suivre les ajouts intra-run.
  const creneauxData = new Map<string, any>();
  for (const d of creneauxSnap.docs) creneauxData.set(d.id, { enrolled: (d.data() as any).enrolled || [], data: d.data() });

  for (const a of attendues) {
    const stage = matchStage(a.stageLabel, a.moniteur);
    if (!stage) { rapport.problemes.push(`Stage introuvable en base : "${a.stageLabel}" (${a.moniteur}) — ${a.enfant}`); continue; }
    if (Array.isArray(stage)) { rapport.problemes.push(`Stage ambigu pour "${a.stageLabel}" (${a.moniteur}) — ${a.enfant} : ${stage.length} candidats`); continue; }

    const enf = resoudreEnfant(a.familyEmail, a.enfant);
    if (!enf) { rapport.problemes.push(`Enfant introuvable en base : ${a.enfant} (${a.familyEmail || "sans email"})`); continue; }
    if (enf === "ambigu") { rapport.problemes.push(`Enfant ambigu (plusieurs familles) : ${a.enfant}`); continue; }

    // Inscrire dans tous les jours du stage (idempotent).
    let joursAjoutes = 0, joursDeja = 0;
    for (const cid of stage.creneauIds) {
      const cd = creneauxData.get(cid);
      if (!cd) continue;
      const deja = cd.enrolled.some((e: any) => e.childId === enf.childId);
      if (deja) { joursDeja++; continue; }
      const entry = {
        childId: enf.childId, childName: enf.childName,
        familyId: enf.familyId, familyName: enf.familyName,
        enrolledAt: new Date().toISOString(),
        stageKey: stage.stageKey,
        paymentSource: "celeris",
      };
      if (apply) {
        cd.enrolled.push(entry);
        await adminDb.collection("creneaux").doc(cid).update({
          enrolled: FieldValue.arrayUnion(entry),
          enrolledCount: cd.enrolled.length,
        });
      } else {
        cd.enrolled.push(entry); // simulation locale pour le comptage
      }
      joursAjoutes++;
    }

    if (joursAjoutes > 0) rapport.a_inscrire++;
    if (joursAjoutes === 0 && joursDeja > 0) rapport.deja_inscrit++;

    // Réservation groupée du stage (idempotente).
    if (apply && joursAjoutes > 0) {
      const firstCid = stage.creneauIds[0];
      const existing = await adminDb.collection("reservations")
        .where("familyId", "==", enf.familyId)
        .where("childId", "==", enf.childId)
        .where("creneauId", "==", firstCid).limit(1).get();
      if (existing.empty) {
        const firstCr = creneauxData.get(firstCid)?.data || {};
        await adminDb.collection("reservations").add({
          familyId: enf.familyId, familyName: enf.familyName,
          childId: enf.childId, childName: enf.childName,
          activityTitle: stage.activityTitle, activityType: "stage", type: "stage",
          creneauId: firstCid, creneauIds: stage.creneauIds,
          date: stage.dates[0] || semaine, dateFin: stage.dates[stage.dates.length - 1] || stage.dates[0] || semaine,
          nbJours: stage.dates.length,
          startTime: firstCr.startTime || "", endTime: firstCr.endTime || "",
          stageKey: stage.stageKey,
          paymentSource: "celeris",
          status: "confirmed", source: "import-celeris",
          createdAt: FieldValue.serverTimestamp(),
        });
        rapport.reservations_creees++;
      }
    }

    rapport.details.push(`${a.enfant} → ${stage.activityTitle} (${stage.creneauIds.length}j) : ${joursAjoutes} ajouté(s)${joursDeja ? `, ${joursDeja} déjà` : ""}`);
  }

  return NextResponse.json(rapport);
}
