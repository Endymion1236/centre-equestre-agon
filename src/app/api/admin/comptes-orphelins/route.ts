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
 *    Pour chacune, la route propose les adresses que l'application connaît
 *    déjà : celle portée par une commande de cette famille, celle à laquelle
 *    le club lui a écrit, celle d'un compte créé à son nom. L'adresse est
 *    rarement perdue — elle est juste ailleurs.
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
import {
  nomsSeCorrespondent, proposerAdresses, type SourceAdresse,
} from "@/lib/adresses-manquantes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

/** Lecture par lots : Firestore limite un `in` à trente valeurs. */
async function lireParFamille(nomCollection: string, familyIds: string[]) {
  const docs: any[] = [];
  for (let i = 0; i < familyIds.length; i += 30) {
    const lot = familyIds.slice(i, i + 30);
    if (lot.length === 0) continue;
    try {
      const snap = await adminDb.collection(nomCollection).where("familyId", "in", lot).get();
      snap.docs.forEach((d) => docs.push(d.data() as any));
    } catch (e) {
      console.warn(`[comptes-orphelins] ${nomCollection} illisible :`, e);
    }
  }
  return docs;
}

const enIso = (v: any): string | null => {
  const d = typeof v?.toDate === "function" ? v.toDate() : v instanceof Date ? v : null;
  return d && !isNaN(d.getTime()) ? d.toISOString() : null;
};
const enFrancais = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "";

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
    /** Tous les comptes non-staff : ils servent aussi de piste d'adresse. */
    const comptes: { email: string; displayName: string }[] = [];
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
        if (email) comptes.push({ email, displayName: u.displayName || "" });
        const fiche = parId.get(u.uid);
        // Une fiche avec des cavaliers = compte rattaché, rien à signaler.
        if (fiche && fiche.nbEnfants > 0) continue;
        // Fiche fusionnée : déjà traitée, elle redirige vers la fiche conservée.
        if (fiche?.status === "merged") continue;

        // Fiches du bureau qui pourraient être la vraie fiche de ce compte :
        // même adresse (fiche pré-remplie jamais rattachée), ou même nom de
        // famille et des cavaliers dessus.
        const memeEmail = (parEmail.get(email) || []).filter((f) => f.id !== u.uid);
        // Comparaison mot à mot : chercher un nom DANS l'autre rapprochait
        // « Virginie Chapdelaine » de la fiche LAINÉ, et « Françoise
        // Langenais » de la fiche FRANCOIS. Fusionner sur ces pistes aurait
        // déplacé les cavaliers d'une famille chez une autre.
        const memeNom = fiches.filter(
          (f) =>
            f.id !== u.uid &&
            f.nbEnfants > 0 &&
            (nomsSeCorrespondent(u.displayName, f.lastName) ||
              nomsSeCorrespondent(u.displayName, f.parentName)),
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
    const fichesSansAdresse = fiches
      .filter((f) => f.status !== "merged")
      .filter((f) => f.nbEnfants > 0)
      .filter((f) => !emailValide(f.parentEmail));

    // Les adresses déjà portées par une AUTRE fiche : les recopier créerait
    // deux fiches à la même adresse, donc un rattachement ambigu. On les
    // propose quand même, mais signalées — c'est une fusion qu'il faut.
    const dejaPrises = fiches
      .filter((f) => f.status !== "merged" && emailValide(f.parentEmail))
      .map((f) => f.parentEmail);

    // Ce que l'application sait déjà de ces familles : ce qu'on a facturé,
    // ce qu'on leur a écrit. Lecture par lots, sur ces fiches seulement.
    const idsSansAdresse = fichesSansAdresse.map((f) => f.id);
    const [commandes, emailsEnvoyes] = idsSansAdresse.length
      ? await Promise.all([
          lireParFamille("payments", idsSansAdresse),
          lireParFamille("emailsSent", idsSansAdresse),
        ])
      : [[], []];

    const sourcesParFamille = new Map<string, SourceAdresse[]>();
    const ajouter = (familyId: string, source: SourceAdresse) => {
      if (!familyId || !source.email) return;
      const liste = sourcesParFamille.get(familyId) || [];
      liste.push(source);
      sourcesParFamille.set(familyId, liste);
    };

    for (const c of commandes) {
      const date = enIso(c.date) || enIso(c.createdAt);
      const titre = (c.items || []).map((i: any) => i?.activityTitle).filter(Boolean)[0] || "commande";
      ajouter(c.familyId, {
        email: c.familyEmail,
        origine: "commande",
        detail: `${titre}${date ? ` du ${enFrancais(date)}` : ""}`,
        date,
      });
    }
    for (const log of emailsEnvoyes) {
      const date = enIso(log.sentAt) || enIso(log.createdAt);
      // `to` peut porter plusieurs destinataires, joints par une virgule.
      for (const adresse of String(log.to || "").split(",")) {
        ajouter(log.familyId, {
          email: adresse,
          origine: "journal",
          detail: `« ${String(log.subject || "email").slice(0, 60)} »${date ? ` le ${enFrancais(date)}` : ""}`,
          date,
        });
      }
    }
    for (const f of fichesSansAdresse) {
      for (const compte of comptes) {
        if (nomsSeCorrespondent(compte.displayName, f.parentName) ||
            nomsSeCorrespondent(compte.displayName, f.lastName)) {
          ajouter(f.id, {
            email: compte.email,
            origine: "compte",
            detail: `compte de « ${compte.displayName} »`,
          });
        }
      }
    }

    const sansAdresse = fichesSansAdresse
      .map((f) => ({
        id: f.id,
        parentName: f.parentName,
        parentPhone: f.parentPhone,
        nbEnfants: f.nbEnfants,
        adressePresente: !!f.parentEmail, // présente mais mal formée
        accountType: f.accountType,
        propositions: proposerAdresses(sourcesParFamille.get(f.id) || [], dejaPrises),
      }))
      .sort((a, b) => {
        // Les fiches qu'on peut régler tout de suite en premier.
        if ((a.propositions.length > 0) !== (b.propositions.length > 0)) {
          return a.propositions.length > 0 ? -1 : 1;
        }
        return a.parentName.localeCompare(b.parentName, "fr");
      });

    return NextResponse.json({
      nbComptes,
      nbFiches: fiches.length,
      orphelins,
      sansAdresse,
      nbSansAdresseAvecPiste: sansAdresse.filter((f) => f.propositions.length > 0).length,
    });
  } catch (e: any) {
    console.error("[comptes-orphelins]", e);
    return NextResponse.json(
      { error: "Erreur lors de la lecture des comptes" },
      { status: 500 },
    );
  }
}
