// ═══ Forfaits annuels : statut et rang de fratrie ═══
//
// Ce fichier portait aussi un calendrier scolaire 2025-2026, une saison et une
// fermeture hivernale écrits en dur, plus un calcul de prorata. Rien de tout
// cela n'était importé nulle part : du code mort, retiré le 30/08/2026.
//
// Il valait mieux le supprimer que le mettre à jour. Ces constantes avaient
// l'apparence de la source de vérité et invitaient à venir les corriger chaque
// rentrée, alors que les vraies données sont ailleurs et n'ont pas besoin
// d'être touchées :
//
//   • la saison est déduite de la date par `seasonOf()` (lib/forfait-pricing) —
//     mois >= septembre → saison de l'année, sinon année précédente. Aucune
//     année codée, elle vaut pour toutes les rentrées ;
//   • les vacances scolaires sont saisies dans l'administration et lues dans
//     la collection Firestore `vacationPeriods` (cf. lib/discounts).
//
// Le prorata et le comptage de séances existent encore dans
// scripts/validate-all.ts, qui en garde ses propres copies locales — ce script
// ne dépend pas de ce module.

// ═══ Statut d'un forfait ═══
// Deux orthographes coexistent en base : "actif" (inscription en ligne des
// familles, avoirs, créations récentes) et "active" (créations depuis l'admin
// jusqu'à cette correction). Un forfait écrit "active" était invisible pour
// l'espace famille : licence et adhésion re-facturées, heure supplémentaire
// vendue à plein tarif au lieu du différentiel, garde anti-double-inscription
// contournée.
//
// On écrit désormais "actif" partout, et on lit les deux — les forfaits déjà
// enregistrés en "active" restent valides sans migration.
// Un forfait sans statut est considéré actif (comportement historique).
export const FORFAIT_STATUT_ACTIF = "actif";

export function isForfaitActif(status?: string | null): boolean {
  return !status || status === "actif" || status === "active";
}

/**
 * Rang de l'enfant dans sa famille pour une saison : 1er, 2e, 3e…
 *
 * Sert à la réduction fratrie. On compte les AUTRES enfants de la famille
 * ayant un forfait actif sur la même saison, et on ajoute 1.
 *
 * Deux filtres décident du montant facturé :
 *   - le statut : un forfait annulé ne compte plus. Sans ce filtre, un aîné
 *     désinscrit continuait de faire passer le cadet en 2e enfant, avec la
 *     réduction indue qui va avec ;
 *   - la saison : les saisons ne se mélangent pas, sinon le rang gonflerait
 *     d'année en année.
 *
 * @param forfaits    forfaits connus (base et/ou panier en cours)
 * @param childId     enfant pour lequel on calcule le rang (exclu du compte)
 * @param saison      année de début de la saison visée
 * @param saisonDe    lit la saison d'un forfait (champ dédié ou date de création)
 */
export function rangEnfantPourSaison(
  forfaits: { childId?: string | null; status?: string | null; seasonStartYear?: number; createdAt?: unknown }[],
  childId: string,
  saison: number,
  saisonDe: (f: { seasonStartYear?: number; createdAt?: unknown }) => number,
): number {
  const autresEnfants = new Set<string>();
  for (const f of forfaits) {
    if (!f.childId || f.childId === childId) continue;
    if (!isForfaitActif(f.status)) continue;
    if (saisonDe(f) !== saison) continue;
    autresEnfants.add(f.childId);
  }
  return autresEnfants.size + 1;
}

// ─── Ce qu'un forfait annuel a réellement encaissé ──────────────────────────
//
// Le champ `totalPaidTTC` du document forfait n'est pas tenu à jour à
// l'encaissement : il ne sert à rien. La vérité est dans `payments`.
//
// Deux pièges, tous deux constatés le 31/08/2026 sur un forfait à 699 € réglé
// en dix prélèvements :
//
//   1. Le filtre ne retenait que les commandes `paid` ou `sepa_scheduled`.
//      Or, au dépôt de la première remise, la commande de référence passe en
//      `partial` — elle disparaissait donc du calcul, et l'écran Forfaits
//      affichait « 0 € / 699 € » alors que 69,90 € étaient au journal.
//
//   2. Le rattachement se faisait par libellé (« Forfait … »). Les échéances
//      2 à 10 d'un paiement en plusieurs fois s'intitulent « Échéance 2/10 —
//      Prénom » : elles n'étaient jamais comptées. On passe donc d'abord par
//      `forfaitRef`, posé sur chaque échéance et égal au `slotKey` du forfait.

