import type { BankLine, MatchContext, MatchResult, Encaissement, EncDetail } from "../types";

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
 *
 * NB : `parseBankDate` et `encToDetail` sont dupliqués localement depuis
 * page.tsx:766-790. Ils seront centralisés dans `engine.ts` lors de la Task 9.
 * Duplication intentionnelle pour rendre les matchers indépendamment testables.
 */

const parseBankDate = (s: string): Date | null => {
  if (!s) return null;
  const p1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (p1) {
    const dd = p1[1].padStart(2, "0"), mm = p1[2].padStart(2, "0");
    return new Date(`${p1[3]}-${mm}-${dd}`);
  }
  const p2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (p2) return new Date(s);
  const p3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (p3) {
    const dd = p3[1].padStart(2, "0"), mm = p3[2].padStart(2, "0");
    return new Date(`${p3[3]}-${mm}-${dd}`);
  }
  return null;
};

const encToDetail = (e: Encaissement): EncDetail => ({
  familyName: e.familyName || "",
  montant: e.montant || 0,
  date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
  activityTitle: e.activityTitle || "",
  mode: e.modeLabel || e.mode || "",
});

export function matchMontantExact(line: BankLine, ctx: MatchContext): MatchResult {
  const label = line.label.toUpperCase();
  const isVirementLabel = label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV");
  if (isVirementLabel) return null;

  const bankDate = parseBankDate(line.date);

  const inWindow = (enc: Encaissement) => {
    if (!bankDate) return true;
    const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
    if (!d) return false;
    const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 3;
  };

  const periodEnc = ctx.encs.filter(e => {
    if (ctx.usedEncIds.has(e.id)) return false;
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) return false;
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return pm === ctx.period;
  });

  const exactMatch = periodEnc.filter(inWindow).find(e =>
    Math.abs((e.montant || 0) - line.amount) < 0.02
  );

  if (!exactMatch) return null;

  ctx.usedEncIds.add(exactMatch.id);
  return {
    matchType: "Montant exact",
    matchDetail: `${exactMatch.familyName || ""} — ${exactMatch.activityTitle || ""}`,
    matchedEncs: [encToDetail(exactMatch)],
    uncertain: true,
  };
}
