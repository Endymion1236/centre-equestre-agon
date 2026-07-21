// ═══════════════════════════════════════════════════════════════════
// SÉCURITÉ DES PROMENADES — règles de niveau, âge et poids.
//
// Ces règles existent parce qu'un accident réel s'est produit : une
// cavalière inscrite sans le niveau requis est tombée et s'est blessée.
// L'objectif n'est PAS de vendre plus, c'est d'empêcher une inscription
// dangereuse. En cas de doute, on refuse et on oriente vers l'évaluation.
//
// IMPORTANT : ces règles ne valent que si les données sont RÉELLEMENT
// collectées au moment de la réservation (poids, maîtrise des allures,
// niveau déclaré). Une règle ne bloque rien sur une donnée absente.
// ═══════════════════════════════════════════════════════════════════

import { ageFromBirth, galopToNumber } from "./eligibilite";

/** Poids maximum commun à TOUTES les promenades (kg). */
export const POIDS_MAX_PROMENADE = 85;

/** Tarif de l'évaluation préalable proposée en cas de doute sur le niveau (€). */
export const TARIF_EVALUATION = 10;

export type NiveauPromenade = "debutant" | "debrouille" | "confirme";

/** Ce que le cavalier déclare au moment de réserver. */
export type DeclarationCavalier = {
  /** Âge révolu, ou date de naissance (l'un des deux suffit). */
  age?: number | null;
  birthDate?: any;
  /** Poids déclaré en kg. */
  poidsKg?: number | null;
  /** Niveau de galop déclaré (texte ou nombre). */
  galop?: any;
  /** Le cavalier déclare-t-il maîtriser le trot enlevé ? */
  maitriseTrotEnleve?: boolean | null;
  /** Le cavalier déclare-t-il maîtriser les 3 allures (pas, trot, galop) ? */
  maitrise3Allures?: boolean | null;
};

/** Critères requis par niveau de promenade. */
type Regle = {
  label: string;
  ageMin: number;
  galopMin: number | null;
  /** Conditions non chiffrables à déclarer explicitement. */
  exigences: {
    trotEnleve?: boolean;
    troisAllures?: boolean;
  };
  resume: string;
};

export const REGLES_PROMENADE: Record<NiveauPromenade, Regle> = {
  confirme: {
    label: "Promenade confirmés",
    ageMin: 13,
    galopMin: 3, // "bon galop 3"
    exigences: { troisAllures: true },
    resume:
      "13 ans minimum, bon Galop 3, maîtrise des 3 allures, 85 kg maximum.",
  },
  debrouille: {
    label: "Promenade débrouillés",
    ageMin: 12,
    galopMin: 2, // bonne maîtrise du trot enlevé OU galop 2
    exigences: { trotEnleve: true },
    resume:
      "12 ans minimum, bonne maîtrise du trot enlevé ou Galop 2, 85 kg maximum.",
  },
  debutant: {
    label: "Promenade débutants",
    ageMin: 12,
    galopMin: null,
    exigences: {},
    resume: "12 ans minimum, 85 kg maximum.",
  },
};

export type ResultatVerif = {
  /** true = le cavalier peut réserver directement. */
  autorise: boolean;
  /**
   * true = ni autorisé ni interdit avec certitude (donnée manquante ou
   * condition non chiffrable). On propose alors l'évaluation à 10 €.
   */
  evaluationRecommandee: boolean;
  /** Raisons lisibles (à afficher au cavalier et à journaliser). */
  raisons: string[];
  /** Le rappel de la clause de non-remboursement, à afficher toujours. */
  clause: string;
};

const CLAUSE_NON_REMBOURSEMENT =
  "En cas de doute sur le niveau, une évaluation la veille est proposée à " +
  `${TARIF_EVALUATION} € ; sans évaluation validée, la promenade n'est pas remboursée ` +
  "si le niveau se révèle insuffisant sur place.";

