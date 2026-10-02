/**
 * src/lib/lecture-piece.ts — lire la réponse de l'analyse d'un justificatif,
 * et dire en clair pourquoi elle a échoué.
 *
 * Octobre 2026 : une pièce scannée ou venue du Drive se déposait bien, mais
 * sa lecture échouait (422 puis 500) avec « Le service n'a pas pu terminer
 * l'opération », sans rien noter de la cause. Ici : une réponse entourée de
 * texte reste lisible, et chaque échec a son message (scan trop long à lire,
 * réponse coupée, fichier refusé par l'analyse, document jugé illisible).
 * Module pur.
 */

/** Le premier objet JSON d'une réponse, même entouré de ```json … ``` ou d'une phrase. */
export function jsonDepuisReponse(texte: string): unknown {
  const t = String(texte || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch { /* on cherche l'objet dans le texte */ }
  const debut = t.indexOf("{"), fin = t.lastIndexOf("}");
  if (debut < 0 || fin <= debut) throw new ErreurLecturePiece("Lecture impossible : l'analyse n'a pas rendu de résultat exploitable. Relancez la lecture ou saisissez les montants à la main.", 422);
  try { return JSON.parse(t.slice(debut, fin + 1)); }
  catch { throw new ErreurLecturePiece("Lecture impossible : l'analyse n'a pas rendu de résultat exploitable. Relancez la lecture ou saisissez les montants à la main.", 422); }
}

export class ErreurLecturePiece extends Error {
  constructor(message: string, public statut: number) { super(message); }
}

/** Message et code HTTP pour un échec de l'analyse ; la pièce, elle, reste déposée. */
export function erreurLecturePiece(e: unknown): { message: string; statut: number } {
  if (e instanceof ErreurLecturePiece) return { message: e.message, statut: e.statut };
  const err = e as { name?: string; status?: number; message?: string };
  const msg = String(err?.message || "");
  if (err?.name === "APIConnectionTimeoutError" || /timed? ?out|timeout/i.test(msg)) {
    return { message: "La lecture a pris trop de temps (scan lourd ou à plusieurs pages). La pièce est bien déposée : relancez la lecture, ou scannez en noir et blanc / une page à la fois.", statut: 504 };
  }
  if (err?.status === 400 || err?.status === 413) {
    return { message: "L'analyse refuse ce fichier (trop lourd, trop grand ou protégé). La pièce est bien déposée : réduisez la résolution du scan (150-200 ppp) ou exportez-la en PDF, puis redéposez-la.", statut: 422 };
  }
  if (err?.status === 429 || err?.status === 529 || (err?.status ?? 0) >= 500) {
    return { message: "Le service de lecture est momentanément saturé. La pièce est bien déposée : relancez la lecture dans une minute.", statut: 503 };
  }
  return { message: "La lecture a échoué. La pièce est bien déposée : relancez la lecture ou saisissez les montants à la main.", statut: 500 };
}

/** Raison donnée par l'analyse quand elle refuse un document. */
export function motifRefusLecture(valeur: unknown): string {
  const brut = valeur && typeof valeur === "object" ? String((valeur as { erreur?: unknown }).erreur || "") : "";
  if (/plusieurs|une seule/i.test(brut)) return "L'analyse voit plusieurs pièces dans ce fichier : déposez une facture par fichier (ou excluez les pages en trop).";
  if (brut) return `L'analyse n'a pas pu lire ce document (« ${brut.slice(0, 120)} »). Vérifiez que le scan est net et droit, ou saisissez les montants à la main.`;
  return "Lecture impossible : vérifiez que le scan est net et droit, ou saisissez les montants à la main.";
}
