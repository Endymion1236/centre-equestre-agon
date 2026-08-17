import { adminDb } from "@/lib/firebase-admin";

/**
 * Places tenues pendant le paiement ("hold").
 *
 * Problème d'origine : la page de réservation famille inscrivait les enfants
 * dans les créneaux AVANT d'envoyer vers la page de paiement. Une personne qui
 * abandonnait (onglet fermé, carte refusée, simple curiosité) restait inscrite
 * dans le planning, sans paiement et sans email — puisque la confirmation ne
 * part qu'après encaissement. Des places étaient donc occupées par des
 * inscriptions fantômes.
 *
 * Principe retenu : on continue d'écrire l'entrée dans `enrolled` au moment du
 * clic — c'est ce qui protège la place et empêche deux familles de prendre la
 * dernière — mais elle est marquée `pending` avec une date d'expiration.
 *   - paiement confirmé  → `confirmerPlacesTenues` retire le marqueur ;
 *   - délai dépassé      → le cron de purge retire l'entrée du créneau.
 *
 * Cette approche réutilise le champ `pending` que /api/enroll sait déjà écrire,
 * plutôt que d'introduire une seconde notion de réservation à côté de
 * `waitlistHold`.
 */

/** Durée de protection d'une place le temps de payer en ligne. */
export const HOLD_PAIEMENT_MINUTES = 30;

/**
 * Durée de protection quand le règlement est différé (chèque, espèces,
 * virement). La famille déclare son paiement en ligne mais l'argent arrive
 * au bureau : la place doit tenir jusqu'à ce que l'admin confirme la
 * réception, pas trente minutes. Sans cette distinction, une inscription
 * réglée par chèque était purgée la demi-heure suivante.
 *
 * Sept jours : de quoi laisser passer un week-end et un envoi postal. Au-delà,
 * la place repart — un chèque annoncé et jamais reçu ne doit pas bloquer une
 * place toute la saison.
 */
export const HOLD_REGLEMENT_DIFFERE_MINUTES = 7 * 24 * 60;

/** Modes de règlement dont l'encaissement se fait hors ligne. */
const MODES_DIFFERES = ["cheque", "especes", "virement", "ancv", "cheque_vacances", "pass_sport"];

export function dateExpirationHold(depuis: Date = new Date(), paymentMethod?: string): string {
  const minutes = paymentMethod && MODES_DIFFERES.includes(paymentMethod)
    ? HOLD_REGLEMENT_DIFFERE_MINUTES
    : HOLD_PAIEMENT_MINUTES;
  return new Date(depuis.getTime() + minutes * 60_000).toISOString();
}

/**
 * Lève le caractère provisoire des places d'un paiement : l'inscription
 * devient définitive. Idempotent — rejouable sans dommage (la route status et
 * le webhook CAWL peuvent tous deux confirmer le même paiement).
 */
export async function confirmerPlacesTenues(paymentId: string): Promise<number> {
  let confirmees = 0;
  try {
    const paySnap = await adminDb.collection("payments").doc(paymentId).get();
    if (!paySnap.exists) return 0;
    const pData = paySnap.data() as any;

    // Créneaux concernés : chaque item porte soit creneauIds (stage), soit
    // creneauId (cours).
    const cibles = new Map<string, Set<string>>(); // creneauId → childIds
    for (const item of pData.items || []) {
      const ids: string[] = Array.isArray(item?.creneauIds) && item.creneauIds.length
        ? item.creneauIds
        : item?.creneauId ? [item.creneauId] : [];
      for (const cid of ids) {
        if (!cid) continue;
        if (!cibles.has(cid)) cibles.set(cid, new Set());
        if (item.childId) cibles.get(cid)!.add(item.childId);
      }
    }

    for (const [creneauId, childIds] of cibles) {
      const ref = adminDb.collection("creneaux").doc(creneauId);
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const list: any[] = (snap.data() as any).enrolled || [];
        let touche = false;
        const maj = list.map((e) => {
          if (!childIds.has(e.childId) || !e.pending) return e;
          touche = true;
          const { pending, holdUntil, ...reste } = e;
          return reste;
        });
        if (touche) {
          tx.update(ref, { enrolled: maj });
          confirmees++;
        }
      });
    }
  } catch (e) {
    console.error("[hold] confirmation des places impossible", paymentId, e);
  }
  return confirmees;
}
