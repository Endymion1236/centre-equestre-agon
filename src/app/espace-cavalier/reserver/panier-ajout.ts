/**
 * src/app/espace-cavalier/reserver/panier-ajout.ts
 *
 * Ajouter un stage ou un cours au panier de la famille — sorti de la page
 * de réservation (2 000 lignes), sur le modèle des actions du planning :
 * tout ce dont ces fonctions ont besoin arrive par un contexte explicite,
 * et ce qu'elles doivent rafraîchir passe par des rappels. Rien du
 * traitement n'a changé.
 */

import type { Dispatch, SetStateAction } from "react";
import { estPromenadeADefinir, niveauDuCreneau, LIBELLE_NIVEAU, type NiveauPromenade } from "@/lib/promenade-niveau";
import { choisirCarte, compterReservationsParCarte, libelleCarte, type CarteLike } from "@/lib/cartes-seances";
import { prixInscriptionCavalier } from "@/lib/tarif-forfaitaire";
import { todayLocalString } from "@/lib/date-local";
import type { CartItem, Creneau } from "./types";

/** Ce que la page sait, et que l'ajout au panier doit lire. */
export interface ContexteAjout {
  creneaux: Creneau[];
  cart: CartItem[];
  /** Cavaliers de la famille, enfants liés compris. */
  children: any[];
  familyId: string;
  user: { uid?: string } | null | undefined;
  familyCartes: CarteLike[];
  reservationsFermees: boolean;
  messageFermeture: string;
  stageBookingMode: "semaine" | "jour";
  selectedChildren: string[];
  existingStageCount: number;
  prixPlancherStage: number;
  stageGroups: Record<string, Creneau[]>;
}

