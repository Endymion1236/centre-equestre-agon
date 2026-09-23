/**
 * src/lib/doublons-familles.ts — reconnaître deux fiches qui sont la même famille.
 *
 * Les signaux, et ce qu'ils valent :
 *
 *  - même adresse email : le plus fort. Une adresse désigne une personne,
 *    là où un fixe désigne un foyer. Ce signal MANQUAIT, et c'est ce qui
 *    rendait l'écran vide dans le cas le plus courant : la fiche du bureau
 *    d'un côté, l'espace que la famille s'est créé de l'autre. Cette fiche-là
 *    n'a ni téléphone, ni cavalier, et porte le nom du compte plutôt que
 *    celui du bureau — aucun des autres signaux ne pouvait la rattraper
 *    (cas SAMSON, THEVENOT, VIMOND, 22/09/2026).
 *  - même téléphone, ou un cavalier commun : forts.
 *  - même nom de parent : présomption, à confirmer par l'admin.
 *
 * Module pur : aucune lecture de base, pour que ces règles soient tenues par
 * des tests plutôt que par la mémoire.
 */

export const POIDS = { email: 4, phone: 3, enfant: 3, nom: 2 } as const;
export type MotifDoublon = keyof typeof POIDS;

const norm = (s: unknown) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Les mots du nom, triés : « Marie DUPONT » et « Dupont marie » se valent. */
export const cleNom = (s: unknown) => norm(s).split(" ").filter(Boolean).sort().join(" ");

/** Les neuf derniers chiffres : indifférent au +33, aux points, aux espaces. */
export const cleTelephone = (s: unknown) => {
  const chiffres = String(s || "").replace(/\D/g, "");
  return chiffres.length >= 9 ? chiffres.slice(-9) : "";
};

export const cleEmail = (s: unknown) => String(s || "").trim().toLowerCase();

export const cleDateNaissance = (b: any): string => {
  if (!b) return "";
  if (typeof b === "string") return b.slice(0, 10);
  if (typeof b?.toDate === "function") { try { return b.toDate().toISOString().slice(0, 10); } catch { return ""; } }
  if (b?.seconds) return new Date(b.seconds * 1000).toISOString().slice(0, 10);
  if (b instanceof Date) return b.toISOString().slice(0, 10);
  return "";
};

export const cleCavalier = (c: any) =>
  `${norm(c?.firstName)}|${norm(c?.lastName)}|${cleDateNaissance(c?.birthDate)}`;

export interface ClesFiche {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  cavaliers: Set<string>;
}

export function clesFiche(f: any): ClesFiche {
  const telephone = f?.parentPhone || f?.phone || f?.tel || "";
  return {
    id: f?.id || "",
    nom: cleNom(f?.parentName),
    email: cleEmail(f?.parentEmail || f?.email),
    telephone: cleTelephone(telephone),
    // Un cavalier sans prénom, sans nom et sans date ne rapproche rien.
    cavaliers: new Set(
      (f?.children || []).map(cleCavalier).filter((k: string) => k.replace(/\|/g, "")),
    ),
  };
}

export interface Rapprochement {
  score: number;
  motifs: MotifDoublon[];
}

/** Ce que deux fiches ont en commun. Score nul : ce ne sont pas des doublons. */
export function comparerFiches(a: ClesFiche, b: ClesFiche): Rapprochement {
  const motifs: MotifDoublon[] = [];
  let score = 0;
  if (a.email && a.email === b.email) { motifs.push("email"); score += POIDS.email; }
  if (a.telephone && a.telephone === b.telephone) { motifs.push("phone"); score += POIDS.phone; }
  if ([...a.cavaliers].some((k) => b.cavaliers.has(k))) { motifs.push("enfant"); score += POIDS.enfant; }
  if (a.nom && a.nom === b.nom) { motifs.push("nom"); score += POIDS.nom; }
  return { score, motifs };
}

/** Clé stable d'une paire, indépendante de l'ordre. */
export const clePaire = (a: string, b: string) => [a, b].sort().join("__");
