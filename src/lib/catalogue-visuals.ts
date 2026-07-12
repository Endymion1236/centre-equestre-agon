export type CatalogueVisual = {
  image: string;
  backgroundSize?: string;
  backgroundPosition?: string;
};

const visual = (activityId: string): CatalogueVisual => ({
  image: `/images/vitrine/catalogue/${activityId}.svg`,
  backgroundSize: "cover",
  backgroundPosition: "right center",
});

export const CATALOGUE_VISUALS: Record<string, CatalogueVisual> = {
  baby: visual("baby"),
  bronze: visual("bronze"),
  argent: visual("argent"),
  or: visual("or"),
  galop34: visual("galop34"),
  "balade-soleil": visual("balade-soleil"),
  "balade-jour": visual("balade-jour"),
  "balade-privee": visual("balade-privee"),
  "randonnee-jeunes": visual("randonnee-jeunes"),
  "cours-loisir": visual("cours-loisir"),
  "cours-compet": visual("cours-compet"),
  cso: visual("cso"),
  ponygames: visual("ponygames"),
  equifun: visual("equifun"),
  anniversaire: visual("anniversaire"),
  ponyride: visual("ponyride"),
};

export function getCatalogueVisual(activityId: string) {
  return CATALOGUE_VISUALS[activityId] || visual("bronze");
}
