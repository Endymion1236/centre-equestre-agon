import type { BankLine, MatchContext, Encaissement } from "../types";

/**
 * Test factories for the rapprochement matcher unit tests.
 *
 * Used across:
 * - parser-ca.test.ts (none yet — but the pattern is here for symmetry)
 * - montant-exact.test.ts
 * - cb-online.test.ts (Task 4)
 * - especes.test.ts (Task 5)
 * - cb-terminal.test.ts (Task 6)
 * - virement.test.ts (Task 7)
 * - cheque.test.ts (Task 8)
 * - engine.test.ts (Task 9)
 *
 * Keep these factories in sync with `types.ts`. When a matcher needs an
 * additional optional field on Encaissement / Remise / etc., extend the
 * type AND the factory together.
 */

export function mkCtx(encs: Encaissement[], period = "2026-05"): MatchContext {
  return {
    encs,
    remises: [],
    remisesSepa: [],
    payments: [],
    period,
    usedEncIds: new Set<string>(),
    usedRemiseIds: new Set<string>(),
    usedRemiseSepaIds: new Set<string>(),
    usedPaymentIds: new Set<string>(),
  };
}

export function mkLine(overrides: Partial<BankLine> = {}): BankLine {
  return {
    date: "15/05/2026",
    label: "PAIEMENT INCONNU",
    amount: 100,
    matched: false,
    matchType: "",
    matchDetail: "",
    ...overrides,
  };
}

export function mkEnc(overrides: Partial<Encaissement>): Encaissement {
  const date = new Date("2026-05-15T12:00:00");
  return {
    id: "e1",
    mode: "cb_terminal",
    montant: 100,
    date: { seconds: Math.floor(date.getTime() / 1000) },
    familyName: "Dupont",
    activityTitle: "Carte 10h",
    ...overrides,
  };
}