/**
 * Vérifie l'éligibilité d'un cavalier à une promenade.
 *
 * Principe de prudence, calqué sur le ciblage d'offres mais avec l'enjeu
 * inverse : ici une erreur peut blesser quelqu'un. Donc :
 *  - un critère chiffrable NON satisfait (âge, poids, galop) => REFUS net ;
 *  - un critère chiffrable INCONNU (donnée non collectée) => évaluation ;
 *  - une exigence non chiffrable non déclarée (allures, trot) => évaluation.
 * On n'autorise en direct QUE si tout ce qui est requis est connu ET conforme.
 */
export function verifierPromenade(
  niveau: NiveauPromenade,
  d: DeclarationCavalier
): ResultatVerif {
  const regle = REGLES_PROMENADE[niveau];
  const raisons: string[] = [];
  let refus = false;
  let doute = false;

  // ── Âge ────────────────────────────────────────────────────────────
  const age = typeof d.age === "number" ? d.age : ageFromBirth(d.birthDate);
  if (age === null) {
    doute = true;
    raisons.push("Âge non renseigné.");
  } else if (age < regle.ageMin) {
    refus = true;
    raisons.push(`Âge minimum ${regle.ageMin} ans (déclaré : ${age} ans).`);
  }

  // ── Poids (commun à toutes les promenades) ─────────────────────────
  if (d.poidsKg === null || d.poidsKg === undefined) {
    doute = true;
    raisons.push("Poids non renseigné.");
  } else if (d.poidsKg > POIDS_MAX_PROMENADE) {
    refus = true;
    raisons.push(`Poids maximum ${POIDS_MAX_PROMENADE} kg (déclaré : ${d.poidsKg} kg).`);
  }

  // ── Galop ──────────────────────────────────────────────────────────
  if (regle.galopMin !== null) {
    const g = galopToNumber(d.galop);
    if (g === null) {
      doute = true;
      raisons.push("Niveau de galop non renseigné.");
    } else if (g < regle.galopMin) {
      // Débrouillé : Galop 2 OU trot enlevé maîtrisé — le galop insuffisant
      // n'est pas rédhibitoire si le trot enlevé est explicitement déclaré.
      const rattrapageTrot =
        niveau === "debrouille" && d.maitriseTrotEnleve === true;
      if (!rattrapageTrot) {
        refus = true;
        raisons.push(`Galop ${regle.galopMin} minimum (déclaré : Galop ${g}).`);
      }
    }
  }

  // ── Exigences non chiffrables : déclarées ? ────────────────────────
  if (regle.exigences.troisAllures) {
    if (d.maitrise3Allures !== true) {
      doute = true;
      raisons.push("Maîtrise des 3 allures à confirmer.");
    }
  }
  if (regle.exigences.trotEnleve) {
    // Déjà couvert si galop >= min ; sinon le trot enlevé devient obligatoire.
    const g = galopToNumber(d.galop);
    const galopSuffit = g !== null && regle.galopMin !== null && g >= regle.galopMin;
    if (!galopSuffit && d.maitriseTrotEnleve !== true) {
      doute = true;
      raisons.push("Maîtrise du trot enlevé à confirmer.");
    }
  }

  // Un refus chiffré prime sur tout : on ne propose PAS l'évaluation pour
  // contourner un critère objectif (âge, poids). L'évaluation ne lève qu'un
  // doute, jamais une inaptitude avérée.
  if (refus) {
    return {
      autorise: false,
      evaluationRecommandee: false,
      raisons,
      clause: CLAUSE_NON_REMBOURSEMENT,
    };
  }
  if (doute) {
    return {
      autorise: false,
      evaluationRecommandee: true,
      raisons,
      clause: CLAUSE_NON_REMBOURSEMENT,
    };
  }
  return {
    autorise: true,
    evaluationRecommandee: false,
    raisons: [],
    clause: CLAUSE_NON_REMBOURSEMENT,
  };
}

/** Détermine le niveau d'une promenade depuis le titre de l'activité. */
export function niveauDepuisTitre(titre: string): NiveauPromenade | null {
  const t = (titre || "").toLowerCase();
  if (!t.includes("promenade") && !t.includes("balade")) return null;
  if (t.includes("confirm")) return "confirme";
  if (t.includes("débrouill") || t.includes("debrouill")) return "debrouille";
  if (t.includes("débutant") || t.includes("debutant")) return "debutant";
  return null;
}
