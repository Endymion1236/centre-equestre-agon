/**
 * GET /api/admin/comptes-orphelins
 *
 * Deux listes, qui sont les deux moitiés du même problème.
 *
 * 1. LES COMPTES ORPHELINS (le dégât déjà fait)
 *    Un compte Firebase Authentication dont la fiche famille est vide : pas
 *    de cavalier, créée automatiquement à la première connexion.
 *
 *    Mécanique (cf. src/lib/auth-context.tsx) : à la connexion, l'application
 *    cherche une fiche portant l'uid, puis une fiche dont `parentEmail`
 *    correspond. Si la fiche saisie au bureau n'a pas d'adresse, aucune des
 *    deux recherches n'aboutit et une TROISIÈME fiche est créée, vide, avec
 *    l'uid pour identifiant. La famille arrive sur un espace vierge, ses
 *    cavaliers restent sur la fiche du bureau, et l'adresse est désormais
 *    prise par le compte orphelin — ce qui bloque son attribution à la
 *    bonne fiche.
 *
 * 2. LES FICHES SANS ADRESSE (le dégât à venir)
 *    Une fiche avec des cavaliers mais sans adresse exploitable fabriquera un
 *    compte orphelin le jour où cette famille se connectera. C'est la liste à
 *    vider AVANT d'envoyer le mail de pré-inscription.
 *
 * Lecture seule : la route ne corrige rien, elle donne à voir. Le
 * rapprochement d'un orphelin avec sa vraie fiche se fait à la main
 * (fusion de fiches, ou changement d'adresse).
 *
 * Auth admin obligatoire.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { emailValide } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

/** Un nom de famille comparable : sans accents, sans casse, sans ponctuation. */
function cleNom(valeur: unknown): string {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    // ── Fiches familles ──
    const famSnap = await adminDb.collection("families").get();
    const fiches = famSnap.docs.map((d) => {
      const f = d.data() as any;
      return {
        id: d.id,
        parentName: f.parentName || "",
        lastName: f.lastName || "",
        parentEmail: norm(f.parentEmail),
        parentPhone: f.parentPhone || "",
        accountType: f.accountType || "particulier",
        authProvider: f.authProvider || "",
        status: f.status || "",
        nbEnfants: Array.isArray(f.children) ? f.children.length : 0,
        createdAt: f.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    const parId = new Map(fiches.map((f) => [f.id, f]));
    const parEmail = new Map<string, typeof fiches>();
    for (const f of fiches) {
      if (!f.parentEmail) continue;
      const liste = parEmail.get(f.parentEmail) || [];
      liste.push(f);
      parEmail.set(f.parentEmail, liste);
    }

    // ── Comptes Firebase Authentication ──
    const orphelins: any[] = [];
    let nbComptes = 0;
    let nextPageToken: string | undefined;
    do {
      const page = await adminAuth.listUsers(1000, nextPageToken);
      for (const u of page.users) {
        const claims = u.customClaims || {};
        // Le personnel n'a pas de fiche famille : ce n'est pas un orphelin.
        if (claims.admin === true || claims.moniteur === true) continue;
        nbComptes++;

        const email = norm(u.email);
        const fiche = parId.get(u.uid);
        // Une fiche avec des cavaliers = compte rattaché, rien à signaler.
        if (fiche && fiche.nbEnfants > 0) continue;
        // Fiche fusionnée : déjà traitée, elle redirige vers la fiche conservée.
        if (fiche?.status === "merged") continue;

        // Fiches du bureau qui pourraient être la vraie fiche de ce compte :
        // même adresse (fiche pré-remplie jamais rattachée), ou même nom de
        // famille et des cavaliers dessus.
        const memeEmail = (parEmail.get(email) || []).filter((f) => f.id !== u.uid);
        const nomCompte = cleNom(u.displayName);
        const memeNom = !nomCompte ? [] : fiches.filter(
          (f) =>
            f.id !== u.uid &&
            f.nbEnfants > 0 &&
            (cleNom(f.lastName) && nomCompte.includes(cleNom(f.lastName)) ||
              cleNom(f.parentName) === nomCompte),
        );

        orphelins.push({
          uid: u.uid,
          email: u.email || "",
          displayName: u.displayName || "",
          provider: u.providerData?.[0]?.providerId || "inconnu",
          creePar: fiche ? (fiche.authProvider || "connexion") : "aucune fiche",
          ficheVide: !!fiche,
          creeLe: u.metadata?.creationTime || null,
          derniereConnexion: u.metadata?.lastSignInTime || null,
          // Pistes de rapprochement, au plus 5 pour rester lisible à l'écran.
          rapprochements: [...memeEmail, ...memeNom]
            .filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i)
            .slice(0, 5)
            .map((f) => ({
              id: f.id,
              parentName: f.parentName,
              parentEmail: f.parentEmail,
              nbEnfants: f.nbEnfants,
              memeEmail: !!f.parentEmail && f.parentEmail === email,
            })),
        });
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);

    // Les plus récents d'abord : ce sont ceux qu'on peut encore rattraper de mémoire.
    orphelins.sort((a, b) =>
      String(b.creeLe || "").localeCompare(String(a.creeLe || "")),
    );

    // ── Fiches sans adresse exploitable (le prochain orphelin) ──
    const sansAdresse = fiches
      .filter((f) => f.status !== "merged")
      .filter((f) => f.nbEnfants > 0)
      .filter((f) => !emailValide(f.parentEmail))
      .map((f) => ({
        id: f.id,
        parentName: f.parentName,
        parentPhone: f.parentPhone,
        nbEnfants: f.nbEnfants,
        adressePresente: !!f.parentEmail, // présente mais mal formée
        accountType: f.accountType,
      }))
      .sort((a, b) => a.parentName.localeCompare(b.parentName, "fr"));

    return NextResponse.json({
      nbComptes,
      nbFiches: fiches.length,
      orphelins,
      sansAdresse,
    });
  } catch (e: any) {
    console.error("[comptes-orphelins]", e);
    return NextResponse.json(
      { error: e?.message || "Erreur lors de la lecture des comptes" },
      { status: 500 },
    );
  }
}
