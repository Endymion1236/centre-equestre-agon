/**
 * Tours guidés (walkthroughs) basés sur driver.js
 *
 * Usage dans une page admin :
 *   import { startTour } from "@/lib/manual-tours";
 *   <button onClick={() => startTour("planning-enroll")}>?</button>
 *
 * Chaque tour est identifié par un ID (référencé depuis le manuel).
 * Le premier passage est mémorisé dans localStorage pour ne pas relancer
 * automatiquement, mais l'utilisateur peut toujours relancer via le bouton d'aide.
 */

import { driver, type Config } from "driver.js";
import "driver.js/dist/driver.css";

type TourStep = {
  element?: string; // sélecteur CSS (optionnel pour étapes sans highlight)
  popover: {
    title: string;
    description: string; // HTML autorisé
  };
};

const TOURS: Record<string, TourStep[]> = {
  // ─── Cavaliers ──────────────────────────────────────────────
  "cavaliers-create-family": [
    {
      popover: {
        title: "Ajouter une nouvelle famille",
        description: "Ce tour te montre comment créer une famille complète en quelques clics.",
      },
    },
    {
      element: "[data-tour='add-family-btn']",
      popover: {
        title: "Bouton Ajouter",
        description: "Clique ici pour ouvrir le formulaire de création.",
      },
    },
  ],

  // ─── Planning ───────────────────────────────────────────────
  "planning-views": [
    {
      popover: {
        title: "Les 3 vues du planning",
        description: "Semaine pour la vue d'ensemble, Jour pour les inscriptions, Timeline pour détecter les chevauchements.",
      },
    },
    {
      element: "[data-tour='planning-view-switcher']",
      popover: {
        title: "Changer de vue",
        description: "Bascule entre Semaine / Jour / Timeline selon ce dont tu as besoin.",
      },
    },
  ],

  "planning-enroll": [
    {
      popover: {
        title: "Inscrire un cavalier à un créneau",
        description: "Voici les étapes pour inscrire un cavalier à un cours ou stage.",
      },
    },
    {
      element: "[data-tour='creneau-card']",
      popover: {
        title: "1. Choisis un créneau",
        description: "Clique sur un créneau pour ouvrir le panneau d'inscription.",
      },
    },
    {
      element: "[data-tour='enroll-search']",
      popover: {
        title: "2. Cherche la famille",
        description: "Tape le nom ou prénom pour trouver la famille concernée.",
      },
    },
    {
      element: "[data-tour='enroll-children']",
      popover: {
        title: "3. Sélectionne les enfants",
        description: "Tu peux cocher plusieurs enfants pour les inscrire en une seule fois.",
      },
    },
    {
      element: "[data-tour='enroll-mode']",
      popover: {
        title: "4. Choisis le mode",
        description: "Ponctuel pour une seule séance, Forfait annuel pour toutes les séances du trimestre/année.",
      },
    },
    {
      element: "[data-tour='enroll-validate']",
      popover: {
        title: "5. Valide",
        description: "L'inscription est créée, un email de confirmation est envoyé automatiquement.",
      },
    },
  ],

  // ─── Paiements ──────────────────────────────────────────────
  "paiements-encaisser": [
    {
      popover: {
        title: "Encaisser un paiement",
        description: "Workflow complet d'un encaissement au comptoir.",
      },
    },
    {
      element: "[data-tour='pay-family']",
      popover: {
        title: "1. Choisis la famille",
        description: "La recherche trouve une famille par nom, prénom parent ou prénom enfant.",
      },
    },
    {
      element: "[data-tour='pay-cart']",
      popover: {
        title: "2. Ajoute au panier",
        description: "Ajoute les activités (cours, stages, forfaits) ou fais une saisie libre.",
      },
    },
    {
      element: "[data-tour='pay-mode']",
      popover: {
        title: "3. Mode de paiement",
        description: "CB, chèque, espèces, chèques différés... adapte selon la situation.",
      },
    },
    {
      element: "[data-tour='pay-validate']",
      popover: {
        title: "4. Valide",
        description: "La commande est créée, l'encaissement enregistré, la facture générée.",
      },
    },
  ],

  "cheques-differes": [
    {
      popover: {
        title: "Chèques différés",
        description: "Pour les paiements en plusieurs chèques encaissés à des dates différentes.",
      },
    },
    {
      element: "[data-tour='mode-cheque-differe']",
      popover: {
        title: "1. Sélectionne ce mode",
        description: "Une section orange apparaît pour saisir chaque chèque individuellement.",
      },
    },
    {
      element: "[data-tour='cheques-list']",
      popover: {
        title: "2. Saisis les chèques",
        description: "Pour chacun : n°, banque, montant, date d'encaissement prévue.",
      },
    },
    {
      element: "[data-tour='cheques-differes-tab']",
      popover: {
        title: "3. Suivi",
        description: "L'onglet Chèques différés liste tous les chèques à venir, groupés par mois.",
      },
    },
  ],

  // ─── Montoir ────────────────────────────────────────────────
  "montoir-assign": [
    {
      popover: {
        title: "Montoir — assigner les poneys",
        description: "Ce tour te montre comment organiser les équidés pour la journée.",
      },
    },
    {
      element: "[data-tour='montoir-charge']",
      popover: {
        title: "Charge poneys",
        description: "Vue d'ensemble de la charge de chaque poney pour la journée (séances, heures). Surveille les poneys en orange/rouge.",
      },
    },
    {
      element: "[data-tour='montoir-assign-select']",
      popover: {
        title: "Assigner un poney",
        description: "Pour chaque cavalier, choisis le poney adapté dans le menu déroulant.",
      },
    },
    {
      element: "[data-tour='montoir-presence']",
      popover: {
        title: "Marquer les présences",
        description: "Vert présent, rouge absent. Utilisé pour le suivi pédagogique.",
      },
    },
  ],
};

/**
 * Démarre un tour guidé par son ID.
 * Si l'ID n'existe pas, affiche une alerte (dev only).
 */
export function startTour(tourId: string): void {
  const steps = TOURS[tourId];
  if (!steps) {
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      console.warn(`[manual-tours] Tour introuvable : ${tourId}`);
    }
    return;
  }

  const config: Config = {
    showProgress: true,
    showButtons: ["next", "previous", "close"],
    nextBtnText: "Suivant →",
    prevBtnText: "← Précédent",
    doneBtnText: "Terminer",
    progressText: "Étape {{current}}/{{total}}",
    steps: steps.map(s => ({
      element: s.element,
      popover: {
        title: s.popover.title,
        description: s.popover.description,
      },
    })),
    onDestroyed: () => {
      // Mémoriser que le tour a été suivi (pour ne pas le relancer automatiquement)
      try {
        localStorage.setItem(`tour-seen-${tourId}`, "1");
      } catch {}
    },
  };

  const d = driver(config);
  d.drive();
}

/**
 * Retourne true si le tour n'a jamais été vu (utile pour afficher un badge "nouveau").
 */
export function isTourNew(tourId: string): boolean {
  try {
    return !localStorage.getItem(`tour-seen-${tourId}`);
  } catch {
    return false;
  }
}

/**
 * Liste tous les tours disponibles (pour le manuel).
 */
export function getAvailableTours(): string[] {
  return Object.keys(TOURS);
}
