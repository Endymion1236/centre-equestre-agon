import type { BankLine, MatchContext, MatchResult } from "../types";
import { parseBankDate, encToDetail, makeInWindow, getPeriodEncs } from "../engine";

/**
 * Règle 6 — Montant exact (extrait depuis page.tsx:1278-1301).
 * Dernier recours : si rien d'autre n'a matché, on cherche un encaissement
 * de même montant (±0.02€) dans la fenêtre ±3 jours autour de la date bancaire.
 *
 * Comportement (figé par les tests, ne PAS modifier dans ce refactor) :
 * 1. Guard "Virement label" : si le libellé contient `VIR`, `SEPA` ou `PRLV`,
 *    la règle ne s'applique pas (return null). Évite les faux positifs sur
 *    les virements (cf. commentaire d'origine page.tsx:1280-1284).
 * 2. Filtre `periodEnc` : encs du mois courant (`ctx.period`) non encore
 *    consommés (hors `usedEncIds`).
 * 3. Filtre `inWindow` : ±3 jours autour de `bankDate` (parseBankDate(line.date)).
 *    Si `bankDate` est null (date illisible), la fenêtre est ouverte.
 * 4. Trouve le premier enc avec `Math.abs(montant - line.amount) < 0.02`.
 * 5. Si match : mute `ctx.usedEncIds` (add(exactMatch.id)) et retourne le
 *    MatchResult avec `matchType: "Montant exact"`, `uncertain: true`.
 * 6. Sinon : return null.
 *
 * IMPORTANT : désactivé pour les virements (label VIR/SEPA/PRLV) car risque
 * élevé de faux positif. Quand activé, marque le résultat `uncertain: true`.
 */

export function matchMontantExact(line: BankLine, ctx: MatchContext): MatchResult {
  const label = line.label.toUpperCase();
  const isVirementLabel = label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV");
  if (isVirementLabel) return null;

  const bankDate = parseBankDate(line.date);
  const inWindow = makeInWindow(bankDate);
  const periodEnc = getPeriodEncs(ctx);

  const exactMatch = periodEnc.filter(inWindow).find(e =>
    Math.abs((e.montant || 0) - line.amount) < 0.02
  );

  if (!exactMatch) return null;

  ctx.usedEncIds.add(exactMatch.id);
  return {
    matchType: "Montant exact",
    matchDetail: `${exactMatch.familyName} — ${exactMatch.activityTitle || ""}`,
    matchedEncs: [encToDetail(exactMatch)],
    uncertain: true, // match fragile : à vérifier
  };
}
