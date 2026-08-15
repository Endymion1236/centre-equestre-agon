/**
 * src/app/espace-cavalier/inscription-annuelle/inscription-actions.ts
 *
 * Tout ce que valider une inscription annuelle ÉCRIT réellement : places dans
 * les créneaux, réservations, paiement groupé, déclaration de règlement,
 * checkout CAWL.
 *
 * Sorti de `page.tsx` parce que c'est la partie irréversible du parcours. Ces
 * fonctions créent des documents Firestore et redirigent vers un paiement
 * bancaire : relues au milieu du JSX, l'ordre des écritures et les garde-fous
 * qui les entourent se perdaient de vue. Ils sont documentés au-dessus de
 * chaque fonction et ne doivent pas être réordonnés :
 *
 *  - le paiement est TOUJOURS créé en status "pending" côté client : les règles
 *    Firestore durcies refusent tout autre status à la création, le passage en
 *    "echeance"/"paid" se fait par l'admin ou le webhook CAWL ;
 *  - le forfait n'est JAMAIS créé côté client (écriture réservée au staff) :
 *    on ne fabrique que son payload, recréé plus tard par le webhook (CB) ou
 *    par l'admin à la validation de la déclaration (chèque/espèces) ;
 *  - en règlement différé, la place n'est que "pending" et la réservation
 *    "pending_validation" tant que le centre n'a pas encaissé ;
 *  - un seul paiement et un seul checkout pour toute la fratrie, sinon la
 *    famille paierait en plusieurs fois sans le vouloir.
 */

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { todayLocalString } from "@/lib/date-local";
import { seasonOf } from "@/lib/forfait-pricing";
import type {
  Creneau, FamilleSession, MoyenPaiement, PanierItem, PaymentPlan, UtilisateurSession,
} from "./types";

/** Ce dont toute écriture d'inscription a besoin : la session et le contexte. */
type ContexteInscription = {
  user: UtilisateurSession;
  family: FamilleSession;
  paymentPlan: PaymentPlan;
  /** Créneaux chargés, pour retrouver la date du cours principal (saison). */
  creneaux: Creneau[];
};

/**
 * Traite UN item (inscription d'un enfant) : créneaux + réservations +
 * forfait. NE crée PAS le paiement (fait une seule fois pour tout le panier).
 * Traite l'inscription d'UN enfant.
 *  - payMethod "cb"  → place confirmée immédiatement, forfait créé tout de suite.
 *  - payMethod différé (cheque/especes) → place tenue en "pending", réservation
 *    "pending_validation", AUCUN forfait créé côté client (interdit par les règles
 *    Firestore : forfaits = write admin only). Le payload du forfait est retourné
 *    pour être recréé par l'admin au moment de la validation de la déclaration.
 * Retourne les éléments à confirmer/annuler ultérieurement (mode différé).
 */
