/**
 * Détection de doublons de comptes famille — admin (Phase 1 : revue, pas de fusion).
 * GET /api/admin/doublons
 *
 * Rapproche deux fiches `families` distinctes susceptibles d'être la même famille
 * réelle (typiquement après inscription en ligne avec une autre adresse mail).
 * Signaux : téléphone identique, enfant commun (prénom+nom+date de naissance),
 * nom du parent identique (normalisé). Chaque paire est renvoyée avec ses motifs.
 *
 * Les paires écartées par l'admin sont stockées dans `doublons-ignores`
 * (clé = idA__idB triés) et exclues du scan.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const nameKey = (s: string) => norm(s).split(" ").filter(Boolean).sort().join(" ");
const phoneKey = (s: string) => { const d = (s || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };
const birthKey = (b: any) => {
  if (!b) return "";
  if (typeof b === "string") return b.slice(0, 10);
  if (b.toDate) try { return b.toDate().toISOString().slice(0, 10); } catch { return ""; }
  if (b.seconds) return new Date(b.seconds * 1000).toISOString().slice(0, 10);
  if (b instanceof Date) return b.toISOString().slice(0, 10);
  return "";
};
const childKey = (c: any) => `${norm(c?.firstName || "")}|${norm(c?.lastName || "")}|${birthKey(c?.birthDate)}`;

async function handle(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const famSnap = await adminDb.collection("families").get();
    type Fam = {
      id: string; parentName: string; parentEmail: string; parentPhone: string;
      children: { name: string; birthDate: string }[];
      nameK: string; phoneK: string; childKs: Set<string>; createdAt: any;
    };
    const fams: Fam[] = famSnap.docs.map(d => {
      const f = d.data() as any;
      const children = (f.children || []).map((c: any) => ({ name: `${c.firstName || ""} ${c.lastName || ""}`.trim(), birthDate: birthKey(c?.birthDate) }));
      return {
        id: d.id,
        parentName: f.parentName || "",
        parentEmail: f.parentEmail || f.email || "",
        parentPhone: f.parentPhone || f.phone || f.tel || "",
        children,
        nameK: nameKey(f.parentName || ""),
        phoneK: phoneKey(f.parentPhone || f.phone || f.tel || ""),
        childKs: new Set((f.children || []).map(childKey).filter((k: string) => k.replace(/\|/g, ""))),
        createdAt: f.createdAt || null,
      };
    });

    // Paires déjà ignorées
    const ignored = new Set<string>();
    try {
      const igSnap = await adminDb.collection("doublons-ignores").get();
      igSnap.forEach(d => ignored.add(d.id));
    } catch { /* collection absente */ }
    const pairId = (a: string, b: string) => [a, b].sort().join("__");

    const paires: any[] = [];
    for (let i = 0; i < fams.length; i++) {
      for (let j = i + 1; j < fams.length; j++) {
        const a = fams[i], b = fams[j];
        if (ignored.has(pairId(a.id, b.id))) continue;

        const motifs: string[] = [];
        let score = 0;
        if (a.phoneK && a.phoneK === b.phoneK) { motifs.push("phone"); score += 3; }
        const enfantsCommuns = [...a.childKs].filter(k => b.childKs.has(k));
        if (enfantsCommuns.length > 0) { motifs.push("enfant"); score += 3; }
        if (a.nameK && a.nameK === b.nameK) { motifs.push("nom"); score += 2; }

        if (score === 0) continue;
        paires.push({
          score, motifs,
          a: { id: a.id, parentName: a.parentName, parentEmail: a.parentEmail, parentPhone: a.parentPhone, children: a.children, createdAt: a.createdAt },
          b: { id: b.id, parentName: b.parentName, parentEmail: b.parentEmail, parentPhone: b.parentPhone, children: b.children, createdAt: b.createdAt },
        });
      }
    }
    paires.sort((x, y) => y.score - x.score);

    return NextResponse.json({ total: fams.length, paires, nbPaires: paires.length });
  } catch (e: any) {
    console.error("doublons:", e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
