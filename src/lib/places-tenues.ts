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
 * virement ou carte bancaire au club). La famille déclare son paiement en ligne mais l'argent arrive
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
const MODES_DIFFERES = ["cheque", "especes", "virement", "cb_terminal", "ancv", "cheque_vacances", "pass_sport"];

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
export async function confirmerPlacesTenues(
  paymentId: string,
): Promise<{ confirmees: number; reinscrites: number }> {
  let confirmees = 0;
  let reinscrites = 0;
  try {
    const paySnap = await adminDb.collection("payments").doc(paymentId).get();
    if (!paySnap.exists) return { confirmees, reinscrites };
    const pData = paySnap.data() as any;

    // Créneaux concernés : chaque item porte soit creneauIds (stage), soit
    // creneauId (cours).
    const cibles = new Map<string, Set<string>>(); // creneauId → childIds
    // De quoi RECRÉER une inscription disparue : nom du cavalier et clé de
    // stage, tels que la commande les porte.
    const infosEnfant = new Map<string, { childName: string; stageKey?: string }>();
    for (const item of pData.items || []) {
      if (item?.childId) {
        infosEnfant.set(item.childId, {
          childName: item.childName || "",
          ...(item.stageKey ? { stageKey: item.stageKey } : {}),
        });
      }
      const ids: string[] = Array.isArray(item?.creneauIds) && item.creneauIds.length
        ? item.creneauIds
        : item?.creneauId ? [item.creneauId] : [];
      for (const cid of ids) {
        if (!cid) continue;
        if (!cibles.has(cid)) cibles.set(cid, new Set());
        if (item.childId) cibles.get(cid)!.add(item.childId);
      }
    }

    // Filet de sécurité pour les paiements ANCIENS dont les items ne portent
    // que le premier jour d'un stage : on étend la levée aux jours frères de
    // la même semaine (même activité) pour les mêmes enfants — sinon un stage
    // payé gardait mardi→vendredi « pending » et la purge les désinscrivait.
    for (const [creneauId, childIds] of [...cibles]) {
      try {
        const cSnap = await adminDb.collection("creneaux").doc(creneauId).get();
        if (!cSnap.exists) continue;
        const c = cSnap.data() as any;
        if (c.activityType !== "stage" && c.activityType !== "stage_journee") continue;
        const jour = new Date(`${c.date}T12:00:00`);
        const lundi = new Date(jour); lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
        const dimanche = new Date(lundi); dimanche.setDate(dimanche.getDate() + 6);
        const ymd = (d: Date) => d.toISOString().slice(0, 10);
        const freres = await adminDb.collection("creneaux")
          .where("activityTitle", "==", c.activityTitle).get();
        freres.docs.forEach((f) => {
          const fd = (f.data() as any).date;
          if (f.id === creneauId || !fd || fd < ymd(lundi) || fd > ymd(dimanche)) return;
          if (!cibles.has(f.id)) cibles.set(f.id, new Set());
          childIds.forEach((id) => cibles.get(f.id)!.add(id));
        });
      } catch (e) {
        console.warn("[hold] extension semaine de stage impossible", creneauId, e);
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
        if (touche) confirmees++;

        // ── Place disparue entre la réservation et le paiement ──────────
        //
        // La place est tenue 30 minutes ; passé ce délai la purge la libère,
        // à raison — rien n'était encore encaissé. Mais si la famille règle
        // APRÈS (elle a laissé l'onglet ouvert, elle a été interrompue), la
        // confirmation ne trouvait plus rien à confirmer : le paiement
        // aboutissait, l'email annonçait le stage, et personne n'était au
        // planning. C'est arrivé le 01/09/2026 — 350 € encaissés, deux
        // cavaliers nulle part.
        //
        // L'argent est reçu : la place est due. On la recrée, définitive.
        // Sans contrôle de capacité — une famille qui a payé ne peut pas être
        // la variable d'ajustement ; un dépassement se voit au planning et se
        // règle humainement.
        const presents = new Set(maj.map((e: any) => e.childId));
        for (const childId of childIds) {
          if (presents.has(childId)) continue;
          const infos = infosEnfant.get(childId);
          maj.push({
            childId,
            childName: infos?.childName || "",
            familyId: pData.familyId || "",
            familyName: pData.familyName || "",
            enrolledAt: new Date().toISOString(),
            ...(infos?.stageKey ? { stageKey: infos.stageKey } : {}),
            // Trace : cette inscription a été rétablie après coup.
            replaceApresPaiement: true,
          });
          touche = true;
          reinscrites++;
          console.warn(
            `[hold] place rétablie après paiement — créneau ${creneauId}, cavalier ${childId}, commande ${paymentId}`,
          );
        }

        if (touche) tx.update(ref, { enrolled: maj, enrolledCount: maj.length });
      });
    }
  } catch (e) {
    console.error("[hold] confirmation des places impossible", paymentId, e);
  }
  return { confirmees, reinscrites };
}
