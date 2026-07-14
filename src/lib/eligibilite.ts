// ═══════════════════════════════════════════════════════════════════
// Éligibilité âge / galop — logique PARTAGÉE (serveur et client).
// Utilisée par le ciblage des offres last-minute ; la même échelle que
// la table d'équivalence de l'assistant boîte :
//   Galop de Bronze = débutant/initiation = 0
//   Galop d'Argent  = Galop 1
//   Galop d'Or      = Galop 2
//   puis Galop 3, 4, 5, 6, 7 (numérotés)
// ═══════════════════════════════════════════════════════════════════

/** Âge révolu à partir d'une date de naissance (string ISO, Timestamp Firestore ou Date). */
export function ageFromBirth(birth: any): number | null {
  if (!birth) return null;
  let d: Date | null = null;
  if (typeof birth === "string") d = new Date(birth.length <= 10 ? birth + "T12:00:00Z" : birth);
  else if (birth?.toDate) d = birth.toDate();
  else if (birth?.seconds) d = new Date(birth.seconds * 1000);
  else if (birth instanceof Date) d = birth;
  if (!d || isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

/**
 * Normalise un niveau de galop (texte libre ou nombre) vers l'échelle 0-7.
 * null = niveau inconnu (≠ 0 qui veut dire "débutant confirmé").
 */
export function galopToNumber(galop: any): number | null {
  if (galop === null || galop === undefined) return null;
  if (typeof galop === "number") return galop >= 0 && galop <= 7 ? galop : null;
  const s = String(galop).toLowerCase().trim();
  if (!s || s === "—" || s === "-") return null;
  if (s.includes("bronze") || s.includes("débutant") || s.includes("debutant") || s.includes("initiation")) return 0;
  if (s.includes("argent")) return 1;
  if (s.includes("or")) {
    // attention : "or" matche aussi dans d'autres mots — on ne l'accepte
    // que si "or" est un mot isolé ("galop d'or", "or")
    if (/\bor\b/.test(s) || s.includes("d'or") || s.includes("d’or")) return 2;
  }
  const m = s.match(/(\d)/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 0 && n <= 7 ? n : null;
  }
  return null;
}

export type EligCriteria = {
  ageMin?: number | null;
  ageMax?: number | null;
  galopRequired?: any; // texte ou nombre, normalisé ici
};

export type EligChild = {
  birthDate?: any;
  galopLevel?: any;
};

/**
 * Un enfant est-il éligible aux critères d'une activité ?
 * Règle prudente pour le CIBLAGE d'offres : un critère non vérifiable
 * (âge inconnu face à un ageMin/ageMax, galop inconnu face à un galop
 * requis) EXCLUT l'enfant — on ne démarche pas "au cas où".
 */
export function isChildEligible(crit: EligCriteria, child: EligChild): boolean {
  const age = ageFromBirth(child.birthDate);
  if (typeof crit.ageMin === "number" || typeof crit.ageMax === "number") {
    if (age === null) return false;
    if (typeof crit.ageMin === "number" && age < crit.ageMin) return false;
    if (typeof crit.ageMax === "number" && age > crit.ageMax) return false;
  }
  const requis = galopToNumber(crit.galopRequired);
  if (requis !== null && requis > 0) {
    const niveau = galopToNumber(child.galopLevel);
    if (niveau === null || niveau < requis) return false;
  }
  return true;
}
