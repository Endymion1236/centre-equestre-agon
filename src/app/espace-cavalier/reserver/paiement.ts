/**
 * src/app/espace-cavalier/reserver/paiement.ts
 *
 * Tout ce qui écrit en base ou appelle le serveur au moment de payer :
 * inscriptions, réservations, document de paiement, checkout CAWL, règlement
 * par avoir et déclaration d'un paiement différé (chèque / espèces / virement).
 *
 * POURQUOI un module à part : c'est la partie de l'écran qui prend de l'argent.
 * Noyée au milieu de 2000 lignes de JSX, elle était impossible à relire d'une
 * traite alors que chaque ligne engage le centre équestre (place tenue, montant
 * encaissé, acompte, preuve d'acceptation des CGV). Ici, la séquence complète
 * se lit d'un bloc, et aucune de ces fonctions ne touche à l'état React : la
 * page reste seule responsable des `setPaying`, des messages et du panier.
 *
 * L'ORDRE des opérations est une garantie, pas un hasard : on inscrit d'abord
 * (la place est tenue, `pending: true`), puis on crée le paiement, puis on
 * redirige vers CAWL. Une inscription sans paiement expire toute seule ; un
 * paiement sans inscription laisserait une famille qui a payé sans place.
 */

import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { formatStageSchedule } from "@/lib/format-stage";
import { todayLocalString } from "@/lib/date-local";
import type { Family } from "@/types";
import type { CartItem, Creneau } from "./types";

/**
 * Inscrit chaque enfant du panier dans ses créneaux, solde les éventuels holds
 * de liste d'attente, puis crée les réservations correspondantes.
 * Lève une erreur dès qu'une inscription est refusée (créneau complet) :
 * l'appelant ne doit surtout pas créer le paiement dans ce cas.
 */
