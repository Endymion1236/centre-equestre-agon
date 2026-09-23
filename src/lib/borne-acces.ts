/**
 * src/lib/borne-acces.ts
 *
 * Qui a le droit de faire parler la borne d'accueil.
 *
 * Jusqu'ici, les routes de la borne se contentaient d'un compte connecté,
 * quel qu'il soit. Deux conséquences : la tablette du hall devait être
 * connectée au compte d'administration du club (une session admin posée sur
 * un écran public, à un geste « retour » de la comptabilité), et n'importe
 * quelle famille connectée à son espace pouvait appeler ces routes — dont
 * celle qui ouvre une conversation vocale, facturée à la minute.
 *
 * Le club déclare donc le COMPTE DE LA BORNE (Paramètres → Borne d'accueil) :
 * un compte ordinaire, sans droits d'administration, créé exprès pour la
 * tablette. Sont alors autorisés, et eux seuls :
 *
 *   - le personnel (administrateur ou moniteur) ;
 *   - le ou les comptes déclarés.
 *
 * Tant qu'aucun compte n'est déclaré, rien ne change pour les écrans
 * existants : les routes ouvertes le restent (`strict: false`), pour ne pas
 * éteindre une borne en service. Déclarer un compte referme la porte.
 * Le tableau du jour, lui, nomme des enfants : il est `strict` dès
 * maintenant, et n'accepte que le personnel ou un compte déclaré.
 *
 * Module pur : ni Firestore, ni React (cf. borne-acces-server).
 */

export const DOC_REGLAGE_BORNE = "borne";

export interface ReglageBorne {
  /** Comptes autorisés : adresses email, ou identifiants de compte (UID). */
  comptes: string[];
}

/** Une entrée saisie par le club → forme comparable (email en minuscules). */
export function normaliserCompte(valeur: unknown): string {
  const v = String(valeur ?? "").trim();
  return v.includes("@") ? v.toLowerCase() : v;
}

/** Nettoie une liste saisie : vide les doublons et les entrées vides. */
export function nettoyerComptes(valeurs: unknown): string[] {
  const liste = Array.isArray(valeurs) ? valeurs : [];
  return Array.from(new Set(liste.map(normaliserCompte).filter(Boolean)));
}

/** Ce compte est-il l'un de ceux déclarés ? Email comparé sans la casse, UID à l'identique. */
export function estCompteDeclare(uid: string, email: string | null | undefined, comptes: string[]): boolean {
  const mail = normaliserCompte(email);
  return nettoyerComptes(comptes).some((c) => (c.includes("@") ? !!mail && c === mail : c === uid));
}

export type MotifAccesBorne = "staff" | "compte-borne" | "aucun-compte-declare" | "refuse";

/**
 * Décision d'accès. `strict` refuse quand aucun compte n'est déclaré ;
 * sans lui, l'absence de déclaration laisse passer tout compte connecté,
 * comme avant ce réglage.
 */
export function accesBorneAccorde(params: {
  estStaff: boolean;
  uid: string;
  email?: string | null;
  comptes: string[];
  strict?: boolean;
}): { ok: boolean; motif: MotifAccesBorne } {
  if (params.estStaff) return { ok: true, motif: "staff" };
  const comptes = nettoyerComptes(params.comptes);
  if (estCompteDeclare(params.uid, params.email, comptes)) return { ok: true, motif: "compte-borne" };
  if (comptes.length === 0 && !params.strict) return { ok: true, motif: "aucun-compte-declare" };
  return { ok: false, motif: "refuse" };
}

export const MESSAGE_REFUS_BORNE = "Ce compte n'est pas celui de la borne d'accueil";