export async function inscrireUnItem(
  item: PanierItem,
  payMethod: MoyenPaiement = "cb",
  ctx: ContexteInscription,
): Promise<{ pendingEnrollments: { creneauId: string; childId: string }[]; reservationIds: string[]; forfaitPayload: any | null }> {
  const { user, family, paymentPlan, creneaux } = ctx;
  const deferred = payMethod !== "cb";
  const pendingEnrollments: { creneauId: string; childId: string }[] = [];
  const reservationIds: string[] = [];

  // 1. Inscrire l'enfant dans tous les créneaux de ses slots
  // Inscription sécurisée côté serveur (audit P0 #3 + #7).
  const enrollRes = await authFetch("/api/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enrollments: [{
        childId: item.childId,
        childName: item.childName,
        creneauIds: item.creneauIds,
        paymentSource: "forfait",
        forfaitId: null,
        ...(deferred ? { pending: true, paymentMethod: payMethod } : {}),
      }],
    }),
  });
  if (!enrollRes.ok) {
    const err = await enrollRes.json().catch(() => ({} as any));
    throw new Error(err.error || "Inscription refusée (créneau complet ?)");
  }
  if (deferred) {
    for (const creneauId of item.creneauIds) pendingEnrollments.push({ creneauId, childId: item.childId });
  }

  // 2. Réservations (une par slot)
  for (const s of item.slotsInfo) {
    const resRef = await addDoc(collection(db, "reservations"), {
      familyId: user.uid,
      familyName: family.parentName,
      childId: item.childId,
      childName: item.childName,
      activityTitle: s.activityTitle,
      activityType: "cours",
      type: "annual",
      forfaitType: item.forfaitType,
      dayLabel: s.dayLabel,
      startTime: s.startTime,
      endTime: s.endTime,
      totalSessions: s.totalSessions,
      creneauIds: s.creneauIds,
      status: deferred ? "pending_validation" : "confirmed",
      ...(deferred ? { paymentMethod: payMethod } : {}),
      createdAt: serverTimestamp(),
    });
    reservationIds.push(resRef.id);
  }

  // 3. Forfait (1 doc pour le créneau principal, comme l'admin)
  const principal = item.slotsInfo[0];
  const forfaitPayload = principal ? {
    familyId: user.uid,
    familyName: family.parentName || "—",
    childId: item.childId,
    childName: item.childName,
    slotKey: `${principal.activityTitle} — ${principal.dayLabel} ${principal.startTime}`,
    activityTitle: principal.activityTitle,
    dayLabel: principal.dayLabel,
    startTime: principal.startTime,
    endTime: principal.endTime,
    totalSessions: principal.totalSessions,
    attendedSessions: 0,
    licenceFFE: item.avecLicence,
    licenceType: item.licenceMoins18 ? "moins18" : "plus18",
    adhesion: item.avecAdhesion,
    forfaitPriceTTC: item.totalAnnuel,
    totalPaidTTC: 0,
    paymentPlan,
    status: "actif",
    frequence: item.frequence,
    // Forfait "complément" : heures ajoutées à un forfait existant la même
    // saison (facturé au différentiel). frequenceDejaInscrite = heures déjà
    // prises avant celui-ci ; la fréquence cumulée réelle de l'enfant est
    // frequenceDejaInscrite + frequence.
    ...((item.frequenceDejaInscrite || 0) > 0 ? {
      complement: true,
      frequenceDejaInscrite: item.frequenceDejaInscrite,
    } : {}),
    seasonStartYear: seasonOf(creneaux.find(c => c.id === principal.creneauIds[0])?.date || todayLocalString()),
    source: "client",
  } : null;

  // Le forfait n'est PLUS créé côté client (les règles Firestore réservent
  // l'écriture des forfaits au staff). Le payload est retourné puis :
  //  - CB      → stocké sur le paiement, créé par le webhook/status CAWL (admin SDK)
  //  - différé → stocké sur la déclaration, créé par l'admin à la validation
  return { pendingEnrollments, reservationIds, forfaitPayload };
}

/**
 * Valide TOUT le panier (+ l'inscription en cours si complète).
 * Crée toutes les inscriptions puis UN SEUL paiement groupé + 1 checkout CAWL.
 *
 * L'appelant a déjà construit `items` (panier + inscription en cours) et
 * vérifié qu'il n'est pas vide : cette fonction ne fait qu'écrire.
 */
