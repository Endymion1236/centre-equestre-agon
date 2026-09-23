/**
 * src/lib/changement-groupe.ts
 *
 * Déplacer un cavalier d'un stage — ou d'un groupe — vers un autre.
 *
 * Jusqu'ici, il fallait le désinscrire puis le réinscrire à la main. Trois
 * ennuis en découlaient, tous vécus :
 *
 *  1. l'acompte ne suivait pas. Désinscrire retire la ligne de la commande ;
 *     l'argent déjà encaissé restait sur la commande d'origine, donc sur le
 *     stage de l'autre enfant, et le nouveau stage repartait plein tarif ;
 *  2. l'ordre des opérations changeait le prix. Les réductions multi-stages
 *     se calculent d'après les stages DÉJÀ en base : inscrire avant de
 *     désinscrire faisait passer le nouveau stage pour un deuxième stage et
 *     lui appliquait une remise indue, qui restait acquise ;
 *  3. la liste d'attente était prévenue d'une place libérée que le club ne
 *     libérait pas vraiment, quand le cavalier ne faisait que changer de
 *     groupe dans le même stage.
 *
 * Le principe retenu ici : on ne détruit rien. La LIGNE DE COMMANDE EXISTANTE
 * est retaillée vers le nouveau stage. La commande, son acompte, son numéro
 * et ses écritures comptables ne bougent pas ; seul l'objet de la ligne
 * change. C'est aussi ce qui rend l'opération explicable à un contrôle : la
 * pièce reste la même, elle dit simplement le bon stage.
 *
 * ── La règle de prix ────────────────────────────────────────────────────
 * Le nouveau prix vaut l'ancien PLUS l'écart entre les deux tarifs de base :
 *
 *     nouveauPrix = ancienPrix + (tarifCible − tarifSource)
 *
 * Les réductions déjà accordées sont donc conservées telles quelles, et la
 * famille paie exactement la différence entre les deux groupes. À tarif égal
 * — le cas courant, un simple changement de niveau — rien ne bouge.
 *
 * On ne RECALCULE délibérément pas les réductions. Un recalcul changerait en
 * silence un prix que la famille a accepté et parfois déjà réglé en partie ;
 * l'écart, lui, se lit et s'explique. Quand la période de vacances change, le
 * barème n'est plus forcément le bon : l'écran le dit et laisse Nicolas
 * trancher.
 *
 * Ce module ne parle ni à Firestore ni à React : il reçoit l'état, il rend un
 * plan. L'exécution est dans app/admin/planning/changer-groupe-actions.ts.
 */

import { memeStage } from "./meme-stage";
import { tauxTva } from "./tva-taux";

export interface CreneauStage {
  id?: string;
  activityId?: string;
  activityTitle: string;
  activityType?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  maxPlaces?: number;
  enrolled?: { childId?: string }[];
  enrolledCount?: number;
  priceTTC?: number;
  price1day?: number;
  price2days?: number;
  price3days?: number;
  price4days?: number;
  stageGroupId?: string;
}

export interface ItemCommande {
  childId?: string;
  childName?: string;
  activityTitle?: string;
  activityType?: string;
  stageKey?: string;
  priceTTC?: number;
  priceHT?: number;
  tva?: number;
  creneauId?: string;
  creneauIds?: string[];
  stageSchedule?: string;
  stageDates?: { date: string; startTime?: string; endTime?: string }[];
  [autre: string]: unknown;
}

export interface ParamsChangementGroupe {
  childId: string;
  childName: string;
  /** Les jours du stage actuel où le cavalier est inscrit. */
  source: CreneauStage[];
  /** Les jours du stage visé. */
  cible: CreneauStage[];
  /** Créneaux connus aux dates visées, pour repérer un conflit d'horaire. */
  creneauxConnus?: CreneauStage[];
  /** La ligne de commande qui porte ce stage, si elle existe. */
  item?: ItemCommande | null;
  /** Les autres lignes de la même commande (elles ne bougent pas). */
  autresItems?: ItemCommande[];
  /** Somme des encaissements rattachés à la commande. */
  dejaEncaisse?: number;
  /** La commande porte-t-elle déjà un numéro de facture émise ? */
  numeroFacture?: string | null;
  /** Période de vacances de chaque stage, pour prévenir d'un barème différent. */
  periodeSource?: string | null;
  periodeCible?: string | null;
  /** Aujourd'hui, pour l'horodatage de la trace (injectable pour les tests). */
  maintenant?: Date;
}

