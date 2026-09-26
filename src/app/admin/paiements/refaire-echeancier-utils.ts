/**
 * src/app/admin/paiements/refaire-echeancier-utils.ts
 *
 * Changer le nombre d'échéances ou le moyen de paiement d'un échéancier en
 * cours, sans toucher à l'inscription.
 *
 * Un forfait inscrit en 3 fois par carte, que la famille veut finalement
 * régler en 10 virements (septembre 2026) : le seul bouton existant annulait
 * l'échéancier ET désinscrivait l'enfant. Ici :
 *   - les échéances déjà payées ne bougent pas ;
 *   - le reste dû est redécoupé en N échéances (construireEcheancier : chaque
 *     échéance porte sa part de chaque ligne, TVA comprise, au centime près) ;
 *   - les commandes non payées sont réutilisées dans l'ordre, les échéances en
 *     plus sont créées, celles en trop sont annulées (jamais effacées : elles
 *     restent tracées avec leur motif).
 *
 * Refus : une échéance non payée déjà facturée ou déjà en partie réglée — la
 * redécouper changerait une pièce émise ou un encaissement au journal.
 * Le prélèvement SEPA passe par son propre écran (mandat, pré-notification).
 */

import { construireEcheancier, type ItemEcheance } from "@/lib/echeancier-paiement";
import { CHAMP_LIEN_CB } from "./echeances-utils";

export const MODES_ECHEANCIER: { id: string; label: string }[] = [
  { id: "virement", label: "Virement" },
  { id: "cb_terminal", label: "Carte bancaire" },
  { id: "cheque", label: "Chèque" },
  { id: "especes", label: "Espèces" },
];

export interface OptionsRefaireEcheancier {
  /** Nombre d'échéances pour le reste dû (1 à 12). */
  nombre: number;
  mode: string;
  /** « AAAA-MM-JJ » : première nouvelle échéance, les suivantes de mois en mois. */
  dateDepart: string;
}

export interface EcritureEcheancier { id: string; data: Record<string, any> }

export interface PlanRefaireEcheancier {
  possible: boolean;
  raison?: string;
  /** Échéances déjà payées, conservées telles quelles. */
  conservees: number;
  /** Reste dû redécoupé, en euros. */
  resteDu: number;
  miseAJour: EcritureEcheancier[];
  creations: EcritureEcheancier[];
  annulations: EcritureEcheancier[];
  /** Un lien de paiement CB a déjà été ouvert sur une échéance redécoupée. */
  lienCbDejaOuvert: boolean;
  apercu: { echeance: number; date: string; montant: number }[];
}

const SUFFIXE_ECHEANCE = /\s+—\s+échéance\s+\d+\/\d+$/i;
const centimes = (n: unknown) => Math.round((Number(n) || 0) * 100);

/**
 * Les lignes à répartir. L'inscription depuis le planning met toutes les
 * lignes du forfait sur l'échéance 1 et une ligne « Échéance i/N » sur les
 * suivantes : si une échéance porte à elle seule des lignes égales au reste
 * dû, ce sont les vraies lignes. Sinon, on additionne les parts de chaque
 * ligne (même libellé sans « — échéance i/N », même taux).
 */
export function lignesDuResteDu(restantes: any[], resteDuCentimes: number): ItemEcheance[] {
  // « Échéance 2/3 — Lou » (ligne des échéances suivantes) → « Solde du forfait — Lou ».
  const titre = (t: unknown) => String(t ?? "").replace(SUFFIXE_ECHEANCE, "").replace(/^Échéance\s+\d+\/\d+\s+—\s+/i, "Solde du forfait — ");
  const propre = (it: any): ItemEcheance => ({
    ...it,
    activityTitle: titre(it.activityTitle ?? it.label),
    label: titre(it.label ?? it.activityTitle),
  });
  for (const e of restantes) {
    const items = Array.isArray(e.items) ? e.items : [];
    const somme = items.reduce((s: number, it: any) => s + centimes(it.priceTTC ?? it.amount), 0);
    if (items.length && Math.abs(somme - resteDuCentimes) <= 5) return items.map(propre);
  }
  const fusion = new Map<string, ItemEcheance>();
  for (const e of restantes) {
    for (const it of Array.isArray(e.items) ? e.items : []) {
      const p = propre(it);
      const cle = `${p.activityTitle}|${p.tva ?? ""}|${(it as any).childId ?? ""}`;
      const deja = fusion.get(cle);
      const ttc = centimes(it.priceTTC ?? it.amount);
      if (deja) deja.priceTTC = (centimes(deja.priceTTC) + ttc) / 100;
      else fusion.set(cle, { ...p, priceTTC: ttc / 100 });
    }
  }
  return [...fusion.values()];
}

/**
 * `surcharge` : corriger aussi le MONTANT (panneau d'inscription, « 💶 Montant »).
 * Les lignes corrigées remplacent celles des commandes, et le reste dû devient
 * leur total moins ce qui est déjà payé.
 */
