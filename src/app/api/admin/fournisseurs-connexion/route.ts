import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { fournisseurDepuisComptes, libelleFournisseur } from "@/lib/fournisseur-connexion";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/admin/fournisseurs-connexion { confirmer?: boolean }
 *
 * Remet d'aplomb le mode de connexion des fiches familles.
 *
 * L'ancien code ne connaissait que deux valeurs : « google » pour
 * google.com, « facebook » pour TOUT LE RESTE. Les comptes créés avec une
 * adresse et un mot de passe, ou par lien de connexion, portent donc à tort
 * la mention Facebook. La vérité est chez Firebase, qui sait à quels
 * fournisseurs chaque compte est rattaché : on la relit et on corrige.
 *
 * Sans `confirmer`, rien n'est écrit : la route compte seulement ce qui
 * changerait. Les fiches créées au club (authProvider « admin », sans
 * compte rattaché) ne sont jamais touchées.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const confirmer = body?.confirmer === true;

    const snap = await adminDb.collection("families").get();
    const fiches = snap.docs
      .map((d) => ({ id: d.id, uid: String((d.data() as any).authUid || ""), actuel: String((d.data() as any).authProvider || "") }))
      .filter((f) => f.uid);

    const resume: Record<string, number> = {};
    const aCorriger: { id: string; uid: string; avant: string; apres: string }[] = [];
    const introuvables: string[] = [];

    // Firebase lit au plus cent comptes par appel.
    for (let i = 0; i < fiches.length; i += 100) {
      const lot = fiches.slice(i, i + 100);
      const { users, notFound } = await adminAuth.getUsers(lot.map((f) => ({ uid: f.uid })));
      const parUid = new Map<string, string[]>(users.map((u: any) => [String(u.uid), (u.providerData || []).map((p: any) => String(p.providerId))]));
      for (const f of lot) {
        const ids = parUid.get(f.uid);
        if (!ids) { introuvables.push(f.id); continue; }
        const vrai = fournisseurDepuisComptes(ids);
        resume[vrai] = (resume[vrai] || 0) + 1;
        if (vrai !== f.actuel) aCorriger.push({ id: f.id, uid: f.uid, avant: f.actuel, apres: vrai });
      }
      void notFound;
    }

    let corrigees = 0;
    if (confirmer && aCorriger.length > 0) {
      for (let i = 0; i < aCorriger.length; i += 400) {
        const batch = adminDb.batch();
        for (const c of aCorriger.slice(i, i + 400)) {
          batch.update(adminDb.collection("families").doc(c.id), { authProvider: c.apres });
        }
        await batch.commit();
        corrigees += aCorriger.slice(i, i + 400).length;
      }
      console.log(`[fournisseurs-connexion] ${corrigees} fiche(s) corrigée(s) par ${auth.email || auth.uid}`);
    }

    return NextResponse.json({
      confirmer,
      fichesAvecCompte: fiches.length,
      comptesIntrouvables: introuvables.length,
      repartition: Object.fromEntries(Object.entries(resume).map(([k, v]) => [libelleFournisseur(k), v])),
      aCorriger: aCorriger.length,
      corrigees,
      exemples: aCorriger.slice(0, 10).map((c) => `${libelleFournisseur(c.avant)} → ${libelleFournisseur(c.apres)}`),
    });
  } catch (e: any) {
    console.error("[fournisseurs-connexion]", e);
    return NextResponse.json({ error: e?.message || "Erreur interne" }, { status: 500 });
  }
}
