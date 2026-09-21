/**
 * src/lib/adresses-manquantes.ts
 *
 * Retrouver l'adresse email d'une fiche famille qui n'en a pas.
 *
 * Une fiche avec des cavaliers mais sans adresse fabrique un compte orphelin
 * le jour où cette famille se connecte : rien ne correspond, une fiche vierge
 * est créée, et les cavaliers restent en arrière. Vider cette liste, c'est
 * fermer la source.
 *
 * L'adresse est rarement perdue pour de bon : le club a facturé cette
 * famille, lui a écrit, ou la connaît par un compte déjà créé. Ce module
 * classe ces pistes et dit d'où chacune vient, sans jamais trancher à la
 * place de l'admin — une adresse posée sur la mauvaise fiche enverrait les
 * codes d'accès chez le voisin.
 */

import { emailValide } from "@/lib/utils";

/** D'où vient la piste, de la plus sûre à la moins sûre. */
export type OrigineAdresse = "commande" | "journal" | "compte";

const RANG_ORIGINE: Record<OrigineAdresse, number> = {
  // Adresse portée par une commande de CETTE fiche : le club a facturé là.
  commande: 0,
  // Le club a écrit à cette adresse pour CETTE fiche.
  journal: 1,
  // Un compte existe au nom de la famille : rapprochement par le nom, donc
  // faillible (« chapde-LAINE » ressemble à « LAINÉ »).
  compte: 2,
};

export const LIBELLE_ORIGINE: Record<OrigineAdresse, string> = {
  commande: "sur une commande de cette famille",
  journal: "email déjà envoyé à cette famille",
  compte: "compte créé à ce nom",
};

export interface SourceAdresse {
  email: string;
  origine: OrigineAdresse;
  /** Ce qu'on peut en dire à l'écran : « facture du 12/09 », « confirmation de stage ». */
  detail?: string;
  /** Date ISO, pour préférer la plus récente. */
  date?: string | null;
}

export interface PropositionAdresse {
  email: string;
  origine: OrigineAdresse;
  detail: string;
  /** Combien de fois cette adresse apparaît, toutes sources confondues. */
  occurrences: number;
  derniereDate: string | null;
  /**
   * L'adresse est déjà celle d'une AUTRE fiche. L'y recopier créerait deux
   * fiches à la même adresse, ce qui rendrait le rattachement automatique
   * ambigu : c'est une fusion de doublons qu'il faut, pas une copie.
   */
  dejaPrise: boolean;
}

export const normaliserEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Regroupe les pistes par adresse, les classe, et signale celles qui sont
 * déjà prises. L'origine la plus sûre l'emporte ; à origine égale, l'adresse
 * la plus souvent vue, puis la plus récente.
 */
export function proposerAdresses(
  sources: SourceAdresse[],
  adressesDejaPrises: Iterable<string> = [],
  maximum = 4,
): PropositionAdresse[] {
  const prises = new Set([...adressesDejaPrises].map(normaliserEmail).filter(Boolean));
  const parEmail = new Map<string, PropositionAdresse>();

  for (const s of sources || []) {
    const email = normaliserEmail(s?.email);
    if (!emailValide(email)) continue;
    const date = s.date || null;
    const existant = parEmail.get(email);
    if (!existant) {
      parEmail.set(email, {
        email,
        origine: s.origine,
        detail: s.detail || LIBELLE_ORIGINE[s.origine],
        occurrences: 1,
        derniereDate: date,
        dejaPrise: prises.has(email),
      });
      continue;
    }
    existant.occurrences++;
    // On garde l'origine la plus sûre, et le détail qui va avec.
    if (RANG_ORIGINE[s.origine] < RANG_ORIGINE[existant.origine]) {
      existant.origine = s.origine;
      existant.detail = s.detail || LIBELLE_ORIGINE[s.origine];
    }
    if (date && (!existant.derniereDate || date > existant.derniereDate)) {
      existant.derniereDate = date;
      if (RANG_ORIGINE[s.origine] === RANG_ORIGINE[existant.origine]) {
        existant.detail = s.detail || existant.detail;
      }
    }
  }

  return [...parEmail.values()]
    .sort((a, b) => {
      // Une adresse déjà prise descend : ce n'est pas la bonne action.
      if (a.dejaPrise !== b.dejaPrise) return a.dejaPrise ? 1 : -1;
      if (RANG_ORIGINE[a.origine] !== RANG_ORIGINE[b.origine]) return RANG_ORIGINE[a.origine] - RANG_ORIGINE[b.origine];
      if (a.occurrences !== b.occurrences) return b.occurrences - a.occurrences;
      return String(b.derniereDate || "").localeCompare(String(a.derniereDate || ""));
    })
    .slice(0, maximum);
}

/** Un nom comparable : sans accents, sans casse, lettres seules. */
export const cleNom = (valeur: unknown): string =>
  String(valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/**
 * Le nom d'un compte désigne-t-il celui d'une fiche ?
 *
 * Chercher un nom à l'intérieur de l'autre produit des rapprochements
 * absurdes : « Virginie Chapdelaine » contient « laine », donc la fiche
 * LAINÉ ; « Françoise Langenais » contient « francois », donc la fiche
 * FRANCOIS. On compare donc mot à mot, et seulement sur des mots d'au moins
 * quatre lettres — en dessous, un fragment commun ne veut rien dire.
 */
export function nomsSeCorrespondent(nomCompte: unknown, nomFiche: unknown): boolean {
  const mots = (v: unknown) =>
    String(v ?? "")
      .split(/[\s'’-]+/)
      .map(cleNom)
      .filter((m) => m.length >= 4);
  const a = new Set(mots(nomCompte));
  if (a.size === 0) return false;
  const b = mots(nomFiche);
  return b.length > 0 && b.some((m) => a.has(m));
}
