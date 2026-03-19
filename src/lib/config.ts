// ═══ Centre Équestre Agon-Coutainville — Configuration ═══

export const SITE_CONFIG = {
  name: "Centre Équestre d'Agon-Coutainville",
  shortName: "Centre Équestre Agon",
  description: "L'équitation les pieds dans le sable",
  address: {
    street: "56 Charrière du Commerce",
    city: "Agon-Coutainville",
    zip: "50230",
    region: "Normandie",
    country: "France",
  },
  contact: {
    phone: "02 44 84 99 96",
    mobile: "06 09 02 71 59",
    email: "ceagon@orange.fr",
  },
  social: {
    facebook: "https://www.facebook.com/ceagon50230",
    instagram: "",
  },
  url: "https://www.centreequestreagon.com",
  since: 1976,
  distanceToBeach: "800m",
} as const;

export const COLORS = {
  blue: {
    50: "#EDF2FA",
    100: "#D0DFEF",
    200: "#A1BFE0",
    300: "#6B9AD0",
    400: "#3068C0",
    500: "#2050A0", // Primary — from logo
    600: "#183878",
    700: "#122A5A",
    800: "#0C1A2E",
    900: "#060D17",
  },
  gold: {
    50: "#FFF8E8",
    100: "#FAECC0",
    200: "#F4D88A",
    300: "#F4B840",
    400: "#F0A010", // Accent — from logo
    500: "#D4880A",
    600: "#A06808",
    700: "#704A06",
    800: "#402A04",
    900: "#201502",
  },
  cream: "#FEFCF8",
  sand: "#FAF6F0",
} as const;

// Horaires par saison
export const SCHEDULE = {
  summer: { period: "Juillet – Août", days: "Lun – Sam", hours: "9h – 19h" },
  holidays: { period: "Vacances scolaires", days: "Lun – Ven", hours: "9h – 18h" },
  school: { period: "Période scolaire", days: "Mer, Sam", hours: "9h – 18h" },
  winter: { period: "Décembre – Février", days: "Fermé", hours: "—" },
} as const;

// Politique d'annulation (configurable dans le back-office)
export const CANCELLATION = {
  freeHoursBefore: 72,
  retentionPercent: 50,
  refundMode: "choice" as "choice" | "cb_only" | "credit_only",
} as const;