export function refaireEcheancier(echs: any[], options: OptionsRefaireEcheancier, surcharge?: { lignes: ItemEcheance[]; totalTTC: number }): PlanRefaireEcheancier {
  const vide = { conservees: 0, resteDu: 0, miseAJour: [], creations: [], annulations: [], lienCbDejaOuvert: false, apercu: [] };
  const refus = (raison: string): PlanRefaireEcheancier => ({ possible: false, raison, ...vide });
  const nombre = Math.floor(Number(options.nombre) || 0);
  if (nombre < 1 || nombre > 12) return refus("Choisissez entre 1 et 12 échéances.");
  if (!MODES_ECHEANCIER.some((m) => m.id === options.mode)) return refus("Moyen de paiement non pris en charge ici (le prélèvement SEPA se prépare dans Prélèvements SEPA).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.dateDepart || "")) return refus("Date de la première échéance invalide.");

  const actives = [...echs].filter((e) => e?.status !== "cancelled").sort((a, b) => Number(a.echeance || 0) - Number(b.echeance || 0));
  const payees = actives.filter((e) => e.status === "paid");
  const restantes = actives.filter((e) => e.status !== "paid");
  if (!restantes.length) return refus("Toutes les échéances sont déjà payées.");
  if (restantes.some((e) => e.status === "sepa_scheduled" || e.paymentMode === "prelevement_sepa")) {
    return refus("Échéancier en prélèvement SEPA : annulez-le d'abord dans Prélèvements SEPA.");
  }
  const facturee = restantes.find((e) => e.invoiceNumber);
  if (facturee) return refus(`L'échéance ${facturee.echeance} porte déjà la facture ${facturee.invoiceNumber} : elle ne se redécoupe plus.`);
  const entamee = restantes.find((e) => (Number(e.paidAmount) || 0) > 0);
  if (entamee) return refus(`L'échéance ${entamee.echeance} est déjà réglée en partie : encaissez-en le solde d'abord.`);

  const dejaPaye = payees.reduce((s, e) => s + centimes(e.totalTTC), 0);
  const resteDuCentimes = surcharge
    ? centimes(surcharge.totalTTC) - dejaPaye
    : restantes.reduce((s, e) => s + centimes(e.totalTTC), 0);
  if (surcharge && resteDuCentimes < 0) return refus(`Le nouveau total (${(centimes(surcharge.totalTTC) / 100).toFixed(2)} €) est inférieur à ce qui est déjà payé (${(dejaPaye / 100).toFixed(2)} €) : le trop-perçu passe par un avoir.`);
  if (resteDuCentimes <= 0) return refus("Rien à redécouper : le reste dû est nul.");

  const nouvelles = construireEcheancier({
    totalTTC: resteDuCentimes / 100,
    items: surcharge ? surcharge.lignes : lignesDuResteDu(restantes, resteDuCentimes),
    nombre,
    dateDepart: options.dateDepart,
  });
  const premiere = restantes[0];
  const total = payees.length + nombre;
  const idsPris = new Set(echs.map((e) => String(e.id)));
  const commun = (rang: number) => ({
    echeance: rang,
    echeancesTotal: total,
    paymentMode: options.mode,
    paymentPlan: `${nombre}x`,
    paymentRef: "",
    status: "pending",
    paidAmount: 0,
    forfaitRef: premiere.forfaitRef || "",
    // Nouvel échéancier : la trace d'un SEPA annulé ne vaut plus.
    echeancierAnnuleLe: null,
    // Le rappel « lien CB en fin de mois » n'a plus de sens hors carte.
    [CHAMP_LIEN_CB]: options.mode === "cb_terminal" ? restantes.some((e) => e[CHAMP_LIEN_CB] === true) : false,
  });

  const miseAJour: EcritureEcheancier[] = [];
  const creations: EcritureEcheancier[] = [];
  nouvelles.forEach((n, k) => {
    const rang = payees.length + k + 1;
    const data = { echeanceDate: n.echeanceDate, totalTTC: n.totalTTC, items: n.items, ...commun(rang) };
    if (k < restantes.length) { miseAJour.push({ id: String(restantes[k].id), data }); return; }
    let id = `${premiere.id}-echeance-${String(rang).padStart(2, "0")}`;
    while (idsPris.has(id)) id += "b";
    idsPris.add(id);
    creations.push({
      id,
      data: {
        ...data,
        familyId: premiere.familyId || "",
        familyName: premiere.familyName || "",
        orderId: `${premiere.orderId || premiere.id}-E${String(rang).padStart(2, "0")}`,
        sourcePaymentId: String(premiere.id),
      },
    });
  });
  const annulations = restantes.slice(nombre).map((e) => ({
    id: String(e.id),
    data: { status: "cancelled", annulationMotif: `Échéancier refait en ${nombre} fois (${libelleMode(options.mode)})` },
  }));

  return {
    possible: true,
    conservees: payees.length,
    resteDu: resteDuCentimes / 100,
    miseAJour,
    creations,
    annulations,
    lienCbDejaOuvert: restantes.some((e) => !!e.cawlHostedCheckoutId),
    apercu: nouvelles.map((n, k) => ({ echeance: payees.length + k + 1, date: n.echeanceDate, montant: n.totalTTC })),
  };
}

export function libelleMode(mode: string): string {
  return MODES_ECHEANCIER.find((m) => m.id === mode)?.label.toLowerCase() || mode;
}
