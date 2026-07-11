export type CatalogueVisual = {
  image: string;
  backgroundSize?: string;
  backgroundPosition?: string;
};

const visual = (image: string, backgroundPosition = "center"): CatalogueVisual => ({
  image,
  backgroundSize: "cover",
  backgroundPosition,
});

const BABY = "/images/vitrine/choices/baby-poney.webp";
const STAGES = "/images/vitrine/choices/stages-enfants.webp";
const SPORT = "/images/vitrine/choices/cavalier-regulier.webp";
const BEACH = "/images/vitrine/choices/balade-plage.webp";

export const CATALOGUE_VISUALS: Record<string, CatalogueVisual> = {
  baby: visual(BABY, "58% center"),
  bronze: visual(STAGES, "42% center"),
  argent: visual(STAGES, "62% center"),
  or: visual(SPORT, "45% center"),
  galop34: visual(SPORT, "68% center"),

  "balade-soleil": visual(BEACH, "38% center"),
  "balade-jour": visual(BEACH, "54% center"),
  "balade-privee": visual(BEACH, "72% center"),
  "randonnee-jeunes": visual(BEACH, "24% center"),

  "cours-loisir": visual(SPORT, "28% center"),
  "cours-compet": visual(SPORT, "58% center"),
  cso: visual(SPORT, "78% center"),
  ponygames: visual(STAGES, "30% center"),
  equifun: visual(STAGES, "74% center"),

  anniversaire: visual(BABY, "35% center"),
  ponyride: visual(BABY, "72% center"),
};

export function getCatalogueVisual(activityId: string): CatalogueVisual {
  return CATALOGUE_VISUALS[activityId] || visual(STAGES);
}
