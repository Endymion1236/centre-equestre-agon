/**
 * src/lib/arret-medical.ts — arrêt médical d'un cavalier au forfait annuel.
 *
 * Novembre 2026, règle de Nicolas : un arrêt médical justifié de 3 semaines
 * au moins (certificat de contre-indication) retire du forfait les séances
 * manquées, au prorata À LA SÉANCE ; la famille continue de payer le reste.
 * Ex. 45 jours sans sport.
 *
 * Règle comptable : les échéances payées ou facturées ne bougent jamais
 * (une restitution passerait par un avoir) ; la réduction est imputée sur
 * les échéances À VENIR, pas encore facturées — commande ET prélèvement
 * SEPA encore « en attente » hors remise. Ce qui ne trouve pas d'échéance
 * où s'imputer est rendu par un avoir. Les séances de l'arrêt sont notées
 * absentes « arrêt médical » et ne donnent pas de rattrapage (déjà
 * compensées par la réduction).
 *
 * Pur, sans import, testé (tests/unit/arret-medical.test.ts).
 */

export const ARRET_MEDICAL_MIN_JOURS = 21;

const cts = (n: unknown) => Math.round((Number(n) || 0) * 100);

/** Jours de l'arrêt, bornes comprises (dates « AAAA-MM-JJ »). */
export function joursArret(debut: string, fin: string): number {
  const a = Date.parse(`${debut}T12:00:00Z`), b = Date.parse(`${fin}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Ligne qui n'est pas le cours lui-même : adhésion, licence, assurance (dues pour l'année). */
export const estLigneHorsCours = (titre: unknown) => /adh[ée]sion|licence|assurance/i.test(String(titre || ""));

/** Part « cours » du forfait : lignes du forfait hors adhésion/licence/assurance, réductions comprises. */
export function partCours(items: { activityTitle?: string; label?: string; priceTTC?: number }[]): number {
  return (items || []).filter((i) => !estLigneHorsCours(i.activityTitle ?? i.label)).reduce((s, i) => s + cts(i.priceTTC), 0) / 100;
}

/** Séance du créneau du forfait où le cavalier est inscrit (même cours, même heure). */
export function estSeanceDuForfait(
  c: { activityTitle?: string; startTime?: string; activityType?: string; enrolled?: { childId?: string }[] },
  forfait: { activityTitle?: string; startTime?: string; childId?: string },
): boolean {
  if (c.activityType === "stage" || c.activityType === "stage_journee") return false;
  return c.activityTitle === forfait.activityTitle && (!forfait.startTime || c.startTime === forfait.startTime)
    && (c.enrolled || []).some((e) => e.childId === forfait.childId);
}

export interface CommandeArret {
  id: string;
  orderId?: string | null;
  echeance?: number;
  echeanceDate?: string;
  totalTTC: number;
  status?: string;
  paymentMode?: string;
  invoiceNumber?: string | null;
  paidAmount?: number;
}

export interface PrelevementArret {
  id: string;
  paymentId?: string | null;
  orderId?: string | null;
  montant: number;
  status?: string;
  remiseId?: string | null;
  dateEcheance?: string;
}

export interface PlanArret {
  possible: boolean;
  raison?: string;
  jours: number;
  prixSeance: number;
  reduction: number;
  /** Prélèvements SEPA baissés (encore en attente, hors remise). */
  prelevements: { id: string; paymentId: string; date?: string; part: number; nouveauMontant: number }[];
  /** Commandes baissées : réduction totale et nouveau total. */
  commandes: { paymentId: string; echeance?: number; reduction: number; nouveauTotal: number; enSepa: boolean }[];
  /** Part de la réduction sans échéance où s'imputer : à rendre par un avoir. */
  nonImpute: number;
}

const estSepa = (c: CommandeArret) => c.status === "sepa_scheduled" || c.paymentMode === "prelevement_sepa";
/** Commande qu'on peut encore baisser : ni payée, ni facturée, ni annulée. */
export const commandeModifiable = (c: CommandeArret) => c.status !== "paid" && c.status !== "cancelled" && !c.invoiceNumber;
/** Prélèvement qu'on peut encore baisser : en attente, pas encore dans une remise. */
export const prelevementModifiable = (p: PrelevementArret) => p.status === "pending" && !p.remiseId;

export function prelevementsDeCommande(c: CommandeArret, prelevements: PrelevementArret[]): PrelevementArret[] {
  return prelevements.filter((p) => p.paymentId === c.id || (!p.paymentId && !!c.orderId && p.orderId === c.orderId));
}

export function planArretMedical(p: {
  debut: string; fin: string;
  seancesManquees: number;
  prixSeance: number;
  commandes: CommandeArret[];
  prelevements: PrelevementArret[];
}): PlanArret {
  const jours = joursArret(p.debut, p.fin);
  const base = { jours, prixSeance: Math.round(p.prixSeance * 100) / 100, reduction: 0, prelevements: [], commandes: [], nonImpute: 0 };
  if (!jours) return { possible: false, raison: "Dates de l'arrêt invalides.", ...base };
  if (jours < ARRET_MEDICAL_MIN_JOURS) return { possible: false, raison: `Arrêt de ${jours} jours : la réduction s'accorde à partir de 3 semaines (${ARRET_MEDICAL_MIN_JOURS} jours). En dessous, les séances se rattrapent.`, ...base };
  if (!(p.seancesManquees > 0)) return { possible: false, raison: "Aucune séance du forfait pendant l'arrêt.", ...base };
  if (!(p.prixSeance > 0)) return { possible: false, raison: "Prix de la séance inconnu : indiquez-le.", ...base };

  // Les « unités » qu'on peut baisser : prélèvements à venir d'une commande en
  // SEPA, ou commande entière (non SEPA, rien encore réglé dessus).
  type Unite = { cle: string; paymentId: string; prelevementId?: string; montant: number; ordre: string };
  const unites: Unite[] = [];
  for (const c of p.commandes) {
    if (!commandeModifiable(c)) continue;
    const prels = prelevementsDeCommande(c, p.prelevements);
    if (prels.length || estSepa(c)) {
      for (const pr of prels.filter(prelevementModifiable)) {
        unites.push({ cle: pr.id, paymentId: c.id, prelevementId: pr.id, montant: cts(pr.montant), ordre: pr.dateEcheance || "" });
      }
    } else if (!(Number(c.paidAmount) > 0)) {
      unites.push({ cle: c.id, paymentId: c.id, montant: cts(c.totalTTC), ordre: c.echeanceDate || String(c.echeance ?? "").padStart(3, "0") });
    }
  }
  unites.sort((a, b) => a.ordre.localeCompare(b.ordre));

  // Réparti à parts égales, au centime ; une échéance ne descend jamais sous
  // zéro, le surplus passe aux suivantes.
  const total = Math.round(p.seancesManquees * cts(p.prixSeance));
  let reste = total;
  const parts = new Map<string, number>();
  unites.forEach((u, k) => {
    const part = Math.min(Math.ceil(reste / (unites.length - k)), u.montant);
    if (part <= 0) return;
    reste -= part;
    parts.set(u.cle, part);
  });

  const prelevements: PlanArret["prelevements"] = [];
  const parCommande = new Map<string, number>();
  for (const u of unites) {
    const part = parts.get(u.cle) || 0;
    if (!part) continue;
    parCommande.set(u.paymentId, (parCommande.get(u.paymentId) || 0) + part);
    if (u.prelevementId) prelevements.push({ id: u.prelevementId, paymentId: u.paymentId, date: u.ordre || undefined, part: part / 100, nouveauMontant: (u.montant - part) / 100 });
  }
  const commandes: PlanArret["commandes"] = p.commandes
    .filter((c) => parCommande.has(c.id))
    .map((c) => ({ paymentId: c.id, echeance: c.echeance, reduction: parCommande.get(c.id)! / 100, nouveauTotal: (cts(c.totalTTC) - parCommande.get(c.id)!) / 100, enSepa: prelevementsDeCommande(c, p.prelevements).length > 0 || estSepa(c) }));
  return { possible: true, jours, prixSeance: base.prixSeance, reduction: total / 100, prelevements, commandes, nonImpute: reste / 100 };
}

/** Prix d'une séance : part « cours » de la commande qui porte le forfait entier, divisée par le nombre de séances. */
export function prixSeanceForfait(commandes: { items?: any[] }[], childId: string, totalSessions: number, prixFiche?: number): number {
  const n = Number(totalSessions) || 0;
  if (n <= 0) return 0;
  for (const c of commandes) {
    const lignes = (c.items || []).filter((i: any) => i?.childId === childId);
    if (lignes.some((i: any) => /forfait/i.test(String(i?.activityTitle || "")))) {
      const cours = partCours(lignes);
      if (cours > 0) return Math.round((cours / n) * 100) / 100;
    }
  }
  return prixFiche && prixFiche > 0 ? Math.round((prixFiche / n) * 100) / 100 : 0;
}
