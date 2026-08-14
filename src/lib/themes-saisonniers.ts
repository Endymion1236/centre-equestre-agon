/**
 * Thèmes saisonniers du site vitrine.
 *
 * Parti pris : la charte du centre (bleu roi + or, tirée du logo) n'est JAMAIS
 * remplacée. Un thème ajoute une touche — un bandeau teinté, une émoticône
 * dans le titre, quelques éléments décoratifs — et rien de plus. Repeindre
 * tout le site trois semaines par an abîmerait une identité qui fonctionne.
 *
 * Activation manuelle depuis l'admin (settings/theme), jamais par date : on
 * ne veut pas de citrouilles qui apparaissent seules un 1er octobre au matin.
 */

export type ThemeId = "aucun" | "halloween" | "noel" | "hiver" | "paques";

export interface ThemeSaisonnier {
  id: ThemeId;
  label: string;
  /** Émoticône ajoutée au bandeau d'annonce, pas au logo. */
  emoji: string;
  /** Message affiché dans le bandeau, modifiable depuis l'admin. */
  messageDefaut: string;
  /** Couleurs du seul bandeau — le reste du site garde sa charte. */
  bandeauFond: string;
  bandeauTexte: string;
  bandeauBordure: string;
  /** Décor flottant discret : émoticônes qui tombent lentement. */
  particules: string[];
}

export const THEMES: Record<ThemeId, ThemeSaisonnier> = {
  aucun: {
    id: "aucun", label: "Aucun (charte habituelle)", emoji: "",
    messageDefaut: "", bandeauFond: "", bandeauTexte: "", bandeauBordure: "",
    particules: [],
  },
  halloween: {
    id: "halloween", label: "Halloween", emoji: "🎃",
    messageDefaut: "Animation Halloween au centre équestre — réservez votre place !",
    bandeauFond: "#2e1065", bandeauTexte: "#fed7aa", bandeauBordure: "#f97316",
    particules: ["🎃", "🦇", "🕸️"],
  },
  noel: {
    id: "noel", label: "Noël", emoji: "🎄",
    messageDefaut: "Offrez un bon cadeau : balade, stage ou cours au choix.",
    bandeauFond: "#14532d", bandeauTexte: "#fef3c7", bandeauBordure: "#dc2626",
    particules: ["❄️", "🎄", "⭐"],
  },
  hiver: {
    id: "hiver", label: "Vacances d'hiver", emoji: "❄️",
    messageDefaut: "Stages des vacances d'hiver : les inscriptions sont ouvertes.",
    bandeauFond: "#0c4a6e", bandeauTexte: "#e0f2fe", bandeauBordure: "#38bdf8",
    particules: ["❄️", "⛄"],
  },
  paques: {
    id: "paques", label: "Pâques", emoji: "🐣",
    messageDefaut: "Chasse aux œufs à poney pendant les vacances de printemps !",
    bandeauFond: "#3f6212", bandeauTexte: "#fef9c3", bandeauBordure: "#facc15",
    particules: ["🐣", "🌷", "🥚"],
  },
};

export const THEMES_LISTE = Object.values(THEMES);
