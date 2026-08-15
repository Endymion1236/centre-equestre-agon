/**
 * src/app/admin/sepa/types.ts
 *
 * Formes exactes des documents SEPA stockés dans Firestore : les mandats
 * signés par les familles (`mandats-sepa`), les échéances à prélever
 * (`echeances-sepa`) et les remises envoyées à la banque (`remises-sepa`).
 *
 * Pourquoi un fichier à part : ces objets sortent de l'écran. Un mandat
 * alimente le fichier XML remis au Crédit Agricole, une échéance devient un
 * encaissement dans le journal comptable et met à jour le paiement de
 * référence. Les champs portent donc le NOM STOCKÉ, pas un nom d'affichage :
 * renommer une clé ici ne casse pas seulement la page, ça casse la remise
 * bancaire ou le rapprochement des paiements. Les modules de la page (calcul
 * des transactions, écritures Firestore, sous-composants d'onglet) s'y
 * réfèrent tous, d'où le contrat écrit une seule fois ici.
 *
 * Le type de la fonction `toast` est repris tel quel depuis le contexte
 * `useToast` : les handlers d'écriture affichent leurs propres messages, il
 * faut donc pouvoir la leur passer.
 */

/** Signature de `toast` fournie par `useToast()` — passée aux handlers. */
export type ToastFn = (
  message: string,
  type?: "success" | "error" | "warning" | "info",
  duration?: number,
) => void;

export interface MandatSepa {
  id: string;
  familyId: string;
  familyName: string;
  mandatId: string;      // ex: CEDC2190MD1
  iban: string;
  bic: string;
  dateSignature: string; // YYYY-MM-DD
  titulaire: string;     // Nom sur le compte bancaire
  libelle?: string;      // Libellé pour distinguer 2 mandats (ex: "Père", "Mère")
  status: "active" | "revoked";
  createdAt: any;
}

export interface EcheanceSepa {
  id: string;
  familyId: string;
  familyName: string;
  mandatId: string;
  montant: number;
  dateEcheance: string; // YYYY-MM-DD
  reference: string;    // ex: "Facture N 9712"
  description: string;  // ex: "Forfait annuel 3/10"
  status: "pending" | "remis" | "preleve" | "rejete";
  remiseId: string | null;
  paymentId: string | null; // Lien vers le paiement correspondant
  orderId?: string | null;  // Lien vers le paiement de référence
  echeance?: number;
  echeancesTotal?: number;
  createdAt: any;
}

export interface RemiseSepa {
  id: string;
  numero: number;
  dateRemise: string;
  datePrelevement: string;
  nbTransactions: number;
  montantTotal: number;
  status: "draft" | "generated" | "deposited";
  xmlFileName: string | null;
  createdAt: any;
}

/** Saisie du formulaire « Nouveau mandat ». */
export interface SaisieMandat {
  familyId: string;
  iban: string;
  bic: string;
  titulaire: string;
  libelle: string;
  dateSignature: string;
}

/** Saisie du formulaire « Créer un échéancier » (1 mandat, ou réparti sur 2). */
export interface SaisieEcheancier {
  mandatId: string;
  mandatId2: string;
  montantTotal: string;
  montant2: string;
  nbEcheances: string;
  dateDebut: string;
  description: string;
}