export async function inscrireEtCreerReservations(
  cart: CartItem[],
  creneaux: Creneau[],
  user: User,
  family: Family,
) {
  // 1. Inscrire chaque enfant dans chaque créneau
  for (const item of cart) {
    // Pour les stages multi-jours, recharger les créneaux depuis Firestore
    // car le client peut n'avoir chargé qu'un seul mois
    const creneauIdsToEnroll = [...item.creneauIds];

    // Inscription sécurisée côté serveur (audit P0 #3 + #7) : valide
    // enfant↔famille, capacité (maxPlaces) et doublons en transaction.
    // Le navigateur n'écrit plus directement le tableau `enrolled`.
    const enrollRes = await authFetch("/api/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollments: [{
          childId: item.childId,
          childName: item.childName,
          creneauIds: creneauIdsToEnroll,
          // Place TENUE, pas encore acquise : elle protege le paiement en
          // cours mais expire toute seule si celui-ci n'aboutit pas. Le
          // marqueur est leve par /api/cawl/status ou le webhook des que
          // l'encaissement est confirme.
          pending: true,
          ...(( item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
        }],
      }),
    });
    if (!enrollRes.ok) {
      const err = await enrollRes.json().catch(() => ({} as any));
      throw new Error(err.error || "Inscription refusée (créneau complet ?)");
    }

    // Waitlist : marquer l'éventuel hold comme accepté pour chaque créneau. Non bloquant.
    for (const cid of creneauIdsToEnroll) {
      try {
        const wlSnap = await getDocs(query(
          collection(db, "waitlist"),
          where("creneauId", "==", cid),
          where("childId", "==", item.childId),
          where("familyId", "==", user.uid),
        ));
        for (const wd of wlSnap.docs) {
          const st = (wd.data() as any).status;
          if (st === "waiting" || st === "notified") {
            await updateDoc(doc(db, "waitlist", wd.id), { status: "accepted", acceptedAt: new Date().toISOString() });
          }
        }
      } catch (wlErr) { console.warn("[handlePay] maj waitlist:", wlErr); }
    }

    // Réservations — une SEULE réservation groupée pour les stages
    // (couvre tous les jours du stage), une seule pour les cours.
    if (item.isStage) {
      // Idempotence : si une réservation stage existe déjà pour ce trio
      // (familyId, childId, 1er créneau du stage), on ne duplique pas.
      const existingResa = await getDocs(query(
        collection(db, "reservations"),
        where("familyId", "==", user.uid),
        where("childId", "==", item.childId),
        where("creneauId", "==", creneauIdsToEnroll[0]),
      ));
      if (existingResa.empty) {
        // Dates de début/fin du stage à partir des créneaux
        const crDates: string[] = [];
        let startTime = "", endTime = "";
        for (const cid of creneauIdsToEnroll) {
          const crSnap = await getDoc(doc(db, "creneaux", cid));
          if (crSnap.exists()) {
            const d = crSnap.data();
            if (d.date) crDates.push(d.date);
            if (!startTime && d.startTime) startTime = d.startTime;
            if (!endTime && d.endTime) endTime = d.endTime;
          }
        }
        crDates.sort();
        await addDoc(collection(db, "reservations"), {
          familyId: user.uid, familyName: family.parentName,
          ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
          childId: item.childId, childName: item.childName,
          activityTitle: item.activityTitle, activityType: "stage",
          type: "stage",
          // créneau "principal" (1er jour) + liste complète pour le détail
          creneauId: creneauIdsToEnroll[0],
          creneauIds: creneauIdsToEnroll,
          date: crDates[0] || todayLocalString(),
          dateFin: crDates[crDates.length - 1] || crDates[0] || todayLocalString(),
          nbJours: crDates.length,
          startTime, endTime,
          priceTTC: item.prixFinal,
          status: "pending_payment", source: "client",
          createdAt: serverTimestamp(),
        });
      } else {
        console.log(`[handlePay] Reservation stage deja existante, skip : ${item.childName}`);
      }
    } else {
      // Idempotence cours : meme check que pour les stages
      const existingCourseResa = await getDocs(query(
        collection(db, "reservations"),
        where("familyId", "==", user.uid),
        where("childId", "==", item.childId),
        where("creneauId", "==", item.creneauIds[0]),
      ));
      if (existingCourseResa.empty) {
        const firstCreneau = creneaux.find(c => c.id === item.creneauIds[0]);
        await addDoc(collection(db, "reservations"), {
          familyId: user.uid, familyName: family.parentName,
          ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
          childId: item.childId, childName: item.childName,
          activityTitle: item.activityTitle, activityType: "cours",
          creneauId: item.creneauIds[0],
          date: firstCreneau?.date || todayLocalString(),
          startTime: firstCreneau?.startTime || "",
          endTime: firstCreneau?.endTime || "",
          priceTTC: item.prixFinal, status: "pending_payment", source: "client",
          createdAt: serverTimestamp(),
        });
      } else {
        console.log(`[handlePay] Reservation cours deja existante, skip : ${item.childName} - creneau ${item.creneauIds[0]}`);
      }
    }
  }
}

/**
 * Crée le document `payments` en statut « pending » et renvoie son id.
 *
 * NB : plus d'email de confirmation envoyé depuis le client.
 * La confirmation (unique) part du SERVEUR après le paiement — route
 * /api/cawl/status ou /api/cawl/webhook, template confirmationStageAcompte.
 * L'ancien appel client à /api/send-email (route adminOnly) renvoyait 403
 * et exposait un envoi d'email HTML arbitraire depuis le navigateur.
 */
