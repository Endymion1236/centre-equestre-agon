export type CatalogueVisual = {
  image: string;
  backgroundSize?: string;
  backgroundPosition?: string;
};

const SPRITE = "/images/vitrine/catalogue/activity-scenes.webp";
const sprite = (column: 0 | 1 | 2 | 3, row: 0 | 1 | 2): CatalogueVisual => ({
  image: SPRITE,
  backgroundSize: "400% 300%",
  backgroundPosition: `${column * 33.333333}% ${row * 50}%`,
});

export const CATALOGUE_VISUALS: Record<string, CatalogueVisual> = {
  baby: sprite(0, 0),
  bronze: sprite(1, 0),
  argent: { image: "/images/vitrine/choices/stages-enfants.webp" },
  or: sprite(2, 0),
  galop34: sprite(2, 1),

  "balade-soleil": { image: "/images/vitrine/choices/balade-plage.webp" },
  "balade-jour": sprite(3, 0),
  "balade-privee": sprite(3, 2),
  "randonnee-jeunes": sprite(2, 2),

  "cours-loisir": sprite(3, 1),
  "cours-compet": sprite(0, 2),
  cso: { image: "/images/vitrine/choices/cavalier-regulier.webp" },
  ponygames: sprite(1, 1),
  equifun: sprite(1, 2),

  anniversaire: sprite(0, 1),
  ponyride: { image: "/images/vitrine/choices/baby-poney.webp" },
};

export function getCatalogueVisual(activityId: string): CatalogueVisual {
  return CATALOGUE_VISUALS[activityId] || { image: "/images/vitrine/choices/stages-enfants.webp" };
}
