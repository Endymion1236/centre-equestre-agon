/**
 * src/app/espace-cavalier/reserver/panier-paiement.ts
 *
 * Valider le panier : inscrire chaque cavalier (serveur), poser les
 * réservations, créer la commande et partir vers le paiement CAWL. Sorti de
 * la page de réservation sans changement de traitement — même principe que
 * panier-ajout : contexte explicite en entrée, rappels pour ce qui change à
 * l'écran.
 */

import type { Dispatch, SetStateAction } from "react";
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { formatStageSchedule } from "@/lib/format-stage";
import { todayLocalString } from "@/lib/date-local";
import type { CartItem, Creneau } from "./types";

export interface ContextePaiement {
  cart: CartItem[];
  creneaux: Creneau[];
  user: { uid: string; email?: string | null } | null | undefined;
  family: { parentName?: string; parentEmail?: string } | null | undefined;
  reservationsFermees: boolean;
  messageFermeture: string;
  depositMode: "full" | "deposit";
  /** Totaux calculés par panier-reservation, la même source que le panier affiché. */
  cartTotal: number;
  cartHasStage: boolean;
  acompteFixe: number;
  soldeFixe: number;
}

export interface RappelsPaiement {
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  setPaying: (v: boolean) => void;
  setSuccess: (v: boolean) => void;
  rechargerCartes: (uid: string) => void | Promise<void>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export async function payerPanier(ctx: ContextePaiement, rappels: RappelsPaiement): Promise<void> {
  const { cart, creneaux, user, family, reservationsFermees, messageFermeture, depositMode, cartTotal, cartHasStage, acompteFixe, soldeFixe } = ctx;
  const { setCart, setPaying, setSuccess, rechargerCartes, toast } = rappels;
  if (cart.length === 0 || !family || !user) return;
  if (reservationsFermees) {
    alert(messageFermeture ||
      "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande.");
    return;
  }

  setPaying(true);
  try {
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
            // Promenade « niveau à définir » : le serveur verrouille ce
            // niveau à la première inscription, ou refuse s'il diffère.
            ...(item.niveauPromenade ? { niveauPromenade: item.niveauPromenade } : {}),
            // Carte de séances : le serveur la vérifie et rend la place ferme.
            ...(item.cardId ? { cardId: item.cardId } : {}),
          }],
        }),
      });
      if (!enrollRes.ok) {
        const err = await enrollRes.json().catch(() => ({} as any));
        if (item.cardId && (err.code === "CARTE_INVALIDE" || err.code === "CARTE_EPUISEE")) {
          // La carte ne couvre finalement pas cette séance : on la remet au
          // tarif normal dans le panier, la famille décide.
          setCart(prev => prev.map(i =>
            i.cardId === item.cardId && i.childId === item.childId && i.creneauIds[0] === item.creneauIds[0]
              ? { ...i, cardId: undefined, carteLabel: undefined, prixFinal: i.prixBase }
              : i));
          if (user?.uid) rechargerCartes(user.uid);
          alert(`${err.error || "Carte de séances non utilisable."}\n\nLa séance a été remise au tarif normal dans votre panier.`);
          setPaying(false);
          return;
        }
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
          // Le créneau est relu en base s'il n'est pas dans la vue courante :
          // l'écran ne charge qu'une fenêtre de dates, et une réservation
          // prise pour octobre depuis l'affichage d'août ne le trouvait pas.
          // Le repli sur « aujourd'hui » écrivait alors la réservation à la
          // date du jour : la séance apparaissait comme PASSÉE le 31 août
          // (cas Loucia Rozier, réservation du 23 octobre) et disparaissait
          // des séances à venir.
          let firstCreneau: any = creneaux.find(c => c.id === item.creneauIds[0]);
          if (!firstCreneau) {
            try {
              const crSnap = await getDoc(doc(db, "creneaux", item.creneauIds[0]));
              if (crSnap.exists()) firstCreneau = { id: crSnap.id, ...crSnap.data() };
            } catch (e) { console.warn("[handlePay] créneau introuvable pour la réservation:", e); }
          }
          await addDoc(collection(db, "reservations"), {
            familyId: user.uid, familyName: family.parentName,
            ...((item as any).sourceFamilyId ? { sourceFamilyId: (item as any).sourceFamilyId } : {}),
            childId: item.childId, childName: item.childName,
            activityTitle: item.activityTitle, activityType: "cours",
            creneauId: item.creneauIds[0],
            // Sans date connue, on laisse le champ vide plutôt que d'y mettre
            // celle du jour : une réservation sans date se voit et se corrige,
            // une réservation datée à tort passe inaperçue.
            date: firstCreneau?.date || "",
            startTime: firstCreneau?.startTime || "",
            endTime: firstCreneau?.endTime || "",
            priceTTC: item.prixFinal,
            // Séance sur carte : place ferme, rien à payer.
            status: item.cardId ? "confirmed" : "pending_payment",
            ...(item.cardId ? { paymentSource: "card", cardId: item.cardId } : {}),
            source: "client",
            createdAt: serverTimestamp(),
          });
        } else {
          console.log(`[handlePay] Reservation cours deja existante, skip : ${item.childName} - creneau ${item.creneauIds[0]}`);
        }
      }
    }

    // Séances prises sur une carte : inscrites et confirmées, rien à payer.
    // Elles ne figurent ni dans la commande ni dans le panier CAWL.
    const cartAPayer = cart.filter(i => !i.cardId);
    if (cartAPayer.length === 0) {
      setCart([]);
      if (user?.uid) rechargerCartes(user.uid);
      toast("Réservation confirmée — la séance sera décomptée de votre carte le jour du cours.", "success");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
      setPaying(false);
      return;
    }

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
      items: cartAPayer.map(i => {
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
    const newPaymentId = paymentDocRef.id;

    // NB : plus d'email de confirmation envoyé depuis le client.
    // La confirmation (unique) part du SERVEUR après le paiement — route
    // /api/cawl/status ou /api/cawl/webhook, template confirmationStageAcompte.
    // L'ancien appel client à /api/send-email (route adminOnly) renvoyait 403
    // et exposait un envoi d'email HTML arbitraire depuis le navigateur.

    const hasStage = cart.some(i => i.isStage);
    const isDeposit = hasStage && depositMode === "deposit";
    const firstStageCreneau = hasStage ? creneaux.find(c => c.id === cart.find(i => i.isStage)?.creneauIds[0]) : null;
    const stageDate = firstStageCreneau?.date || "";
    
    // Stocker les infos stage/acompte dans le paiement
    if (hasStage) {
      await updateDoc(doc(db, "payments", newPaymentId), {
        stageDate: stageDate,
        stageTitle: cart.find(i => i.isStage)?.activityTitle || "",
        acompteAmount: acompteFixe,
        soldeAmount: soldeFixe,
      });
    }

    try {
      const res = await authFetch("/api/cawl/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: user.uid,
          familyEmail: family.parentEmail || user.email,
          familyName: family.parentName,
          paymentId: newPaymentId,
          totalTTC: isDeposit ? acompteFixe : cartTotal,
          depositPercent: isDeposit ? Math.round(acompteFixe / cartTotal * 100) : null,
          stageDate,
          items: cartAPayer.map(i => ({
            name: `${i.activityTitle} — ${i.childName}`,
            description: i.dates || null,
            priceInCents: Math.round(i.prixFinal * 100),
            quantity: 1,
          })),
        }),
      });
      const data = await res.json();
      if (data.url) {
        // Redirection immédiate vers CAWL — pas de setCart ici pour éviter le message "panier vide"
        window.location.href = data.url;
        return;
      }
    } catch (cawlErr) {
      console.error("CAWL checkout (non-bloquant):", cawlErr);
    }
    setCart([]);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 5000);
  } catch (e: any) {
    console.error("[handlePay] Erreur complete:", e);
    // Afficher un message d'erreur explicite plutot que generique
    const errMsg = e?.message || e?.code || String(e) || "Erreur inconnue";
    alert(`❌ Erreur lors du paiement :\n\n${errMsg}\n\nDétails dans la console (F12).`);
  }
  setPaying(false);
}