export async function creerPaiementEnAttente(opts: {
  cart: CartItem[];
  creneaux: Creneau[];
  cartHasStage: boolean;
  cartTotal: number;
  user: User;
  family: Family;
}): Promise<string> {
  const { cart, creneaux, cartHasStage, cartTotal, user, family } = opts;
  // 2. Créer le paiement pending
  const paymentDocRef = await addDoc(collection(db, "payments"), {
    // Preuve d'acceptation des conditions d'annulation, horodatée.
    // Sans trace de l'acceptation AVANT paiement, la clause est
    // difficilement opposable en cas de litige.
    cgvAnnulationAcceptee: cartHasStage ? true : null,
    cgvAnnulationAccepteeAt: cartHasStage ? new Date().toISOString() : null,
    cgvVersion: cartHasStage ? "2026-07-stages-3semaines" : null,
    familyId: user.uid, familyName: family.parentName,
    familyEmail: family.parentEmail || user.email || "",
    items: cart.map(i => {
      const firstCr = creneaux.find(c => c.id === i.creneauIds[0]);
      const stageCrs = i.isStage ? i.creneauIds.map(id => creneaux.find(c => c.id === id)).filter(Boolean) : [];
      return {
        activityTitle: `${i.activityTitle} — ${i.childName}${i.remiseEuros > 0 ? ` (-${i.remiseEuros}€)` : ""}`,
        childId: i.childId,
        childName: i.childName,
        creneauId: i.creneauIds[0],
        creneauIds: i.isStage ? i.creneauIds : null,
        stageKey: i.isStage ? `${i.activityTitle}_${i.dates}` : null,
        activityType: i.isStage ? "stage" : "cours",
        stageSchedule: i.isStage ? (formatStageSchedule(stageCrs as any) ?? null) : null,
        stageDates: i.isStage ? stageCrs.map((c: any) => ({ date: c.date, startTime: c.startTime, endTime: c.endTime })) : null,
        priceHT: i.prixFinal / 1.055, tva: 5.5, priceTTC: i.prixFinal,
        // Prix plein (avant degressivite) : sert au recalcul des rangs si
        // un enfant est supprime de la commande plus tard (admin > Modifier).
        // Sans ce champ, on ne peut pas recalculer correctement le tarif
        // des enfants restants qui remontent en rang.
        originalPriceTTC: i.prixBase || i.prixFinal,
        date: firstCr?.date || null,
        startTime: firstCr?.startTime || null,
        endTime: firstCr?.endTime || null,
        monitor: firstCr?.monitor || null,
      };
    }),
    totalTTC: cartTotal,
    paymentMode: "", paymentRef: "",
    status: "pending", paidAmount: 0,
    source: "client",
    date: serverTimestamp(),
  });
  return paymentDocRef.id;
}

/** Stocker les infos stage/acompte dans le paiement. */
export async function enregistrerInfosStage(paymentId: string, infos: {
  stageDate: string;
  stageTitle: string;
  acompteAmount: number;
  soldeAmount: number;
}) {
  await updateDoc(doc(db, "payments", paymentId), {
    stageDate: infos.stageDate,
    stageTitle: infos.stageTitle,
    acompteAmount: infos.acompteAmount,
    soldeAmount: infos.soldeAmount,
  });
}

/**
 * Demande l'URL de paiement CAWL. Renvoie null si l'appel échoue ou ne
 * contient pas d'URL : l'échec est NON BLOQUANT (les inscriptions et le
 * paiement pending existent déjà, le centre pourra encaisser autrement).
 */
export async function demanderCheckoutCawl(opts: {
  user: User;
  family: Family;
  paymentId: string;
  totalTTC: number;
  depositPercent: number | null;
  stageDate: string;
  cart: CartItem[];
}): Promise<string | null> {
  const { user, family, paymentId, totalTTC, depositPercent, stageDate, cart } = opts;
  try {
    const res = await authFetch("/api/cawl/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        familyId: user.uid,
        familyEmail: family.parentEmail || user.email,
        familyName: family.parentName,
        paymentId,
        totalTTC,
        depositPercent,
        stageDate,
        items: cart.map(i => ({
          name: `${i.activityTitle} — ${i.childName}`,
          description: i.dates || null,
          priceInCents: Math.round(i.prixFinal * 100),
          quantity: 1,
        })),
      }),
    });
    const data = await res.json();
    if (data.url) return data.url as string;
  } catch (cawlErr) {
    console.error("CAWL checkout (non-bloquant):", cawlErr);
  }
  return null;
}