export async function validerPanier(params: {
  items: PanierItem[];
  moyenPaiement: MoyenPaiement;
  paymentPlan: PaymentPlan;
  user: UtilisateurSession;
  family: FamilleSession;
  creneaux: Creneau[];
  setSubmitting: (v: boolean) => void;
  setDeclaredSuccess: (v: { mode: "cheque" | "especes"; total: number; names: string }) => void;
  toast: (message: string, type?: "success" | "error") => void;
}): Promise<void> {
  const {
    items, moyenPaiement, paymentPlan, user, family, creneaux,
    setSubmitting, setDeclaredSuccess, toast,
  } = params;
  setSubmitting(true);
  try {
    const deferred = moyenPaiement !== "cb";

    // 1. Créer toutes les inscriptions (créneaux + réservations [+ forfaits si CB])
    const allPending: { creneauId: string; childId: string }[] = [];
    const allReservationIds: string[] = [];
    const allForfaitPayloads: any[] = [];
    for (const it of items) {
      const r = await inscrireUnItem(it, moyenPaiement, { user, family, paymentPlan, creneaux });
      if (r.forfaitPayload) allForfaitPayloads.push(r.forfaitPayload);
      if (deferred) {
        allPending.push(...r.pendingEnrollments);
        allReservationIds.push(...r.reservationIds);
      }
    }

    // 2. UN SEUL paiement groupé pour toute la fratrie (toujours créé en "pending")
    const totalGroupe = items.reduce((s, it) => s + it.totalAnnuel, 0);
    // Items à la forme attendue par l'admin (TabImpayes, retrait d'item,
    // facture PDF) : childName / activityTitle / priceTTC. On garde label/amount
    // en plus pour rétro-compatibilité avec d'éventuels autres lecteurs.
    const paymentItems = items.flatMap(it =>
      it.detailLignes.map(l => ({
        childId: it.childId,
        childName: it.childName,
        activityTitle: l.label,
        priceTTC: l.montantTTC,
        priceHT: Math.round((l.montantTTC / 1.055) * 100) / 100,
        tva: 5.5,
        label: `${it.childName} — ${l.label}`,
        amount: l.montantTTC,
      }))
    );
    const payDoc = await addDoc(collection(db, "payments"), {
      familyId: user.uid,
      familyName: family.parentName,
      type: "inscription_annuelle",
      label: `Inscription annuelle — ${items.map(it => it.childName).join(", ")}`,
      items: paymentItems,
      totalTTC: totalGroupe,
      paidAmount: 0,
      paymentPlan,
      paymentMode: deferred ? moyenPaiement : "cb",
      status: "pending",
      skipPayment: true,
      source: "client",
      nbEnfants: items.length,
      ...(deferred ? { awaitingValidation: true } : { forfaitPayloads: allForfaitPayloads }),
      createdAt: serverTimestamp(),
    });

    // 3a. Chèque / Espèces → déclaration à valider par l'admin (PAS de CAWL).
    //     La/les place(s) restent "pending" jusqu'à la confirmation admin.
    if (deferred) {
      const names = items.map(it => it.childName).join(", ");
      const modeLabel = moyenPaiement === "cheque" ? "chèque" : "espèces";
      await addDoc(collection(db, "payment_declarations"), {
        paymentId: payDoc.id,
        familyId: user.uid,
        familyName: family.parentName,
        familyEmail: family.parentEmail || user.email || "",
        montant: totalGroupe,
        mode: moyenPaiement,
        note: "",
        activityTitle: `Inscription annuelle — ${names}`,
        status: "pending_confirmation",
        // Marqueurs spécifiques à l'inscription annuelle : permettent à l'admin
        // de finaliser l'inscription (lever le pending, confirmer la résa, créer
        // le forfait) lors de la confirmation de la déclaration.
        type: "inscription_annuelle",
        paymentPlan,
        pendingEnrollments: allPending,
        reservationIds: allReservationIds,
        forfaitPayloads: allForfaitPayloads,
        createdAt: serverTimestamp(),
      });
      // Email admin (non bloquant)
      authFetch("/api/notify-club", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "inscription_annuelle",
          titre: `Inscription annuelle (${modeLabel}) à valider — ${family.parentName}`,
          lignes: [
            `${family.parentName} a inscrit ${names} à l'année et déclare un règlement de ${totalGroupe.toFixed(2)}€ par ${modeLabel} (${paymentPlan}).`,
            "À valider dans Paiements → Déclarations pour confirmer la ou les places.",
          ],
          familyId: user.uid,
        }),
      }).catch(() => {});
      setDeclaredSuccess({ mode: moyenPaiement, total: totalGroupe, names });
      setSubmitting(false);
      return;
    }

    // 3b. CB → UN SEUL checkout CAWL groupé
    try {
      const cawlItems = items.flatMap(it => [
        ...(it.prixAdhesion > 0 ? [{ name: `Adhésion — ${it.childName}`, description: `Enfant ${it.rangEnfant}`, priceInCents: Math.round(it.prixAdhesion * 100), quantity: 1 }] : []),
        ...(it.prixLicence > 0 ? [{ name: `Licence FFE — ${it.childName}`, description: it.licenceMoins18 ? "-18 ans" : "+18 ans", priceInCents: Math.round(it.prixLicence * 100), quantity: 1 }] : []),
        { name: `Forfait ${it.frequence}×/sem — ${it.childName}`, description: it.slotsInfo.map(s => `${s.dayLabel} ${s.startTime}`).join(", "), priceInCents: Math.round(it.prixForfaitNet * 100), quantity: 1 },
      ]);
      const res = await authFetch("/api/cawl/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payDoc.id,
          familyId: user.uid,
          familyEmail: family.parentEmail,
          familyName: family.parentName,
          items: cawlItems,
          metadata: { type: "inscription_annuelle_groupee", nbEnfants: items.length },
        }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
    } catch (cawlErr) {
      console.error("CAWL checkout groupé (non-bloquant):", cawlErr);
    }
    window.location.href = "/espace-cavalier/reservations?success=true";
  } catch (e) {
    console.error("Erreur inscription groupée:", e);
    toast("Erreur lors de l'inscription. Veuillez réessayer.", "error");
  } finally {
    setSubmitting(false);
  }
}
