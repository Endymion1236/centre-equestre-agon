/**
 * src/lib/rib-texte.ts — lire un RIB écrit DANS le corps d'un message.
 *
 * Beaucoup de familles ne joignent pas leur RIB : elles recopient les lignes
 * de leur banque directement dans le mail.
 *
 *     C/C EUROCOMPTE CONFORT
 *     MLE V CHAPDELAINE OU M S GIOT
 *     RIB
 *     15489 04706 00031290901 86
 *     IBAN
 *     FR76 1548 9047 0600 0312 9090 186
 *     BIC
 *     CMCIFR2A
 *
 * La lecture assistée ne savait traiter qu'une pièce jointe ou un fichier
 * Drive : ces messages-là n'offraient aucun bouton, et il fallait recopier
 * l'IBAN à la main — là où une faute de frappe coûte un prélèvement rejeté
 * et des frais.
 *
 * ── Pourquoi sans IA ─────────────────────────────────────────────────────
 *
 * Un IBAN dans du texte se reconnaît à sa forme et se VÉRIFIE par sa clé de
 * contrôle (ISO 13616, modulo 97). Aucun modèle n'est nécessaire, et s'en
 * passer vaut mieux : c'est instantané, gratuit, reproductible, et une clé
 * fausse est rejetée ici plutôt qu'à la banque. L'IA reste pour ce qu'elle
 * seule sait faire — lire un PDF ou une photo.
 */

import { validateIban, validateBic } from "@/lib/sepa-validation";

export interface RibTrouve {
  iban: string;
  /** null si le message n'en donne pas : le BIC est déductible de l'IBAN. */
  bic: string | null;
  /** Titulaire du compte, si une ligne le laisse deviner. */
  titulaire: string | null;
}

/**
 * Début d'IBAN : deux lettres de pays et la clé de contrôle, éventuellement
 * séparées d'un espace (« FR 76 » se rencontre).
 */
const DEBUT_IBAN = /\b([A-Z]{2})[\s.\-]*(\d{2})/gi;

/** Longueur maximale d'un IBAN, ISO 13616. */
const IBAN_MAX = 34;
/** Le plus court IBAN en service (Norvège) fait 15 caractères. */
const IBAN_MIN = 15;

/**
 * Où s'arrête l'IBAN ? Le texte ne le dit pas : « …3M02 606\nBIC » et
 * « …3M02 606 merci » se ressemblent, et une expression régulière gourmande
 * avale le mot suivant.
 *
 * On collecte donc généreusement, puis on laisse la CLÉ DE CONTRÔLE trancher :
 * on essaie les préfixes du plus long au plus court. `validateIban` vérifie
 * aussi la longueur attendue du pays, donc un seul préfixe peut convenir —
 * aucune ambiguïté à départager.
 */
function ibanDepuis(texte: string, debut: number): string | null {
  let brut = "";
  for (let i = debut; i < texte.length && brut.length < IBAN_MAX; i++) {
    const c = texte[i];
    if (/[A-Za-z0-9]/.test(c)) { brut += c.toUpperCase(); continue; }
    // Un séparateur est toléré ; deux d'affilée terminent la lecture.
    if (/[\s.\-]/.test(c)) {
      if (/[\s.\-]/.test(texte[i + 1] || "")) break;
      continue;
    }
    break;
  }
  for (let n = brut.length; n >= IBAN_MIN; n--) {
    const candidat = brut.slice(0, n);
    if (validateIban(candidat).valid) return candidat;
  }
  return null;
}

/** BIC / SWIFT : 8 ou 11 caractères, jamais collé à un mot. */
const MOTIF_BIC = /\b([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g;

/**
 * Lignes à ne PAS prendre pour un nom de titulaire : intitulés de produit
 * bancaire, en-têtes, formules de politesse.
 */
const LIGNES_NON_TITULAIRE =
  /^(rib|iban|bic|swift|banque|domiciliation|code|compte|c\/c|cc|titulaire|bonjour|cordialement|merci|ci-joint|ci-dessous|eurocompte|livret|compte[\s-]*cheque)/i;

/**
 * Cherche un IBAN valide dans un texte libre.
 *
 * Retourne `null` si aucun IBAN ne passe la clé de contrôle — un numéro mal
 * recopié n'est pas proposé, il n'est pas proposé du tout.
 */
export function extraireRibDuTexte(texte: string): RibTrouve | null {
  if (!texte || typeof texte !== "string") return null;

  // ── IBAN ──────────────────────────────────────────────────────────────
  // On teste TOUS les candidats et on garde le premier qui a une clé de
  // contrôle juste : un mail peut contenir une référence client qui
  // ressemble à un IBAN sans en être un.
  let iban: string | null = null;
  for (const m of texte.matchAll(DEBUT_IBAN)) {
    const trouve = ibanDepuis(texte, m.index!);
    if (trouve) { iban = trouve; break; }
  }
  if (!iban) return null;

  // ── BIC ───────────────────────────────────────────────────────────────
  // Facultatif : il se déduit de l'IBAN. On ne retient qu'un BIC cohérent
  // avec le pays de l'IBAN, pour ne pas ramasser un mot de huit lettres en
  // capitales qui aurait la bonne forme.
  let bic: string | null = null;
  const pays = iban.substring(0, 2);
  for (const m of texte.toUpperCase().matchAll(MOTIF_BIC)) {
    const candidat = m[1];
    if (candidat === iban.substring(0, candidat.length)) continue;
    if (validateBic(candidat, pays).valid) { bic = candidat; break; }
  }

  // ── Titulaire ─────────────────────────────────────────────────────────
  // Les relevés écrivent le titulaire en capitales, sur sa propre ligne,
  // au-dessus des coordonnées. On prend la dernière ligne de ce genre avant
  // l'IBAN : c'est celle qui le précède immédiatement.
  let titulaire: string | null = null;
  const avantIban = texte.split(/\b[A-Z]{2}\s*\d{2}[\s.\-]*[A-Z0-9]/i)[0] || texte;
  for (const ligne of avantIban.split(/\r?\n/)) {
    const l = ligne.trim();
    if (l.length < 4 || l.length > 70) continue;
    if (LIGNES_NON_TITULAIRE.test(l)) continue;
    // Majoritairement des capitales et des espaces : la signature d'un
    // titulaire recopié depuis un relevé.
    const lettres = l.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (lettres.length < 4) continue;
    const capitales = l.replace(/[^A-ZÀ-Þ]/g, "").length;
    if (capitales / lettres.length < 0.7) continue;
    titulaire = l.replace(/\s{2,}/g, " ");
  }

  return { iban, bic, titulaire };
}

/** Le texte contient-il un IBAN exploitable ? Sert à n'afficher le bouton que quand il servira. */
export function contientUnRib(texte: string): boolean {
  return extraireRibDuTexte(texte) !== null;
}
