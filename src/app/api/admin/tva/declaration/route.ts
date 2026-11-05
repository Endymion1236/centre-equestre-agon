/**
 * GET /api/admin/tva/declaration?mois=AAAA-MM&periode=mois|trimestre&credit=12.5
 *   → { mois, encaissements, factures } : la CA3 préparée sur les deux bases
 *     (lib/declaration-tva), pour que l'écran montre l'écart tant que le
 *     cabinet n'a pas tranché. Lecture seule. Auth admin obligatoire.
 */

import { avoirsDuMois, tvaAvoirsDuMois } from "@/lib/avoir-fournisseur";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { messageErreur } from "@/lib/message-erreur";
import { MOIS_RE, normaliserDoc } from "@/lib/envoi-comptable";
import { chargerLignesMois } from "@/lib/lignes-mois";
import { bilanTvaMois, deductibleParNature } from "@/lib/bilan-justificatifs";
import { trimestreDe } from "@/lib/tva-a-payer";
import { preparerDeclarationTva, type DeductibleMois, type EcritureCelerisTva } from "@/lib/declaration-tva";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams;
  const moisRef = String(q.get("mois") || "");
  if (!MOIS_RE.test(moisRef)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  const mois = q.get("periode") === "trimestre" ? trimestreDe(moisRef).mois : [moisRef];
  const credit = Number(String(q.get("credit") || "0").replace(",", "."));
  const creditAnterieur = Number.isFinite(credit) && credit > 0 ? credit : 0;

  try {
    const [paySnap, encSnap, celerisIds, ...parMois] = await Promise.all([
      adminDb.collection("payments").get(),
      adminDb.collection("encaissements").get(),
      adminDb.collection("historiqueComptableCeleris").select().get(),
      ...mois.map(async (m) => {
        const [celeris, tableau] = await Promise.all([
          adminDb.collection("historiqueComptableCeleris").doc(m).get().catch(() => null),
          chargerLignesMois(m).catch((e) => { console.error("[tva/declaration] achats illisibles", m, e); return null; }),
        ]);
        return { m, celeris, tableau };
      }),
    ]);
    const celeris: Record<string, EcritureCelerisTva[]> = {};
    const deductible: Record<string, DeductibleMois | null> = {};
    for (const { m, celeris: doc, tableau } of parMois) {
      const lignes = doc?.exists ? (doc.data() as any)?.lignes : null;
      if (Array.isArray(lignes) && lignes.length) celeris[m] = lignes;
      // Tableau tronqué (plus de 2 000 lignes) : mieux vaut dire « partiel » que sous-déduire en silence.
      // TVA des avoirs fournisseurs du mois (joints dans le Rapprochement) : en moins.
      const avoirs = tableau && !tableau.limite ? tvaAvoirsDuMois(avoirsDuMois(tableau.pieces, m)) : null;
      const brut = tableau && !tableau.limite ? deductibleParNature(tableau.lignes) : null;
      deductible[m] = tableau && !tableau.limite && brut && avoirs
        ? { ...brut, immobilisations: Math.round((brut.immobilisations - avoirs.immobilisations) * 100) / 100,
            autresBiensServices: Math.round((brut.autresBiensServices - avoirs.autresBiensServices) * 100) / 100,
            aVerifier: bilanTvaMois(tableau.lignes).aVerifier }
        : null;
    }
    const commun = {
      mois,
      payments: paySnap.docs.map(normaliserDoc),
      encaissements: encSnap.docs.map(normaliserDoc),
      celeris,
      moisCeleris: celerisIds.docs.map((d) => d.id),
      deductible,
      creditAnterieur,
    };
    return NextResponse.json({
      mois,
      encaissements: preparerDeclarationTva({ ...commun, base: "encaissements" }),
      factures: preparerDeclarationTva({ ...commun, base: "factures" }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[tva/declaration]", e);
    return NextResponse.json({ error: `Préparation impossible — ${messageErreur(e)}` }, { status: 500 });
  }
}
