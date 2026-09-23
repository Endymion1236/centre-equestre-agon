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
 * Ne supprime PAS, en PRODUCTION :
 *   - Les encaissements, factures, avoirs, remises, mandats et déclarations.
 *     Ces pièces sont ANONYMISÉES (nom, email, téléphone neutralisés) et
 *     conservées : le montant, la date, le numéro de pièce et la chaîne
 *     d'empreintes restent intacts.
 *
 *   C'est la réponse correcte à une demande RGPD d'effacement : l'art. 17-3-b
 *   du RGPD réserve le droit à l'effacement lorsqu'une obligation légale de
 *   conservation s'y oppose (art. L102 B du LPF : 6 ans ; art. L123-22 du Code
 *   de commerce : 10 ans). Supprimer l'écriture elle-même serait à la fois
 *   inutile au regard du RGPD et fautif au regard du fisc.
 *
 *   Sur la base de TEST, la suppression reste totale : c'est là que se
 *   nettoient les comptes d'essai.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { isProdEnvironment } from "@/lib/reset-guard";
import {
  estCollectionFiscale,
  anonymisationComptable,
} from "@/lib/collections-comptables";
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
  /** Pièces comptables conservées mais dépersonnalisées (production). */
  anonymises: Record<string, number>;
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

  // NB : suppression ciblée sur UNE seule famille (par email), protégée
  // par l'auth admin + le mode dry-run. En production, les pièces comptables
  // de cette famille sont anonymisées et non supprimées (cf. en-tête).
  const estProd = isProdEnvironment();
  const champsAnonymes = anonymisationComptable();

  const report: DeletionReport = {
    email,
    uid: null,
    familyDocId: null,
    familyName: null,
    mode: apply ? "apply" : "dry-run",
    counts: {},
    anonymises: {},
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
      report.errors.push({ step: "firebase-auth-lookup", error: "Erreur interne"});
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
    report.errors.push({ step: "families-lookup", error: "Erreur interne"});
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
    // En production, une pièce comptable se dépersonnalise, elle ne s'efface pas.
    const anonymiser = estProd && estCollectionFiscale(collName);
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
            for (const doc of chunk) {
              if (anonymiser) batch.update(doc.ref, champsAnonymes);
              else batch.delete(doc.ref);
            }
            await batch.commit();
          }
        }
      } catch (e: any) {
        report.errors.push({
          step: `delete-${collName}`,
          error: "Erreur interne",
        });
      }
    }
    if (totalInColl > 0) {
      if (anonymiser) report.anonymises[collName] = totalInColl;
      else report.counts[collName] = totalInColl;
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
          error: "Erreur interne",
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
    report.errors.push({ step: "creneaux-cleanup", error: "Erreur interne"});
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
      report.errors.push({ step: "families-delete", error: "Erreur interne"});
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
      report.errors.push({ step: "firebase-auth-delete", error: "Erreur interne"});
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
 * Conformité fiscale — implémenté (septembre 2026).
 *
 * Le choix n'est plus délégué à l'admin, parce qu'il n'en est pas un : sur la
 * base de PRODUCTION, les pièces comptables de la famille sont anonymisées et
 * conservées ; sur la base de TEST, tout est supprimé. La bascule se fait sur
 * le projectId Firebase actif (isProdEnvironment), pas sur un paramètre d'URL
 * — un garde-fou qu'on peut désactiver depuis la barre d'adresse n'en est pas
 * un.
 *
 * Le rapport distingue les deux : `counts` liste ce qui a été supprimé,
 * `anonymises` ce qui a été conservé sous forme dépersonnalisée. Conserver ce
 * rapport vaut preuve de traitement de la demande RGPD.
 */
