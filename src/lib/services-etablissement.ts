/**
 * src/lib/services-etablissement.ts
 *
 * Les sites facturables d'un établissement : centres de loisirs d'une même
 * communauté de communes, écoles d'une même mairie, antennes d'une
 * association.
 *
 * Un service n'était qu'une ligne de texte : son nom, imprimé sur la
 * facture. Tout le reste venait de la structure au-dessus — une seule
 * adresse email, un seul téléphone, une seule adresse postale. Quatre
 * centres de loisirs d'une même collectivité recevaient donc quatre
 * factures à la même boîte, alors que chaque site a son directeur, son
 * téléphone, parfois sa propre adresse de facturation, et pour le secteur
 * public son code service et son numéro d'engagement.
 *
 * Chaque service porte donc ses propres coordonnées, toutes facultatives :
 * ce qui n'est pas renseigné retombe sur la structure. Les services
 * enregistrés sous forme de simple texte continuent de fonctionner, ils
 * sont relus comme une fiche dont seul le nom est connu.
 *
 * Module pur : ni Firestore, ni React.
 */

export interface ServiceEtablissement {
  nom: string;
  /** Personne à qui la facture est adressée sur ce site. */
  contact?: string;
  email?: string;
  telephone?: string;
  /** Adresse de facturation propre au site, quand elle diffère de la structure. */
  adresse?: string;
  codePostal?: string;
  ville?: string;
  /** Facturation publique : code du service destinataire, et engagement du bon de commande. */
  codeService?: string;
  numeroEngagement?: string;
}

const texte = (v: unknown, max = 160): string => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : "";
};

/** Une entrée telle qu'elle est stockée — texte d'hier, fiche d'aujourd'hui — en fiche. */
export function lireService(valeur: unknown): ServiceEtablissement | null {
  if (typeof valeur === "string") {
    const nom = texte(valeur);
    return nom ? { nom } : null;
  }
  if (!valeur || typeof valeur !== "object") return null;
  const v = valeur as Record<string, unknown>;
  const nom = texte(v.nom);
  if (!nom) return null;
  const fiche: ServiceEtablissement = { nom };
  const champs: [keyof ServiceEtablissement, number][] = [
    ["contact", 120], ["email", 160], ["telephone", 30],
    ["adresse", 200], ["codePostal", 10], ["ville", 80],
    ["codeService", 60], ["numeroEngagement", 60],
  ];
  for (const [cle, max] of champs) {
    const valeurChamp = texte(v[cle], max);
    if (valeurChamp) (fiche as unknown as Record<string, string>)[cle] = valeurChamp;
  }
  return fiche;
}

/** La liste des services d'une fiche famille, quelle que soit la forme stockée. */
export function normaliserServices(valeur: unknown): ServiceEtablissement[] {
  if (!Array.isArray(valeur)) return [];
  const vus = new Set<string>();
  const services: ServiceEtablissement[] = [];
  for (const brut of valeur) {
    const fiche = lireService(brut);
    if (!fiche) continue;
    const cle = fiche.nom.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    services.push(fiche);
  }
  return services;
}

/** Les noms seuls : ce que proposent les menus déroulants de facturation. */
export function nomsServices(valeur: unknown): string[] {
  return normaliserServices(valeur).map((s) => s.nom);
}

/** Le service portant ce nom, ou null. La casse et les espaces sont ignorés. */
export function serviceParNom(valeur: unknown, nom: string | null | undefined): ServiceEtablissement | null {
  const cherche = texte(nom).toLowerCase();
  if (!cherche) return null;
  return normaliserServices(valeur).find((s) => s.nom.toLowerCase() === cherche) || null;
}

export interface CoordonneesFacturation {
  destinataire: string;
  email: string;
  telephone: string;
  adresse: string;
  codeService: string;
  numeroEngagement: string;
  /** Vrai dès qu'au moins une coordonnée vient du service et non de la structure. */
  duService: boolean;
}

/**
 * À qui adresser la facture : les coordonnées du service quand elles
 * existent, celles de la structure sinon, champ par champ.
 */
export function coordonneesFacturation(
  structure: { parentName?: string; parentEmail?: string; parentPhone?: string; address?: string; zipCode?: string; city?: string } | null | undefined,
  service: ServiceEtablissement | null | undefined,
): CoordonneesFacturation {
  const s = structure || {};
  const adresseStructure = [texte(s.address, 200), [texte(s.zipCode, 10), texte(s.city, 80)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const adresseService = service?.adresse || service?.codePostal || service?.ville
    ? [texte(service?.adresse, 200), [texte(service?.codePostal, 10), texte(service?.ville, 80)].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  const duService = !!(service && (service.contact || service.email || service.telephone || adresseService));
  return {
    destinataire: service?.contact || texte(s.parentName, 160),
    email: service?.email || texte(s.parentEmail, 160),
    telephone: service?.telephone || texte(s.parentPhone, 30),
    adresse: adresseService || adresseStructure,
    codeService: service?.codeService || "",
    numeroEngagement: service?.numeroEngagement || "",
    duService,
  };
}
