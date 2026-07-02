/**
 * POST /api/admin/reset-family-financial
 *
 * Réinitialise TOUTES les données financières d'une famille (utile pour
 * créer un compte de test "vierge" sans avoir à recréer la famille +
 * enfants + auth).
 *
 * Body : { familyId: string, apply?: boolean }
 *   - apply=false (défaut) : dry-run, retourne ce qui SERA supprimé
 *   - apply=true : exécute réellement
 *
 * Ce qui est supprimé :
 *   - payments (tous statuts confondus)
 *   - avoirs
 *   - rattrapages
 *   - forfaits
 *   - cartes
 *   - echeances-sepa
 *   - mandats-sepa
 *   - reservations
 *   - waitlist (liste d'attente)
 *   - bonsRecup (collection legacy)
 *   - paiements offerts éventuels
 *   - les inscriptions sur les créneaux (enrolled[] purgé de la famille,
 *     places libérées) — phase 3
 *
 * Ce qui est PRÉSERVÉ :
 *   - le doc family (parent, enfants, contact, etc.)
 *   - les enfants (id, prénom, âge, galop, etc.)
 *   - le compte Firebase Auth
 *   - les emails-log (audit)
 *
 * 🔒 Sécurité : adminOnly via verifyAuth.
 * ⚠️ Opération irréversible quand apply=true.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Collections où familyId est un champ direct du document
const COLLECTIONS_BY_FAMILYID = [
  "payments",
  "avoirs",
  "rattrapages",
  "forfaits",
  "cartes",
  "echeances-sepa",
  "mandats-sepa",
  "reservations",
  "waitlist",
  "bonsRecup",
  "fidelite_transactions", // Historique des gains/conso de points
  "recurrences",           // Pensions et autres prestations recurrentes
];

// Collections où le doc ID EST le familyId (1 doc max par famille)
const COLLECTIONS_BY_DOC_ID = [
  "fidelite", // Solde de points stocké à fidelite/{familyId}
];

export async function POST(req: NextRequest) {
  // 🔒 Admin uniquement (suppression de masse)
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  try {
    const reqBody = await req.json();
    const { familyId, apply } = reqBody;

    if (!familyId) {
      return NextResponse.json({ error: "familyId requis" }, { status: 400 });
    }

    // NB : opération ciblée sur UNE seule famille, déjà protégée par
    // l'auth admin + le dry-run + la confirmation nommée côté UI.
    // Le garde-fou anti-prod ne s'applique qu'aux resets massifs
    // (reset-base, reset-compta), pas aux opérations par-famille.

    // Vérifier que la famille existe (sécurité supplémentaire)
    const famDoc = await adminDb.collection("families").doc(familyId).get();
    if (!famDoc.exists) {
      return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    }
    const famData = famDoc.data();
    const familyName = famData?.parentName || famData?.name || familyId;

    // Ensemble des identifiants à purger. Les données client (réservations,
    // liste d'attente…) sont rattachées à l'UID de connexion (user.uid), qui
    // n'est pas toujours égal à l'ID du document famille (fiche créée par
    // l'admin, compte relié, compte recréé…). On purge donc par l'ID du doc
    // ET l'authUid, et pour les réservations aussi par sourceFamilyId.
    const idSet = Array.from(new Set([familyId, famData?.authUid].filter(Boolean))) as string[];

    // Cas des comptes en double (fiche créée admin + fiche sous l'UID de
    // connexion partageant le même email) : on ajoute toutes les fiches du
    // même email et leurs authUid, sinon le reset rate les données rattachées
    // à l'autre fiche.
    const email = (famData?.parentEmail || famData?.email || "").trim().toLowerCase();
    if (email) {
      try {
        const sameEmail = await adminDb.collection("families").where("parentEmail", "==", famData?.parentEmail).get();
        sameEmail.forEach(d => {
          if (!idSet.includes(d.id)) idSet.push(d.id);
          const au = (d.data() as any)?.authUid;
          if (au && !idSet.includes(au)) idSet.push(au);
        });
      } catch { /* champ absent : ignore */ }
    }
    const SOURCE_FIELD_COLLECTIONS = new Set(["reservations", "waitlist"]);

    // Récupère les IDs de docs d'une collection correspondant à l'un des idSet
    // (champ familyId, + sourceFamilyId pour les collections concernées).
    const gatherIds = async (colName: string): Promise<string[]> => {
      const found = new Set<string>();
      for (let i = 0; i < idSet.length; i += 10) {
        const chunk = idSet.slice(i, i + 10);
        const snap = await adminDb.collection(colName).where("familyId", "in", chunk).get();
        snap.forEach(d => found.add(d.id));
        if (SOURCE_FIELD_COLLECTIONS.has(colName)) {
          try {
            const snap2 = await adminDb.collection(colName).where("sourceFamilyId", "in", chunk).get();
            snap2.forEach(d => found.add(d.id));
          } catch { /* champ absent : ignore */ }
        }
      }
      return Array.from(found);
    };

    // ── Phase 1 : inventaire ─────────────────────────────────────────
    // On compte (et liste les IDs) ce qui SERA supprimé. Permet à
    // l'admin de valider avant le coup fatal.
    const inventory: Record<string, { count: number; ids: string[] }> = {};

    for (const colName of COLLECTIONS_BY_FAMILYID) {
      const ids = await gatherIds(colName);
      inventory[colName] = { count: ids.length, ids };
    }

    // Collections ou le doc ID EST le familyId : check existence pour chaque id
    for (const colName of COLLECTIONS_BY_DOC_ID) {
      const ids: string[] = [];
      for (const id of idSet) {
        const docSnap = await adminDb.collection(colName).doc(id).get();
        if (docSnap.exists) ids.push(id);
      }
      inventory[colName] = { count: ids.length, ids };
    }

    const totalDocs = Object.values(inventory).reduce((s, x) => s + x.count, 0);

    // Mode dry-run : on n'écrit rien, on retourne l'inventaire + le nombre
    // de créneaux dont la famille serait désinscrite (phase 3).
    if (!apply) {
      let creneauxConcernes = 0;
      const allCreneauxSnap = await adminDb.collection("creneaux").get();
      for (const doc of allCreneauxSnap.docs) {
        const enrolled = (doc.data().enrolled || []) as any[];
        if (enrolled.some(e => idSet.includes(e.familyId))) creneauxConcernes++;
      }
      return NextResponse.json({
        success: true,
        dryRun: true,
        familyId,
        familyName,
        totalDocs,
        inventory,
        creneauxConcernes,
        message: `DRY-RUN : ${totalDocs} document(s) seraient supprimés et la famille désinscrite de ${creneauxConcernes} créneau(x) pour "${familyName}".`,
      });
    }

    // ── Phase 2 : suppression effective ──────────────────────────────
    // On batch par 450 (limite Firestore 500) pour chaque collection.
    const deletedByCollection: Record<string, number> = {};

    for (const [colName, info] of Object.entries(inventory)) {
      if (info.count === 0) {
        deletedByCollection[colName] = 0;
        continue;
      }
      let deleted = 0;
      for (let i = 0; i < info.ids.length; i += 450) {
        const batch = adminDb.batch();
        const chunk = info.ids.slice(i, i + 450);
        for (const id of chunk) {
          batch.delete(adminDb.collection(colName).doc(id));
        }
        await batch.commit();
        deleted += chunk.length;
      }
      deletedByCollection[colName] = deleted;
    }

    const totalDeleted = Object.values(deletedByCollection).reduce((s, n) => s + n, 0);

    // ── Phase 3 : nettoyer creneaux.enrolled[] ──────────────────────
    // Le reset des reservations a supprime les docs, mais l'inscription
    // au niveau du creneau (enrolled[]) doit aussi etre purgee, sinon :
    // - L'admin voit la famille toujours inscrite
    // - Les places restantes sont incorrectes
    // - Cote client, l'enfant est inscrit dans le creneau mais pas dans
    //   ses reservations (incoherent)
    //
    // On scanne tous les creneaux et on retire les entries ou familyId
    // matche. On ne touche qu'aux creneaux qui ont effectivement un
    // enrolled[] non-vide pour cette famille (perf).
    let creneauxCleaned = 0;
    const allCreneauxSnap = await adminDb.collection("creneaux").get();
    for (const doc of allCreneauxSnap.docs) {
      const data = doc.data();
      const enrolled = (data.enrolled || []) as any[];
      if (enrolled.length === 0) continue;
      const filtered = enrolled.filter(e => !idSet.includes(e.familyId));
      if (filtered.length === enrolled.length) continue; // pas concerne
      // Mise a jour : nouveau enrolled + enrolledCount
      await doc.ref.update({
        enrolled: filtered,
        enrolledCount: filtered.length,
      });
      creneauxCleaned++;
    }

    // Audit log
    console.log(`[reset-family-financial] Famille "${familyName}" (${familyId}) :`, deletedByCollection, `+ ${creneauxCleaned} creneaux purges`);

    return NextResponse.json({
      success: true,
      dryRun: false,
      familyId,
      familyName,
      totalDeleted,
      deletedByCollection,
      creneauxCleaned,
      message: `✅ ${totalDeleted} document(s) supprimés pour la famille "${familyName}". ${creneauxCleaned} créneau(x) purgé(s) des inscriptions. La fiche famille est préservée.`,
    });
  } catch (error: any) {
    console.error("[reset-family-financial] Erreur:", error);
    return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
  }
}