export interface PlanChangementGroupe {
  possible: boolean;
  blocages: string[];
  avertissements: string[];
  /** Le déplacement reste-t-il à l'intérieur du même stage ? */
  memeStage: boolean;
  /** Créneaux à quitter, créneaux à rejoindre. */
  quitter: string[];
  rejoindre: string[];
  stageKeyCible: string;
  prixAncien: number;
  prixNouveau: number;
  ecart: number;
  /** Nouveau total de la commande, et ce qu'il fait du règlement déjà reçu. */
  totalCommande: number;
  paidAmount: number;
  statut: "paid" | "partial" | "pending";
  /** Trop-perçu à transformer en avoir (0 le plus souvent). */
  avoir: number;
  notifierListeAttente: boolean;
  itemModifie: ItemCommande | null;
}

const centimes = (n: number) => Math.round(n * 100) / 100;

const jourFr = (dateISO: string) => {
  const d = new Date(dateISO + "T12:00:00Z");
  return Number.isNaN(d.getTime())
    ? dateISO
    : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};

/**
 * Le tarif d'un stage entier, tel que l'affiche le panneau d'inscription :
 * le tarif configuré pour ce nombre de jours s'il existe et ne dépasse pas le
 * prix plein, sinon le prix plein du créneau.
 */
export function tarifStage(creneaux: CreneauStage[]): number {
  if (creneaux.length === 0) return 0;
  const ref = creneaux[0];
  const prixComplet = ref.priceTTC || 0;
  const parNombreDeJours: Record<number, number | undefined> = {
    1: ref.price1day, 2: ref.price2days, 3: ref.price3days, 4: ref.price4days,
  };
  const configure = parNombreDeJours[creneaux.length];
  return configure && configure > 0 && configure <= prixComplet ? configure : prixComplet;
}

/**
 * Places restantes sur le jour le plus chargé du stage, l'enfant déplacé mis
 * à part : il libère sa propre place en partant, elle ne doit pas le bloquer.
 */
export function placesRestantes(creneaux: CreneauStage[], childId: string): number {
  if (creneaux.length === 0) return 0;
  return Math.min(...creneaux.map((c) => {
    const inscrits = (c.enrolled || []).filter((e) => e?.childId !== childId).length;
    return (c.maxPlaces || 0) - inscrits;
  }));
}

/** Les créneaux déjà suivis par l'enfant qui chevauchent les jours visés. */
export function conflitsHoraires(
  cible: CreneauStage[],
  childId: string,
  creneauxConnus: CreneauStage[],
  ignorer: Set<string>,
): { date: string; titre: string }[] {
  const conflits: { date: string; titre: string }[] = [];
  for (const jour of cible) {
    for (const autre of creneauxConnus) {
      if (!autre.id || ignorer.has(autre.id)) continue;
      if (autre.date !== jour.date) continue;
      if (!(autre.enrolled || []).some((e) => e?.childId === childId)) continue;
      const debutA = jour.startTime || "", finA = jour.endTime || "";
      const debutB = autre.startTime || "", finB = autre.endTime || "";
      // Sans horaires connus des deux côtés, on ne conclut pas à un conflit :
      // mieux vaut laisser passer qu'interdire un déplacement légitime.
      if (!debutA || !finA || !debutB || !finB) continue;
      if (debutA < finB && debutB < finA) conflits.push({ date: jour.date, titre: autre.activityTitle });
    }
  }
  return conflits;
}

/** « Stage Poneys_2026-10-19 » : la clé stable qui relie l'inscription à sa ligne. */
export const stageKeyDe = (creneaux: CreneauStage[]) =>
  creneaux.length === 0 ? "" : `${creneaux[0].activityTitle}_${creneaux[0].date}`;

/** « lundi 19, mardi 20, mercredi 21 octobre » — le libellé porté par la ligne. */
export function resumeJours(creneaux: CreneauStage[]): string {
  return creneaux
    .map((c) => `${jourFr(c.date)}${c.startTime ? ` ${c.startTime}` : ""}`)
    .join(", ");
}

/**
 * Le nouveau libellé de la ligne. La mention de remise « (-20€) » est
 * conservée : la règle de prix garde la réduction à l'identique, donc elle
 * reste vraie.
 */
