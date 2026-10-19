/**
 * src/lib/famille-existante.ts — « cette adresse a-t-elle déjà une fiche ? »
 *
 * Octobre 2026, COSTEGROSSE : la famille avait créé son espace (avec ses
 * cavaliers), puis le bureau a créé une seconde fiche à la même adresse
 * depuis le planning. Les inscriptions et les paiements sont partis sur la
 * fiche du bureau ; l'espace famille, lui, n'en voyait rien.
 *
 * Règle, une fois, pour les deux formulaires de création (planning et
 * Cavaliers) : l'adresse se compare en minuscules et sans espaces, une fiche
 * absorbée ne compte pas, et on ne crée pas de doublon — on renvoie vers la
 * fiche existante.
 */

export interface FicheConnue {
  id: string;
  parentName?: string;
  parentEmail?: string;
  status?: string | null;
  children?: unknown[] | null;
}

/** Adresse comparable : minuscules, sans espaces autour. */
export const emailNormalise = (email: unknown) => String(email || "").trim().toLowerCase();

/** Les fiches vivantes qui portent cette adresse. */
export function fichesVivantesParEmail<T extends FicheConnue>(fiches: T[], email: unknown): T[] {
  const cle = emailNormalise(email);
  if (!cle) return [];
  return (fiches || []).filter((f) => f && f.status !== "merged" && emailNormalise(f.parentEmail) === cle);
}

/** Le message à montrer au bureau quand l'adresse a déjà une fiche. */
export function messageFicheExistante(fiches: FicheConnue[]): string {
  if (fiches.length === 0) return "";
  const nom = fiches[0].parentName || "sans nom";
  const nb = Array.isArray(fiches[0].children) ? fiches[0].children.length : 0;
  const cavaliers = nb > 0 ? `, ${nb} cavalier${nb > 1 ? "s" : ""}` : ", aucun cavalier";
  return fiches.length === 1
    ? `Une fiche existe déjà à cette adresse : « ${nom} »${cavaliers}. Inscrivez depuis cette fiche plutôt que d'en créer une seconde — sinon la famille ne verrait ni ses inscriptions ni ses paiements dans son espace.`
    : `${fiches.length} fiches portent déjà cette adresse (« ${nom} »…). Fusionnez-les depuis Cavaliers → Doublons avant d'en créer une nouvelle.`;
}
