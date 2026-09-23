/**
 * src/lib/nom-destinataire.ts
 *
 * À qui s'adresse un email ou une facture quand la fiche famille n'a pas
 * de nom.
 *
 * Une inscription par email et mot de passe crée une fiche sans nom : le
 * fournisseur n'en donne aucun, contrairement à Google ou Facebook. La
 * famille apparaît alors « Sans nom » à l'accueil, et les confirmations
 * commençaient par « Bonjour Client, » — un mot que personne n'écrirait à
 * un parent du club.
 *
 * À défaut du nom de la fiche, on prend celui que porte l'enfant inscrit :
 * il est presque toujours celui de la famille, et il figure déjà dans la
 * commande. Module pur.
 */

/** « Gabin LEMESLE » → « LEMESLE ». « Jean-Baptiste Roy » → « Roy ». */
export function nomFamilleDepuisEnfant(childName: string | null | undefined): string {
  const mots = String(childName || "").trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return "";
  // Un nom de famille est saisi en capitales dans la fiche cavalier ; à
  // défaut de capitales, le dernier mot en tient lieu.
  const capitales = mots.filter((m) => m.length > 1 && m === m.toUpperCase());
  return capitales.length > 0 ? capitales.join(" ") : mots[mots.length - 1];
}

/**
 * Le nom à écrire en tête d'un courrier, du plus sûr au plus approximatif.
 * Renvoie "" seulement si rien n'est connu — à l'appelant de décider quoi
 * en faire plutôt que d'inventer un mot.
 */
export function nomDestinataire(params: {
  familyName?: string | null;
  parentName?: string | null;
  items?: { childName?: string | null }[] | null;
}): string {
  const direct = String(params.familyName || "").trim() || String(params.parentName || "").trim();
  if (direct) return direct;
  for (const item of params.items || []) {
    const nom = nomFamilleDepuisEnfant(item?.childName);
    if (nom) return nom;
  }
  return "";
}

/** Le même nom, mais jamais vide : pour les gabarits qui écrivent « Bonjour {parentName}, ». */
export function nomDestinataireOuDefaut(params: Parameters<typeof nomDestinataire>[0]): string {
  return nomDestinataire(params) || "à vous";
}