export function libelleItem(titre: string, nbJours: number, childName: string, ancienLibelle: string): string {
  const remise = String(ancienLibelle || "").match(/\s*\(-[\d\s.,]+€\)\s*$/);
  return `${titre} (${nbJours}j) — ${childName}${remise ? remise[0].trimEnd() : ""}`;
}

/**
 * Regroupe une liste de créneaux en stages : un stage = les jours d'un même
 * lot, sur une même semaine. Sert à proposer des destinations à l'écran sans
 * lui faire deviner ce qui va avec quoi.
 *
 * Les jours de chaque stage ressortent triés par date, et les stages par date
 * de début : Nicolas lit un calendrier, pas un tas.
 */
export function grouperEnStages(creneaux: CreneauStage[]): CreneauStage[][] {
  const lots: CreneauStage[][] = [];
  for (const c of creneaux) {
    const lot = lots.find((l) => memeStage(l[0], c));
    if (lot) lot.push(c);
    else lots.push([c]);
  }
  for (const lot of lots) lot.sort((a, b) => a.date.localeCompare(b.date));
  return lots.sort((a, b) => a[0].date.localeCompare(b[0].date)
    || String(a[0].startTime || "").localeCompare(String(b[0].startTime || "")));
}

/**
 * Le plan complet du déplacement : ce qu'il faut écrire, ce qui coince, et ce
 * dont il faut prévenir avant de valider.
 */
