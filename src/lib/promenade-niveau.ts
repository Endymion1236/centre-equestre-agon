/**
 * src/lib/promenade-niveau.ts — Promenade au niveau fixé par la première inscription.
 *
 * PRINCIPE MÉTIER (décidé avec Nicolas, septembre 2026) :
 *   Le dimanche, le club ne sait pas à l'avance quel niveau de promenade
 *   proposer. Plutôt que trois créneaux concurrents, UN créneau « Promenade
 *   du dimanche » est publié avec le niveau « à définir » (`niveauADefinir`).
 *   La première famille qui réserve déclare le niveau de son cavalier ; ce
 *   niveau est alors VERROUILLÉ sur le créneau (`niveauFixe`) : les suivants
 *   ne peuvent réserver que s'ils sont compatibles. Premier arrivé, premier
 *   servi. Si le créneau se vide (annulation, place tenue expirée), le niveau
 *   redevient à définir.
 *
 *   Le verrou est posé PAR LE SERVEUR (/api/enroll) dans la transaction
 *   d'inscription : deux premières inscriptions simultanées ne peuvent pas
 *   fixer deux niveaux.
 *
 * Module pur : aucune dépendance Firestore, pour être partagé entre le
 * navigateur, les routes API et les tests.
 */

import { ageFromBirth, galopToNumber } from "./eligibilite";
import { REGLES_PROMENADE, niveauDepuisTitre, type NiveauPromenade } from "./promenades-securite";

export type { NiveauPromenade } from "./promenades-securite";

export const NIVEAUX_PROMENADE: NiveauPromenade[] = ["debutant", "debrouille", "confirme"];

/** Libellé court, pour un titre ou une pastille. */
export const LIBELLE_NIVEAU: Record<NiveauPromenade, string> = {
  debutant: "Débutants",
  debrouille: "Débrouillés",
  confirme: "Confirmés",
};

/** Résumé des conditions, tel que défini dans les règles de sécurité. */
export function resumeNiveau(n: NiveauPromenade): string {
  return REGLES_PROMENADE[n].resume;
}

export function estNiveauPromenade(v: unknown): v is NiveauPromenade {
  return v === "debutant" || v === "debrouille" || v === "confirme";
}

/** Champs d'un créneau qui comptent ici. */
export interface CreneauNiveau {
  activityTitle?: string;
  activityType?: string;
  niveauADefinir?: boolean;
  niveauFixe?: NiveauPromenade | null;
  enrolled?: unknown[];
}

/** Le créneau est-il une promenade dont le niveau est fixé par la première inscription ? */
export function estPromenadeADefinir(c: CreneauNiveau | null | undefined): boolean {
  return !!c && c.activityType === "balade" && c.niveauADefinir === true;
}

/**
 * Niveau effectif d'un créneau : le niveau verrouillé s'il existe, sinon
 * celui du titre pour une promenade classique, sinon null (à définir).
 */
export function niveauDuCreneau(c: CreneauNiveau | null | undefined): NiveauPromenade | null {
  if (!c) return null;
  if (estNiveauPromenade(c.niveauFixe)) return c.niveauFixe;
  if (estPromenadeADefinir(c)) return null;
  return niveauDepuisTitre(c.activityTitle || "");
}

/** « Débrouillés », « Niveau fixé par la première inscription », ou "" (pas concerné). */
export function libelleNiveauCreneau(c: CreneauNiveau | null | undefined): string {
  if (!estPromenadeADefinir(c)) return "";
  const n = niveauDuCreneau(c);
  return n ? LIBELLE_NIVEAU[n] : "Niveau fixé par la première inscription";
}

/**
 * Titre à afficher (réservation, borne, emails) : le niveau verrouillé est
 * ajouté au titre, sinon la mention « niveau à définir ».
 */
export function titreAvecNiveau(c: CreneauNiveau | null | undefined): string {
  const titre = String(c?.activityTitle || "").trim();
  if (!estPromenadeADefinir(c)) return titre;
  const n = niveauDuCreneau(c);
  return n ? `${titre} — ${LIBELLE_NIVEAU[n]}` : `${titre} — niveau à définir`;
}

/**
 * Compatibilité d'un cavalier avec un niveau, sur ce que la fiche sait :
 * l'âge (obligatoire) et le galop (s'il est renseigné). Le poids et la
 * maîtrise des allures ne sont pas dans nos données : ils restent vérifiés
 * par l'équipe au départ, comme aujourd'hui.
 */
export function compatibiliteCavalier(
  niveau: NiveauPromenade,
  cavalier: { birthDate?: any; galopLevel?: any },
): { ok: boolean; raison: string } {
  const regle = REGLES_PROMENADE[niveau];
  const age = ageFromBirth(cavalier.birthDate);
  if (age === null) return { ok: false, raison: "Date de naissance non renseignée sur la fiche." };
  if (age < regle.ageMin) return { ok: false, raison: `${regle.ageMin} ans minimum pour cette promenade (${age} ans).` };
  if (regle.galopMin !== null) {
    const g = galopToNumber(cavalier.galopLevel);
    if (g !== null && g < regle.galopMin) {
      return {
        ok: false,
        raison: niveau === "debrouille"
          ? `Galop ${regle.galopMin} ou trot enlevé maîtrisé requis (fiche : Galop ${g}). Contactez le club pour une évaluation.`
          : `Galop ${regle.galopMin} minimum requis (fiche : Galop ${g}).`,
      };
    }
  }
  return { ok: true, raison: "" };
}

/**
 * Ce qu'il faut écrire sur le créneau après un retrait d'inscrits : si une
 * promenade « à définir » se vide, son niveau redevient à définir.
 */
export function champsNiveauApresRetrait(
  c: CreneauNiveau | null | undefined,
  enrolledRestants: unknown[],
): { niveauFixe: null } | Record<string, never> {
  if (!estPromenadeADefinir(c)) return {};
  if (enrolledRestants.length > 0) return {};
  return c?.niveauFixe ? { niveauFixe: null } : {};
}

/**
 * Décision d'inscription sur une promenade « à définir », prise dans la
 * transaction serveur.
 *   - créneau vide, niveau déclaré     → on inscrit ET on verrouille ce niveau ;
 *   - créneau vide, rien déclaré       → refus « niveau requis » (famille) ;
 *   - niveau verrouillé, même niveau   → on inscrit ;
 *   - niveau verrouillé, autre niveau  → refus « niveau différent ».
 * Le personnel peut inscrire sans déclarer : il n'impose alors aucun niveau.
 */
export function deciderInscriptionNiveau(
  c: CreneauNiveau,
  niveauDeclare: unknown,
  estStaff: boolean,
): { ok: true; fixer: NiveauPromenade | null } | { ok: false; code: "niveau_requis" | "niveau_different"; niveauFixe: NiveauPromenade | null } {
  if (!estPromenadeADefinir(c)) return { ok: true, fixer: null };
  const fixe = estNiveauPromenade(c.niveauFixe) && (c.enrolled || []).length > 0 ? c.niveauFixe : null;
  const declare = estNiveauPromenade(niveauDeclare) ? niveauDeclare : null;
  if (!fixe) {
    if (declare) return { ok: true, fixer: declare };
    if (estStaff) return { ok: true, fixer: null };
    return { ok: false, code: "niveau_requis", niveauFixe: null };
  }
  if (!declare) return estStaff ? { ok: true, fixer: null } : { ok: false, code: "niveau_requis", niveauFixe: fixe };
  if (declare !== fixe) return { ok: false, code: "niveau_different", niveauFixe: fixe };
  return { ok: true, fixer: null };
}
