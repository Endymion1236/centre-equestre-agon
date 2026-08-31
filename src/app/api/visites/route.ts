/**
 * Compteur de fréquentation du site public.
 *
 * POST — appelé par le navigateur à chaque page vue. Aucune authentification :
 *        c'est un visiteur anonyme qui l'appelle.
 * GET  — lu par l'administration (Statistiques › Fréquentation), admin requis.
 *
 * ── Ce qui est enregistré, et ce qui ne l'est pas ────────────────────────
 *
 * Un document par jour, qui ne contient que des compteurs :
 *
 *   visites/2026-08-31 → { jour, vues, visiteurs, pages: { tarifs: 44, … } }
 *
 * Aucune adresse IP, aucun identifiant de visiteur, aucun cookie. Le
 * navigateur garde un marqueur dans sa `sessionStorage` — effacé à la
 * fermeture de l'onglet — uniquement pour ne compter qu'une fois le visiteur
 * qui lit plusieurs pages d'affilée. Rien de tout cela ne remonte ici.
 *
 * Cette sobriété n'est pas qu'une précaution : une mesure d'audience limitée
 * au site, agrégée et sans suivi entre sites relève de l'exemption de
 * consentement de la CNIL. Aucun bandeau cookies n'est donc nécessaire, ce
 * qui n'aurait pas été vrai avec un outil de mesure tiers.
 *
 * ── Le coût ─────────────────────────────────────────────────────────────
 *
 * Une écriture par page vue, sur UN document par jour, avec `increment` : pas
 * de lecture préalable, pas de document par visite. À l'échelle du club, on
 * reste très loin du quota gratuit quotidien de Firestore.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { FieldValue } from "firebase-admin/firestore";
import { estRobot, rubriqueDe } from "@/lib/robots";

export const dynamic = "force-dynamic";

/** Jour courant à Paris, en AAAA-MM-JJ — l'identifiant du document. */
function jourParis(d = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export async function POST(req: NextRequest) {
  // Un robot reconnu repart avec un 204 : on ne compte pas, et on ne lui dit
  // pas qu'il a été filtré. Le même code de retour pour tout le monde évite
  // d'offrir un moyen de tester quels user-agents passent.
  const ua = req.headers.get("user-agent");
  if (estRobot(ua)) return new NextResponse(null, { status: 204 });

  try {
    const body = await req.json().catch(() => ({}));
    const rubrique = rubriqueDe(String(body?.chemin || "/"));
    // `premiere` est posé par le navigateur au premier appel de la session.
    // On lui fait confiance : le mensonge éventuel fausserait un compteur de
    // club, pas une facturation, et l'alternative — tenir la liste des
    // visiteurs du jour — coûterait la vie privée qu'on cherche à préserver.
    const premiereVue = body?.premiere === true;

    const ref = adminDb.collection("visites").doc(jourParis());
    // La rubrique est passée en objet imbriqué, et non en chemin pointé :
    // `set` prend « pages.tarifs » au pied de la lettre et créerait un champ
    // dont le nom contient un point, à côté de la carte `pages` au lieu
    // d'être dedans. Seul `update` interprète les chemins — mais il échoue
    // sur un document qui n'existe pas encore, donc au premier passage de la
    // journée.
    await ref.set({
      jour: jourParis(),
      vues: FieldValue.increment(1),
      visiteurs: FieldValue.increment(premiereVue ? 1 : 0),
      pages: { [rubrique]: FieldValue.increment(1) },
      majLe: FieldValue.serverTimestamp(),
    }, { merge: true });

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    // Un compteur ne doit jamais faire remonter d'erreur au visiteur : la
    // page est déjà affichée, et l'échec d'une statistique n'est pas son
    // problème.
    console.error("[visites]", e);
    return new NextResponse(null, { status: 204 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  // Fenêtre demandée, bornée à un an : au-delà, la lecture coûterait plus
  // que le renseignement n'apporte.
  const jours = Math.min(Math.max(Number(req.nextUrl.searchParams.get("jours")) || 30, 1), 365);
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - (jours - 1));

  const snap = await adminDb.collection("visites")
    .where("jour", ">=", jourParis(depuis))
    .orderBy("jour", "asc")
    .get();

  const parJour = snap.docs.map((d) => {
    const v = d.data() as Record<string, unknown>;
    return {
      jour: String(v.jour || d.id),
      vues: Number(v.vues) || 0,
      visiteurs: Number(v.visiteurs) || 0,
      pages: (v.pages || {}) as Record<string, number>,
    };
  });

  const pages: Record<string, number> = {};
  for (const j of parJour) {
    for (const [rubrique, n] of Object.entries(j.pages)) {
      pages[rubrique] = (pages[rubrique] || 0) + (Number(n) || 0);
    }
  }

  return NextResponse.json({
    jours,
    parJour,
    pages,
    totalVues: parJour.reduce((s, j) => s + j.vues, 0),
    totalVisiteurs: parJour.reduce((s, j) => s + j.visiteurs, 0),
  });
}
