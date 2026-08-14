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
  /** Décor flottant : émoticônes qui tombent lentement. */
  particules: string[];
  /** Densité du décor (nombre d'éléments à l'écran). */
  densite: number;
  /** Titre de la page d'accueil, remplace « L'équitation les pieds dans le sable ». */
  heroTitre: string;
  heroSousTitre: string;
  /** Accent : remplace l'or du dégradé de titre et des boutons secondaires. */
  accent: string;
  accentClair: string;
  /** Teinte appliquée par-dessus la photo d'accueil (superposition). */
  heroVoile: string;
  /** Décorations d'angle sur la page d'accueil, en grand format. */
  coins: string[];
  /** Brume en bas de page. */
  brume: string;
}

export const THEMES: Record<ThemeId, ThemeSaisonnier> = {
  aucun: {
    id: "aucun", label: "Aucun (charte habituelle)", emoji: "",
    messageDefaut: "", bandeauFond: "", bandeauTexte: "", bandeauBordure: "",
    particules: [], densite: 0, heroTitre: "", heroSousTitre: "",
    accent: "", accentClair: "", heroVoile: "", coins: [], brume: "",
  },
  halloween: {
    id: "halloween", label: "Halloween", emoji: "🎃",
    messageDefaut: "Animation Halloween au centre équestre — réservez votre place !",
    bandeauFond: "#2e1065", bandeauTexte: "#fed7aa", bandeauBordure: "#f97316",
    particules: ["🎃", "🦇", "🕷️", "👻"],
    densite: 16,
    heroTitre: "Halloween",
    heroSousTitre: "au centre équestre",
    accent: "#f97316", accentClair: "#fdba74",
    heroVoile: "linear-gradient(90deg,rgba(46,16,101,0.82) 0%,rgba(76,29,149,0.55) 47%,rgba(120,53,15,0.25) 100%)",
    coins: ["🎃", "🕸️", "🦇", "🕸️"],
    brume: "rgba(249,115,22,0.16)",
  },
  noel: {
    id: "noel", label: "Noël", emoji: "🎄",
    messageDefaut: "Offrez un bon cadeau : balade, stage ou cours au choix.",
    bandeauFond: "#14532d", bandeauTexte: "#fef3c7", bandeauBordure: "#dc2626",
    particules: ["❄️", "🎄", "⭐", "🎁"],
    densite: 18,
    heroTitre: "Noël",
    heroSousTitre: "au centre équestre",
    accent: "#dc2626", accentClair: "#fca5a5",
    heroVoile: "linear-gradient(90deg,rgba(5,46,22,0.82) 0%,rgba(20,83,45,0.55) 47%,rgba(127,29,29,0.22) 100%)",
    coins: ["🎄", "⭐", "🎁", "❄️"],
    brume: "rgba(220,38,38,0.14)",
  },
  hiver: {
    id: "hiver", label: "Vacances d'hiver", emoji: "❄️",
    messageDefaut: "Stages des vacances d'hiver : les inscriptions sont ouvertes.",
    bandeauFond: "#0c4a6e", bandeauTexte: "#e0f2fe", bandeauBordure: "#38bdf8",
    particules: ["❄️", "⛄", "🧣"],
    densite: 20,
    heroTitre: "Vacances d'hiver",
    heroSousTitre: "à poney",
    accent: "#38bdf8", accentClair: "#bae6fd",
    heroVoile: "linear-gradient(90deg,rgba(8,47,73,0.82) 0%,rgba(12,74,110,0.52) 47%,rgba(56,189,248,0.18) 100%)",
    coins: ["❄️", "⛄", "❄️", "🧤"],
    brume: "rgba(186,230,253,0.30)",
  },
  paques: {
    id: "paques", label: "Pâques", emoji: "🐣",
    messageDefaut: "Chasse aux œufs à poney pendant les vacances de printemps !",
    bandeauFond: "#3f6212", bandeauTexte: "#fef9c3", bandeauBordure: "#facc15",
    particules: ["🐣", "🌷", "🥚", "🦋"],
    densite: 15,
    heroTitre: "Pâques",
    heroSousTitre: "au centre équestre",
    accent: "#facc15", accentClair: "#fef08a",
    heroVoile: "linear-gradient(90deg,rgba(54,83,20,0.78) 0%,rgba(101,163,13,0.48) 47%,rgba(250,204,21,0.20) 100%)",
    coins: ["🌷", "🐣", "🥚", "🦋"],
    brume: "rgba(250,204,21,0.16)",
  },
};

export const THEMES_LISTE = Object.values(THEMES);
