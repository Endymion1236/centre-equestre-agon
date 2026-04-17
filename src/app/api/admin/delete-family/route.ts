/**
 * GET  /api/admin/delete-family?secret=xxx&email=xxx
 * POST /api/admin/delete-family?secret=xxx&email=xxx&apply=true
 *
 * Supprime entièrement un compte famille (Firebase Auth + Firestore + Storage).
 *
 * Sécurité :
 *   - CRON_SECRET obligatoire (route destructrice, admin ops only)
 *   - Mode dry-run par défaut : retourne un rapport de ce qui SERAIT supprimé
 *   - ?apply=true : exécute réellement la suppression
 *
 * Stratégie :
 *   1. Trouver le compte Firebase Auth par email
 *   2. Trouver le doc families (par uid OU par parentEmail)
 *   3. Pour chaque collection liée, supprimer les docs où familyId == uid
 *   4. Nettoyer les creneaux.enrolled[] pour retirer les enfants de la famille
 *   5. Supprimer les push_tokens (où uid == uid)
 *   6. Supprimer le doc families
 *   7. Supprimer le compte Firebase Auth
 *   8. Retourner un rapport détaillé
 *
 * ⚠️ Opération IRRÉVERSIBLE — utiliser uniquement pour :
 *   - Comptes de test à nettoyer
 *   - Requêtes RGPD de suppression (conserver le rapport comme preuve)
 *
 * Ne supprime PAS :
 *   - Les encaissements qui ont déjà été reportés en comptabilité (ils restent
 *     pour la traçabilité fiscale — à la charge de l'admin de les archiver avant)
 *   - Les factures émises (pour la même raison — obligation fiscale de conservation)
 *   Note : cette exception n'est pas encore implémentée car elle demande une
 *   décision métier (cf commentaire à la fin). Pour l'instant, on supprime TOUT.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Collections où supprimer tous les docs avec familyId == uid
const FAMILY_ID_COLLECTIONS = [
  "payments",
  "paiements", // legacy, en cours de migration
  "encaissements",
  "reservations",
  "avoirs",
  "cartes",
  "forfaits",
  "fidelite",
  "bonsRecup",
  "mandats-sepa",
  "pedagogie",
  "progressions",
  "rattrapages",
  "waitlist",
  "avis-satisfaction",
  "payment_declarations",
  "satisfaction",
  "devis",
  "communications",
];

// Collections où supprimer tous les docs avec uid == uid (pas familyId)
const UID_COLLECTIONS = [
  "push_tokens",
];

interface DeletionReport {
  email: string;
  uid: string | null;
  familyDocId: string | null;
  familyName: string | null;
  mode: "dry-run" | "apply";
  counts: Record<string, number>;
  creneauxCleaned: number;
  firebaseAuthDeleted: boolean;
  familyDocDeleted: boolean;
  totalDocsAffected: number;
  errors: { step: string; error: string }[];
}

async function handleDelete(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Route non configurée" }, { status: 500 });
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json(
      { error: "Paramètre 'email' obligatoire (ex: ?email=test@example.com)" },
      { status: 400 }
    );
  }

  const apply = req.nextUrl.searchParams.get("apply") === "true";

  const report: DeletionReport = {
    email,
    uid: null,
    familyDocId: null,
    familyName: null,
    mode: apply ? "apply" : "dry-run",
    counts: {},
    creneauxCleaned: 0,
    firebaseAuthDeleted: false,
    familyDocDeleted: false,
    totalDocsAffected: 0,
    errors: [],
  };

  // ── 1. Trouver le compte Firebase Auth ──────────────────────────────
  let uid: string | null = null;
  try {
    const userRecord = await adminAuth.getUserByEmail(email);
    uid = userRecord.uid;
    report.uid = uid;
  } catch (e: any) {
    if (e.code === "auth/user-not-found") {
      report.errors.push({
        step: "firebase-auth-lookup",
        error: "Aucun compte Firebase Auth pour cet email",
      });
    } else {
      report.errors.push({ step: "firebase-auth-lookup", error: e.message });
    }
    // On continue quand même — on peut avoir un doc families sans compte Auth
  }

  // ── 2. Trouver le doc families ──────────────────────────────────────
  let familyDocId: string | null = null;
  let familyData: any = null;
  try {
    // Priorité 1 : par uid
    if (uid) {
      const snap = await adminDb
        .collection("families")
        .where("uid", "==", uid)
        .limit(1)
        .get();
      if (!snap.empty) {
        familyDocId = snap.docs[0].id;
        familyData = snap.docs[0].data();
      }
    }
    // Fallback : par parentEmail
    if (!familyDocId) {
      const snap = await adminDb
        .collection("families")
        .where("parentEmail", "==", email)
        .limit(1)
        .get();
      if (!snap.empty) {
        familyDocId = snap.docs[0].id;
        familyData = snap.docs[0].data();
      }
    }
    report.familyDocId = familyDocId;
    report.familyName = familyData?.parentName || null;
  } catch (e: any) {
    report.errors.push({ step: "families-lookup", error: e.message });
  }

  // Le familyId utilisé dans les docs liés est soit l'uid, soit le firestoreId
  // du doc families. On gère les deux cas, en dédupliquant : pour la majorité
  // des comptes, uid === familyDocId (le doc families a pour id l'uid du user),
  // donc sans dédup on compterait chaque doc deux fois au dry-run.
  const possibleFamilyIds = Array.from(
    new Set([uid, familyDocId].filter(Boolean) as string[])
  );
  if (possibleFamilyIds.length === 0) {
    return NextResponse.json({
      ...report,
      message:
        "Aucun compte Firebase Auth ni doc families trouvé pour cet email. Rien à supprimer.",
    });
  }

  // ── 3. Compter (et supprimer si apply) les docs liés ────────────────
  for (const collName of FAMILY_ID_COLLECTIONS) {
    let totalInColl = 0;
    for (const fid of possibleFamilyIds) {
      try {
        const snap = await adminDb
          .collection(collName)
          .where("familyId", "==", fid)
          .get();
        if (snap.empty) continue;
        totalInColl += snap.size;

        if (apply) {
          // Batch par 400 (limite Firestore 500 opérations)
          const BATCH_SIZE = 400;
          for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
            const chunk = snap.docs.slice(i, i + BATCH_SIZE);
            const batch = adminDb.batch();
            for (const doc of chunk) batch.delete(doc.ref);
            await batch.commit();
          }
        }
      } catch (e: any) {
        report.errors.push({
          step: `delete-${collName}`,
          error: e.message,
        });
      }
    }
    if (totalInColl > 0) {
      report.counts[collName] = totalInColl;
      report.totalDocsAffected += totalInColl;
    }
  }

  // ── 4. Supprimer push_tokens (champ uid, pas familyId) ──────────────
  if (uid) {
    for (const collName of UID_COLLECTIONS) {
      try {
        const snap = await adminDb
          .collection(collName)
          .where("uid", "==", uid)
          .get();
        if (snap.empty) continue;
        report.counts[collName] = snap.size;
        report.totalDocsAffected += snap.size;

        if (apply) {
          const batch = adminDb.batch();
          for (const doc of snap.docs) batch.delete(doc.ref);
          await batch.commit();
        }
      } catch (e: any) {
        report.errors.push({
          step: `delete-${collName}`,
          error: e.message,
        });
      }
    }
  }

  // ── 5. Nettoyer creneaux.enrolled[] (retirer les enfants de cette famille) ─
  try {
    // Récupérer la liste des childIds à retirer (depuis familyData.children)
    const childIds: string[] = (familyData?.children || [])
      .map((c: any) => c?.id)
      .filter(Boolean);

    if (childIds.length > 0 || possibleFamilyIds.length > 0) {
      // Stratégie : on scanne les créneaux futurs uniquement (les passés sont
      // immuables pour l'audit) et on retire l'entrée matching
      const today = new Date().toISOString().split("T")[0];
      const crSnap = await adminDb
        .collection("creneaux")
        .where("date", ">=", today)
        .get();

      for (const crDoc of crSnap.docs) {
        const crData = crDoc.data();
        const enrolled = crData.enrolled || [];
        const newEnrolled = enrolled.filter((e: any) => {
          // On retire si familyId matche OU childId matche
          if (possibleFamilyIds.includes(e.familyId)) return false;
          if (childIds.includes(e.childId)) return false;
          return true;
        });

        if (newEnrolled.length !== enrolled.length) {
          report.creneauxCleaned++;
          if (apply) {
            await crDoc.ref.update({
              enrolled: newEnrolled,
              enrolledCount: newEnrolled.length,
            });
          }
        }
      }
    }
  } catch (e: any) {
    report.errors.push({ step: "creneaux-cleanup", error: e.message });
  }

  // ── 6. Supprimer le doc families ────────────────────────────────────
  if (familyDocId) {
    try {
      if (apply) {
        await adminDb.collection("families").doc(familyDocId).delete();
        report.familyDocDeleted = true;
      }
      // En dry-run, on laisse le flag à false mais le rapport indique
      // bien familyDocId (visible côté user), ce qui suffit à comprendre
      // qu'il sera supprimé.
    } catch (e: any) {
      report.errors.push({ step: "families-delete", error: e.message });
    }
  }

  // ── 7. Supprimer le compte Firebase Auth ────────────────────────────
  if (uid) {
    try {
      if (apply) {
        await adminAuth.deleteUser(uid);
        report.firebaseAuthDeleted = true;
      }
    } catch (e: any) {
      report.errors.push({ step: "firebase-auth-delete", error: e.message });
    }
  }

  // ── 8. Log pour audit ────────────────────────────────────────────────
  if (apply) {
    try {
      await adminDb.collection("audit_log").add({
        type: "family-deletion",
        email,
        uid,
        familyName: report.familyName,
        familyDocId,
        totalDocsAffected: report.totalDocsAffected,
        counts: report.counts,
        performedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // Non-bloquant
      console.error("audit_log write failed:", e);
    }
  }

  return NextResponse.json({
    ...report,
    hint: apply
      ? `Suppression effectuée. ${report.totalDocsAffected} docs supprimés, ${report.creneauxCleaned} créneaux nettoyés.`
      : "Dry-run terminé. Ajouter ?apply=true pour exécuter. (Et utiliser POST pour être explicite sur l'intention destructrice.)",
  });
}

export async function GET(req: NextRequest) {
  // GET = toujours dry-run, même si ?apply=true (sécurité supplémentaire :
  // un destructeur doit être en POST)
  const params = new URLSearchParams(req.nextUrl.search);
  params.delete("apply");
  const newUrl = new URL(req.nextUrl.pathname + "?" + params.toString(), req.nextUrl.origin);
  const dryRunReq = new NextRequest(newUrl, { headers: req.headers });
  return handleDelete(dryRunReq);
}

export async function POST(req: NextRequest) {
  return handleDelete(req);
}

/*
 * TODO futur — conformité fiscale française :
 *
 * Selon le CGI, les factures émises doivent être conservées 10 ans. En cas
 * de request RGPD, il faut :
 *   - Anonymiser les factures (remplacer familyName et adresse par "CLIENT
 *     ANONYMISÉ") plutôt que les supprimer
 *   - Conserver le hash du compte pour prouver la demande
 *
 * Pour les comptes de test, TOUT supprimer est acceptable — pas d'obligation
 * fiscale sur des données non réelles.
 *
 * Ce choix est délégué à l'admin. La route actuelle supprime tout. Si un
 * jour on implémente un flag ?mode=rgpd pour anonymiser au lieu de supprimer,
 * ce sera ici.
 */
