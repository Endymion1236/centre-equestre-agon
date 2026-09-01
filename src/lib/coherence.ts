/**
 * src/lib/coherence.ts — ce qui ne colle pas, sans avoir à le chercher.
 *
 * Une journée de septembre 2026 a suffi à en montrer l'utilité : une famille
 * réglait 350 € sans apparaître au planning, une autre voyait sa promenade
 * d'octobre datée du 31 août, une commande était soldée sans numéro de
 * facture, un prélèvement s'affichait sur trois forfaits à la fois. Aucun de
 * ces défauts ne se signalait : ils ont été découverts un par un, par hasard,
 * en ouvrant le bon écran au bon moment.
 *
 * Ce module rassemble les vérifications que la machine peut faire seule. Il ne
 * corrige rien et n'écrit rien : il constate, et dit où regarder.
 *
 * Fonction PURE, sans Firestore : elle reçoit les collections déjà lues (la
 * route /api/admin/coherence s'en charge) et rend une liste d'anomalies. C'est
 * ce qui la rend testable — la leçon de la journée étant qu'un calcul enfermé
 * dans un écran de 4 000 lignes ne se vérifie jamais.
 */

export type GraviteAnomalie = "bloquant" | "attention" | "info";

export interface Anomalie {
  /** Identifiant stable de la règle, pour le regroupement et les tests. */
  code: string;
  gravite: GraviteAnomalie;
  /** Ce qui ne va pas, en une ligne. */
  titre: string;
  /** Le détail, avec les montants et les noms. */
  detail: string;
  famille?: string;
  paymentId?: string;
  creneauId?: string;
  /** Écran où le traiter. */
  lien?: string;
  /** Réparation proposée par l'écran, quand elle existe. */
  action?: "replacer-au-planning" | "attribuer-numero";
}

export interface DonneesCoherence {
  paiements: any[];
  creneaux: any[];
  reservations: any[];
  encaissements: any[];
  echeancesSepa: any[];
  cartes: any[];
  /** Horodatage de référence — injecté pour rendre les tests déterministes. */
  maintenant?: Date;
}

const arrondi = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const eur = (n: number) => `${arrondi(n).toFixed(2).replace(".", ",")} €`;
const estAnnule = (p: any) => p?.status === "cancelled";

/** Créneaux couverts par une ligne de commande, quelle que soit sa forme. */
function creneauxDeLaLigne(item: any): string[] {
  if (Array.isArray(item?.creneauIds) && item.creneauIds.length) return item.creneauIds.filter(Boolean);
  return item?.creneauId ? [item.creneauId] : [];
}

