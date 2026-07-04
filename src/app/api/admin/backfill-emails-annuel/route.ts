import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Normalisation identique au reste du projet (route doublons) :
// NFD → suppression accents → minuscules → alphanum + espaces.
const norm = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Une inscription "forfait annuel" = un document `forfaits` avec ces statuts.
const ACTIF = new Set(["actif", "active"]);

type CsvRow = { nom: string; prenom: string; emailCav: string; emailTut: string };

// Déduit nom de famille + prénom du parent à partir de la fiche.
// Priorité aux champs lastName/firstName ; sinon on parse parentName
// ("NOM Prénom" : les tokens tout en MAJUSCULES = nom de famille).
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
  const seasonFilter =
    body?.seasonStartYear === null || body?.seasonStartYear === undefined
      ? null
      : Number(body.seasonStartYear);

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
  //     Un même nom|prénom peut renvoyer plusieurs emails distincts
  //     (homonymes) → on les garde tous pour détecter l'ambiguïté.
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

  // ── 2. Familles "forfait annuel" = ≥1 forfait actif ──
  const forfaitsSnap = await adminDb.collection("forfaits").get();
  const annualFamilyIds = new Set<string>();
  for (const d of forfaitsSnap.docs) {
    const f = d.data();
    if (!ACTIF.has(String(f.status || ""))) continue;
    if (seasonFilter !== null && Number(f.seasonStartYear) !== seasonFilter) continue;
    if (f.familyId) annualFamilyIds.add(String(f.familyId));
  }

  // ── 3. Parcours des familles annuelles SANS email ──
  const famSnap = await adminDb.collection("families").get();
  const proposals: any[] = [];
  let annualCount = 0;
  let alreadyHaveEmail = 0;

  for (const d of famSnap.docs) {
    if (!annualFamilyIds.has(d.id)) continue;
    annualCount++;
    const fam = d.data();

    const currentEmail = String(fam.parentEmail || "").trim();
    if (currentEmail) {
      alreadyHaveEmail++;
      continue; // on ne remplit QUE les fiches sans email
    }

    const { surname, first } = parseFamilyName(fam);
    const children = Array.isArray(fam.children) ? fam.children : [];

    // Clés candidates : chaque enfant, puis le parent lui-même.
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
      familyId: d.id,
      parentName: fam.parentName || "",
      children: children.map((c: any) => c?.firstName).filter(Boolean),
      proposedEmail: found?.email || "",
      source: found?.source || "",
      via: found?.via || "",
      allEmails: Array.from(seenEmails),
      status: !found ? "non_trouve" : ambiguous ? "ambigu" : "ok",
    });
  }

  // ── 4. Application (uniquement status "ok") ──
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

  const summary = {
    projectId,
    isProd,
    dryRun,
    seasonFilter,
    annualFamilies: annualCount,
    alreadyHaveEmail,
    withoutEmail: proposals.length,
    ok: proposals.filter((p) => p.status === "ok").length,
    ambigu: proposals.filter((p) => p.status === "ambigu").length,
    nonTrouve: proposals.filter((p) => p.status === "non_trouve").length,
    appliedCount,
  };

  // Tri : ok d'abord, puis ambigu, puis non trouvés (lecture plus simple).
  const order: Record<string, number> = { ok: 0, ambigu: 1, non_trouve: 2 };
  proposals.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return NextResponse.json({ summary, proposals });
}
