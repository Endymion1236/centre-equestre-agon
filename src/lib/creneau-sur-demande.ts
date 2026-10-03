/**
 * src/lib/creneau-sur-demande.ts — créneau « sur demande » : la première
 * famille qui réserve choisit la formule (anniversaire, cours particulier).
 *
 * PRINCIPE MÉTIER (décidé avec Nicolas, octobre 2026), sur le modèle de la
 * promenade du dimanche au niveau fixé par la première inscription
 * (lib/promenade-niveau) :
 *   - le club publie UN créneau « sur demande » (`surDemande`) avec les
 *     formules qu'il accepte à cette heure-là, chacune avec son prix, son
 *     nombre de cavaliers et un descriptif ;
 *   - la première famille qui réserve choisit la formule : le créneau en
 *     prend le titre, le prix et le nombre de places, et il est PRIVATISÉ
 *     pour cette famille (`formuleFamilyId`) — les autres ne peuvent plus
 *     réserver ;
 *   - anniversaire : forfait pour le groupe, facturé une fois par famille
 *     (mécanisme `tarifForfaitaire`) ; les invités ne sont pas inscrits ;
 *   - cours particulier : prix par cavalier, la fratrie peut venir ;
 *   - si le créneau se vide (annulation, place tenue expirée), il redevient
 *     « sur demande », titre et prix d'origine compris — sauf si l'admin a
 *     lui-même fixé la formule (`formuleForcee`).
 *
 * Le verrou est posé PAR LE SERVEUR (/api/enroll), dans la transaction
 * d'inscription : deux premières réservations simultanées ne peuvent pas
 * choisir deux formules.
 *
 * Module pur, partagé entre le navigateur, les routes et les tests.
 */

export type IdFormule = "anniversaire" | "cours-particulier";

export interface FormuleSurDemande {
  id: IdFormule;
  label: string;
  /** Prix TTC : du groupe pour un forfait, du cavalier sinon. */
  priceTTC: number;
  /** Cavaliers de la famille inscrits au plus (les invités d'un anniversaire n'en sont pas). */
  places: number;
  /** Forfait : facturé une fois par famille, quel que soit le nombre de cavaliers. */
  forfait: boolean;
  /** Ce que la famille lit avant de choisir (« jusqu'à 8 enfants, goûter compris »). */
  descriptif?: string;
}

export const FORMULES_SUR_DEMANDE_DEFAUT: FormuleSurDemande[] = [
  { id: "anniversaire", label: "Anniversaire", priceTTC: 0, places: 1, forfait: true, descriptif: "Forfait pour le groupe d'enfants invités." },
  { id: "cours-particulier", label: "Cours particulier", priceTTC: 0, places: 3, forfait: false, descriptif: "Avec un moniteur, seul ou en fratrie. Prix par cavalier." },
];

export interface CreneauSurDemande {
  activityTitle?: string;
  priceTTC?: number | null;
  maxPlaces?: number | null;
  tarifForfaitaire?: boolean | null;
  surDemande?: boolean;
  formules?: FormuleSurDemande[] | null;
  formuleChoisie?: IdFormule | null;
  formuleFamilyId?: string | null;
  formuleForcee?: boolean;
  surDemandeOrigine?: { activityTitle?: string; priceTTC?: number | null; maxPlaces?: number | null; tarifForfaitaire?: boolean | null } | null;
  enrolled?: { familyId?: string | null }[] | null;
}

const estIdFormule = (v: unknown): v is IdFormule => v === "anniversaire" || v === "cours-particulier";

export function estSurDemande(c: CreneauSurDemande | null | undefined): boolean {
  return !!c && c.surDemande === true;
}

/** Formules proposées : celles qui ont un prix. */
export function formulesProposees(c: CreneauSurDemande | null | undefined): FormuleSurDemande[] {
  if (!estSurDemande(c)) return [];
  return (c!.formules || []).filter((f) => estIdFormule(f?.id) && Number(f.priceTTC) > 0 && Number(f.places) > 0);
}

/** Formule fixée sur le créneau, ou null tant que personne n'a choisi. */
export function formuleDuCreneau(c: CreneauSurDemande | null | undefined): FormuleSurDemande | null {
  if (!estSurDemande(c) || !estIdFormule(c!.formuleChoisie)) return null;
  return (c!.formules || []).find((f) => f.id === c!.formuleChoisie) || null;
}

