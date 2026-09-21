/**
 * POST /api/famille/lier-compte
 *
 * Rattache le compte Firebase qui appelle à sa fiche famille — celle que le
 * bureau a saisie, retrouvée sur l'adresse du jeton.
 *
 * ── Pourquoi côté serveur ────────────────────────────────────────────────
 *
 * Ce rattachement se faisait dans le navigateur, à la première connexion :
 * requête `families where parentEmail == mon email`, puis `setDoc` de la
 * fiche entière sous l'uid. Deux problèmes.
 *
 * 1. Sécurité. La copie emportait `linkedChildren` — le champ qui autorise à
 *    réserver pour l'enfant d'une AUTRE famille. Comme le navigateur
 *    composait le document, il suffisait de créer sa propre fiche à la
 *    première connexion avec les `linkedChildren` de son choix pour
 *    s'attribuer n'importe quel enfant du club. Les règles interdisent
 *    désormais à une famille d'écrire ces champs ; c'est cette route, en
 *    Admin SDK, qui les reporte — après avoir vérifié que l'adresse du jeton
 *    correspond bien à la fiche.
 *
 * 2. Fiabilité. La requête par email était souvent refusée par les règles
 *    (le code le documentait lui-même : « permission-denied … bascule en
 *    création »), et une famille pré-inscrite par l'admin repartait alors sur
 *    une fiche vierge, sans ses enfants. L'Admin SDK ignore les règles : la
 *    recherche aboutit toujours.
 *
 * ── Le compte orphelin, et pourquoi il ne se réparait jamais ─────────────
 *
 * Une fiche vierge créée ici lors d'une connexion où rien ne correspondait
 * enfermait la famille pour de bon : au passage suivant, la route trouvait
 * cette fiche sous l'uid, la renvoyait, et ne cherchait plus jamais la vraie
 * fiche par l'adresse. Le bureau pouvait bien renseigner l'adresse ensuite,
 * la famille revenait indéfiniment sur son espace vide. Vingt-quatre comptes
 * dans ce cas au 21/09/2026, tous connectés une seule fois.
 *
 * Une fiche sous l'uid n'arrête donc la recherche que si elle porte des
 * cavaliers. Vide, elle est traitée comme une absence : on cherche la vraie
 * fiche, et si on la trouve, on la recopie ici et on lui fait passer le
 * relais — commandes, réservations, places au planning.
 *
 * Réponse :
 *   { lie: true,  family }  → fiche rattachée (ou déjà rattachée)
 *   { lie: true, cree: true, family } → aucune fiche connue, fiche vierge créée
 *   403 EMAIL_NON_VERIFIE   → une fiche existe, mais l'adresse du jeton n'a
 *                             pas été confirmée : rattachement refusé.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { FieldValue } from "firebase-admin/firestore";
import { fournisseurDepuisJeton } from "@/lib/fournisseur-connexion";
import { choisirFicheARattacher, fusionnerChampsFiche, fusionnerFamilles } from "@/lib/fusion-familles";

export const dynamic = "force-dynamic";

const aDesCavaliers = (d: any) => Array.isArray(d?.children) && d.children.length > 0;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const uid: string = auth.uid;
  const email: string = (auth.email || "").toLowerCase().trim();

  try {
    // Fiche portant déjà l'identifiant du compte. Avec des cavaliers, le
    // rattachement est fait : rien à chercher. Vide, elle ne prouve rien —
    // c'est justement la fiche orpheline à réparer, et on continue.
    const propreSnap = await adminDb.collection("families").doc(uid).get();
    const propre = propreSnap.exists ? (propreSnap.data() as Record<string, any>) : null;
    if (propre && aDesCavaliers(propre)) {
      return NextResponse.json({ lie: true, family: { id: uid, ...propre } });
    }

    // Fiches portant l'adresse DU JETON — jamais une adresse fournie par
    // l'appelant. La sienne, et les fiches déjà absorbées, ne comptent pas.
    const snap = email
      ? await adminDb.collection("families").where("parentEmail", "==", email).get()
      : null;
    const candidates: (Record<string, any> & { id: string })[] =
      (snap?.docs || []).map((d) => ({ ...(d.data() as Record<string, any>), id: d.id }));
    const ancienne = choisirFicheARattacher(candidates, uid);

    if (!ancienne) {
      if (candidates.filter((f) => f.id !== uid && f.status !== "merged").length > 1) {
        console.warn(`[lier-compte] ${email} : plusieurs fiches à cette adresse, rattachement laissé à l'admin`);
      }
      // La fiche vide existe déjà : on la rend telle quelle plutôt que d'en
      // récrire une par-dessus. Elle reste signalée dans les comptes orphelins.
      if (propre) return NextResponse.json({ lie: true, family: { id: uid, ...propre } });

      // Aucune fiche connue → fiche vierge créée ICI plutôt que dans le
      // navigateur. Les règles n'autorisent plus une famille à écrire
      // `parentEmail`, `authUid` ni `authProvider` : ces champs identifient le
      // compte, ils ne peuvent pas être déclarés par lui.
      const nouvelle = {
        parentName: auth.name || "",
        parentEmail: email,
        parentPhone: "",
        authProvider: fournisseurDepuisJeton(auth.firebase?.sign_in_provider),
        authUid: uid,
        children: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await adminDb.collection("families").doc(uid).set(nouvelle);
      console.log(`[lier-compte] nouvelle fiche pour ${email || uid}`);
      return NextResponse.json({ lie: true, cree: true, family: { id: uid, ...nouvelle } });
    }

    // ── Adresse vérifiée exigée pour REPRENDRE une fiche existante ─────────
    //
    // L'adresse du jeton est la seule clé de rattachement. L'inscription par
    // email/mot de passe étant ouverte, une adresse non vérifiée ne prouve
    // rien : n'importe qui pouvait taper l'adresse d'une famille du club,
    // choisir son mot de passe, et récupérer sa fiche — enfants, téléphone,
    // enfants liés. Google et Facebook renvoient toujours une adresse
    // vérifiée ; seul le mot de passe est concerné.
    //
    // La création d'une fiche vierge (plus haut) reste permise : elle
    // n'expose aucune donnée. C'est bien la reprise d'une fiche déjà remplie
    // qui est protégée ici.
    if (auth.email_verified !== true) {
      console.warn(`[lier-compte] refus : ${email} non vérifiée (fiche ${ancienne.id})`);
      return NextResponse.json(
        {
          error: "EMAIL_NON_VERIFIE",
          message:
            "Votre adresse e-mail doit être confirmée avant de retrouver votre fiche. " +
            "Ouvrez le lien de confirmation que nous venons de vous envoyer.",
        },
        { status: 403 }
      );
    }

    const { id: _idAncienne, ...donneesAncienne } = ancienne as Record<string, any>;
    // La fiche du bureau fait foi ; ce que la famille avait saisi sur sa
    // fiche vide comble les champs que le bureau a laissés vides. `status`
    // n'est pas repris : la fiche rattachée est vivante, pas absorbée.
    // (`FieldValue.delete()` est interdit dans un `set()` sans fusion ; on
    // retire donc la clé plutôt que de demander sa suppression.)
    const { status: _statusIgnore, ...champs } = fusionnerChampsFiche(propre || {}, donneesAncienne);
    const fiche = {
      ...champs,
      authUid: uid,
      authProvider: fournisseurDepuisJeton(auth.firebase?.sign_in_provider),
      parentEmail: email,
      parentName: donneesAncienne.parentName || propre?.parentName || auth.name || "",
      updatedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("families").doc(uid).set(fiche);

    // L'ancienne fiche passe le relais : tout ce qu'elle porte encore —
    // commandes, réservations, places au planning, cartes, mandats — est
    // repointé vers celle-ci, et elle est marquée fusionnée (pas supprimée).
    // Jusqu'au 21/09/2026 elle était effacée telle quelle : les acomptes de
    // stage payés le matin même restaient sur un identifiant mort, et la
    // fiche du parent affichait Facturé 0 / Payé 0.
    if (ancienne.id !== uid) {
      try {
        const { apercu } = await fusionnerFamilles({ keepId: uid, mergeId: ancienne.id, mergedBy: "system:lier-compte" });
        console.log(`[lier-compte] ancienne fiche ${ancienne.id} fusionnée dans ${uid} :`, apercu.reassign, `créneaux=${apercu.creneauxTouches}`);
      } catch (e) {
        console.error(`[lier-compte] fusion de l'ancienne fiche ${ancienne.id} impossible — elle reste en doublon, à fusionner depuis Cavaliers`, e);
      }
    }

    console.log(`[lier-compte] ${email} → uid ${uid}${propre ? " (fiche orpheline réparée)" : ""}`);
    const finale = await adminDb.collection("families").doc(uid).get();
    return NextResponse.json({ lie: true, family: { id: uid, ...(finale.data() || fiche) } });
  } catch (e) {
    console.error("[lier-compte]", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
