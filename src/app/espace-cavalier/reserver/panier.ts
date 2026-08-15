/**
 * src/app/espace-cavalier/reserver/panier.ts
 *
 * Préparation des lignes de panier pour un stage : qui peut être ajouté, à
 * quel prix, et quels cavaliers sont en conflit d'horaires.
 *
 * POURQUOI c'est séparé : ce calcul décide du montant que la famille va payer.
 * Il était noyé dans un gestionnaire de clic de 150 lignes qui mélangeait
 * `alert()`, `setState` et arithmétique. Ici la fonction est PURE — elle ne
 * fait qu'inspecter le panier, les créneaux déjà pris et les réglages, puis
 * renvoie les lignes à ajouter et la liste des conflits. La page garde la main
 * sur les messages affichés et sur l'état.
 *
 * Deux garde-fous à ne jamais perdre de vue en touchant ce fichier :
 *  - le doublon (même enfant, même créneau déjà au panier) est ignoré
 *    silencieusement : sans ça, la famille paierait deux fois la même place ;
 *  - le conflit d'horaires (inscription déjà payée OU autre ligne du panier)
 *    bloque l'ajout : un cavalier ne peut pas être à deux endroits à la fois.
 */

import { calculerTarifStage, chevauchement, creneauxOccupesEnfant } from "./utils-reservation";
import type { CartItem, Creneau } from "./types";

// En mode jour, stageCreneaux ne contient QUE les jours sélectionnés ; il faut
// donc passer prixJourParam (prix d'UN jour) et totalJoursStageParam (nombre
// total de jours du stage) calculés par l'appelant, sinon le prorata est faux.
export function preparerAjoutStageAuPanier(opts: {
  stageCreneaux: Creneau[];
  prixJourParam?: number;
  totalJoursStageParam?: number;
  selectedChildren: string[];
  children: any[];
  cart: CartItem[];
  creneaux: Creneau[];
  familyId: string;
  stageBookingMode: "semaine" | "jour";
  existingStageCount: number;
  prixPlancherStage: number;
}): { items: CartItem[]; conflits: { childName: string; date: string }[] } {
  const {
    stageCreneaux, prixJourParam, totalJoursStageParam, selectedChildren, children,
    cart, creneaux, familyId, stageBookingMode, existingStageCount, prixPlancherStage,
  } = opts;

  const first = stageCreneaux[0];
  const prixSemaine = (first as any).priceTTC || first.priceHT * (1 + (first.tvaTaux || 5.5) / 100);
  const allowDay = stageCreneaux.some((c: any) => c.allowDayBooking);
  const isJourMode = allowDay && stageBookingMode === "jour";

  // Calculer le prix effectif
  let prixBase: number;
  if (isJourMode) {
    const totalJours = totalJoursStageParam || stageCreneaux.length;
    const prixJour = prixJourParam ?? (first as any).priceTTCDay ?? Math.round(prixSemaine / Math.max(1, totalJours) * 100) / 100;
    // Prix jour × nb de jours sélectionnés. Si tous les jours sont pris,
    // on retombe sur le prix semaine complet. Pas de remise (gérée plus bas).
    prixBase = (stageCreneaux.length >= totalJours)
      ? prixSemaine
      : Math.round(prixJour * stageCreneaux.length * 100) / 100;
  } else {
    prixBase = prixSemaine;
  }

  const dates = stageCreneaux.map(c => new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short" })).join(", ");

  // Filtrer les enfants déjà dans le panier OU deja inscrits au stage
  const firstCrId = stageCreneaux[0]?.id;

  const conflits: { childName: string; date: string }[] = [];
  const childrenToAdd = selectedChildren.filter(childId => {
    const alreadyInCart = cart.some(i => i.childId === childId && i.creneauIds.includes(firstCrId));
    if (alreadyInCart) {
      console.log(`Doublon panier ignoré: childId=${childId} créneau=${firstCrId}`);
      return false;
    }
    // Verifier conflit horaire : un des creneaux qu'on veut ajouter chevauche
    // un creneau ou l'enfant est deja inscrit (panier ou base)
    const busySlots = creneauxOccupesEnfant(childId, creneaux, cart, familyId);
    for (const targetCr of stageCreneaux) {
      const target = { date: targetCr.date, startTime: targetCr.startTime, endTime: targetCr.endTime };
      for (const busy of busySlots) {
        if (chevauchement(target, busy)) {
          const child = children.find((c: any) => c.id === childId);
          const dateFr = new Date(targetCr.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
          conflits.push({ childName: (child as any)?.firstName || "?", date: `${dateFr} (${target.startTime}-${target.endTime})` });
          console.log(`Conflit horaire ignore: ${childId} ${targetCr.date} ${target.startTime}-${target.endTime} vs deja inscrit ${busy.date} ${busy.startTime}-${busy.endTime}`);
          return false;
        }
      }
    }
    return true;
  });

  // Nombre total de jours du stage pour calculer la remise au prorata.
  // En mode jour, stageCreneaux = jours sélectionnés ; le total vient du param.
  const nbJoursSelectionnes = Math.max(1, stageCreneaux.length);
  const totalJoursStage = isJourMode ? Math.max(nbJoursSelectionnes, totalJoursStageParam || nbJoursSelectionnes) : 1;
  // NB : `nbJoursSemaine` n'est plus lu par personne depuis que la remise se
  // calcule au rang et non au prorata des jours. Conservé tel quel lors de
  // l'extraction (aucun changement de comportement) — à supprimer sciemment,
  // pas par accident, le jour où le prorata sera définitivement abandonné.
  const nbJoursSemaine = totalJoursStage; // dénominateur du prorata
  void nbJoursSemaine;

  const items: CartItem[] = childrenToAdd.map((childId, idx) => {
    const child = children.find((c: any) => c.id === childId);
    const rang = existingStageCount + idx;
    // En mode JOUR : prix jour brut (prixBase = prixJour × nb jours), AUCUNE
    // remise, AUCUN plancher. En mode semaine : remise dégressive + plancher.
    const { prixFinal, remise: remiseEffective } = calculerTarifStage(prixBase, rang, isJourMode, prixPlancherStage);
    return {
      creneauIds: stageCreneaux.map(c => c.id),
      activityTitle: first.activityTitle,
      dates: isJourMode ? `${stageCreneaux.length} jour${stageCreneaux.length > 1 ? "s" : ""} (${dates})` : `${stageCreneaux.length} jours (${dates})`,
      childId,
      childName: (child as any)?.firstName || "?",
      prixBase: Math.round(prixBase * 100) / 100,
      remiseEuros: remiseEffective,
      rang: rang + 1,
      prixFinal,
      isStage: true,
    };
  });

  return { items, conflits };
}