/**
 * Règlement par avoir.
 * Tout passe par l'API serveur — les écritures Firestore
 * (payments, encaissements, avoirs, reservations, creneaux)
 * sont atomiques et sécurisées côté adminDb.
 */
export async function payerAvecAvoir(cart: CartItem[]) {
  const res = await authFetch("/api/pay-with-avoir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cart: cart.map(i => ({
        activityTitle: i.activityTitle,
        childId: i.childId,
        childName: i.childName,
        creneauIds: i.creneauIds,
        prixFinal: i.prixFinal,
        isStage: i.isStage,
        ...((i as any).sourceFamilyId ? { sourceFamilyId: (i as any).sourceFamilyId } : {}),
      })),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Erreur serveur");
  }
}

/**
 * Paiement différé déclaré par la famille (chèque, espèces, virement) :
 * on inscrit et on crée un paiement « pending » exactement comme pour la CB,
 * plus une déclaration que l'équipe confirmera à réception, et un mail au club.
 */
export async function declarerPaiementDiffere(opts: {
  cart: CartItem[];
  creneaux: Creneau[];
  cartTotal: number;
  cartPayMode: string;
  user: User;
  family: Family;
  familyId: string;
}) {
  const { cart, creneaux, cartTotal, cartPayMode, user, family, familyId } = opts;
  // 1. Inscrire + créer réservations + paiement pending
  for (const item of cart) {
    // Inscription sécurisée côté serveur (audit P0 #3 + #7).
    const enrollRes = await authFetch("/api/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollments: [{
          childId: item.childId,
          childName: item.childName,
          creneauIds: item.creneauIds,
          ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
        }],
      }),
    });
    if (!enrollRes.ok) {
      const err = await enrollRes.json().catch(() => ({} as any));
      throw new Error(err.error || "Inscription refusée (créneau complet ?)");
    }
    const firstCr = creneaux.find(c => c.id === item.creneauIds[0]);
    await addDoc(collection(db, "reservations"), {
      familyId: user.uid, familyName: family.parentName,
      ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
      childId: item.childId, childName: item.childName,
      activityTitle: item.activityTitle, activityType: item.isStage ? "stage" : "cours",
      creneauId: item.creneauIds[0],
      date: firstCr?.date || todayLocalString(),
      startTime: firstCr?.startTime || "", endTime: firstCr?.endTime || "",
      priceTTC: item.prixFinal, status: "pending_payment", source: "client",
      createdAt: serverTimestamp(),
    });
  }
  const payDoc = await addDoc(collection(db, "payments"), {
    familyId: user.uid, familyName: family.parentName,
    items: cart.map(i => ({
      activityTitle: `${i.activityTitle} — ${i.childName}`,
      childId: i.childId, childName: i.childName,
      creneauId: i.creneauIds[0],
      priceHT: i.prixFinal / 1.055, tva: 5.5, priceTTC: i.prixFinal,
    })),
    totalTTC: cartTotal,
    paymentMode: cartPayMode, paymentRef: "",
    status: "pending", paidAmount: 0,
    source: "client", date: serverTimestamp(),
  });
  // 2. Créer la déclaration
  await addDoc(collection(db, "payment_declarations"), {
    paymentId: payDoc.id,
    familyId: user.uid, familyName: family.parentName,
    familyEmail: family.parentEmail || user.email || "",
    montant: cartTotal,
    mode: cartPayMode,
    note: "",
    activityTitle: cart.map(i => i.activityTitle).join(", "),
    status: "pending_confirmation",
    createdAt: serverTimestamp(),
  });
  // 3. Email admin
  authFetch("/api/notify-club", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: "reservation_paiement",
      titre: `Paiement ${cartPayMode} à confirmer — ${family.parentName}`,
      lignes: [
        `${family.parentName} déclare un paiement de ${cartTotal.toFixed(2)}€ par ${cartPayMode}.`,
        `Activités : ${cart.map(i => i.activityTitle).join(", ")}`,
      ],
      familyId,
    }),
  }).catch(() => {});
}