/** Ce que l'ajout au panier doit mettre à jour dans la page. */
export interface RappelsAjout {
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  setSelectedChildren: (ids: string[]) => void;
  setSelectedCreneau: (c: Creneau | null) => void;
  setShowCart: (v: boolean) => void;
  setBookingCreneau: (c: Creneau | null) => void;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

/** AAAA-MM-JJ en heure locale (les dates de créneaux sont des jours civils). */
export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** « Prénom Nom », tel que l'attend le planning. */
export function nomCompletCavalier(child: any): string {
  const prenom = String(child?.firstName || "?").split(" (")[0].trim();
  const nom = String(child?.lastName || "").trim();
  return nom ? `${prenom} ${nom}` : prenom;
}

export const isStage = (c: Pick<Creneau, "activityType">) => c.activityType === "stage" || c.activityType === "stage_journee";

// Ajouter au panier (stage = multi-enfants, cours = 1 enfant)
// En mode jour, stageCreneaux ne contient QUE les jours sélectionnés ; il faut
// donc passer prixJourParam (prix d'UN jour) et totalJoursStageParam (nombre
// total de jours du stage) calculés par l'appelant, sinon le prorata est faux.
export function ajouterStageAuPanier(
  ctx: ContexteAjout,
  rappels: RappelsAjout,
  stageCreneaux: Creneau[],
  prixJourParam?: number,
  totalJoursStageParam?: number,
  // Cavaliers explicites : la carte du stage passe par la sélection à
  // l'écran, mais un jour de stage ajouté depuis un autre chemin (lien
  // ?creneau=, place tenue) ne connaît qu'un cavalier à la fois.
  childIdsParam?: string[],
) {
const { creneaux, cart, children, familyId, reservationsFermees, messageFermeture, stageBookingMode, selectedChildren, existingStageCount, prixPlancherStage } = ctx;
const { setCart, setSelectedChildren, setSelectedCreneau, setShowCart } = rappels;
  if (reservationsFermees) {
    alert(messageFermeture ||
      "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande.");
    return;
  }

  const enfantsAAjouter = childIdsParam ?? selectedChildren;
  if (enfantsAAjouter.length === 0) return;
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

  // Helper : 2 plages horaires se chevauchent-elles le meme jour ?
  // Compare date + intersection [start,end]. Renvoie true si chevauchement.
  const overlap = (a: { date: string; startTime: string; endTime: string }, b: { date: string; startTime: string; endTime: string }) => {
    if (a.date !== b.date) return false;
    // Comparaison HH:MM en string fonctionne tant qu'on a le format "HH:MM" ou "HH:MM:SS"
    const aStart = a.startTime || "00:00";
    const aEnd = a.endTime || "23:59";
    const bStart = b.startTime || "00:00";
    const bEnd = b.endTime || "23:59";
    // Pas de chevauchement si a finit avant que b commence, ou b finit avant a
    return !(aEnd <= bStart || bEnd <= aStart);
  };

  // Recuperer pour un enfant la liste de tous ses creneaux deja "pris" :
  // - inscriptions deja payees (enrolled[] des creneaux en base)
  // - items dans le panier (stages et cours)
  const getChildBusySlots = (childId: string): { date: string; startTime: string; endTime: string }[] => {
    const slots: { date: string; startTime: string; endTime: string }[] = [];
    // 1. Inscriptions deja payees : on parcourt creneaux qui ont enrolled[]
    for (const c of creneaux) {
      if ((c.enrolled || []).some((e: any) => e.childId === childId && e.familyId === familyId)) {
        slots.push({ date: c.date, startTime: c.startTime, endTime: c.endTime });
      }
    }
    // 2. Items du panier : parcourir creneauIds[] et resoudre vers le creneau
    for (const item of cart) {
      if (item.childId !== childId) continue;
      for (const cid of (item.creneauIds || [])) {
        const cr = creneaux.find(c => c.id === cid);
        if (cr) slots.push({ date: cr.date, startTime: cr.startTime, endTime: cr.endTime });
      }
    }
    return slots;
  };

  const conflits: { childName: string; date: string }[] = [];
  const childrenToAdd = enfantsAAjouter.filter(childId => {
    const alreadyInCart = cart.some(i => i.childId === childId && i.creneauIds.includes(firstCrId));
    if (alreadyInCart) {
      console.log(`Doublon panier ignoré: childId=${childId} créneau=${firstCrId}`);
      return false;
    }
    // Verifier conflit horaire : un des creneaux qu'on veut ajouter chevauche
    // un creneau ou l'enfant est deja inscrit (panier ou base)
    const busySlots = getChildBusySlots(childId);
    for (const targetCr of stageCreneaux) {
      const target = { date: targetCr.date, startTime: targetCr.startTime, endTime: targetCr.endTime };
      for (const busy of busySlots) {
        if (overlap(target, busy)) {
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

  // Message clair si certains enfants ont des conflits
  if (conflits.length > 0) {
    const details = conflits.slice(0, 5).map(c => `• ${c.childName} : ${c.date}`).join("\n");
    const plus = conflits.length > 5 ? `\n... et ${conflits.length - 5} autre(s)` : "";
    alert(`⚠️ Conflit d'horaires détecté :\n\n${details}${plus}\n\nCet enfant est déjà inscrit à un autre stage/cours à ce moment-là. Désinscrivez-le d'abord ou choisissez une autre période.`);
    setSelectedChildren([]);
    setSelectedCreneau(null);
    return;
  }

  // Nombre total de jours du stage pour calculer la remise au prorata.
  // En mode jour, stageCreneaux = jours sélectionnés ; le total vient du param.
  const nbJoursSelectionnes = Math.max(1, stageCreneaux.length);
  const totalJoursStage = isJourMode ? Math.max(nbJoursSelectionnes, totalJoursStageParam || nbJoursSelectionnes) : 1;
  const nbJoursSemaine = totalJoursStage; // dénominateur du prorata

  const newItems: CartItem[] = childrenToAdd.map((childId, idx) => {
    const child = children.find((c: any) => c.id === childId);
    const rang = existingStageCount + idx;
    // En mode JOUR : prix jour brut (prixBase = prixJour × nb jours), AUCUNE
    // remise, AUCUN plancher. En mode semaine : remise dégressive + plancher.
    let remiseEffective: number;
    let prixFinal: number;
    if (isJourMode) {
      remiseEffective = 0;
      prixFinal = Math.max(0, Math.round(prixBase * 100) / 100);
    } else {
      const remiseSemaine = rang === 0 ? 0 : rang === 1 ? 10 : rang === 2 ? 20 : 20 + (rang - 2) * 10;
      prixFinal = Math.max(0, Math.round((prixBase - remiseSemaine) * 100) / 100);
      remiseEffective = remiseSemaine;
      // Plancher uniquement en mode semaine.
      if (prixPlancherStage > 0 && prixFinal < prixPlancherStage) {
        prixFinal = prixPlancherStage;
        remiseEffective = Math.max(0, Math.round((prixBase - prixPlancherStage) * 100) / 100);
      }
    }
    return {
      creneauIds: stageCreneaux.map(c => c.id),
      activityTitle: first.activityTitle,
      dates: isJourMode ? `${stageCreneaux.length} jour${stageCreneaux.length > 1 ? "s" : ""} (${dates})` : `${stageCreneaux.length} jours (${dates})`,
      childId,
      // Prénom ET nom, comme pour les cours : le planning n'affichait que le
      // prénom des inscriptions prises en ligne.
      childName: nomCompletCavalier(child),
      prixBase: Math.round(prixBase * 100) / 100,
      remiseEuros: remiseEffective,
      rang: rang + 1,
      prixFinal,
      isStage: true,
    };
  });

  // Forme fonctionnelle par coherence (ce chemin ajoute tous les enfants
  // d'un coup, mais un appel concurrent ne doit rien ecraser).
  setCart((prev) => [...prev, ...newItems]);
  setSelectedChildren([]);
  setSelectedCreneau(null);
  setShowCart(true);
}

export function ajouterCoursAuPanier(
  ctx: ContexteAjout,
  rappels: RappelsAjout,
  creneau: Creneau,
  childId: string,
  opts?: { viaHold?: boolean; niveauPromenade?: NiveauPromenade },
) {
const { creneaux, cart, children, user, familyCartes, reservationsFermees, messageFermeture, stageGroups } = ctx;
const { setCart, setSelectedChildren, setSelectedCreneau, setBookingCreneau, toast } = rappels;
  if (reservationsFermees) {
    alert(messageFermeture ||
      "Les réservations en ligne ne sont pas encore ouvertes. Contactez le centre équestre pour toute demande.");
    return;
  }

  // Un jour de STAGE arrivé par un chemin « cours » — lien ?creneau= reçu
  // par email, place tenue en liste d'attente — était traité comme une
  // séance ordinaire : prix plein de la semaine facturé d'un coup, sans
  // acompte, et pour la seule journée cliquée. Une famille a ainsi réglé
  // 350 € le 31/08/2026 au lieu des 60 € d'acompte pour ses deux enfants.
  // On le renvoie sur la logique stage : semaine complète et acompte.
  if (isStage(creneau)) {
    const d = new Date(creneau.date);
    const lundi = new Date(d); lundi.setDate(lundi.getDate() - ((d.getDay() + 6) % 7));
    const cle = `${(creneau as any).stageGroupId || creneau.activityId}_${fmtDate(lundi)}`;
    const jours = (stageGroups[cle] || [creneau]).slice().sort((a, b) => a.date.localeCompare(b.date));
    ajouterStageAuPanier(ctx, rappels, jours, undefined, undefined, [childId]);
    return;
  }

  // Bloquer le doublon panier (verification rapide sur l'etat courant ;
  // la garde definitive est dans le setCart fonctionnel ci-dessous)
  if (cart.some(i => i.childId === childId && i.creneauIds.includes(creneau.id))) {
    toast("Cet enfant est déjà dans le panier pour ce créneau.", "warning");
    return;
  }
  const child = children.find((c: any) => c.id === childId);

  // ── Promenade au niveau fixé par la première inscription ──────────
  // Tant que personne n'a réservé, la famille doit déclarer le niveau de
  // son cavalier : on passe par la fenêtre de choix, qui le demande.
  // Une fois le niveau verrouillé, il est repris tel quel.
  let niveauPromenade: NiveauPromenade | undefined = opts?.niveauPromenade;
  if (estPromenadeADefinir(creneau as any)) {
    const fixe = niveauDuCreneau(creneau as any);
    if (fixe) niveauPromenade = fixe;
    else if (!niveauPromenade) { setBookingCreneau(creneau); return; }
  }

  // ── Règle métier : 12 ans minimum pour les promenades ──────────────
  // "Année des 12 ans" : l'enfant doit être né au plus tard l'année N-12
  // (où N = année courante). Ex : en 2026, il faut être né en 2014 ou avant.
  if (creneau.activityType === "balade" && child && !opts?.viaHold) {
    const bd: any = (child as any).birthDate;
    const birthDate = bd?.seconds ? new Date(bd.seconds * 1000) : (bd ? new Date(bd) : null);
    if (birthDate && !isNaN(birthDate.getTime())) {
      const anneeSeuil = new Date().getFullYear() - 12;
      if (birthDate.getFullYear() > anneeSeuil) {
        alert(
          `Désolé, l'inscription aux promenades est réservée aux cavaliers qui ont 12 ans (ou plus) dans l'année en cours.\n\n` +
          `${(child as any)?.firstName || "Cet enfant"} est trop jeune pour cette activité.\n\n` +
          `Contactez le centre équestre pour voir les alternatives adaptées à son âge.`
        );
        return;
      }
    } else {
      // Pas de date de naissance renseignée → on bloque par précaution et on invite à compléter
      alert(
        `Aucune date de naissance n'est renseignée pour ${(child as any)?.firstName || "cet enfant"}.\n\n` +
        `Les promenades sont réservées aux cavaliers de 12 ans et plus. Merci de compléter la date de naissance dans le profil avant l'inscription.`
      );
      return;
    }
  }
  // ── fin règle d'âge ────────────────────────────────────────────────

  const priceTTC = (creneau as any).priceTTC || creneau.priceHT * (1 + (creneau.tvaTaux || 5.5) / 100);
  // Prénom ET nom : le planning n'affichait que « Loucia », impossible de
  // savoir de quelle famille il s'agit quand deux cavaliers partagent un
  // prénom. L'inscription depuis l'administration, elle, écrit « Prénom Nom ».
  // Le suffixe « (NomFamille) » des cavaliers liés est retiré au passage.
  const cleanName = nomCompletCavalier(child);
  const sourceFamilyId = (child as any)?.sourceFamilyId || null;
  // ⚠️ Forme FONCTIONNELLE obligatoire : `setCart([...cart, x])` capture le
  // panier fige au rendu. Sur une inscription multi-cavaliers (boucle
  // forEach sur la selection), les deux appels partaient du meme panier et
  // le second ECRASAIT le premier — une seule personne etait facturee.
  setCart((prev) => {
    if (prev.some(i => i.childId === childId && i.creneauIds.includes(creneau.id))) return prev;
    // Créneau au tarif forfaitaire (balade privatisée) : le prix est celui
    // de la sortie, pas du cavalier. Le premier de la famille le porte, les
    // suivants sont à 0 € — qu'ils soient ajoutés au panier maintenant ou
    // déjà inscrits sur ce créneau.
    const dejaFamille =
      prev.filter(i => i.creneauIds.includes(creneau.id)).length
      + ((creneau as any).enrolled || []).filter((e: any) => e?.familyId === user?.uid).length;
    const prix = prixInscriptionCavalier(creneau as any, dejaFamille);
    // ── Carte de séances ──────────────────────────────────────────────
    // Si une carte active couvre ce créneau pour ce cavalier, la séance est
    // prise dessus : 0 € au panier, inscription ferme sans paiement. Les
    // séances déjà réservées (créneaux à venir + panier) sont déduites pour
    // ne pas réserver au-delà de la carte. Le serveur revérifie tout.
    const reservees = compterReservationsParCarte(creneaux as any[], todayLocalString());
    for (const i of prev) if (i.cardId) reservees[i.cardId] = (reservees[i.cardId] || 0) + 1;
    const carte = !(creneau as any).tarifForfaitaire && prix > 0
      ? choisirCarte(familyCartes, { childId, activityType: creneau.activityType, date: creneau.date }, reservees)
      : null;
    return [...prev, {
      creneauIds: [creneau.id],
      // Le niveau de la promenade fait partie du libellé : réservation,
      // commande, facture et emails le reprennent.
      activityTitle: (niveauPromenade && estPromenadeADefinir(creneau as any)
          ? `${creneau.activityTitle} — ${LIBELLE_NIVEAU[niveauPromenade]}`
          : creneau.activityTitle)
        + ((creneau as any).tarifForfaitaire && prix <= 0 ? " — inclus au forfait" : ""),
      ...(niveauPromenade ? { niveauPromenade } : {}),
      dates: new Date(creneau.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
      childId,
      childName: cleanName,
      prixBase: Math.round(prix * 100) / 100,
      remiseEuros: 0,
      rang: 0,
      prixFinal: carte ? 0 : Math.round(prix * 100) / 100,
      isStage: false,
      ...(sourceFamilyId ? { sourceFamilyId } : {}),
      ...(carte ? { cardId: carte.id, carteLabel: libelleCarte(carte) } : {}),
    }];
  });
  setSelectedCreneau(null);
  setSelectedChildren([]);
}
