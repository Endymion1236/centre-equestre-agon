import { describe, it, expect } from "vitest";
import { matchMontantExact } from "../matchers/montant-exact";
import type { BankLine, MatchContext, Encaissement } from "../types";

function mkCtx(encs: Encaissement[], period = "2026-05"): MatchContext {
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

function mkLine(overrides: Partial<BankLine> = {}): BankLine {
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

function mkEnc(overrides: Partial<Encaissement>): Encaissement {
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

describe("matchMontantExact", () => {
  it("matche un encaissement de même montant dans la fenêtre ±3 jours", () => {
    const enc = mkEnc({ id: "e1", montant: 100 });
    const ctx = mkCtx([enc]);
    const result = matchMontantExact(mkLine({ amount: 100 }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Montant exact");
    expect(result!.uncertain).toBe(true);
    expect(result!.matchedEncs[0].familyName).toBe("Dupont");
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("ne matche pas si l'écart de montant > 0.02€", () => {
    const enc = mkEnc({ id: "e1", montant: 100.05 });
    const ctx = mkCtx([enc]);
    expect(matchMontantExact(mkLine({ amount: 100 }), ctx)).toBeNull();
    expect(ctx.usedEncIds.size).toBe(0);
  });

  it("ne matche pas hors fenêtre ±3 jours", () => {
    const enc = mkEnc({
      id: "e1",
      montant: 100,
      date: { seconds: Math.floor(new Date("2026-05-01T12:00:00").getTime() / 1000) },
    });
    const ctx = mkCtx([enc]);
    expect(matchMontantExact(mkLine({ date: "15/05/2026", amount: 100 }), ctx)).toBeNull();
  });

  it("est désactivé pour les libellés VIR / SEPA / PRLV (faux positifs)", () => {
    const enc = mkEnc({ id: "e1", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchMontantExact(mkLine({ label: "VIR DE MME DUPONT", amount: 100 }), ctx)).toBeNull();
    expect(matchMontantExact(mkLine({ label: "SEPA DUPONT", amount: 100 }), ctx)).toBeNull();
    expect(matchMontantExact(mkLine({ label: "PRLV CONSO", amount: 100 }), ctx)).toBeNull();
  });

  it("ne matche pas un encaissement déjà consommé", () => {
    const enc = mkEnc({ id: "e1", montant: 100 });
    const ctx = mkCtx([enc]);
    ctx.usedEncIds.add("e1");
    expect(matchMontantExact(mkLine({ amount: 100 }), ctx)).toBeNull();
  });

  it("ne matche pas un encaissement hors période", () => {
    const enc = mkEnc({
      id: "e1",
      montant: 100,
      date: { seconds: Math.floor(new Date("2026-04-15T12:00:00").getTime() / 1000) },
    });
    const ctx = mkCtx([enc], "2026-05");
    expect(matchMontantExact(mkLine({ date: "15/05/2026", amount: 100 }), ctx)).toBeNull();
  });
});
