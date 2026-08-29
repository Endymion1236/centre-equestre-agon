/**
 * GET /api/admin/diag-famille?email=laserbayagon@gmail.com
 *     GET /api/admin/diag-famille?uid=xxxx
 *
 * Répond à UNE question : « où sont passées les données de cette famille ? »
 *
 * Écrit après l'incident du 29/08/2026 — une réservation visible dans
 * l'espace client, invisible côté admin, et un reset financier annonçant
 * « 0 document ». Trois causes possibles, indiscernables depuis l'interface :
 *
 *   1. le navigateur et l'administration ne lisent pas le MÊME projet Firebase ;
 *   2. la famille a DEUX fiches (une créée par l'admin, une sous l'uid de
 *      connexion), et les données sont rattachées à celle qu'on ne regarde pas ;
 *   3. les documents n'existent réellement pas — une réservation orpheline a
 *      été créée sans paiement.
 *
 * Cette route les distingue en une réponse. Lecture seule, admin uniquement.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { getActiveProjectId } from "@/lib/reset-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const uid = (req.nextUrl.searchParams.get("uid") || "").trim();
  if (!email && !uid) {
    return NextResponse.json({ error: "email ou uid requis" }, { status: 400 });
  }

  try {
    // ── 1. Toutes les fiches famille de cette personne ────────────────────
    // Comparaison en minuscules côté JS, et non dans la requête : deux fiches
    // saisies « Laserbayagon@… » et « laserbayagon@… » sont la même personne,
    // mais une égalité Firestore ne les rapproche pas.
    const toutes = await adminDb.collection("families").get();
    const fiches = toutes.docs
      .filter((d) => {
        const f = d.data() as any;
        const e = String(f.parentEmail || f.email || "").trim().toLowerCase();
        return (email && e === email) || (uid && (d.id === uid || f.authUid === uid));
      })
      .map((d) => {
        const f = d.data() as any;
        return {
          docId: d.id,
          parentName: f.parentName || null,
          parentEmail: f.parentEmail || null,
          authUid: f.authUid || null,
          nbEnfants: (f.children || []).length,
          nbLies: (f.linkedChildren || []).length,
          status: f.status || null,
          creePar: f.source || null,
        };
      });

    // Tous les identifiants sous lesquels des données peuvent être rattachées.
    const ids = Array.from(new Set([
      ...fiches.map((f) => f.docId),
      ...fiches.map((f) => f.authUid).filter(Boolean) as string[],
      ...(uid ? [uid] : []),
    ]));

    // ── 2. Ce qui existe réellement, par collection ───────────────────────
    const compter = async (col: string) => {
      const snap = await adminDb.collection(col).get();
      const docs = snap.docs.filter((d) => {
        const x = d.data() as any;
        return ids.includes(x.familyId) || ids.includes(x.sourceFamilyId);
      });
      return {
        total: docs.length,
        exemples: docs.slice(0, 5).map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            familyId: x.familyId || null,
            status: x.status || null,
            montant: x.totalTTC ?? x.montant ?? null,
            libelle: x.activityTitle || x.label || null,
            creneauId: x.creneauId || null,
          };
        }),
      };
    };

    const [payments, reservations, encaissements, waitlist, declarations] = await Promise.all([
      compter("payments"),
      compter("reservations"),
      compter("encaissements"),
      compter("waitlist"),
      compter("payment_declarations"),
    ]);

    // ── 3. Inscriptions réellement posées dans le planning ────────────────
    // Et surtout : les réservations qui pointent vers un créneau DISPARU.
    // C'est la signature de l'incident — /api/enroll répondait « ok » quand le
    // créneau n'existait pas, et le navigateur créait quand même la
    // réservation et le paiement.
    const creneauxSnap = await adminDb.collection("creneaux").get();
    const creneauxExistants = new Set(creneauxSnap.docs.map((d) => d.id));
    const inscriptions: any[] = [];
    creneauxSnap.docs.forEach((d) => {
      const c = d.data() as any;
      (c.enrolled || []).forEach((e: any) => {
        if (!ids.includes(e.familyId)) return;
        inscriptions.push({
          creneauId: d.id,
          date: c.date,
          activite: c.activityTitle,
          enfant: e.childName,
          enAttente: !!e.pending,
          expireLe: e.holdUntil || null,
        });
      });
    });

    const resaSnap = await adminDb.collection("reservations").get();
    const reservationsOrphelines = resaSnap.docs
      .filter((d) => {
        const r = d.data() as any;
        if (!ids.includes(r.familyId) && !ids.includes(r.sourceFamilyId)) return false;
        const cibles: string[] = Array.isArray(r.creneauIds) && r.creneauIds.length
          ? r.creneauIds
          : r.creneauId ? [r.creneauId] : [];
        return cibles.length > 0 && cibles.some((c) => !creneauxExistants.has(c));
      })
      .map((d) => {
        const r = d.data() as any;
        return {
          id: d.id, activite: r.activityTitle, date: r.date,
          status: r.status, creneauId: r.creneauId || null,
        };
      });

    return NextResponse.json({
      // LE point à vérifier en premier : si ce projet n'est pas celui que le
      // navigateur utilise, tout le reste est normal — vous regardez deux bases.
      projetFirebase: getActiveProjectId(),
      buildSha: process.env.NEXT_PUBLIC_BUILD_SHA || "inconnu",
      recherche: { email: email || null, uid: uid || null },
      fiches,
      identifiantsScrutes: ids,
      donnees: { payments, reservations, encaissements, waitlist, declarations },
      inscriptionsPlanning: inscriptions,
      // Non vide = des réservations pointent vers des créneaux supprimés.
      reservationsOrphelines,
      lecture: {
        plusieursFiches: fiches.length > 1
          ? "⚠️ Plusieurs fiches pour cette personne : les données sont réparties entre elles."
          : null,
        orphelines: reservationsOrphelines.length > 0
          ? "⚠️ Réservations pointant vers un créneau supprimé — voir /api/enroll, cas « créneau introuvable »."
          : null,
        rienDuTout: ids.length > 0 && payments.total === 0 && reservations.total === 0
          ? "Aucune donnée sous ces identifiants. Si le navigateur en affiche, il lit un AUTRE projet Firebase."
          : null,
      },
    });
  } catch (e) {
    console.error("[diag-famille]", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