/** Famille pour qui le créneau est privatisé (seulement s'il reste quelqu'un d'inscrit). */
export function familleDuCreneau(c: CreneauSurDemande | null | undefined): string | null {
  if (!estSurDemande(c)) return null;
  const inscrits = c!.enrolled || [];
  if (inscrits.length === 0) return null;
  if (c!.formuleFamilyId) return c!.formuleFamilyId;
  // Formule fixée par le club et famille inscrite depuis le planning : c'est
  // la famille déjà inscrite qui a le créneau.
  return formuleDuCreneau(c) ? (inscrits.find((e) => e?.familyId)?.familyId || null) : null;
}

/** Réservé à une autre famille : ni réservable, ni liste d'attente. */
export function privatisePourAutreFamille(c: CreneauSurDemande | null | undefined, familyId: string | null | undefined): boolean {
  const f = familleDuCreneau(c);
  return !!f && f !== familyId;
}

/** Le créneau tel qu'il sera avec cette formule : titre, prix, places, forfait. */
export function creneauAvecFormule<T extends CreneauSurDemande>(c: T, f: FormuleSurDemande): T {
  return { ...c, activityTitle: f.label, priceTTC: Math.round(Number(f.priceTTC) * 100) / 100, maxPlaces: Number(f.places), tarifForfaitaire: !!f.forfait };
}

/** Titre à afficher tant que la formule n'est pas choisie. */
export function titreSurDemande(c: CreneauSurDemande): string {
  const f = formuleDuCreneau(c);
  if (f) return f.label;
  const noms = formulesProposees(c).map((x) => x.label.toLowerCase());
  return noms.length ? `Sur demande — ${noms.join(" ou ")}` : "Sur demande";
}

export type DecisionSurDemande =
  | { ok: true; fixer: { formule: FormuleSurDemande; familyId: string | null } | null }
  | { ok: false; code: "formule_requise" | "formule_differente" | "formule_inconnue" | "prive"; formule: FormuleSurDemande | null };

/**
 * Décision d'inscription sur un créneau sur demande, prise dans la
 * transaction serveur :
 *   - personne n'a choisi, formule déclarée      → on inscrit ET on fixe formule + famille ;
 *   - personne n'a choisi, rien déclaré          → refus (famille) ; le personnel passe ;
 *   - formule fixée, privatisée pour une autre famille → refus « privé » ;
 *   - formule fixée, autre formule déclarée      → refus « formule différente » ;
 *   - formule fixée par l'admin, pas encore de famille → on inscrit et on privatise.
 */
export function deciderInscriptionSurDemande(
  c: CreneauSurDemande,
  formuleDeclaree: unknown,
  familyId: string,
  estStaff: boolean,
): DecisionSurDemande {
  if (!estSurDemande(c)) return { ok: true, fixer: null };
  const fixee = formuleDuCreneau(c);
  const famille = familleDuCreneau(c);
  if (famille && famille !== familyId && !estStaff) return { ok: false, code: "prive", formule: fixee };
  const declaree = estIdFormule(formuleDeclaree) ? formulesProposees(c).find((f) => f.id === formuleDeclaree) || null : null;
  if (formuleDeclaree != null && formuleDeclaree !== "" && !declaree) return { ok: false, code: "formule_inconnue", formule: fixee };
  if (!fixee) {
    if (declaree) return { ok: true, fixer: { formule: declaree, familyId: estStaff ? null : familyId } };
    return estStaff ? { ok: true, fixer: null } : { ok: false, code: "formule_requise", formule: null };
  }
  if (declaree && declaree.id !== fixee.id) return { ok: false, code: "formule_differente", formule: fixee };
  if (!famille && !estStaff) return { ok: true, fixer: { formule: fixee, familyId } };
  return { ok: true, fixer: null };
}

