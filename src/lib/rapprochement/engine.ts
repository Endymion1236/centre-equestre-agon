import type {
  BankLine, MatchContext, Encaissement, EncDetail, Remise, RemiseSepa, Payment,
} from "./types";
import { matchCbOnline } from "./matchers/cb-online";
import { matchCbTerminal } from "./matchers/cb-terminal";
import { matchVirement } from "./matchers/virement";
import { matchCheque } from "./matchers/cheque";
import { matchEspeces } from "./matchers/especes";
import { matchMontantExact } from "./matchers/montant-exact";

/**
 * Parse une date bancaire (formats : DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY).
 * Extrait depuis page.tsx (originel lignes 772-787).
 */
export const parseBankDate = (s: string): Date | null => {
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

/** Convertit un encaissement en EncDetail pour affichage UI. Extrait depuis page.tsx:790-796. */
export const encToDetail = (e: Encaissement): EncDetail => ({
  familyName: e.familyName || "",
  montant: e.montant || 0,
  date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
  activityTitle: e.activityTitle || "",
  mode: e.modeLabel || e.mode || "",
});

/**
 * Cherche un sous-ensemble de `encs` dont la somme (en centimes) = targetCents (±2c).
 * Programmation dynamique. Limite : 25 encs max, 100k DP entries. Extrait depuis page.tsx:740-769.
 *
 * Note : signature retypée Encaissement[] (vs any[] dans page.tsx) — comportement strictement identique
 * car la fonction n'utilise que `e.montant`.
 */
export const findSubsetSum = (encs: Encaissement[], targetCents: number): Encaissement[] | null => {
  if (encs.length === 0 || encs.length > 25) return null;
  const centsValues = encs.map(e => Math.round((e.montant || 0) * 100));
  const totalCents = centsValues.reduce((s, c) => s + c, 0);
  if (targetCents > totalCents + 2) return null;
  if (targetCents <= 0) return null;
  if (Math.abs(totalCents - targetCents) <= 2) return [...encs];

  let dp = new Map<number, number[]>();
  dp.set(0, []);
  for (let i = 0; i < centsValues.length; i++) {
    const current = centsValues[i];
    const nextDp = new Map(dp);
    for (const [sum, indices] of dp.entries()) {
      const newSum = sum + current;
      if (newSum > targetCents + 2) continue;
      if (!nextDp.has(newSum)) {
        const newIndices = [...indices, i];
        nextDp.set(newSum, newIndices);
        if (Math.abs(newSum - targetCents) <= 2) {
          return newIndices.map(idx => encs[idx]);
        }
      }
    }
    dp = nextDp;
    if (dp.size > 100000) return null;
  }
  return null;
};

/**
 * Calcule la période précédente (gère le year-wrap janvier → décembre année précédente).
 * Ex: "2026-01" → "2025-12". "2026-05" → "2026-04".
 */
export const getPrevPeriod = (period: string): string => {
  const [y, m] = period.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
};

/**
 * Construit la fenêtre temporelle ±N jours autour de bankDate.
 * Si bankDate est null, la fenêtre est "ouverte" (renvoie true pour toute enc avec date).
 * NB: la fenêtre est *symétrique* (±). Pour des fenêtres asymétriques (ex: J-1 à J+5),
 * les matchers font le check inline (cf. cb-terminal et cheque).
 */
export const makeInWindow = (bankDate: Date | null, days = 3) => {
  return (enc: Encaissement): boolean => {
    if (!bankDate) return true;
    const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
    if (!d) return false;
    const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= days;
  };
};

/**
 * Filtre les encaissements de la période courante (ou étendue avec mois précédent),
 * non encore consommés selon ctx.usedEncIds.
 */
export const getPeriodEncs = (ctx: MatchContext, opts: { extended?: boolean } = {}): Encaissement[] => {
  const prevPeriod = opts.extended ? getPrevPeriod(ctx.period) : null;
  return ctx.encs.filter(e => {
    if (ctx.usedEncIds.has(e.id)) return false;
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) return false;
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return pm === ctx.period || (prevPeriod !== null && pm === prevPeriod);
  });
};

/** Crée un MatchContext frais à partir des données chargées de Firestore. */
export function createMatchContext(args: {
  encs: Encaissement[];
  remises: Remise[];
  remisesSepa: RemiseSepa[];
  payments: Payment[];
  period: string;
}): MatchContext {
  return {
    ...args,
    usedEncIds: new Set<string>(),
    usedRemiseIds: new Set<string>(),
    usedRemiseSepaIds: new Set<string>(),
    usedPaymentIds: new Set<string>(),
  };
}

/**
 * Orchestrateur : applique les 6 matchers dans l'ordre sur chaque BankLine.
 * Le premier matcher non-null gagne. Mute `ctx` (Sets used*Ids) au fil de l'itération.
 *
 * Returns : { lines } — tableau enrichi (matched=true, matchType, matchDetail, matchedEncs).
 *
 * NB : ne fait PAS la fusion avec matchs manuels (Bug #2), ni les écritures Firestore.
 * Ces étapes restent dans handleCSVImport côté page.tsx.
 *
 * Inclut le bloc "détection indirecte des remises consommées" (originel page.tsx:1554-1564) :
 * après la map, parcourt ctx.remises et marque dans usedRemiseIds celles dont tous
 * les encaissements sont déjà dans usedEncIds.
 */
export function runMatching(
  lines: BankLine[],
  ctx: MatchContext
): { lines: BankLine[] } {
  const matchers = [
    matchCbOnline,
    matchCbTerminal,
    matchVirement,
    matchCheque,
    matchEspeces,
    matchMontantExact,
  ];

  const matched = lines.map((bl) => {
    for (const matcher of matchers) {
      const result = matcher(bl, ctx);
      if (result) {
        return { ...bl, matched: true, ...result };
      }
    }
    return bl; // non-matché
  });

  // Détection indirecte des remises consommées (cf. page.tsx 1554-1564 originel)
  for (const r of ctx.remises) {
    if (ctx.usedRemiseIds.has(r.id)) continue;
    const encIds = r.encaissementIds || [];
    if (encIds.length === 0) continue;
    if (encIds.every((id) => ctx.usedEncIds.has(id))) {
      ctx.usedRemiseIds.add(r.id);
    }
  }

  return { lines: matched };
}
