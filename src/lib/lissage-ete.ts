/**
 * Lissage d'été des horaires : juillet et août comptés comme une seule période.
 *
 * Le reste de l'année, la semaine est l'unité de compte : au-delà du contrat
 * hebdomadaire c'est de l'heure sup, en dessous c'est un déficit. L'été, cette
 * règle est fausse — une semaine creuse de juillet et une semaine chargée
 * d'août se compensent, et les trancher séparément ferait payer des heures sup
 * sur un total qui n'en produit pas.
 *
 * Le solde est donc établi une seule fois, sur le total des deux mois :
 *
 *  - le SURPLUS se mesure sur le contrat PLEIN de la période, à partir des
 *    heures réellement travaillées. Un congé payé ne fabrique jamais d'heures
 *    sup — ici pas plus qu'à la semaine ;
 *  - le DÉFICIT est calculé pour être affiché, mais n'alimente rien : un creux
 *    d'été non compensé n'est pas dû par le salarié.
 *
 * Tout est en MINUTES, comme le reste du suivi RH.
 */

/** Mois concernés, au format JavaScript (0 = janvier). Juillet et août. */
export const MOIS_LISSES = [6, 7];

/** Août : le mois où le solde des deux mois est arrêté et affiché. */
export const MOIS_DECOMPTE_LISSAGE = 7;

export interface EntreeLissage {
  /** Contrat hebdomadaire, en minutes. */
  contratMin: number;
  /** Semaines ÉCOULÉES de la période — les semaines à venir ne comptent pas. */
  semaines: number;
  /** Minutes réellement travaillées sur ces semaines. */
  travailleMin: number;
  /** Minutes d'absence payée (congé, récup, maladie, férié) sur la période. */
  absMin: number;
}

export interface SoldeLissage {
  /** Contrat dû sur la période : contrat hebdomadaire × semaines écoulées. */
  contratPeriode: number;
  /** Heures sup de la période. 0 si le total reste sous le contrat. */
  surplus: number;
  /** Manque par rapport au contrat diminué des congés. Affiché, jamais retenu. */
  deficit: number;
}

export function soldeLissage(e: EntreeLissage): SoldeLissage {
  const semaines = Math.max(0, e.semaines);
  const contratPeriode = Math.max(0, e.contratMin) * semaines;
  const travaille = Math.max(0, e.travailleMin);
  const absMin = Math.max(0, e.absMin);

  return {
    contratPeriode,
    surplus: Math.max(0, travaille - contratPeriode),
    deficit: Math.max(0, Math.max(0, contratPeriode - absMin) - travaille),
  };
}

/**
 * État d'une semaine vis-à-vis du décompte.
 *
 * Une semaine COMMENCÉE n'est pas une semaine finie : les jours restants ne
 * sont pas un déficit. Un mercredi affichait « −10h30 de déficit » sur une
 * semaine à 25 h et proposait de le figer au compteur, alors qu'il restait
 * quatre jours pour les faire.
 */
export type EtatSemaine = "a_venir" | "en_cours" | "terminee";

export function etatSemaine(lundi: Date, aujourdhui: Date): EtatSemaine {
  const jour = new Date(aujourdhui); jour.setHours(0, 0, 0, 0);
  const debut = new Date(lundi); debut.setHours(0, 0, 0, 0);
  if (debut.getTime() > jour.getTime()) return "a_venir";
  const dimanche = new Date(debut); dimanche.setDate(debut.getDate() + 6);
  return dimanche.getTime() >= jour.getTime() ? "en_cours" : "terminee";
}

/**
 * Une semaine appartient à la période lissée si son LUNDI tombe en juillet ou
 * en août. Le critère porte sur la semaine entière, jamais sur le mois
 * affiché : la semaine du 31 août au 6 septembre est comptée en entier, celle
 * du 29 juin au 5 juillet reste dans le décompte de juin.
 *
 * C'est le même piège qui, dans la vue mensuelle, faisait apparaître 25 h de
 * déficit sur une semaine à cheval : on comparait le travail de deux jours
 * regardés au contrat de sept.
 */
export function lundiDansPeriodeLissee(lundi: Date, annee: number): boolean {
  return lundi.getFullYear() === annee && MOIS_LISSES.includes(lundi.getMonth());
}
