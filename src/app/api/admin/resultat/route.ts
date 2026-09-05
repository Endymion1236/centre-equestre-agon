/**
 * GET /api/admin/resultat — le compte de résultat « en continu », mois par mois :
 *   - ca        : chiffre d'affaires ENCAISSÉ (TTC), depuis la caisse NF525 —
 *                 zéro saisie, mêmes exclusions que partout (avoirs, apports de
 *                 caisse, versements en banque : l'argent qui se déplace sans
 *                 se gagner ne compte pas) ;
 *   - masse     : coût de la masse salariale (coût employeur, sinon brut,
 *                 + charges patronales versées à part) — écran Masse salariale ;
 *   - depenses  : total des factures saisies — écran Dépenses par poste ;
 *   - caExterne : CA encaissé AVANT la bascule, saisi à la main depuis
 *                 l'ancien logiciel (Celeris) pour les mois où la caisse de
 *                 l'application est incomplète (juillet-août 2026). Doc par
 *                 mois dans `resultat-ca-externe/{AAAA-MM}`.
 *
 * POST /api/admin/resultat
 *   { action: "ca-externe", mois: "AAAA-MM", montant: number | null, note? }
 *       → pose (ou efface si null) le CA repris pour un mois.
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
import { FieldValue } from "firebase-admin/firestore";
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
    const [encSnap, msSnap, depSnap, extSnap] = await Promise.all([
      adminDb.collection("encaissements")
        .select("montant", "mode", "isApportCaisse", "isVersementBanque", "date")
        .get(),
      adminDb.collection("masse-salariale").get(),
      adminDb.collection("depenses").get(),
      adminDb.collection("resultat-ca-externe").get(),
    ]);

    const parMois = new Map<string, { ca: number; masse: number; depenses: number; caExterne: number; caExterneNote: string }>();
    const entree = (mois: string) => {
      let e = parMois.get(mois);
      if (!e) { e = { ca: 0, masse: 0, depenses: 0, caExterne: 0, caExterneNote: "" }; parMois.set(mois, e); }
      return e;
    };

    extSnap.docs.forEach((d) => {
      const r = d.data() as any;
      const mois = String(r.mois || d.id);
      if (!MOIS_RE.test(mois)) return;
      const e = entree(mois);
      e.caExterne += Number(r.montant || 0);
      e.caExterneNote = String(r.note || "");
    });

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
        caExterne: Math.round(v.caExterne * 100) / 100,
        caExterneNote: v.caExterneNote,
      }))
      .sort((a, b) => a.mois.localeCompare(b.mois));

    return NextResponse.json({ mois });
  } catch (e) {
    console.error("[resultat] lecture", e);
    return NextResponse.json({ error: "Erreur de lecture" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => ({} as any));
    if (body?.action !== "ca-externe") {
      return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }
    const mois = String(body.mois || "");
    if (!MOIS_RE.test(mois)) return NextResponse.json({ error: "Mois invalide (AAAA-MM)" }, { status: 400 });

    const ref = adminDb.collection("resultat-ca-externe").doc(mois);
    if (body.montant === null || body.montant === "" || body.montant === undefined) {
      await ref.delete();
      return NextResponse.json({ ok: true, mois, montant: null });
    }
    const montant = Number(String(body.montant).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(montant) || montant < 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }
    const note = String(body.note || "Celeris").trim().slice(0, 120);
    await ref.set({
      mois,
      montant: Math.round(montant * 100) / 100,
      note,
      saisiPar: (auth as any)?.email || (auth as any)?.uid || "admin",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, mois, montant: Math.round(montant * 100) / 100, note });
  } catch (e) {
    console.error("[resultat] écriture", e);
    return NextResponse.json({ error: "Erreur d'enregistrement" }, { status: 500 });
  }
}
