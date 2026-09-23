/**
 * src/lib/fournisseur-connexion.ts
 *
 * Comment une famille se connecte : Google, Facebook, adresse et mot de
 * passe, lien de connexion…
 *
 * La fiche ne connaissait que deux valeurs, et les déduisait ainsi :
 * « google.com » donnait « google », TOUT LE RESTE donnait « facebook ».
 * Une inscription par email et mot de passe — celle qui ne transmet aucun
 * nom, et crée donc les fiches « Sans nom » — était donc étiquetée
 * Facebook. Impossible, en lisant une fiche, de savoir par où la famille
 * passe, ni de lui expliquer comment se reconnecter.
 *
 * Module pur : deux lectures possibles, le jeton du visiteur
 * (`sign_in_provider`) ou la liste des comptes rattachés côté Firebase
 * (`providerData`), et un libellé pour l'écran.
 */

export type FournisseurConnexion = "google" | "facebook" | "apple" | "email" | "lien" | "admin" | "autre";

const PAR_IDENTIFIANT: Record<string, FournisseurConnexion> = {
  "google.com": "google",
  "facebook.com": "facebook",
  "apple.com": "apple",
  // Adresse + mot de passe, et lien de connexion Firebase : même fournisseur.
  password: "email",
  // Jeton signé par nos soins : c'est notre lien de connexion maison.
  custom: "lien",
};

/** Priorité quand un compte est rattaché à plusieurs fournisseurs. */
const ORDRE: FournisseurConnexion[] = ["google", "facebook", "apple", "email", "lien"];

/** Depuis `sign_in_provider` du jeton présenté à l'arrivée. */
export function fournisseurDepuisJeton(signInProvider: unknown): FournisseurConnexion {
  const cle = String(signInProvider || "").trim().toLowerCase();
  return PAR_IDENTIFIANT[cle] || "autre";
}

/** Depuis la liste des comptes rattachés (Firebase Auth, `providerData`). */
export function fournisseurDepuisComptes(providerIds: readonly string[] | null | undefined): FournisseurConnexion {
  const trouves = (providerIds || [])
    .map((id) => PAR_IDENTIFIANT[String(id || "").trim().toLowerCase()])
    .filter(Boolean) as FournisseurConnexion[];
  if (trouves.length === 0) return "lien";
  for (const f of ORDRE) if (trouves.includes(f)) return f;
  return trouves[0];
}

const LIBELLES: Record<FournisseurConnexion, string> = {
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
  email: "E-mail et mot de passe",
  lien: "Lien de connexion",
  admin: "Créé par le club",
  autre: "Mode inconnu",
};

export function libelleFournisseur(valeur: unknown): string {
  const cle = String(valeur || "").trim().toLowerCase() as FournisseurConnexion;
  return LIBELLES[cle] || LIBELLES.autre;
}

/** Version courte pour une pastille de liste. */
export function libelleFournisseurCourt(valeur: unknown): string {
  const cle = String(valeur || "").trim().toLowerCase() as FournisseurConnexion;
  if (cle === "email") return "E-mail";
  if (cle === "admin") return "Créé admin";
  return LIBELLES[cle] || LIBELLES.autre;
}
