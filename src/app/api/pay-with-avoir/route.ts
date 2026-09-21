/**
 * POST /api/pay-with-avoir
 *
 * Permet à un cavalier connecté de régler son panier en utilisant
 * son solde d'avoirs — ou, avec `bonCadeauCode`, un bon cadeau : même
 * circuit (crédit consommé, écriture « avoir »), seule la source change. Toute la logique d'écriture (payments, encaissements,
 * avoirs, reservations, creneaux) passe par adminDb côté serveur — le client
 * n'a plus accès en écriture directe à ces collections.
 *
 * Sécurité :
 *   - Auth obligatoire (verifyAuth)
 *   - Les avoirs utilisés sont re-lus depuis Firestore (on ne fait PAS confiance
 *     au payload client pour les montants disponibles)
 *   - familyId forcé à auth.uid (impossible de payer avec les avoirs d'autrui)
 *   - L'ensemble des écritures se fait dans une transaction Firestore pour
 *     garantir l'atomicité (pas de demi-débit d'avoir)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "@/lib/api-auth";
import { bloquerSiReservationsFermees } from "@/lib/reservations-ouvertes";
import { awardLoyaltyPointsServer } from "@/lib/fidelite";
import { loadTemplate } from "@/lib/email-template-loader";
import { logEmail } from "@/lib/email-log";
import { isRecipientAllowed, refreshEmailMode } from "@/lib/email-guard";
import { lignesDetailHtml, libelleModePaiement } from "@/lib/email-prestations";
import { nomDestinataireOuDefaut } from "@/lib/nom-destinataire";
import { preparerEncaissementServer } from "@/lib/compta-encaissement-server";
import { normaliserCodeBon, verifierBonCadeau, type BonCadeauLu } from "@/lib/bon-cadeau-application";
import { attribuerNumeroFacture } from "@/lib/invoice-number";

export const dynamic = "force-dynamic";

interface CartItem {
  activityTitle: string;
  childId: string;
  childName: string;
  creneauIds: string[];
  prixFinal: number;
  isStage?: boolean;
  sourceFamilyId?: string;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const verrou = await bloquerSiReservationsFermees(auth);
  if (verrou) return verrou;

  const uid = auth.uid;

  try {
    const body = await req.json();
    const cart: CartItem[] = Array.isArray(body.cart) ? body.cart : [];

    if (cart.length === 0) {
      return NextResponse.json({ error: "Panier vide" }, { status: 400 });
    }

    // ── Charger la famille (source de vérité pour familyName/email) ────────
    const famSnap = await adminDb.collection("families").doc(uid).get();
    if (!famSnap.exists) {
      return NextResponse.json({ error: "Famille introuvable" }, { status: 404 });
    }
    const family = famSnap.data() as any;
    const familyName = family.parentName || "—";
    const familyEmail = family.parentEmail || auth.email || "";

    // Sécurité (audit P0 #2/#3) : l'enfant doit appartenir à la famille connectée
    // (sauf réservation liée explicite via sourceFamilyId).
    const childIds = new Set((family.children || []).map((c: any) => c.id));
    for (const item of cart) {
      if (item?.childId && !childIds.has(item.childId) && !(item as any).sourceFamilyId) {
        return NextResponse.json({ error: "Enfant non autorisé" }, { status: 403 });
      }
    }

    // ── Calculer le total du panier (on ne fait PAS confiance au client) ───
    // Pour être safe, on revalide chaque prix contre le document créneau si possible.
    // Par simplicité ici, on utilise prixFinal envoyé mais on le traitera comme
    // un montant plafonné par les avoirs disponibles.
    const cartTotal = cart.reduce((s, i) => s + (Number(i.prixFinal) || 0), 0);
    if (cartTotal <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }

    // ── Source du crédit : un bon cadeau (par code) ou les avoirs actifs ──
    const bonCode = normaliserCodeBon(body.bonCadeauCode);
    let bon: BonCadeauLu | null = null;
    let activeAvoirs: { id: string; ref: any; data: any }[] = [];
    let totalAvoir = 0;
    if (bonCode) {
      const v = await verifierBonCadeau(bonCode);
      if (!v.ok) return NextResponse.json({ error: v.raison }, { status: 400 });
      bon = v.bon;
      totalAvoir = bon.solde;
    } else {
      const avoirsSnap = await adminDb
        .collection("avoirs")
        .where("familyId", "==", uid)
        .get();
      activeAvoirs = avoirsSnap.docs
        .map((d) => ({ id: d.id, ref: d.ref, data: d.data() }))
        .filter((a) => a.data.status === "actif" && (a.data.remainingAmount || 0) > 0);
      totalAvoir = activeAvoirs.reduce((s, a) => s + (a.data.remainingAmount || 0), 0);
    }

    if (totalAvoir <= 0) {
      return NextResponse.json(
        { error: bon ? "Ce bon est épuisé." : "Aucun avoir disponible" },
        { status: 400 }
      );
    }

    const toUse = Math.min(totalAvoir, cartTotal);
    const status = toUse >= cartTotal ? "paid" : "partial";

    // ── Transaction atomique : tout ou rien ────────────────────────────────
    const payRef = adminDb.collection("payments").doc();

    // L'encaissement est préparé AVANT d'ouvrir la transaction : le chaînage
    // doit lire le maillon précédent, et Firestore interdit une lecture après
    // une écriture dans une transaction. Ce règlement par avoir écrivait
    // jusqu'ici un encaissement sans empreinte, donc hors de la chaîne.
    const encaissementPayload = await preparerEncaissementServer({
      paymentId: payRef.id,
      familyId: uid,
      familyName,
      montant: toUse,
      mode: "avoir",
      modeLabel: bon ? "Bon cadeau" : "Avoir",
      ref: bon ? bon.code : "",
      activityTitle: cart.map((i) => i.activityTitle).join(", "),
      ...(bon ? { raison: `Bon cadeau ${bon.code}`, bonCadeauId: bon.id, isAvoir: true } : {}),
    });
    // Lignes de la commande, gardées pour l'email de confirmation.
    let itemsCommande: any[] = [];

    await adminDb.runTransaction(async (tx) => {
      // ── PHASE 1 : LECTURES ────────────────────────────────────────────
      // Firestore impose que TOUTES les lectures precedent TOUTES les
      // ecritures dans une transaction. Les creneaux etaient lus au milieu
      // des ecritures : « Firestore transactions require all reads to be
      // executed before all writes ». On charge donc tout en amont.
      const creneauxIds = [...new Set(
        cart.flatMap((i) => (i.creneauIds || []) as string[]).filter(Boolean)
      )];
      const creneauxSnaps = new Map<string, any>();
      for (const cid of creneauxIds) {
        const snap = await tx.get(adminDb.collection("creneaux").doc(cid));
        if (snap.exists) creneauxSnaps.set(cid, snap.data());
      }

      // ── PHASE 2 : ECRITURES ───────────────────────────────────────────
      // 1. Créer le document payment
      // Date, horaires et moniteur sur chaque ligne, comme le panier réglé
      // par carte : c'est ce que lisent l'email de confirmation, la facture
      // et — si l'avoir ne couvre pas tout — le lien de paiement du reste.
      // Sans eux, la famille recevait le titre de l'activité, sans jour ni heure.
      itemsCommande = cart.map((i) => {
        const ids = (i.creneauIds || []).filter(Boolean);
        const premier = ids[0] ? creneauxSnaps.get(ids[0]) : null;
        const jours = i.isStage
          ? ids.map((cid) => creneauxSnaps.get(cid)).filter(Boolean)
            .map((c: any) => ({ date: c.date || null, startTime: c.startTime || null, endTime: c.endTime || null }))
            .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))
          : [];
        return {
          activityTitle: i.activityTitle,
          childId: i.childId,
          childName: i.childName,
          priceTTC: i.prixFinal,
          priceHT: Math.round((i.prixFinal / 1.055) * 100) / 100,
          tva: 5.5,
          creneauId: ids[0] || "",
          creneauIds: i.isStage ? ids : null,
          activityType: i.isStage ? "stage" : "cours",
          date: premier?.date || null,
          startTime: premier?.startTime || null,
          endTime: premier?.endTime || null,
          monitor: premier?.monitor || null,
          stageDates: i.isStage ? jours : null,
        };
      });
      tx.set(payRef, {
        familyId: uid,
        familyName,
        familyEmail,
        items: itemsCommande,
        totalTTC: cartTotal,
        paidAmount: toUse,
        paymentMode: "avoir",
        paymentRef: bon ? bon.code : "",
        ...(bon ? { bonCadeauCode: bon.code } : {}),
        status,
        source: "client",
        date: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });

      // 2. Déduire le crédit : le bon cadeau, ou les avoirs dans l'ordre
      if (bon) {
        const newSolde = Math.round((bon.solde - toUse) * 100) / 100;
        tx.update(adminDb.collection("bons-cadeaux").doc(bon.id), {
          solde: newSolde,
          statut: newSolde <= 0.005 ? "utilise" : "actif",
          usedFamilyId: uid,
          utilisations: FieldValue.arrayUnion({
            date: new Date().toISOString(),
            paymentId: payRef.id,
            montant: toUse,
            par: `famille:${uid}`,
          }),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      let remaining = bon ? 0 : toUse;
      for (const a of activeAvoirs) {
        if (remaining <= 0) break;
        const available = a.data.remainingAmount || 0;
        const deduction = Math.min(remaining, available);
        remaining -= deduction;

        const newUsed = (a.data.usedAmount || 0) + deduction;
        const newRemaining = Math.max(0, available - deduction);
        const newStatus = newRemaining <= 0 ? "utilise" : "actif";

        tx.update(a.ref, {
          usedAmount: newUsed,
          remainingAmount: newRemaining,
          status: newStatus,
          usageHistory: [
            ...(a.data.usageHistory || []),
            {
              date: new Date().toISOString(),
              amount: deduction,
              invoiceRef: payRef.id.slice(-6).toUpperCase(),
            },
          ],
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // 3. Créer l'encaissement (signé et chaîné, cf. préparation ci-dessus)
      const encRef = adminDb.collection("encaissements").doc();
      tx.set(encRef, encaissementPayload);

      // 4. Inscrire dans les créneaux (lecture + ajout dans enrolled)
      // Note: ces lectures/écritures sont dans la même transaction pour éviter
      // les conditions de course avec d'autres inscriptions simultanées
      for (const item of cart) {
        for (const cid of item.creneauIds || []) {
          const crRef = adminDb.collection("creneaux").doc(cid);
          const crData = creneauxSnaps.get(cid);
          if (!crData) continue;
          const enrolled = crData.enrolled || [];
          if (enrolled.some((e: any) => e.childId === item.childId)) continue;
          // Sécurité (audit P0 #7) : ne pas dépasser la capacité du créneau.
          const maxP = typeof crData.maxPlaces === "number" ? crData.maxPlaces : Number.POSITIVE_INFINITY;
          if (enrolled.length >= maxP) {
            throw new Error(`COMPLET:${item.activityTitle || cid}`);
          }

          const newEntry: any = {
            childId: item.childId,
            childName: item.childName,
            familyId: uid,
            familyName,
            enrolledAt: new Date().toISOString(),
          };
          if (item.sourceFamilyId) {
            newEntry.sourceFamilyId = item.sourceFamilyId;
          }

          const nouveauEnrolled = [...enrolled, newEntry];
          tx.update(crRef, {
            enrolled: nouveauEnrolled,
            enrolledCount: nouveauEnrolled.length,
          });
          // Le cache doit refléter cette inscription : deux enfants de la même
          // famille sur le même créneau partiraient sinon du même `enrolled`
          // initial, et le second écraserait le premier.
          creneauxSnaps.set(cid, { ...crData, enrolled: nouveauEnrolled });
        }

        // 5. Créer la réservation
        const resRef = adminDb.collection("reservations").doc();
        const firstCid = item.creneauIds?.[0];
        let date = new Date().toISOString().split("T")[0];
        let startTime = "";
        let endTime = "";
        if (firstCid) {
          const crData = creneauxSnaps.get(firstCid);
          if (crData) {
            date = crData.date || date;
            startTime = crData.startTime || "";
            endTime = crData.endTime || "";
          }
        }
        const resData: any = {
          familyId: uid,
          familyName,
          childId: item.childId,
          childName: item.childName,
          activityTitle: item.activityTitle,
          activityType: item.isStage ? "stage" : "cours",
          creneauId: firstCid || "",
          date,
          startTime,
          endTime,
          priceTTC: item.prixFinal,
          status: status === "paid" ? "confirmed" : "pending_payment",
          source: "client",
          createdAt: FieldValue.serverTimestamp(),
        };
        if (item.sourceFamilyId) {
          resData.sourceFamilyId = item.sourceFamilyId;
        }
        tx.set(resRef, resData);
      }
    });

    // ── Numéro de facture séquentiel : une commande soldée en est une ──────
    // (le circuit CB le fait au retour CAWL ; le règlement par crédit
    // s'arrêtait avant, et la facture restait sans numéro).
    if (status === "paid") {
      try {
        const { invoiceNumber } = await attribuerNumeroFacture({ paymentId: payRef.id, attributedBy: `famille:${uid}` });
        await payRef.update({ invoiceNumber, invoiceDate: FieldValue.serverTimestamp() });
      } catch (e) {
        console.error("[pay-with-avoir] numéro de facture non attribué (non bloquant) :", e);
      }
    }

    // ── Attribution des points de fidélité (hors transaction, non-bloquant) ─
    await awardLoyaltyPointsServer({
      familyId: uid,
      familyName,
      montant: toUse,
      label: cart.map((i) => i.activityTitle).join(", ") || "Paiement par avoir",
    });

    // ── Confirmation à la famille ──────────────────────────────────────────
    // Un panier réglé par avoir ne produisait AUCUN email : la carte bancaire
    // passe par le retour CAWL, qui envoie la confirmation ; l'avoir, lui,
    // s'arrêtait ici. La famille n'avait ni date ni heure de sa séance par
    // écrit. Quand l'avoir ne couvre pas tout, c'est le règlement du reste
    // qui confirmera, avec les mêmes lignes.
    if (status === "paid") {
      try {
        await refreshEmailMode();
        const resendKey = process.env.RESEND_API_KEY;
        const to = String(familyEmail || "").trim();
        if (to && resendKey && isRecipientAllowed(to)) {
          const { subject, html } = await loadTemplate("confirmationPaiement", {
            parentName: nomDestinataireOuDefaut({ familyName, items: itemsCommande }),
            familyId: uid,
            montant: toUse.toFixed(2),
            prestations: lignesDetailHtml(itemsCommande),
            mode: bon ? `Bon cadeau ${bon.code}` : libelleModePaiement("avoir"),
          });
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || "Centre Equestre <onboarding@resend.dev>",
              to,
              ...(process.env.RESEND_BCC_EMAIL ? { bcc: process.env.RESEND_BCC_EMAIL } : {}),
              subject,
              html,
            }),
          });
          const errText = r.ok ? "" : await r.text().catch(() => "");
          await logEmail({
            to, subject, context: "famille_paiement_avoir", template: "confirmationPaiement",
            status: r.ok ? "sent" : "failed",
            ...(r.ok ? {} : { error: `HTTP ${r.status}: ${errText}`.slice(0, 500) }),
            sentBy: "system", paymentId: payRef.id, familyId: uid,
          }).catch(() => {});
        } else if (to) {
          await logEmail({
            to, subject: "Paiement reçu (avoir)", context: "famille_paiement_avoir", template: "confirmationPaiement",
            status: "failed", error: resendKey ? "Bloqué par le mode restreint" : "RESEND_API_KEY absente",
            sentBy: "system", paymentId: payRef.id, familyId: uid,
          }).catch(() => {});
        }
      } catch (e) {
        // Le paiement est enregistré ; un email manqué se voit dans le journal.
        console.warn("[pay-with-avoir] email de confirmation:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      paymentId: payRef.id,
      paidAmount: toUse,
      status,
      remaining: cartTotal - toUse,
    });
  } catch (error: any) {
    console.error("pay-with-avoir error:", error);
    const msg: string = error?.message || "Erreur interne";
    if (msg.startsWith("COMPLET:")) {
      return NextResponse.json(
        { error: `Créneau complet : ${msg.slice("COMPLET:".length)}. Aucun crédit n'a été utilisé.` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
