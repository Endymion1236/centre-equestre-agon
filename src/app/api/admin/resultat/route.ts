/**
 * GET /api/admin/resultat — le compte de résultat « en continu », mois par mois :
 *   - ca        : chiffre d'affaires ENCAISSÉ (TTC), depuis la caisse NF525 —
 *                 zéro saisie, mêmes exclusions que partout (avoirs, apports de
 *                 caisse, versements en banque : l'argent qui se déplace sans
 *                 se gagner ne compte pas) ;
 *   - masse     : coût de la masse salariale (coût employeur, sinon brut,
 *                 + charges patronales versées à part) — écran Masse salariale ;
 *   - depenses  : total des factures saisies — écran Dépenses par poste.
 *
 * L'agrégation se fait ICI pour ne jamais envoyer le détail des encaissements
 * au navigateur : seuls 3 totaux par mois sortent. Les mois sont calés sur
 * l'heure de Paris (un encaissement du 31 juillet à 23h30 reste en juillet).
 *
 * Ce n'est PAS un compte de résultat comptable : le CA est TTC et encaissé
 * (pas facturé), les dotations/loyers non saisis manquent. C'est le tableau
 * de bord que le bilan ne donne qu'une fois par an, six mois trop tard.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Timestamp Firestore → "AAAA-MM" en heure de Paris. */
function moisParis(date: { toDate?: () => Date } | null | undefined): string | null {
  const d = date?.toDate?.();
  if (!d) return null;
  // "sv-SE" donne un format ISO (AAAA-MM-JJ …) directement découpable.
  return d.toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 7);
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const [encSnap, msSnap, depSnap] = await Promise.all([
      adminDb.collection("encaissements")
        .select("montant", "mode", "isApportCaisse", "isVersementBanque", "date")
        .get(),
      adminDb.collection("masse-salariale").get(),
      adminDb.collection("depenses").get(),
    ]);

    const parMois = new Map<string, { ca: number; masse: number; depenses: number }>();
    const entree = (mois: string) => {
      let e = parMois.get(mois);
      if (!e) { e = { ca: 0, masse: 0, depenses: 0 }; parMois.set(mois, e); }
      return e;
    };

    encSnap.docs.forEach((d) => {
      const r = d.data() as any;
      // Mêmes exclusions que le tableau de bord et le ticket Z : un avoir
      // consommé n'est pas un nouvel encaissement, un apport/versement est un
      // déplacement d'argent. Les corrections négatives, elles, COMPTENT (en
      // moins) : le CA du mois est net des remboursements.
      if (r.mode === "avoir" || r.isApportCaisse || r.isVersementBanque) return;
      const mois = moisParis(r.date);
      const montant = Number(r.montant || 0);
      if (!mois || !Number.isFinite(montant)) return;
      entree(mois).ca += montant;
    });

    msSnap.docs.forEach((d) => {
      const r = d.data() as any;
      const mois = String(r.mois || "");
      if (!MOIS_RE.test(mois)) return;
      if (r.type === "charge") entree(mois).masse += Number(r.montant || 0);
      else entree(mois).masse += Number(r.coutEmployeur != null && Number(r.coutEmployeur) > 0 ? r.coutEmployeur : r.brut || 0);
    });

    depSnap.docs.forEach((d) => {
      const r = d.data() as any;
      const mois = String(r.mois || "");
      if (!MOIS_RE.test(mois)) return;
      entree(mois).depenses += Number(r.montant || 0);
    });

    const mois = [...parMois.entries()]
      .map(([m, v]) => ({
        mois: m,
        ca: Math.round(v.ca * 100) / 100,
        masse: Math.round(v.masse * 100) / 100,
        depenses: Math.round(v.depenses * 100) / 100,
      }))
      .sort((a, b) => a.mois.localeCompare(b.mois));

    return NextResponse.json({ mois });
  } catch (e) {
    console.error("[resultat] lecture", e);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }
}
