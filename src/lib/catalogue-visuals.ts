export type CatalogueVisual = {
  image: string;
  backgroundSize?: string;
  backgroundPosition?: string;
};

const SPRITE = "/api/catalogue-scenes";
const sprite = (column: 0 | 1 | 2 | 3, row: 0 | 1 | 2): CatalogueVisual => ({
  image: SPRITE,
  backgroundSize: "400% 300%",
  backgroundPosition: `${column * 33.333333}% ${row * 50}%`,
});

export const CATALOGUE_VISUALS: Record<string, CatalogueVisual> = {
  baby: sprite(0, 0),
  bronze: sprite(1, 0),
  argent: sprite(2, 0),
  or: sprite(3, 0),
  galop34: sprite(0, 1),
  "balade-soleil": sprite(1, 1),
  "balade-jour": sprite(2, 1),
  "balade-privee": sprite(3, 1),
  "randonnee-jeunes": sprite(0, 2),
  "cours-loisir": sprite(1, 2),
  "cours-compet": sprite(2, 2),
  cso: sprite(3, 2),
  ponygames: sprite(2, 0),
  equifun: sprite(1, 2),
  anniversaire: sprite(3, 2),
  ponyride: sprite(0, 0),
};

export function getCatalogueVisual(activityId: string): CatalogueVisual {
  return CATALOGUE_VISUALS[activityId] || sprite(2, 0);
}
