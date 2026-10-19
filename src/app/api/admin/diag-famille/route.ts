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
import { messageErreur } from "@/lib/message-erreur";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { getActiveProjectId } from "@/lib/reset-guard";
import { ficheCorrespondA } from "@/lib/famille-existante";
import { toParisDateString } from "@/lib/date-local";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;

  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const uid = (req.nextUrl.searchParams.get("uid") || "").trim();
  // Recherche libre (nom du parent, nom d'un cavalier, adresse) : retrouve
  // la fiche du bureau ET le compte de la famille même quand leurs adresses
  // diffèrent — ce que l'écran Doublons ne voit pas (COSTEGROSSE, 10/2026).
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!email && !uid && q.length < 2) {
    return NextResponse.json({ error: "email, uid ou q (au moins 2 caractères) requis" }, { status: 400 });
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
        return (email && e === email) || (uid && (d.id === uid || f.authUid === uid)) || (q && ficheCorrespondA({ id: d.id, ...f }, q));
      })
      .map((d) => {
        const f = d.data() as any;
        return {
          docId: d.id,
          parentName: f.parentName || null,
          parentEmail: f.parentEmail || null,
          parentPhone: f.parentPhone || null,
          authUid: f.authUid || null,
          authProvider: f.authProvider || null,
          // Le compte de connexion de la famille : son identifiant Firebase
          // est celui du document (cf. /api/famille/lier-compte).
          estCompte: !!f.authUid && f.authUid === d.id,
          enfants: (f.children || []).map((c: any) => `${c?.firstName || ""} ${c?.lastName || ""}`.trim() || c?.name || "?"),
          nbEnfants: (f.children || []).length,
          nbLies: (f.linkedChildren || []).length,
          status: f.status || null,
          mergedInto: f.mergedInto || null,
          creePar: f.source || null,
          // Rempli plus bas : ce que porte cette fiche-là.
          commandes: 0, commandesVivantes: 0, totalCommandes: 0, totalRegle: 0, inscriptionsAVenir: 0,
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

    // Le détail de chaque commande : ses écritures au journal, et les avoirs
    // de la famille avec leurs utilisations. C'est ce qui dit où est passé
    // un règlement ou une déduction d'avoir que la facture ne montre pas.
    const encTousSnap = await adminDb.collection("encaissements").get();
    const encParCommande = new Map<string, any[]>();
    for (const d of encTousSnap.docs) {
      const e = d.data() as any;
      if (!e.paymentId) continue;
      const l = encParCommande.get(e.paymentId) || [];
      l.push({ id: d.id, date: e.dateIso || (e.date?.seconds ? new Date(e.date.seconds * 1000).toISOString() : null), mode: e.mode || null, modeLabel: e.modeLabel || null, montant: Number(e.montant) || 0, ref: e.ref || null, raison: e.raison || null });
      encParCommande.set(e.paymentId, l);
    }
    const detailCommandes: any[] = [];
    const avoirsSnap = await adminDb.collection("avoirs").get();
    const detailAvoirs = avoirsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((a) => ids.includes(a.familyId))
      .map((a) => ({
        id: a.id, familyId: a.familyId, reference: a.reference || null, type: a.type || "avoir", status: a.status || null,
        amount: Number(a.amount) || 0, usedAmount: Number(a.usedAmount) || 0, remainingAmount: Number(a.remainingAmount) || 0,
        reason: a.reason || null,
        utilisations: (a.usageHistory || []).map((u: any) => ({ date: u.date || null, montant: Number(u.montant ?? u.amount) || 0, paymentId: u.paymentId || null, invoiceRef: u.invoiceRef || null })),
      }));

    // Par fiche : ses commandes (hors annulées) et ce qui est réglé dessus.
    // C'est ce qui dit, en un coup d'œil, sur quelle fiche vit le dossier.
    const paySnap = await adminDb.collection("payments").get();
    for (const d of paySnap.docs) {
      const p = d.data() as any;
      const fiche = fiches.find((f) => f.docId === p.familyId);
      if (!fiche) continue;
      detailCommandes.push({
        id: d.id, familyId: p.familyId, invoiceNumber: p.invoiceNumber || null, status: p.status || null,
        totalTTC: Number(p.totalTTC) || 0, paidAmount: Number(p.paidAmount) || 0,
        date: p.date?.seconds ? new Date(p.date.seconds * 1000).toISOString() : null,
        lignes: (p.items || []).map((i: any) => `${i.activityTitle || "?"} (${(Number(i.priceTTC) || 0).toFixed(2)} €)`),
        encaissements: (encParCommande.get(d.id) || []).sort((x, y) => String(x.date || "").localeCompare(String(y.date || ""))),
      });
      fiche.commandes += 1;
      if (p.status === "cancelled") continue;
      fiche.commandesVivantes += 1;
      fiche.totalCommandes = Math.round((fiche.totalCommandes + (Number(p.totalTTC) || 0)) * 100) / 100;
      fiche.totalRegle = Math.round((fiche.totalRegle + (Number(p.paidAmount) || 0)) * 100) / 100;
    }

    // ── 3. Inscriptions réellement posées dans le planning ────────────────
    // Et surtout : les réservations qui pointent vers un créneau DISPARU.
    // C'est la signature de l'incident — /api/enroll répondait « ok » quand le
    // créneau n'existait pas, et le navigateur créait quand même la
    // réservation et le paiement.
    const creneauxSnap = await adminDb.collection("creneaux").get();
    const creneauxExistants = new Set(creneauxSnap.docs.map((d) => d.id));
    const inscriptions: any[] = [];
    const aujourdhui = toParisDateString();
    creneauxSnap.docs.forEach((d) => {
      const c = d.data() as any;
      (c.enrolled || []).forEach((e: any) => {
        if (!ids.includes(e.familyId)) return;
        const fiche = fiches.find((f) => f.docId === e.familyId);
        if (fiche && c.date >= aujourdhui) fiche.inscriptionsAVenir += 1;
        inscriptions.push({
          creneauId: d.id,
          date: c.date,
          activite: c.activityTitle,
          enfant: e.childName,
          familyId: e.familyId,
          enAttente: !!e.pending,
          expireLe: e.holdUntil || null,
        });
      });
    });
    inscriptions.sort((a, b) => String(a.date).localeCompare(String(b.date)));

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
      recherche: { email: email || null, uid: uid || null, q: q || null },
      fiches,
      identifiantsScrutes: ids,
      donnees: { payments, reservations, encaissements, waitlist, declarations },
      inscriptionsPlanning: inscriptions,
      detailCommandes: detailCommandes.sort((x, y) => String(y.date || "").localeCompare(String(x.date || ""))),
      detailAvoirs,
      // Non vide = des réservations pointent vers des créneaux supprimés.
      reservationsOrphelines,
      lecture: {
        plusieursFiches: fiches.filter((f) => f.status !== "merged").length > 1
          ? "⚠️ Plusieurs fiches vivantes pour cette personne : les données sont réparties entre elles. Rattachez la fiche du bureau au compte de connexion."
          : null,
        dossierHorsCompte: (() => {
          const compte = fiches.find((f) => f.estCompte && f.status !== "merged");
          const ailleurs = fiches.filter((f) => f.status !== "merged" && !f.estCompte && (f.commandesVivantes > 0 || f.inscriptionsAVenir > 0));
          return compte && ailleurs.length > 0
            ? `⚠️ Le compte de connexion (« ${compte.parentName || compte.docId} ») ne porte ni les commandes ni les inscriptions : elles sont sur ${ailleurs.map((f) => `« ${f.parentName || f.docId} »`).join(", ")}. La famille ne les voit donc pas dans son espace.`
            : null;
        })(),
        compteAbsorbe: (() => {
          const absorbe = fiches.find((f) => f.estCompte && f.status === "merged" && f.mergedInto);
          const cible = absorbe ? fiches.find((f) => f.docId === absorbe.mergedInto) : null;
          return absorbe && cible && !cible.estCompte
            ? `⚠️ Le compte de connexion « ${absorbe.parentName || absorbe.docId} » a été absorbé par la fiche du bureau « ${cible.parentName || cible.docId} » : c'est le mauvais sens. La famille retrouve sa fiche mais l'espace famille ne lit que ce qui est rattaché au compte, d'où un espace sans inscription ni paiement. Rétablissez le compte comme fiche principale.`
            : null;
        })(),
        sansCompte: fiches.length > 0 && !fiches.some((f) => f.estCompte)
          ? "Aucune de ces fiches n'est un compte de connexion : la famille ne s'est pas encore connectée (ou s'est connectée avec une autre adresse — cherchez-la par le nom)."
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
    return NextResponse.json({ error: `Erreur interne — ${messageErreur(e)}` }, { status: 500 });
  }
}
