import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { formatStageSchedule } from "@/lib/format-stage";
import { generateOrderId } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════
// POST /api/admin/inbox-enroll  (admin uniquement)
//
// Étape 2 de l'assistant boîte : inscrire EN 1 CLIC l'enfant d'une famille
// (celle qui a écrit le mail) sur un créneau proposé par l'assistant.
//
// Principe de sûreté (identique à l'audit `sourceFamilyId` corrigé) :
//   - Le serveur ne fait JAMAIS confiance au client pour le lien enfant↔famille.
//     Il re-résout la famille (`familyId`), puis vérifie que `childId` figure
//     bien dans `family.children`. Sinon → 403 (enfant non autorisé).
//   - L'écriture se fait dans une TRANSACTION sur le créneau : on relit la
//     capacité au dernier moment (place réellement dispo) et on refuse un
//     créneau complet. Pas de doublon (déjà inscrit = idempotent → "already").
//   - AUCUNE écriture financière ici. L'inscription est découplée du paiement
//     (le lien de paiement / la déclaration d'encaissement, c'est l'étape 3).
//     Mutation réversible : l'admin peut retirer l'entrée du créneau.
//
//   - Après inscription réussie, crée la COMMANDE (doc `payments` en statut
//     "pending" — la proforma) selon la même logique que l'inscription admin :
//     panier unique (fusion dans la commande pending la plus récente de la
//     famille, hors échéanciers), prix AUTORITAIRE repris des créneaux,
//     acompte/solde renseignés pour les stages (30 €/enfant). AUCUN lien de
//     paiement envoyé — c'est une commande à régler, visible dans Paiements.
//
// Body    : { creneauIds: string[], childId: string, familyId: string }
//           (rétro-compat : creneauId string unique accepté)
//           Un stage semaine = TOUS ses creneauIds → inscription tout-ou-rien.
// Réponse : { ok: true, status: "enrolled" | "already", enrolledCount }
//           ou { error, status: "full" | "missing" | "notOwned" | "badRequest" }
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth; // 401 / 403

  try {
    const body = await req.json().catch(() => ({}));
    const creneauIds: string[] = Array.isArray(body?.creneauIds)
      ? body.creneauIds.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim())
      : typeof body?.creneauId === "string" && body.creneauId.trim()
      ? [body.creneauId.trim()]
      : [];
    const childId = typeof body?.childId === "string" ? body.childId.trim() : "";
    const familyId = typeof body?.familyId === "string" ? body.familyId.trim() : "";

    if (creneauIds.length === 0 || !childId || !familyId) {
      return NextResponse.json(
        { error: "Paramètres manquants (creneauIds, childId, familyId requis).", status: "badRequest" },
        { status: 400 }
      );
    }
    if (creneauIds.length > 10) {
      return NextResponse.json(
        { error: "Trop de créneaux en une fois (max 10).", status: "badRequest" },
        { status: 400 }
      );
    }

    // ── 1. Re-résolution serveur : l'enfant appartient-il bien à la famille ? ──
    const famSnap = await adminDb.collection("families").doc(familyId).get();
    if (!famSnap.exists) {
      return NextResponse.json({ error: "Famille introuvable.", status: "notOwned" }, { status: 403 });
    }
    const family = famSnap.data() as any;
    const child = (family.children || []).find((c: any) => c?.id === childId);
    if (!child) {
      // Le childId fourni n'appartient pas à cette famille → on refuse.
      return NextResponse.json(
        { error: "Cet enfant n'appartient pas à la famille de l'expéditeur.", status: "notOwned" },
        { status: 403 }
      );
    }
    const childName = `${child.firstName || ""} ${child.lastName || ""}`.trim() || child.firstName || "";
    const familyName = family.parentName || "";

    // ── 2. Transaction TOUT-OU-RIEN sur l'ensemble des créneaux (semaine de
    //    stage = tous les jours, ou un créneau simple). On vérifie TOUT avant
    //    d'écrire quoi que ce soit : si un seul jour est complet → rien n'est
    //    inscrit (pas d'inscription partielle qu'il faudrait facturer à tort).
    const refs = creneauIds.map((cid) => adminDb.collection("creneaux").doc(cid));
    const joursData: {
      date: string; startTime: string; endTime: string; titre: string; type: string; prixTTC: number | null;
      stageGroupId: string; activityId: string; priceTTCDay: number | null; pricePerCount: Record<number, number | null>;
    }[] = [];
    const outcome = await adminDb.runTransaction(async (tx) => {
      joursData.length = 0; // la transaction peut être rejouée par Firestore
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      // Phase 1 — vérifications (aucune écriture)
      let toWrite = 0;
      for (let i = 0; i < snaps.length; i++) {
        const snap = snaps[i];
        if (!snap.exists) return { status: "missing" as const, cid: creneauIds[i] };
        const cr = snap.data() as any;
        // Données autoritaires pour la commande (prix = source créneau)
        joursData.push({
          date: cr.date || "",
          startTime: cr.startTime || "",
          endTime: cr.endTime || "",
          titre: cr.activityTitle || "",
          type: cr.activityType || "cours",
          prixTTC:
            typeof cr.priceTTC === "number"
              ? cr.priceTTC
              : typeof cr.priceHT === "number"
              ? Math.round(cr.priceHT * (1 + (cr.tvaTaux ?? 5.5) / 100) * 100) / 100
              : null,
          stageGroupId: (cr.stageGroupId || "") + "",
          activityId: (cr.activityId || "") + "",
          priceTTCDay: typeof cr.priceTTCDay === "number" && cr.priceTTCDay > 0 ? cr.priceTTCDay : null,
          pricePerCount: {
            1: typeof cr.price1day === "number" && cr.price1day > 0 ? cr.price1day : null,
            2: typeof cr.price2days === "number" && cr.price2days > 0 ? cr.price2days : null,
            3: typeof cr.price3days === "number" && cr.price3days > 0 ? cr.price3days : null,
            4: typeof cr.price4days === "number" && cr.price4days > 0 ? cr.price4days : null,
          },
        });
        const list: any[] = Array.isArray(cr.enrolled) ? cr.enrolled : [];
        if (list.some((e: any) => e.childId === childId)) continue; // déjà inscrit ce jour → ok
        const maxP = typeof cr.maxPlaces === "number" ? cr.maxPlaces : Number.POSITIVE_INFINITY;
        if (list.length >= maxP) return { status: "full" as const, cid: creneauIds[i] };
        toWrite++;
      }
      if (toWrite === 0) return { status: "already" as const, count: 0 };

      // Phase 2 — écritures (tout est validé)
      const nowIso = new Date().toISOString();
      const isStage0 = joursData.some((j) => j.type === "stage" || j.type === "stage_journee");
      const firstDate0 = [...joursData].sort((a, b) => a.date.localeCompare(b.date))[0]?.date || "";
      const stageKey0 = isStage0 ? `${joursData[0]?.titre || ""}_${firstDate0}` : null;
      for (let i = 0; i < snaps.length; i++) {
        const cr = snaps[i].data() as any;
        const list: any[] = Array.isArray(cr.enrolled) ? cr.enrolled : [];
        if (list.some((e: any) => e.childId === childId)) continue;
        const entry: any = {
          childId,
          childName,
          familyId,
          familyName,
          enrolledAt: nowIso,
          presence: null,
          // Traçabilité : inscription issue de l'assistant boîte, non encore réglée.
          source: "boite-ia",
          enrolledBy: auth.email || auth.uid || "",
        };
        if (stageKey0) entry.stageKey = stageKey0; // matching paiement précis (comme EnrollPanel)
        tx.update(refs[i], { enrolled: [...list, entry], enrolledCount: list.length + 1 });
      }
      return { status: "enrolled" as const, count: toWrite };
    });

    if (outcome.status === "missing") {
      return NextResponse.json(
        { error: "Un des créneaux est introuvable ou supprimé.", status: "missing", cid: outcome.cid },
        { status: 404 }
      );
    }
    if (outcome.status === "full") {
      return NextResponse.json(
        { error: creneauIds.length > 1 ? "Un jour de la semaine est complet — rien n'a été inscrit." : "Créneau complet.", status: "full", cid: outcome.cid },
        { status: 409 }
      );
    }
    // ── 3. COMMANDE PROFORMA (uniquement si on vient réellement d'inscrire —
    //    pas sur un "already", pour ne pas dupliquer au double-clic).
    //    Même logique que l'inscription admin : panier unique par famille.
    //    AUCUN lien de paiement envoyé ici.
    let orderInfo: { orderId: string; totalTTC: number; merged: boolean } | null = null;
    if (outcome.status === "enrolled") {
      const jours = [...joursData].sort((a, b) => a.date.localeCompare(b.date));
      const first = jours[0];
      const isStage = jours.some((j) => j.type === "stage" || j.type === "stage_journee");
      const stageKey = `${first.titre}_${first.date}`;

      // ── Prix AUTORITAIRE. Pour un stage : détecter si on inscrit la semaine
      //    complète ou un SOUS-ENSEMBLE de jours. Nombre total de jours du
      //    stage = créneaux du même lot (stageGroupId, fallback activityId+titre)
      //    dans la même semaine. Si jours inscrits < total → tarif jours :
      //    price{n}days (admin) > priceTTCDay × n > prorata semaine.
      let priceTTC = first.prixTTC ?? 0;
      let nbJoursSemaine = jours.length;
      if (isStage) {
        try {
          const monday = (() => {
            const d = new Date(first.date + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
            return d.toISOString().slice(0, 10);
          })();
          const sunday = (() => {
            const d = new Date(monday + "T12:00:00Z");
            d.setUTCDate(d.getUTCDate() + 6);
            return d.toISOString().slice(0, 10);
          })();
          let groupSnap;
          if (first.stageGroupId) {
            groupSnap = await adminDb.collection("creneaux").where("stageGroupId", "==", first.stageGroupId).get();
          } else if (first.activityId) {
            groupSnap = await adminDb.collection("creneaux").where("activityId", "==", first.activityId).get();
          }
          if (groupSnap) {
            const weekDates = new Set<string>();
            groupSnap.forEach((d) => {
              const c = d.data() as any;
              if (c.date >= monday && c.date <= sunday && (c.activityTitle || "") === first.titre) weekDates.add(c.date);
            });
            if (weekDates.size > 0) nbJoursSemaine = Math.max(weekDates.size, jours.length);
          }
        } catch {
          /* fallback : nbJoursSemaine = jours inscrits (prix semaine) */
        }
        if (jours.length < nbJoursSemaine) {
          const n = jours.length;
          const pc = first.pricePerCount?.[n];
          priceTTC =
            typeof pc === "number" && pc > 0
              ? pc
              : first.priceTTCDay
              ? Math.round(first.priceTTCDay * n * 100) / 100
              : first.prixTTC
              ? Math.round((first.prixTTC / nbJoursSemaine) * n * 100) / 100
              : 0;
        }
      }
      const modeJours = isStage && jours.length < nbJoursSemaine;
      const scheduleDesc = formatStageSchedule(jours.map((j) => ({ date: j.date, startTime: j.startTime, endTime: j.endTime })));

      const item = {
        activityTitle: isStage
          ? `${first.titre} (${jours.length}j${modeJours ? `/${nbJoursSemaine}` : ""}) — ${childName}`
          : `${first.titre} — ${childName}`,
        childId,
        childName,
        stageKey,
        activityType: first.type,
        stageSchedule: scheduleDesc,
        stageDates: jours.map((j) => ({ date: j.date, startTime: j.startTime, endTime: j.endTime })),
        priceHT: Math.round((priceTTC / 1.055) * 100) / 100,
        tva: 5.5,
        priceTTC,
      };

      try {
        // Panier unique : fusionner dans la commande pending la plus récente
        // de la famille (hors échéanciers), sinon créer.
        const pendSnap = await adminDb
          .collection("payments")
          .where("familyId", "==", familyId)
          .where("status", "==", "pending")
          .get();
        const pendingDocs = pendSnap.docs
          .filter((d) => !((d.data() as any).echeancesTotal > 1))
          .sort((a, b) => ((b.data() as any).date?.seconds || 0) - ((a.data() as any).date?.seconds || 0));
        const openOrder = pendingDocs.length > 0 ? pendingDocs[0] : null;

        const ACOMPTE_PAR_ENFANT = 30;
        if (openOrder) {
          const existing = openOrder.data() as any;
          // Ne pas dupliquer l'item si exactement le même (enfant + stageKey) existe déjà.
          const items: any[] = Array.isArray(existing.items) ? existing.items : [];
          const dup = items.some((i: any) => i.childId === childId && i.stageKey === stageKey);
          const mergedItems = dup ? items : [...items, item];
          const mergedTotal = Math.round(mergedItems.reduce((s: number, i: any) => s + (i.priceTTC || 0), 0) * 100) / 100;
          const nbStageItems = mergedItems.filter((i: any) => i.activityType === "stage" || i.activityType === "stage_journee").length;
          await openOrder.ref.update({
            items: mergedItems,
            totalTTC: mergedTotal,
            stageDate: existing.stageDate || first.date,
            stageTitle: existing.stageTitle || first.titre,
            ...(nbStageItems > 0 && mergedTotal > ACOMPTE_PAR_ENFANT * nbStageItems
              ? {
                  acompteAmount: ACOMPTE_PAR_ENFANT * nbStageItems,
                  soldeAmount: Math.round((mergedTotal - ACOMPTE_PAR_ENFANT * nbStageItems) * 100) / 100,
                }
              : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });
          orderInfo = { orderId: existing.orderId || openOrder.id, totalTTC: mergedTotal, merged: true };
          console.log(`[inbox-enroll] commande FUSIONNÉE ${orderInfo.orderId} — total ${mergedTotal} € (famille ${familyId}, enfant ${childName})`);
        } else {
          const famEmail = (family.parentEmail || "").trim();
          const showAcompte = isStage && priceTTC > ACOMPTE_PAR_ENFANT;
          const orderId = generateOrderId();
          await adminDb.collection("payments").add({
            orderId,
            familyId,
            familyName,
            familyEmail: famEmail,
            items: [item],
            totalTTC: priceTTC,
            paymentMode: "",
            paymentRef: "",
            status: "pending",
            paidAmount: 0,
            stageDate: first.date,
            stageTitle: first.titre,
            ...(showAcompte
              ? { acompteAmount: ACOMPTE_PAR_ENFANT, soldeAmount: Math.round((priceTTC - ACOMPTE_PAR_ENFANT) * 100) / 100 }
              : {}),
            source: "boite-ia",
            date: FieldValue.serverTimestamp(),
          });
          orderInfo = { orderId, totalTTC: priceTTC, merged: false };
          console.log(`[inbox-enroll] commande CRÉÉE ${orderId} — ${priceTTC} € (famille ${familyId}, enfant ${childName}, ${jours.length} jour(s)${modeJours ? ` sur ${nbJoursSemaine}` : ""})`);
        }
      } catch (e) {
        // L'inscription est faite ; la commande a échoué → on le DIT à l'admin
        // (pas d'échec silencieux) pour qu'il crée la commande à la main.
        console.error("[inbox-enroll] commande proforma échouée:", e);
        return NextResponse.json({
          ok: true,
          status: outcome.status,
          childName,
          creneauIds,
          enrolledCount: outcome.count ?? 0,
          orderError: "Inscription faite, mais la commande n'a pas pu être créée — à créer manuellement dans Paiements.",
        });
      }
    }

    // "enrolled" ou "already" → succès
    return NextResponse.json({
      ok: true,
      status: outcome.status,
      childName,
      creneauIds,
      enrolledCount: outcome.count ?? 0,
      order: orderInfo,
    });
  } catch (e: any) {
    console.error("[inbox-enroll]", e);
    return NextResponse.json({ error: e?.message || "Erreur serveur", status: "error" }, { status: 500 });
  }
}
