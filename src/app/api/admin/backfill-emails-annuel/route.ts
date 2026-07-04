import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Normalisation identique au reste du projet (route doublons).
const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type CsvRow = { nom: string; prenom: string; emailCav: string; emailTut: string };

// Déduit nom de famille + prénom du parent depuis la fiche.
function parseFamilyName(fam: any): { surname: string; first: string } {
  const ln = norm(fam.lastName || "");
  const fn = norm(fam.firstName || "");
  if (ln) return { surname: ln, first: fn };

  const pn = String(fam.parentName || "").trim();
  const toks = pn.split(/\s+/).filter(Boolean);
  const upper = toks.filter((t) => t.length > 1 && t === t.toUpperCase() && /[A-ZÀ-Ÿ]/.test(t));
  if (upper.length) {
    const rest = toks.filter((t) => !upper.includes(t));
    return { surname: norm(upper.join(" ")), first: norm(rest.join(" ")) };
  }
  return { surname: norm(toks[0] || ""), first: norm(toks.slice(1).join(" ")) };
}

export async function POST(req: NextRequest) {
  // 🔒 Route admin
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "";
  const isProd = !projectId.includes("test");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const rows: CsvRow[] = Array.isArray(body?.rows) ? body.rows : [];
  const dryRun = body?.dryRun !== false; // aperçu par défaut
  const confirmProd = String(body?.confirmProd || "");

  // Saison N : créneaux cours datés du 1/9/N au 30/6/N+1.
  // Défaut : N = 2025 → saison 2025-2026 (forfaits actifs jusqu'à fin juin 2026).
  const N = Number.isFinite(Number(body?.saison)) && Number(body?.saison) > 2000
    ? Number(body.saison)
    : 2025;
  const start = `${N}-09-01`;
  const end = `${N + 1}-06-30`;

  if (!rows.length) {
    return NextResponse.json({ error: "Aucune ligne CSV fournie." }, { status: 400 });
  }

  // Écriture réelle en PROD = mot-clé explicite (aperçu libre partout).
  if (!dryRun && isProd && confirmProd !== "MAJ-EMAILS-PROD") {
    return NextResponse.json(
      {
        error: "Écriture réelle en PRODUCTION refusée : confirmProd=MAJ-EMAILS-PROD requis.",
        projectId,
      },
      { status: 403 },
    );
  }

  // ── 1. Map "nom|prénom" → emails (tuteur prioritaire, sinon cavalier) ──
  const map = new Map<string, { email: string; source: "tuteur" | "cavalier" }[]>();
  for (const r of rows) {
    const key = `${norm(r.nom)}|${norm(r.prenom)}`;
    if (!key.replace("|", "").trim()) continue;
    const tut = (r.emailTut || "").trim();
    const cav = (r.emailCav || "").trim();
    const email = (tut || cav).toLowerCase();
    if (!email) continue;
    const source: "tuteur" | "cavalier" = tut ? "tuteur" : "cavalier";
    const arr = map.get(key) || [];
    if (!arr.some((e) => e.email === email)) arr.push({ email, source });
    map.set(key, arr);
  }

  // ── 2. Charger les familles (+ index childId → familyId) ──
  const famSnap = await adminDb.collection("families").get();
  const famById = new Map<string, any>();
  const childToFamily = new Map<string, string>();
  famSnap.forEach((d) => {
    const fam = d.data();
    famById.set(d.id, fam);
    for (const c of fam.children || []) {
      if (c?.id) childToFamily.set(String(c.id), d.id);
    }
  });

  // ── 3. Population "forfait annuel" = enfants inscrits (enrolled) dans un
  //      créneau de type "cours" daté dans la saison N (1/9/N → 30/6/N+1).
  //      Source de vérité identique à l'outil de réinscriptions.
  const cSnap = await adminDb
    .collection("creneaux")
    .where("date", ">=", start)
    .where("date", "<=", end)
    .get();

  const annualFamilyIds = new Set<string>();
  cSnap.forEach((d) => {
    const c = d.data();
    if (c.activityType !== "cours") return;
    for (const e of c.enrolled || []) {
      if (!e?.childId) continue;
      const famId = e.familyId ? String(e.familyId) : childToFamily.get(String(e.childId)) || "";
      if (famId && famById.has(famId)) annualFamilyIds.add(famId);
    }
  });

  // ── 4. Pour chaque famille annuelle SANS email : chercher dans le CSV ──
  const proposals: any[] = [];
  let alreadyHaveEmail = 0;

  for (const famId of annualFamilyIds) {
    const fam = famById.get(famId);
    if (!fam) continue;

    const currentEmail = String(fam.parentEmail || "").trim();
    if (currentEmail) {
      alreadyHaveEmail++;
      continue; // on ne remplit QUE les fiches sans email
    }

    const { surname, first } = parseFamilyName(fam);
    const children = Array.isArray(fam.children) ? fam.children : [];

    const candidates: { label: string; key: string }[] = [];
    for (const c of children) {
      const cSurname = norm(c?.lastName || "") || surname;
      const cFirst = norm(c?.firstName || "");
      if (cSurname && cFirst) {
        candidates.push({ label: `${c?.firstName || "?"} (enfant)`, key: `${cSurname}|${cFirst}` });
      }
    }
    if (surname && first) {
      candidates.push({ label: `${fam.parentName || "?"} (parent)`, key: `${surname}|${first}` });
    }

    let found: { email: string; source: string; via: string } | null = null;
    const seenEmails = new Set<string>();
    for (const cand of candidates) {
      const hits = map.get(cand.key);
      if (!hits || !hits.length) continue;
      for (const h of hits) seenEmails.add(h.email);
      if (!found) found = { email: hits[0].email, source: hits[0].source, via: cand.label };
    }
    const ambiguous = seenEmails.size > 1;

    proposals.push({
      familyId: famId,
      parentName: fam.parentName || "",
      children: children.map((c: any) => c?.firstName).filter(Boolean),
      proposedEmail: found?.email || "",
      source: found?.source || "",
      via: found?.via || "",
      allEmails: Array.from(seenEmails),
      status: !found ? "non_trouve" : ambiguous ? "ambigu" : "ok",
    });
  }

  // ── 5. Application (uniquement status "ok") ──
  let appliedCount = 0;
  if (!dryRun) {
    const toApply = proposals.filter((p) => p.status === "ok" && p.proposedEmail);
    for (let i = 0; i < toApply.length; i += 400) {
      const chunk = toApply.slice(i, i + 400);
      const batch = adminDb.batch();
      for (const p of chunk) {
        batch.update(adminDb.collection("families").doc(p.familyId), {
          parentEmail: p.proposedEmail,
          updatedAt: new Date(),
        });
      }
      await batch.commit();
      appliedCount += chunk.length;
    }
  }

  const order: Record<string, number> = { ok: 0, ambigu: 1, non_trouve: 2 };
  proposals.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const summary = {
    projectId,
    isProd,
    dryRun,
    saison: `${N}-${N + 1}`,
    periode: `${start} → ${end}`,
    annualFamilies: annualFamilyIds.size,
    alreadyHaveEmail,
    withoutEmail: proposals.length,
    ok: proposals.filter((p) => p.status === "ok").length,
    ambigu: proposals.filter((p) => p.status === "ambigu").length,
    nonTrouve: proposals.filter((p) => p.status === "non_trouve").length,
    appliedCount,
  };

  return NextResponse.json({ summary, proposals });
}
