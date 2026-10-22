/**
 * src/lib/evaluation-suite.ts — évaluer toute une reprise d'affilée.
 *
 * Octobre 2026, demande de Nicolas : en fin de semaine, chaque évaluation
 * enregistrée renvoyait au planning, où il fallait recliquer sur le 📊 du
 * cavalier suivant. Le 📊 du planning transmet désormais la liste des
 * inscrits de la séance (paramètre `suite`) ; la page d'évaluation passe au
 * suivant après l'enregistrement, et revient au planning après le dernier.
 *
 * Module pur, testé seul (tests/unit/evaluation-suite.test.ts).
 */

export interface CavalierSuite { childId: string; familyId: string; prenom: string }

/** Liste → paramètre d'URL (les identifiants Firestore n'ont ni « , » ni « : »). */
export function encoderSuite(liste: CavalierSuite[]): string {
  return liste
    .filter((c) => c.childId)
    .map((c) => [c.childId, c.familyId || "", c.prenom || ""].map(encodeURIComponent).join(":"))
    .join(",");
}

export function decoderSuite(param: string | null | undefined): CavalierSuite[] {
  if (!param) return [];
  return param.split(",").map((morceau) => {
    const [childId = "", familyId = "", prenom = ""] = morceau.split(":").map((x) => {
      try { return decodeURIComponent(x); } catch { return x; }
    });
    return { childId, familyId, prenom };
  }).filter((c) => c.childId);
}

/** Place du cavalier dans la suite (1 = premier), et celui qui vient après. */
export function positionDans(suite: CavalierSuite[], childId: string): { rang: number; total: number; suivant: CavalierSuite | null } {
  const i = suite.findIndex((c) => c.childId === childId);
  return { rang: i + 1, total: suite.length, suivant: i >= 0 && i + 1 < suite.length ? suite[i + 1] : null };
}

/** Adresse de la page d'évaluation d'un cavalier, la suite conservée. */
export function urlEvaluation(c: CavalierSuite, suiteParam: string): string {
  return `/admin/progression/${encodeURIComponent(c.childId)}?familyId=${encodeURIComponent(c.familyId || "")}${suiteParam ? `&suite=${encodeURIComponent(suiteParam)}` : ""}`;
}