export interface ForfaitRegle {
  familyId?: string | null;
  /** Cavalier du forfait : ce qui distingue trois frères et sœurs sur le même créneau. */
  childId?: string | null;
  slotKey?: string | null;
  activityTitle?: string | null;
}

/**
 * Somme des lignes d'une commande qui concernent ce cavalier.
 *
 * Les remises portent aussi le childId (montant négatif) : la part obtenue
 * est donc bien ce que l'enfant coûte, remise déduite.
 */
function partEnfant(paiement: any, childId: string): number {
  const total = (paiement?.items || [])
    .filter((i: any) => i?.childId === childId)
    .reduce((s: number, i: any) => s + (Number(i.priceTTC) || 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * La commande se rapporte-t-elle à ce forfait ?
 *
 * Le cavalier d'abord : `forfaitRef` vaut « activité — jour heure », sans le
 * moindre nom. Trois enfants d'une même famille inscrits au même créneau — le
 * cas Duhem du 31/08/2026 — partagent donc la MÊME référence, et chacun
 * s'attribuait les règlements des trois : 213,30 € affichés sur les trois
 * forfaits alors qu'une seule remise de 213,30 € couvrait deux d'entre eux.
 */
export function commandeDuForfait(paiement: any, forfait: ForfaitRegle): boolean {
  if (!paiement || paiement.familyId !== forfait.familyId) return false;
  if (paiement.status === "cancelled") return false;

  const items = paiement.items || [];
  // Une commande qui ne porte aucune ligne de ce cavalier ne le concerne pas.
  if (forfait.childId && !items.some((i: any) => i?.childId === forfait.childId)) return false;

  // Rattachement explicite : couvre toutes les échéances d'un 3× ou 10×,
  // dont les libellés ne disent que « Échéance 2/10 ».
  if (paiement.forfaitRef && forfait.slotKey && paiement.forfaitRef === forfait.slotKey) return true;
  // Repli sur le libellé, pour les forfaits saisis avant `forfaitRef`.
  return items.some((i: any) =>
    String(i?.activityTitle || "").includes("Forfait") &&
    String(i?.activityTitle || "").includes(forfait.activityTitle || ""),
  );
}

/**
 * Montant réellement encaissé sur ce forfait, toutes échéances confondues.
 *
 * Une commande peut porter plusieurs cavaliers — la fratrie inscrite en 1×
 * est regroupée dans une seule commande. Ce qui est encaissé est alors réparti
 * au prorata de ce que chaque enfant y pèse : à commande soldée, chacun voit
 * exactement sa part ; à mi-parcours, une approximation honnête plutôt que le
 * total de la fratrie affiché sur chacun.
 */
export function montantRegleForfait(paiements: any[], forfait: ForfaitRegle): number {
  const total = (paiements || [])
    .filter((p) => commandeDuForfait(p, forfait))
    .reduce((s: number, p: any) => {
      let regle = Number(p.paidAmount) || 0;
      // Anciennes commandes soldées sans `paidAmount` renseigné.
      if (regle === 0 && p.status === "paid") regle = Number(p.totalTTC) || 0;
      if (regle === 0) return s;

      const totalCommande = Number(p.totalTTC) || 0;
      const part = forfait.childId ? partEnfant(p, forfait.childId) : totalCommande;
      // Commande dédiée à ce cavalier (le cas courant) : rien à répartir.
      if (!forfait.childId || totalCommande <= 0 || part <= 0 || Math.abs(part - totalCommande) < 0.01) {
        return s + regle;
      }
      return s + regle * (part / totalCommande);
    }, 0);
  return Math.round(total * 100) / 100;
}