export function planifierChangementGroupe(params: ParamsChangementGroupe): PlanChangementGroupe {
  const {
    childId, childName, source, cible, creneauxConnus = [],
    item = null, autresItems = [], dejaEncaisse = 0,
    numeroFacture = null, periodeSource = null, periodeCible = null,
    maintenant = new Date(),
  } = params;

  const blocages: string[] = [];
  const avertissements: string[] = [];

  const idsSource = source.map((c) => c.id).filter(Boolean) as string[];
  const idsCible = cible.map((c) => c.id).filter(Boolean) as string[];
  const dansLeMemeStage = source.length > 0 && cible.length > 0 && memeStage(source[0], cible[0]);

  const prixAncien = centimes(item?.priceTTC || 0);
  const tarifSource = tarifStage(source);
  const tarifCible = tarifStage(cible);
  // Sans ligne de commande, il n'y a pas de prix à reporter : le déplacement
  // est purement planning.
  const prixNouveau = item ? Math.max(0, centimes(prixAncien + (tarifCible - tarifSource))) : 0;
  const ecart = centimes(prixNouveau - prixAncien);

  // ── Ce qui empêche le déplacement ──────────────────────────────────────
  if (source.length === 0) blocages.push("Le cavalier n'est inscrit à aucun jour de ce stage.");
  if (cible.length === 0) blocages.push("Aucun jour n'a été trouvé pour le groupe de destination.");

  const memesJours = idsSource.length === idsCible.length
    && idsSource.every((id) => idsCible.includes(id));
  if (memesJours && idsSource.length > 0) {
    blocages.push(`${childName} est déjà inscrit(e) dans ce groupe.`);
  }

  if (cible.length > 0 && !memesJours) {
    const restantes = placesRestantes(cible, childId);
    if (restantes <= 0) {
      const jourPlein = cible.find((c) => {
        const inscrits = (c.enrolled || []).filter((e) => e?.childId !== childId).length;
        return (c.maxPlaces || 0) - inscrits <= 0;
      });
      blocages.push(`Le groupe est complet${jourPlein ? ` le ${jourFr(jourPlein.date)}` : ""}.`);
    }
  }

  const ignorer = new Set<string>([...idsSource, ...idsCible]);
  for (const conflit of conflitsHoraires(cible, childId, creneauxConnus, ignorer)) {
    blocages.push(`Conflit d'horaire le ${jourFr(conflit.date)} avec « ${conflit.titre} ».`);
  }

  // Une facture émise ne se réécrit pas. Tant que le montant ne bouge pas, on
  // accepte de corriger l'objet de la ligne ; dès qu'il change, la voie légale
  // est l'avoir, pas la retouche (art. L102 B du LPF).
  if (numeroFacture && ecart !== 0) {
    blocages.push(
      `La facture ${numeroFacture} est déjà émise et le prix change de ${ecart > 0 ? "+" : ""}${ecart.toFixed(2)}€. `
      + "Passe par une désinscription (qui crée l'avoir) puis une nouvelle inscription.",
    );
  }

  // ── Ce dont il faut prévenir ───────────────────────────────────────────
  if (!item) {
    avertissements.push("Cette inscription n'est rattachée à aucune commande : seul le planning change, rien n'est facturé.");
  } else if (ecart !== 0) {
    avertissements.push(
      `Le prix passe de ${prixAncien.toFixed(2)}€ à ${prixNouveau.toFixed(2)}€ `
      + `(${ecart > 0 ? "+" : ""}${ecart.toFixed(2)}€ pour la famille).`,
    );
  } else if (item) {
    avertissements.push("Même tarif : rien ne change pour la famille, l'acompte reste acquis à cette inscription.");
  }

  if (numeroFacture && ecart === 0) {
    avertissements.push(`La facture ${numeroFacture} est déjà émise : le montant ne bouge pas, seul l'intitulé du stage est corrigé.`);
  }

  if (periodeSource && periodeCible && periodeSource !== periodeCible) {
    avertissements.push(
      "Le nouveau stage est sur une autre période de vacances : les réductions déjà accordées sont conservées telles quelles, "
      + "elles ne sont pas recalculées sur le barème de la nouvelle période.",
    );
  }

  if (dansLeMemeStage) {
    avertissements.push("Changement de groupe à l'intérieur du même stage : la liste d'attente n'est pas prévenue.");
  }

  const totalAutres = autresItems.reduce((s, i) => s + (i.priceTTC || 0), 0);
  const totalCommande = item ? centimes(totalAutres + prixNouveau) : centimes(totalAutres);
  const paidAmount = centimes(Math.min(dejaEncaisse, totalCommande));
  const avoir = centimes(Math.max(0, dejaEncaisse - totalCommande));
  // Même règle que la désinscription : une commande soldée est « paid », y
  // compris quand elle ne doit plus rien.
  const statut: "paid" | "partial" | "pending" =
    paidAmount >= totalCommande ? "paid" : paidAmount > 0 ? "partial" : "pending";

  if (avoir > 0) {
    avertissements.push(`Le nouveau stage coûte moins que ce qui a déjà été réglé : un avoir de ${avoir.toFixed(2)}€ sera créé.`);
  }

  const stageKeyCible = stageKeyDe(cible);

  // ── La ligne de commande retaillée ─────────────────────────────────────
  let itemModifie: ItemCommande | null = null;
  if (item && cible.length > 0) {
    const taux = tauxTva(item.tva);
    itemModifie = {
      ...item,
      activityTitle: libelleItem(cible[0].activityTitle, cible.length, childName, String(item.activityTitle || "")),
      activityType: cible[0].activityType || item.activityType,
      stageKey: stageKeyCible,
      stageSchedule: resumeJours(cible),
      stageDates: cible.map((c) => ({ date: c.date, startTime: c.startTime || "", endTime: c.endTime || "" })),
      priceTTC: prixNouveau,
      priceHT: centimes(prixNouveau / (1 + taux / 100)),
      tva: taux,
      // Trace de l'opération : un vérificateur — et Nicolas dans six mois —
      // doit pouvoir lire d'où vient cette ligne.
      _deplaceDepuis: {
        stageKey: item.stageKey || null,
        activityTitle: item.activityTitle || null,
        prixTTC: prixAncien,
        le: maintenant.toISOString(),
      },
    };
    // Les lignes créées en ligne portent leurs jours ; celles créées en admin
    // n'en portent pas. On ne pose la clé que si elle existait déjà, pour ne
    // pas changer la forme d'une ligne au passage.
    if (Array.isArray(item.creneauIds)) itemModifie.creneauIds = idsCible;
    if (item.creneauId) itemModifie.creneauId = idsCible[0];
  }

  return {
    possible: blocages.length === 0,
    blocages,
    avertissements,
    memeStage: dansLeMemeStage,
    quitter: idsSource.filter((id) => !idsCible.includes(id)),
    rejoindre: idsCible.filter((id) => !idsSource.includes(id)),
    stageKeyCible,
    prixAncien,
    prixNouveau,
    ecart,
    totalCommande,
    paidAmount,
    statut,
    avoir,
    notifierListeAttente: !dansLeMemeStage,
    itemModifie,
  };
}