export function analyserCoherence(d: DonneesCoherence): Anomalie[] {
  const maintenant = d.maintenant || new Date();
  const anomalies: Anomalie[] = [];
  const paiements = (d.paiements || []).filter((p) => !estAnnule(p));
  const creneauxParId = new Map<string, any>((d.creneaux || []).map((c) => [c.id, c]));

  // ── 1. Commande soldée sans numéro de facture ────────────────────────────
  // Toute vente soldée doit porter un numéro de la séquence continue
  // (CGI art. 242 nonies A). Le dépôt d'une remise SEPA en oubliait.
  for (const p of paiements) {
    if (p.status !== "paid") continue;
    if (p.invoiceNumber) continue;
    if ((Number(p.totalTTC) || 0) <= 0) continue; // inscription offerte
    anomalies.push({
      code: "facture-sans-numero",
      gravite: "bloquant",
      titre: "Commande soldée sans numéro de facture",
      detail: `${p.familyName || "Famille"} — ${eur(p.totalTTC)} réglés, aucun numéro attribué.`,
      famille: p.familyName,
      paymentId: p.id,
      lien: "/admin/paiements?tab=historique",
      action: "attribuer-numero",
    });
  }

  // ── 2. Argent encaissé, cavalier absent du planning ──────────────────────
  // Le cas WAGNER : place tenue libérée par la purge, règlement arrivé après,
  // et plus personne au planning. L'email annonce le stage, la place n'existe
  // pas.
  for (const p of paiements) {
    if ((Number(p.paidAmount) || 0) <= 0) continue;
    const manquants: string[] = [];
    for (const item of p.items || []) {
      if (!item?.childId) continue;
      for (const cid of creneauxDeLaLigne(item)) {
        const c = creneauxParId.get(cid);
        if (!c) continue; // créneau supprimé ou hors fenêtre : traité plus bas
        const inscrit = (c.enrolled || []).some((e: any) => e?.childId === item.childId);
        if (!inscrit) {
          manquants.push(`${item.childName || "cavalier"} — ${c.activityTitle || "créneau"} du ${c.date || "?"}`);
        }
      }
    }
    if (manquants.length > 0) {
      anomalies.push({
        code: "paye-mais-absent-du-planning",
        gravite: "bloquant",
        titre: "Réglé, mais absent du planning",
        detail: `${p.familyName || "Famille"} a réglé ${eur(p.paidAmount)} — place(s) manquante(s) : ${manquants.slice(0, 6).join(" · ")}${manquants.length > 6 ? ` (+${manquants.length - 6})` : ""}.`,
        famille: p.familyName,
        paymentId: p.id,
        lien: "/admin/paiements?tab=historique",
        action: "replacer-au-planning",
      });
    }
  }

  // ── 3. Le journal et la commande ne disent pas la même chose ─────────────
  // `paidAmount` doit être la somme des écritures. Un écart signale une
  // écriture perdue, une contre-passation oubliée, ou un montant forcé.
  const encParPaiement = new Map<string, number>();
  for (const e of d.encaissements || []) {
    if (!e?.paymentId) continue;
    encParPaiement.set(e.paymentId, arrondi((encParPaiement.get(e.paymentId) || 0) + (Number(e.montant) || 0)));
  }
  for (const p of paiements) {
    const journal = encParPaiement.get(p.id);
    if (journal === undefined) continue; // aucune écriture : rien à comparer
    const commande = arrondi(p.paidAmount);
    if (Math.abs(journal - commande) < 0.01) continue;
    anomalies.push({
      code: "journal-different-de-la-commande",
      gravite: "bloquant",
      titre: "Le journal et la commande divergent",
      detail: `${p.familyName || "Famille"} — ${eur(journal)} au journal contre ${eur(commande)} sur la commande (écart ${eur(Math.abs(journal - commande))}).`,
      famille: p.familyName,
      paymentId: p.id,
      lien: "/admin/paiements?tab=journal",
    });
  }

  // ── 4. Réservation sans date, ou datée autrement que son créneau ─────────
  // Le cas ROZIER : une promenade d'octobre écrite au 31 août, donc affichée
  // comme passée et absente des séances à venir.
  for (const r of d.reservations || []) {
    if (r?.status === "cancelled") continue;
    const c = r?.creneauId ? creneauxParId.get(r.creneauId) : null;
    if (!r?.date) {
      anomalies.push({
        code: "reservation-sans-date",
        gravite: "attention",
        titre: "Réservation sans date",
        detail: `${r.childName || "Cavalier"} — ${r.activityTitle || "séance"} (${r.familyName || "famille"}).`,
        famille: r.familyName,
        creneauId: r.creneauId,
        lien: "/admin/planning",
      });
      continue;
    }
    if (c && c.date && r.date !== c.date) {
      anomalies.push({
        code: "reservation-date-incoherente",
        gravite: "attention",
        titre: "Réservation datée autrement que son créneau",
        detail: `${r.childName || "Cavalier"} — ${r.activityTitle || "séance"} : réservation au ${r.date}, créneau du ${c.date}.`,
        famille: r.familyName,
        creneauId: r.creneauId,
        lien: "/admin/planning",
      });
    }
  }

  // ── 5. Prélèvement passé sans écriture au journal ────────────────────────
  const encParEcheance = new Set((d.encaissements || []).map((e: any) => e?.sepaEcheanceId).filter(Boolean));
  for (const ech of d.echeancesSepa || []) {
    if (ech?.status !== "preleve") continue;
    if (encParEcheance.has(ech.id)) continue;
    anomalies.push({
      code: "sepa-preleve-sans-ecriture",
      gravite: "bloquant",
      titre: "Prélèvement passé sans écriture au journal",
      detail: `${ech.familyName || "Famille"} — ${eur(ech.montant)} du ${ech.dateEcheance || "?"} : marqué prélevé, rien au journal.`,
      famille: ech.familyName,
      lien: "/admin/sepa",
    });
  }

  // ── 6. Place tenue qui aurait dû expirer ─────────────────────────────────
  // La purge tourne tous les quarts d'heure : au-delà d'une heure de retard,
  // c'est elle qui ne fait pas son travail.
  const limiteHold = new Date(maintenant.getTime() - 60 * 60_000).toISOString();
  for (const c of d.creneaux || []) {
    for (const e of c.enrolled || []) {
      if (!e?.pending || !e.holdUntil) continue;
      if (e.holdUntil >= limiteHold) continue;
      anomalies.push({
        code: "place-tenue-expiree",
        gravite: "attention",
        titre: "Place tenue jamais libérée",
        detail: `${e.childName || "Cavalier"} — ${c.activityTitle || "créneau"} du ${c.date || "?"} : réservée jusqu'au ${e.holdUntil.slice(0, 16).replace("T", " ")}, toujours en attente.`,
        famille: e.familyName,
        creneauId: c.id,
        lien: "/admin/inscriptions-impayees",
      });
    }
  }

  // ── 7. Compteur de places désynchronisé ──────────────────────────────────
  for (const c of d.creneaux || []) {
    const reel = (c.enrolled || []).length;
    if (typeof c.enrolledCount !== "number" || c.enrolledCount === reel) continue;
    anomalies.push({
      code: "compteur-de-places-faux",
      gravite: "info",
      titre: "Compteur de places faux",
      detail: `${c.activityTitle || "Créneau"} du ${c.date || "?"} : ${c.enrolledCount} annoncé(s), ${reel} inscrit(s).`,
      creneauId: c.id,
      lien: "/admin/planning",
    });
  }

  // ── 8. Carte de séances remise sans encaissement ─────────────────────────
  for (const carte of d.cartes || []) {
    if (carte?.status !== "active") continue;
    const commandes = paiements.filter((p) =>
      p.cardId === carte.id || (p.items || []).some((i: any) => i?.cardId === carte.id));
    if (commandes.length === 0) continue; // carte importée : on ne présume rien
    const regle = arrondi(commandes.reduce((s: number, p: any) => s + (Number(p.paidAmount) || 0), 0));
    if (regle > 0.009) continue;
    const total = arrondi(commandes.reduce((s: number, p: any) => s + (Number(p.totalTTC) || 0), 0));
    anomalies.push({
      code: "carte-non-reglee",
      gravite: "attention",
      titre: "Carte de séances non réglée",
      detail: `${carte.familyName || "Famille"} — ${carte.childName || "carte"} : ${carte.remainingSessions ?? "?"} séance(s) restante(s), ${eur(total)} jamais encaissés.`,
      famille: carte.familyName,
      paymentId: commandes[0]?.id,
      lien: "/admin/cartes",
    });
  }

  // Le plus grave d'abord : c'est l'ordre dans lequel on veut les traiter.
  const poids: Record<GraviteAnomalie, number> = { bloquant: 0, attention: 1, info: 2 };
  return anomalies.sort((a, b) => poids[a.gravite] - poids[b.gravite] || a.code.localeCompare(b.code));
}

/** Regroupe les anomalies par règle, pour l'affichage. */
export function grouperAnomalies(anomalies: Anomalie[]): Array<{ code: string; titre: string; gravite: GraviteAnomalie; items: Anomalie[] }> {
  const groupes = new Map<string, { code: string; titre: string; gravite: GraviteAnomalie; items: Anomalie[] }>();
  for (const a of anomalies) {
    const g = groupes.get(a.code);
    if (g) g.items.push(a);
    else groupes.set(a.code, { code: a.code, titre: a.titre, gravite: a.gravite, items: [a] });
  }
  return [...groupes.values()];
}
