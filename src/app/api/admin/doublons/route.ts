/**
 * Détection de doublons de comptes famille — admin (Phase 1 : revue, pas de fusion).
 * GET /api/admin/doublons
 *
 * Rapproche deux fiches `families` distinctes susceptibles d'être la même famille
 * réelle (typiquement après inscription en ligne avec une autre adresse mail).
 * Les signaux et leur poids vivent dans lib/doublons-familles : adresse email
 * identique, téléphone identique, cavalier commun, nom du parent identique.
 * Chaque paire est renvoyée avec ses motifs.
 *
 * Les paires écartées par l'admin sont stockées dans `doublons-ignores`
 * (clé = idA__idB triés) et exclues du scan.
 */
import { NextRequest, NextResponse } from "next/server";
import { messageErreur } from "@/lib/message-erreur";
import { verifyAuth } from "@/lib/api-auth";
import {
  clePaire, clesFiche, cleDateNaissance, comparerFiches, type ClesFiche,
} from "@/lib/doublons-familles";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";


async function handle(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const famSnap = await adminDb.collection("families").get();
    type Fam = {
      id: string; parentName: string; parentEmail: string; parentPhone: string;
      children: { name: string; birthDate: string }[];
      cles: ClesFiche; createdAt: any;
    };
    const fams: Fam[] = famSnap.docs
      .filter(d => (d.data() as any).status !== "merged")
      .map(d => {
      const f = d.data() as any;
      const children = (f.children || []).map((c: any) => ({ name: `${c.firstName || ""} ${c.lastName || ""}`.trim(), birthDate: cleDateNaissance(c?.birthDate) }));
      return {
        id: d.id,
        parentName: f.parentName || "",
        parentEmail: f.parentEmail || f.email || "",
        parentPhone: f.parentPhone || f.phone || f.tel || "",
        children,
        cles: clesFiche({ id: d.id, ...f }),
        createdAt: f.createdAt || null,
      };
    });

    // Paires déjà ignorées
    const ignored = new Set<string>();
    try {
      const igSnap = await adminDb.collection("doublons-ignores").get();
      igSnap.forEach(d => ignored.add(d.id));
    } catch { /* collection absente */ }

    const paires: any[] = [];
    for (let i = 0; i < fams.length; i++) {
      for (let j = i + 1; j < fams.length; j++) {
        const a = fams[i], b = fams[j];
        if (ignored.has(clePaire(a.id, b.id))) continue;

        const { score, motifs } = comparerFiches(a.cles, b.cles);
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
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