/** Champs à écrire sur le créneau quand une formule est fixée. */
export function champsFixationFormule(c: CreneauSurDemande, f: FormuleSurDemande, familyId: string | null, quand: string): Record<string, unknown> {
  const origine = c.surDemandeOrigine || {
    activityTitle: c.activityTitle || "",
    priceTTC: c.priceTTC ?? 0,
    maxPlaces: c.maxPlaces ?? null,
    tarifForfaitaire: !!c.tarifForfaitaire,
  };
  const avec = creneauAvecFormule(c, f);
  return {
    formuleChoisie: f.id,
    ...(familyId ? { formuleFamilyId: familyId } : {}),
    formuleChoisieLe: quand,
    surDemandeOrigine: origine,
    activityTitle: avec.activityTitle,
    priceTTC: avec.priceTTC,
    maxPlaces: avec.maxPlaces,
    tarifForfaitaire: avec.tarifForfaitaire,
  };
}

/**
 * Après un retrait d'inscrits : un créneau sur demande vidé redevient libre,
 * avec son titre, son prix et ses places d'origine. Une formule fixée par
 * l'admin reste, seule la famille est libérée.
 */
export function champsSurDemandeApresRetrait(c: CreneauSurDemande | null | undefined, enrolledRestants: unknown[]): Record<string, unknown> {
  if (!estSurDemande(c) || enrolledRestants.length > 0) return {};
  if (!c!.formuleChoisie && !c!.formuleFamilyId) return {};
  if (c!.formuleForcee) return c!.formuleFamilyId ? { formuleFamilyId: null } : {};
  const o = c!.surDemandeOrigine;
  return {
    formuleChoisie: null,
    formuleFamilyId: null,
    ...(o ? { activityTitle: o.activityTitle ?? c!.activityTitle ?? "", priceTTC: o.priceTTC ?? 0, maxPlaces: o.maxPlaces ?? c!.maxPlaces ?? null, tarifForfaitaire: !!o.tarifForfaitaire } : {}),
  };
}

/** Formules saisies par l'admin, nettoyées (prix et places numériques, libellé non vide). */
export function nettoyerFormules(brut: unknown): FormuleSurDemande[] {
  const liste = Array.isArray(brut) ? brut : [];
  return liste
    .filter((f: any) => estIdFormule(f?.id))
    .map((f: any) => ({
      id: f.id as IdFormule,
      label: String(f.label || "").trim().slice(0, 60) || (f.id === "anniversaire" ? "Anniversaire" : "Cours particulier"),
      priceTTC: Math.max(0, Math.round((Number(String(f.priceTTC ?? "").replace(",", ".")) || 0) * 100) / 100),
      places: Math.max(1, Math.min(20, Math.round(Number(f.places) || 1))),
      forfait: !!f.forfait,
      descriptif: String(f.descriptif || "").trim().slice(0, 200),
    }));
}

/** Places à ouvrir sur le créneau tant qu'aucune formule n'est choisie : la plus grande. */
export function placesSurDemande(formules: FormuleSurDemande[]): number {
  return Math.max(1, ...formules.filter((f) => f.priceTTC > 0).map((f) => f.places));
}

/**
 * Champs à écrire quand l'admin modifie un créneau sur demande :
 *   - formule fixée par le club (réservation par téléphone) → le créneau la
 *     prend tout de suite, la famille éventuelle reste ;
 *   - formule rendue au choix des familles → si personne n'est inscrit, le
 *     créneau redevient libre (titre, prix et places d'origine) ;
 *   - créneau libre → places = la plus grande formule.
 */
export function champsEditionSurDemande(
  c: CreneauSurDemande,
  formules: FormuleSurDemande[],
  forcee: IdFormule | "",
  quand: string,
): Record<string, unknown> {
  const base = { surDemande: true, formules };
  const avec = { ...c, surDemande: true, formules };
  if (forcee) {
    const f = formules.find((x) => x.id === forcee && x.priceTTC > 0);
    if (f) return { ...base, ...champsFixationFormule(avec, f, null, quand), formuleForcee: true };
  }
  if (c.formuleForcee) {
    const vide = (c.enrolled || []).length === 0;
    return { ...base, formuleForcee: false, ...(vide ? champsSurDemandeApresRetrait({ ...avec, formuleForcee: false }, []) : {}) };
  }
  if (c.formuleChoisie) return base;
  return { ...base, maxPlaces: placesSurDemande(formules) };
}
