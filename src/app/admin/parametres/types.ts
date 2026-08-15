/**
 * src/app/admin/parametres/types.ts
 *
 * Formes exactes des réglages écrits dans Firestore par la page Paramètres.
 *
 * Pourquoi un fichier à part : ces objets ne sont pas de simples états d'écran.
 * Chaque clé porte le NOM DU CHAMP tel qu'il est stocké dans `settings/*` et
 * relu ailleurs dans l'application — la facturation lit `settings/inscription`,
 * les emails lisent `settings/centre`, les réductions lisent
 * `settings/degressivite`. Renommer une clé ici casse silencieusement une autre
 * page : ces types servent de contrat écrit entre la page de saisie et ses
 * lecteurs, et les sous-composants de l'écran s'y réfèrent tous.
 */

/** Onglets de la page (l'URL ?section=… peut en ouvrir un directement). */
export type SectionId =
  | "centre" | "reductions" | "degressivite" | "vacances" | "annulation"
  | "comptable" | "horaires" | "moniteurs" | "fidelite" | "inscription"
  | "epreuves" | "progression" | "maintenance" | "notifications" | "marees" | "stages";

/** Sous-onglets de la section Maintenance. */
export type MaintenanceTab = "nettoyage" | "test" | "historique";

/** Document `settings/centre` — repris sur les factures, bons cadeaux et emails. */
export type CentreParams = {
  nom: string;
  legalName: string;
  address: string;
  tel: string;
  email: string;
  siret: string;
  tvaIntra: string;
  iban: string;
  bic: string;
  website: string;
  // Seuils poneys
  seuilPoneyOrange: number;   // nb séances → alerte orange
  seuilPoneyRouge: number;    // nb séances → alerte rouge
  seuilPoneyHeures: number;   // nb heures max/jour
};

// ─── Type d'une ligne optionnelle libre ───
// Ces lignes apparaissent dans l'inscription annuelle et la famille peut les cocher.
export type CustomInscriptionLine = {
  id: string;            // identifiant stable (timestamp ou uuid simple)
  label: string;         // ex. "Forfait compétition", "Tenue club"
  priceTTC: number;      // montant TTC en euros
  tvaRate: number;       // 0, 5.5, 10 ou 20
  accountCode: string;   // code du plan comptable (ex. 70611000)
};

/** Document `settings/inscription` — source de vérité des tarifs annuels. */
export type InscriptionParams = {
  // Forfaits par fréquence
  forfait1x: number;
  forfait2x: number;
  forfait3x: number;
  // Adhésion dégressive
  adhesion1: number;
  adhesion2: number;
  adhesion3: number;
  adhesion4plus: number;
  // Licence FFE
  licenceMoins18: number;
  licencePlus18: number;
  licenceTvaRate: number;      // TVA appliquée à la licence FFE (typiquement 0%)
  licenceAccountCode: string;  // code comptable de la licence
  // Saison
  totalSessionsSaison: number;
  dateFinSaison: string;
  // Stages
  assuranceOccasionnelle: number;
  // Lignes libres optionnelles (forfait compétition, options, suppléments...)
  customLines: CustomInscriptionLine[];
};

// ─── Réductions & codes promo ───
export type PromoType = "code" | "premiere_annee" | "anniversaire" | "parrainage";
export type DiscountMode = "percent" | "fixed";
export interface Promo {
  id: string;
  type: PromoType;
  code: string;
  label: string;
  discountMode: DiscountMode;
  discountValue: number;
  appliesTo: "forfait" | "paiement" | "tout";
  active: boolean;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
}

/**
 * Palier de dégressivité (document `settings/degressivite`).
 * `nth` = rang déclencheur (2ème stage, 3ème enfant…), `discount` = % de remise.
 */
export type PalierReduction = { nth: number; discount: number };

/** Politique d'annulation, stockée dans le même document `settings/degressivite`. */
export type Cancellation = { hours: number; retention: number };

// ═══ Vacances scolaires ═══
// Source pour la logique de réduction famille/multi-stages.
export interface VacationPeriod { id: string; name: string; startDate: string; endDate: string; }

/** Document `settings/notifications` — événements qui déclenchent un push admin. */
export type NotifSettings = {
  nouvelle_inscription: boolean;
  nouveau_paiement: boolean;
  impaye: boolean;
  liste_attente: boolean;
  annulation: boolean;
  nouveau_cavalier: boolean;
  rappel_stage: boolean;
};

/** Saisie du formulaire de fiche moniteur (collection `moniteurs`). */
export type MoniteurForm = {
  name: string;
  role: string;
  email: string;
  phone: string;
  status: string;
};
