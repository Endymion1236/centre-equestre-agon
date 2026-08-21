/**
 * Balade sous le minimum — choix de la famille (public, sécurisé par token).
 *
 * GET  /api/public/balade-choix?token=XXX
 *   -> infos d'affichage : balade, cavaliers, supplément, statut, et le
 *      nombre d'inscrits ACTUEL (si le minimum a été atteint entre-temps,
 *      la page annonce que la balade est maintenue sans supplément).
 *
 * POST /api/public/balade-choix   body: { token, choice }
 *   choice = "supplement" -> crée la commande du supplément + session de
 *            paiement CAWL, renvoie { url } vers laquelle rediriger.
 *            L'encaissement suit ensuite le circuit standard
 *            (/api/cawl/status + webhook : payment soldé, encaissement,
 *            email de confirmation).
 *   choice = "report"     -> enregistre la demande, le club recontacte.
 *   choice = "avoir"      -> désinscrit les cavaliers de la famille du
 *            créneau, annule les réservations, crée un avoir du montant
 *            payé (fusionné avec les avoirs actifs, même règle que le
 *            reste du back-office), notifie le club.
 *
 * Sécurité : le token est l'id (non devinable) du doc `balade-petit-groupe`
 * créé par le cron. Le serveur ne fait confiance qu'à ce doc : le client ne
 * fournit AUCUN montant, aucun identifiant de famille ou de créneau.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cawlSdk, CAWL_PSPID } from "@/lib/cawl";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, blockedLog, refreshEmailMode } from "@/lib/email-guard";
import { emailLayout } from "@/lib/email-templates";
import { todayLocalString } from "@/lib/date-local";
import {
  BALADE_CHOIX_COLLECTION,
  adresseClub,
  compterInscritsConfirmes,
  formatDateBalade,
} from "@/lib/balade-petit-groupe";

export const dynamic = "force-dynamic";

// ── Notification interne au club (destinataire fixé serveur) ──────────────
async function notifierClub(titre: string, lignes: string[], familyId?: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const to = adresseClub();
  await refreshEmailMode();
  if (!isRecipientAllowed(to)) { console.warn(blockedLog(to, "balade_choix_club")); return; }
  const echappe = (s: string) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = emailLayout(
    `<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1e293b;">${echappe(titre)}</p>` +
    lignes.map((l) => `<p style="margin:0 0 6px;font-size:14px;color:#334155;">${echappe(l)}</p>`).join("")
  );
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
        to,
        subject: titre.slice(0, 200),
        html,
      }),
    });
    await logEmail({
      to, subject: titre, context: "balade_choix", template: "baladeChoixClub",
      status: r.ok ? "sent" : "failed", sentBy: "system", familyId,
      ...(r.ok ? {} : { error: `HTTP ${r.status}` }),
    }).catch(() => {});
  } catch (e) {
    console.error("[balade-choix] notification club:", e);
  }
}

// ── GET : infos pour la page publique ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });

  const snap = await adminDb.collection(BALADE_CHOIX_COLLECTION).doc(token).get();
  if (!snap.exists) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const d = snap.data() as any;

  // Situation ACTUELLE du créneau : d'autres cavaliers ont pu s'inscrire
  // (ou se désinscrire) depuis l'envoi de l'email.
  let inscritsActuels = d.inscritsAuMomentEnvoi || 0;
  try {
    const crSnap = await adminDb.collection("creneaux").doc(d.creneauId).get();
    if (crSnap.exists) inscritsActuels = compterInscritsConfirmes(crSnap.data() as any);
  } catch {}

  // Statut effectif du paiement du supplément (le circuit CAWL met à jour le
  // payment, pas ce doc — on reflète ici sans double écriture).
  let supplementPaye = false;
  if (d.status === "supplement_choisi" && d.paymentId) {
    try {
      const paySnap = await adminDb.collection("payments").doc(d.paymentId).get();
      supplementPaye = paySnap.exists && (paySnap.data() as any).status === "paid";
    } catch {}
  }

  return NextResponse.json({
    activityTitle: d.activityTitle || "Balade",
    date: d.date,
    dateLabel: formatDateBalade(d.date),
    startTime: d.startTime,
    endTime: d.endTime,
    childrenNames: (d.children || []).map((c: any) => c.childName).filter(Boolean),
    minParticipants: d.minParticipants,
    inscritsActuels,
    minimumAtteint: inscritsActuels >= d.minParticipants,
    supplementParCavalier: d.supplementParCavalier || 0,
    supplementTotal: d.supplementTotal || 0,
    status: d.status,
    supplementPaye,
    avoirAmount: d.avoirAmount ?? null,
    expiree: d.date < todayLocalString(),
  });
}

// ── POST : enregistrer le choix ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "json invalide" }, { status: 400 }); }
  const token = String(body?.token || "");
  const choice = String(body?.choice || "");
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });
  if (!["supplement", "report", "avoir"].includes(choice)) {
    return NextResponse.json({ error: "choix inconnu" }, { status: 400 });
  }

  const ref = adminDb.collection(BALADE_CHOIX_COLLECTION).doc(token);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const d = snap.data() as any;

  if (d.date < todayLocalString()) {
    return NextResponse.json({ error: "La balade est passée — ce lien a expiré." }, { status: 410 });
  }

  // Reprise autorisée d'un seul cas : relancer le paiement d'un supplément
  // déjà choisi mais non abouti (session CAWL abandonnée/expirée).
  const repriseSupplement = choice === "supplement" && d.status === "supplement_choisi";
  if (d.status !== "attente" && !repriseSupplement) {
    return NextResponse.json({ error: "Un choix a déjà été enregistré.", status: d.status }, { status: 409 });
  }

  const dateLabel = formatDateBalade(d.date);
  const cavaliers = (d.children || []).map((c: any) => c.childName).filter(Boolean).join(", ");
  const enTete = `${d.activityTitle} du ${dateLabel} ${d.startTime}–${d.endTime}`;

  // ════ Choix 1 : maintien avec supplément (paiement en ligne) ════
  if (choice === "supplement") {
    if (!(d.supplementParCavalier > 0)) {
      return NextResponse.json({ error: "Aucun supplément n'est proposé pour cette balade." }, { status: 400 });
    }
    if (!CAWL_PSPID) {
      return NextResponse.json({ error: "Paiement en ligne indisponible — contactez le club." }, { status: 500 });
    }

    // Commande du supplément : créée une seule fois, réutilisée en cas de
    // nouvelle tentative de paiement.
    let paymentId: string = d.paymentId || "";
    if (paymentId) {
      const paySnap = await adminDb.collection("payments").doc(paymentId).get();
      if (paySnap.exists && (paySnap.data() as any).status === "paid") {
        return NextResponse.json({ error: "Le supplément est déjà réglé.", status: "supplement_choisi", supplementPaye: true }, { status: 409 });
      }
      if (!paySnap.exists) paymentId = "";
    }
    const tva = 5.5;
    if (!paymentId) {
      const payRef = await adminDb.collection("payments").add({
        familyId: d.familyId,
        familyName: d.familyName || "",
        familyEmail: d.familyEmail || "",
        items: (d.children || []).map((ch: any) => ({
          activityTitle: `Supplément petit comité — ${d.activityTitle} (${dateLabel}) — ${ch.childName}`,
          childId: ch.childId,
          childName: ch.childName,
          creneauId: d.creneauId,
          activityType: "balade",
          priceHT: Math.round((d.supplementParCavalier / (1 + tva / 100)) * 100) / 100,
          tva,
          priceTTC: d.supplementParCavalier,
          date: d.date,
          startTime: d.startTime || null,
          endTime: d.endTime || null,
          monitor: null,
        })),
        totalTTC: d.supplementTotal,
        paymentMode: "", paymentRef: "",
        status: "pending", paidAmount: 0,
        source: "balade-petit-groupe",
        baladeChoixToken: token,
        date: FieldValue.serverTimestamp(),
      });
      paymentId = payRef.id;
    }

    // Session Hosted Checkout CAWL — même circuit de retour que le checkout
    // standard : /api/cawl/status solde le payment, encaisse et confirme.
    const totalCents = Math.round(d.supplementTotal * 100);
    const merchantRef = `CE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const origin = req.nextUrl.origin;
    const returnUrl = `${origin}/api/cawl/status?ref=${merchantRef}&paymentId=${paymentId}&familyId=${d.familyId}&deposit=0`;

    let response: any;
    try {
      response = await cawlSdk.hostedCheckout.createHostedCheckout(CAWL_PSPID, {
        order: {
          amountOfMoney: { amount: totalCents, currencyCode: "EUR" },
          customer: {
            merchantCustomerId: d.familyId,
            contactDetails: { emailAddress: d.familyEmail || "" },
            personalInformation: {
              name: {
                firstName: (d.familyName || "").split(" ")[0] || "",
                surname: (d.familyName || "").split(" ").slice(1).join(" ") || d.familyName || "",
              },
            },
          },
          references: {
            merchantReference: merchantRef,
            descriptor: `Supplément petit comité — ${d.activityTitle}`.substring(0, 256),
          },
        },
        hostedCheckoutSpecificInput: { returnUrl, locale: "fr_FR", showResultPage: false },
        // SALE = autorisation + capture immédiate (cf. /api/cawl/checkout).
        cardPaymentMethodSpecificInput: { authorizationMode: "SALE" },
      }, {});
    } catch (e: any) {
      console.error("[balade-choix] CAWL createHostedCheckout:", e);
      return NextResponse.json({ error: "Le paiement en ligne est momentanément indisponible. Réessayez ou contactez le club." }, { status: 500 });
    }

    const hostedCheckoutId = response.body.hostedCheckoutId || "";
    const partialRedirectUrl = response.body.partialRedirectUrl || "";
    const baseUrl = process.env.CAWL_ENV === "production"
      ? "https://payment.ca.cawl-solutions.fr"
      : "https://payment.preprod.ca.cawl-solutions.fr";
    const redirectUrl = response.body.redirectUrl
      || (partialRedirectUrl ? `${baseUrl}/${partialRedirectUrl}` : null);
    if (!redirectUrl) {
      console.error("[balade-choix] CAWL sans URL de redirection:", response.body);
      return NextResponse.json({ error: "Le paiement en ligne est momentanément indisponible." }, { status: 500 });
    }

    if (hostedCheckoutId) {
      // Nécessaire à la vérification RETURNMAC au retour du paiement.
      await adminDb.collection("cawl_sessions").doc(hostedCheckoutId).set({
        hostedCheckoutId,
        returnMac: response.body.RETURNMAC || "",
        merchantRef,
        familyId: d.familyId,
        paymentId,
        totalCents,
        isDeposit: false,
        depositPercent: 0,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).catch((e: any) => console.error("[balade-choix] cawl_sessions:", e));
    }
    await adminDb.collection("payments").doc(paymentId).update({
      cawlRef: merchantRef,
      cawlHostedCheckoutId: hostedCheckoutId,
      cawlInitiatedAt: FieldValue.serverTimestamp(),
    }).catch(() => {});

    await ref.update({
      status: "supplement_choisi",
      paymentId,
      choiceAt: d.choiceAt || new Date().toISOString(),
    });

    if (!repriseSupplement) {
      await notifierClub(
        `🐴 Balade maintenue en petit comité — ${enTete}`,
        [
          `${d.familyName || d.familyId} (${cavaliers}) a choisi de MAINTENIR la balade avec le supplément.`,
          `Supplément : ${d.supplementParCavalier.toFixed(2)}€ × ${(d.children || []).length} = ${d.supplementTotal.toFixed(2)}€ — paiement CB en cours.`,
        ],
        d.familyId
      );
    }

    return NextResponse.json({ ok: true, url: redirectUrl });
  }

  // ════ Choix 2 : report à une autre date ════
  if (choice === "report") {
    await ref.update({ status: "report", choiceAt: new Date().toISOString() });
    await notifierClub(
      `📅 Demande de report — ${enTete}`,
      [
        `${d.familyName || d.familyId} (${cavaliers}) souhaite REPORTER la balade à une autre date.`,
        `Contact : ${d.familyEmail || "email inconnu"} — merci de proposer une nouvelle date puis de déplacer l'inscription depuis le planning.`,
      ],
      d.familyId
    );
    return NextResponse.json({ ok: true, status: "report" });
  }

  // ════ Choix 3 : annulation avec avoir ════
  // 1) Désinscription atomique du créneau + verrou sur le doc de choix
  //    (empêche un double-clic de créer deux avoirs).
  const childIds = new Set((d.children || []).map((c: any) => c.childId).filter(Boolean));
  try {
    await adminDb.runTransaction(async (tx) => {
      const choixSnap = await tx.get(ref);
      if ((choixSnap.data() as any)?.status !== "attente") throw new Error("DEJA_TRAITE");
      const crRef = adminDb.collection("creneaux").doc(d.creneauId);
      const crSnap = await tx.get(crRef);
      if (crSnap.exists) {
        const list: any[] = (crSnap.data() as any).enrolled || [];
        const rest = list.filter((e: any) => !(e.familyId === d.familyId && childIds.has(e.childId)));
        tx.update(crRef, { enrolled: rest, enrolledCount: rest.length });
      }
      tx.update(ref, { status: "avoir", choiceAt: new Date().toISOString() });
    });
  } catch (e: any) {
    if (e?.message === "DEJA_TRAITE") {
      return NextResponse.json({ error: "Un choix a déjà été enregistré.", status: "avoir" }, { status: 409 });
    }
    console.error("[balade-choix] transaction avoir:", e);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }

  // 2) Annuler les réservations (requête par familyId seul + filtre mémoire :
  //    même approche que discounts.ts, pas d'index composite requis).
  try {
    const resSnap = await adminDb.collection("reservations")
      .where("familyId", "==", d.familyId).get();
    for (const rd of resSnap.docs) {
      const r = rd.data() as any;
      if (r.creneauId !== d.creneauId || !childIds.has(r.childId)) continue;
      if (r.status === "cancelled") continue;
      await adminDb.collection("reservations").doc(rd.id).update({
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelReason: "Balade sous le minimum de participants — avoir choisi par la famille",
      });
    }
  } catch (e) {
    console.error("[balade-choix] annulation réservations:", e);
  }

  // 3) Montant de l'avoir : uniquement ce qui a été réellement ENCAISSÉ pour
  //    cette balade (items des payments paid/partial de la famille pointant
  //    ce créneau). Une place réglée par chèque non encaissé ne génère pas
  //    d'avoir automatique — le club est notifié pour arbitrer.
  let montantPaye = 0;
  try {
    const paySnap = await adminDb.collection("payments")
      .where("familyId", "==", d.familyId).get();
    for (const pd of paySnap.docs) {
      const p = pd.data() as any;
      if (!["paid", "partial"].includes(p.status)) continue;
      for (const it of (p.items || [])) {
        if (it.creneauId === d.creneauId && childIds.has(it.childId)) {
          montantPaye += Number(it.priceTTC) || 0;
        }
      }
    }
    montantPaye = Math.round(montantPaye * 100) / 100;
  } catch (e) {
    console.error("[balade-choix] recherche paiements:", e);
  }

  let avoirId: string | null = null;
  let avoirRefStr = "";
  if (montantPaye > 0) {
    // Fusion silencieuse avec les avoirs actifs — même règle que le reste du
    // back-office (cf. /api/admin/unenroll-annual) : jamais 2 avoirs actifs
    // sur la même famille. Requête par familyId seul, filtre statut en
    // mémoire (pas d'index composite).
    let mergedAmount = 0;
    const toMerge: { id: string; data: any }[] = [];
    try {
      const avSnap = await adminDb.collection("avoirs")
        .where("familyId", "==", d.familyId).get();
      for (const ad of avSnap.docs) {
        const a = ad.data() as any;
        if (!["actif", "actif_partiel"].includes(a.status)) continue;
        const remaining = Math.round((a.remainingAmount || 0) * 100) / 100;
        if (remaining <= 0) continue;
        mergedAmount += remaining;
        toMerge.push({ id: ad.id, data: a });
      }
    } catch (e) {
      console.warn("[balade-choix] lecture avoirs actifs:", e);
    }

    const finalAmount = Math.round((montantPaye + mergedAmount) * 100) / 100;
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    avoirRefStr = `AV-${Date.now().toString(36).toUpperCase()}`;

    const avoirRef = await adminDb.collection("avoirs").add({
      familyId: d.familyId,
      familyName: d.familyName || "",
      type: "avoir",
      amount: finalAmount,
      usedAmount: 0,
      remainingAmount: finalAmount,
      reason: `Balade annulée (moins de ${d.minParticipants} participants) — ${d.activityTitle} du ${dateLabel}${cavaliers ? ` — ${cavaliers}` : ""}`,
      reference: avoirRefStr,
      expiryDate: expiryDate.toISOString(),
      status: "actif",
      usageHistory: [],
      _audit: {
        source: "balade-petit-groupe",
        baladeChoixToken: token,
        creneauId: d.creneauId,
        montantBalade: montantPaye,
        ...(toMerge.length > 0 ? {
          mergedAt: new Date().toISOString(),
          mergedAmount,
          newAmount: montantPaye,
          mergedFrom: toMerge.map((m) => ({
            avoirId: m.id,
            reference: m.data.reference || "",
            remaining: m.data.remainingAmount || 0,
            reason: m.data.reason || "",
          })),
        } : {}),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    avoirId = avoirRef.id;

    for (const m of toMerge) {
      await adminDb.collection("avoirs").doc(m.id).update({
        status: "fusionne",
        remainingAmount: 0,
        mergedInto: avoirId,
        mergedIntoRef: avoirRefStr,
        mergedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch((e: any) => console.warn("[balade-choix] fusion avoir:", m.id, e));
    }
  }

  await ref.update({ avoirId, avoirAmount: montantPaye });

  await notifierClub(
    `💶 Annulation avec avoir — ${enTete}`,
    [
      `${d.familyName || d.familyId} (${cavaliers}) a choisi l'ANNULATION avec avoir.`,
      `Cavaliers désinscrits du créneau, réservations annulées.`,
      montantPaye > 0
        ? `Avoir ${avoirRefStr} créé : ${montantPaye.toFixed(2)}€ (fusionné avec les avoirs actifs le cas échéant).`
        : `⚠️ Aucun paiement en ligne encaissé retrouvé pour cette balade — aucun avoir créé automatiquement, à vérifier (chèque/espèces ?).`,
    ],
    d.familyId
  );

  return NextResponse.json({ ok: true, status: "avoir", avoirAmount: montantPaye });
}
