/**
 * Suppression DÉFINITIVE de tous les justificatifs.
 *
 * GET  → aperçu : combien de pièces, combien rattachées à un paiement, et
 *   sur quelle base on s'apprête à travailler.
 * POST { confirme: "SUPPRIMER", attendu? } → supprime par lots qui tiennent
 *   dans le délai d'une fonction ; renvoie ce qu'il reste, le navigateur
 *   rappelle jusqu'à zéro.
 *
 * Partent ensemble, et sans retour possible : le document de la pièce, sa
 * sous-collection `historique`, le fichier stocké, et le lien qui la
 * rattachait à un paiement. Les opérations bancaires, leurs catégories et
 * leurs comptes proposés ne sont pas touchés — elles réapparaîtront
 * simplement comme « justificatif manquant ».
 *
 * Trois garde-fous, parce que c'est irréversible :
 *   1. administration seulement ;
 *   2. le mot « SUPPRIMER » écrit à la main, et le compte de l'aperçu ;
 *   3. refus sur la base de PRODUCTION sans la phrase de déblocage
 *      (cf. lib/reset-guard) — la préversion, elle, est libre.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { assertResetAllowed, getActiveProjectId, isProdEnvironment } from "@/lib/reset-guard";
import { apercuTouJours, verifierDemandeSuppression } from "@/lib/suppression-justificatifs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Un lot assez petit pour tenir dans le délai, assez gros pour ne pas traîner. */
const LOT = 120;
const BUDGET_MS = 45_000;
const PLAFOND_APERCU = 5000;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    const snap = await adminDb.collection("justificatifs").select("depenseId", "retire").limit(PLAFOND_APERCU + 1).get();
    const docs = snap.docs.slice(0, PLAFOND_APERCU);
    return NextResponse.json({
      total: docs.length,
      audela: snap.size > PLAFOND_APERCU,
      liees: docs.filter(d => !!d.data().depenseId).length,
      archivees: docs.filter(d => d.data().retire === true).length,
      base: getActiveProjectId(),
      production: isProdEnvironment(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[justificatifs/supprimer-tout] GET", message);
    return NextResponse.json({ error: `Aperçu impossible : ${message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const verdict = verifierDemandeSuppression(body);
  if (!verdict.ok) return NextResponse.json({ error: verdict.erreur }, { status: 400 });

  // La production ne s'efface pas par inadvertance : il faut la phrase.
  const blocage = assertResetAllowed(body);
  if (blocage) return blocage;

  const debut = Date.now();
  let etape = "lecture des pièces";
  try {
    // Le compte de l'aperçu ne vaut qu'au premier appel : l'écran ne
    // l'envoie que là, puisque les tours suivants en trouvent forcément
    // moins. Trouver PLUS que prévu, en revanche, signale un import lancé en
    // parallèle — on s'arrête plutôt que d'effacer ce que personne n'a vu.
    if (verdict.attendu !== null) {
      etape = "contrôle de l'aperçu";
      const total = await adminDb.collection("justificatifs").select().limit(verdict.attendu + 1).get();
      const desaccord = apercuTouJours(verdict.attendu, total.size);
      if (desaccord) return NextResponse.json({ error: desaccord }, { status: 409 });
    }

    etape = "lecture du lot";
    const snap = await adminDb.collection("justificatifs").select("depenseId", "paiementsAssocies").limit(LOT).get();
    const restantsAvant = snap.size;

    const bucket = adminStorage.bucket();
    let supprimes = 0;
    const echecs: string[] = [];

    for (const doc of snap.docs) {
      if (Date.now() - debut > BUDGET_MS) break;
      const id = doc.id, v = doc.data();
      try {
        etape = `suppression de ${id}`;
        // 1. Les liens qui rattachaient cette pièce à un ou plusieurs débits.
        const liens = [v.depenseId, ...((v.paiementsAssocies || []) as { id: string }[]).map(a => a.id)]
          .filter((x): x is string => typeof x === "string" && /^[\w-]{1,150}$/.test(x));
        for (const depenseId of [...new Set(liens)]) {
          const ref = adminDb.collection("justificatifs-liens").doc(depenseId);
          const lien = await ref.get();
          // Ne jamais casser le lien d'une AUTRE pièce portant le même débit.
          if (lien.exists && lien.data()?.pieceId === id) await ref.delete();
        }
        // 2. L'historique de la pièce, sous-collection que Firestore ne
        //    supprime pas avec son parent.
        for (;;) {
          const hist = await doc.ref.collection("historique").limit(400).get();
          if (hist.empty) break;
          const lot = adminDb.batch();
          for (const h of hist.docs) lot.delete(h.ref);
          await lot.commit();
          if (hist.size < 400) break;
        }
        // 3. Le fichier stocké. Absent (import interrompu) n'est pas un échec.
        await bucket.file(`justificatifs-prives/${id}`).delete().catch((e: unknown) => {
          const code = (e as { code?: number })?.code;
          if (code !== 404) throw e;
        });
        // 4. La pièce elle-même, en dernier : si l'un des trois précédents
        //    échoue, la pièce reste et le prochain passage la reprendra.
        await doc.ref.delete();
        supprimes++;
      } catch (e) {
        echecs.push(`${id} : ${e instanceof Error ? e.message : "suppression impossible"}`);
      }
    }

    const reste = await adminDb.collection("justificatifs").select().limit(1).get();
    return NextResponse.json({
      ok: true, supprimes, echecs,
      restants: reste.empty ? 0 : Math.max(1, restantsAvant - supprimes),
      // `termine` est la seule information fiable pour arrêter la boucle :
      // `restants` n'est qu'une estimation du lot courant.
      termine: reste.empty,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Suppression impossible";
    console.error("[justificatifs/supprimer-tout]", message);
    return NextResponse.json({
      error: `Suppression interrompue — ${etape} : ${message}. Les pièces déjà supprimées le restent ; relancez pour reprendre.`,
    }, { status: 500 });
  }
}
