/**
 * src/lib/groupes-copie-test.ts
 *
 * Copie production → base de test : quoi recopier, quoi garder.
 *
 * Pourquoi des groupes : quand on travaille la comptabilité sur la préversion
 * test (rapprochements, justificatifs, catégories), une copie « base propre »
 * qui écrase tout ferait perdre ce travail. Chaque famille de données se
 * choisit donc séparément :
 *
 *   - « prod »   : vidée en test puis recopiée depuis la production ;
 *   - « garder » : laissée telle quelle en test (ni vidage, ni copie).
 *
 * Un groupe gardé n'est jamais touché, même partiellement : recopier la
 * production par-dessus des documents de même identifiant écraserait le
 * travail fait en test, ce qui est exactement ce qu'on veut éviter.
 *
 * Toute collection qui n'appartient à aucun groupe nommé tombe dans
 * « autres » : une collection ajoutée demain suit la règle de ce groupe, elle
 * ne peut pas être oubliée.
 *
 * Module pur, sans Firebase : utilisé par la route (plan) et par l'écran
 * (libellés), et testé unitairement.
 */

export type ModeGroupe = "prod" | "garder";

export interface GroupeCopie {
  id: string;
  libelle: string;
  detail: string;
  /** Collections de premier niveau ; les sous-collections suivent leur parent. */
  collections: readonly string[];
}

export const GROUPES_COPIE: readonly GroupeCopie[] = [
  {
    id: "compta-depenses",
    libelle: "Comptabilité : dépenses, justificatifs, rapprochements",
    detail: "Tableau des opérations, pièces et associations, relevés et imports bancaires, doublons, masse salariale, colis comptables.",
    collections: [
      "depenses", "justificatifs", "justificatifs-liens", "mouvements-rapprochement", "rapprochements",
      "tresorerie-releves", "imports-bancaires-liens", "imports-bancaires-historique", "tableau-depenses-historique",
      "depenses-doublons-archives", "depenses-doublons-lots", "depenses-doublons-historique", "doublons-ignores",
      "masse-salariale", "envois-comptable", "historiqueComptableCeleris", "comptabilite", "documents-comptables",
    ],
  },
  {
    id: "ventes-caisse",
    libelle: "Ventes et caisse : paiements, factures, encaissements",
    detail: "Paiements et factures, encaissements, avoirs, cartes, forfaits, remises, SEPA, chèques, clôtures de caisse, journaux d'audit.",
    collections: [
      "payments", "paiements", "encaissements", "avoirs", "cartes", "forfaits", "remises", "fidelite",
      "invoice_audit", "payment_declarations", "devis", "bons-cadeaux", "payment-links", "pricing_audit",
      "mandats-sepa", "echeances-sepa", "remises-sepa", "cheques-differes", "cawl_sessions", "cawl_confirmations",
      "mouvements_registre", "cloturesJournalieres", "fondsDeCaisse", "echeances",
    ],
  },
  {
    id: "inscriptions",
    libelle: "Planning et inscriptions",
    detail: "Créneaux, réservations, liste d'attente, récurrences, notes de séance, progressions.",
    collections: ["creneaux", "reservations", "waitlist", "recurrences", "preinscritsNotifies", "notes-seance", "progressions", "passages", "soins"],
  },
  {
    id: "familles",
    libelle: "Familles et comptes",
    detail: "Fiches familles, utilisateurs, fusions, changements d'adresse, liens de connexion.",
    collections: ["families", "users", "family-merges", "email-changes", "activation-emails", "activation-tokens", "magic-link-events", "push_tokens", "visites"],
  },
  {
    id: "autres",
    libelle: "Tout le reste : structure, communications, journaux",
    detail: "Activités, cavalerie, moniteurs, réglages, emails envoyés, messages, satisfaction, audits… et toute collection non listée ailleurs.",
    collections: [],
  },
] as const;

const INDEX: ReadonlyMap<string, string> = new Map(
  GROUPES_COPIE.flatMap((g) => g.collections.map((c) => [c, g.id] as const)),
);

/** Identifiant du groupe d'une collection (« autres » par défaut). */
export function groupeDeCollection(collection: string): string {
  return INDEX.get(collection) ?? "autres";
}

/** Lit `?garder=a,b` : identifiants de groupes connus, sans doublon ; lève sur un inconnu. */
export function lireGroupesGardes(valeur: string | null | undefined): string[] {
  const ids = (valeur || "").split(",").map((s) => s.trim()).filter(Boolean);
  const connus = new Set(GROUPES_COPIE.map((g) => g.id));
  for (const id of ids) if (!connus.has(id)) throw new Error(`Groupe inconnu dans « garder » : ${id}. Groupes possibles : ${[...connus].join(", ")}.`);
  return [...new Set(ids)];
}

export type ActionCollection = "vider-puis-copier" | "copier" | "garder";

export interface PlanCollection {
  collection: string;
  groupe: string;
  action: ActionCollection;
  /** Documents présents en test (comptés seulement si la base propre est demandée). */
  enTest?: number;
}

/**
 * Plan d'une copie : pour chaque collection vue en source ou en test, ce qui
 * lui arrive. Une collection gardée n'est ni vidée ni copiée. Sans
 * « propre », rien n'est vidé (copie par-dessus, comportement historique).
 */
export function planifierCopie(params: {
  collectionsSource: readonly string[];
  collectionsTest: readonly string[];
  propre: boolean;
  garder: readonly string[];
}): PlanCollection[] {
  const gardes = new Set(params.garder);
  const noms = [...new Set([...params.collectionsSource, ...params.collectionsTest])].sort();
  return noms.map((collection) => {
    const groupe = groupeDeCollection(collection);
    const enSource = params.collectionsSource.includes(collection);
    let action: ActionCollection;
    if (gardes.has(groupe)) action = "garder";
    else if (params.propre) action = "vider-puis-copier";
    else action = enSource ? "copier" : "garder";
    return { collection, groupe, action };
  });
}

/** Résumé lisible par groupe : « prod » ou « garder ». */
export function resumeParGroupe(garder: readonly string[]): Record<string, ModeGroupe> {
  const gardes = new Set(garder);
  return Object.fromEntries(GROUPES_COPIE.map((g) => [g.id, gardes.has(g.id) ? "garder" : "prod"]));
}
