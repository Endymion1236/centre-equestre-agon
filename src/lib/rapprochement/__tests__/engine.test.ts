import { describe, it, expect } from "vitest";
import { runMatching, createMatchContext, getPrevPeriod, makeInWindow, findSubsetSum, encToDetail } from "../engine";
import type { BankLine, Encaissement, Remise } from "../types";

const sec = (date: string, h: number = 12) =>
  Math.floor(new Date(`${date}T${String(h).padStart(2, "0")}:00:00`).getTime() / 1000);

describe("engine.runMatching", () => {
  it("applique les matchers dans l'ordre — CB online a priorité sur CB terminal pour un label ambigu", () => {
    // Label "CAWL REMISE CB" déclenche à la fois cb-online (CAWL) ET cb-terminal (REMISE/CB).
    // Si l'ordre est respecté, cb-online (premier dans matchers[]) gagne.
    // 1 enc cb_online de 100€ matchable par cb-online sous-bloc a (montant exact).
    // 1 enc cb_terminal de 100€ matchable par cb-terminal sous-bloc b (jour exact).
    const eOnline: Encaissement = {
      id: "online", mode: "cb_online", montant: 100,
      date: { seconds: sec("2026-05-15") },
      familyName: "Dupont",
    };
    // Pour que cb-online sous-bloc a (match exact) gagne, l'enc doit juste matcher par montant.
    // Sous-bloc a ne check pas la date, juste le montant.
    const eTerminal: Encaissement = {
      id: "terminal", mode: "cb_terminal", montant: 100,
      date: { seconds: sec("2026-05-14") }, // J-1 dans la fenêtre [-1, +5]
      familyName: "Martin",
    };
    const ctx = createMatchContext({
      encs: [eOnline, eTerminal], remises: [], remisesSepa: [], payments: [],
      period: "2026-05",
    });
    const lines: BankLine[] = [{
      date: "15/05/2026", label: "CAWL REMISE CB", // ambigu
      amount: 100, matched: false, matchType: "", matchDetail: "",
    }];
    const { lines: result } = runMatching(lines, ctx);
    expect(result[0].matched).toBe(true);
    expect(result[0].matchType).toBe("CB en ligne"); // cb-online a gagné
    expect(result[0].matchDetail).toContain("Dupont"); // famille du eOnline
    expect(ctx.usedEncIds.has("online")).toBe(true);
    expect(ctx.usedEncIds.has("terminal")).toBe(false); // cb-terminal n'a pas été appelé après cb-online success
  });

  it("laisse non-matché si aucun matcher ne matche", () => {
    const ctx = createMatchContext({
      encs: [], remises: [], remisesSepa: [], payments: [],
      period: "2026-05",
    });
    const lines: BankLine[] = [{
      date: "15/05/2026", label: "INCONNU XYZ",
      amount: 999, matched: false, matchType: "", matchDetail: "",
    }];
    const { lines: result } = runMatching(lines, ctx);
    expect(result[0].matched).toBe(false);
    expect(result[0].matchType).toBe("");
  });

  it("marque indirectement une remise consommée quand tous ses encs le sont (post-loop)", () => {
    // 2 encs especes le 15/05 (50€ chacun, total 100). Une remise (id r1) groupe ces 2 encs.
    // Bank line "VERSEMENT ESPECES" 100€ → match jour exact (sous-bloc b especes), consomme e1 + e2.
    // Le post-loop doit alors marquer r1 comme consommée même si especes n'a pas matché par bordereau.
    const e1: Encaissement = { id: "e1", mode: "especes", montant: 50, date: { seconds: sec("2026-05-15", 10) } };
    const e2: Encaissement = { id: "e2", mode: "especes", montant: 50, date: { seconds: sec("2026-05-15", 14) } };
    const r1: Remise = {
      id: "r1", total: 200, // total différent → bordereau direct ne matche pas
      paymentMode: "especes", encaissementIds: ["e1", "e2"],
      date: { seconds: sec("2026-05-14") },
    };
    const ctx = createMatchContext({
      encs: [e1, e2], remises: [r1], remisesSepa: [], payments: [],
      period: "2026-05",
    });
    const lines: BankLine[] = [{
      date: "15/05/2026", label: "VERSEMENT ESPECES",
      amount: 100, matched: false, matchType: "", matchDetail: "",
    }];
    const { lines: result } = runMatching(lines, ctx);
    expect(result[0].matched).toBe(true);
    expect(ctx.usedEncIds.has("e1")).toBe(true);
    expect(ctx.usedEncIds.has("e2")).toBe(true);
    expect(ctx.usedRemiseIds.has("r1")).toBe(true); // marquée indirectement
  });

  it("createMatchContext retourne un MatchContext avec des Sets vides", () => {
    const ctx = createMatchContext({
      encs: [], remises: [], remisesSepa: [], payments: [],
      period: "2026-05",
    });
    expect(ctx.usedEncIds.size).toBe(0);
    expect(ctx.usedRemiseIds.size).toBe(0);
    expect(ctx.usedRemiseSepaIds.size).toBe(0);
    expect(ctx.usedPaymentIds.size).toBe(0);
    expect(ctx.period).toBe("2026-05");
  });
});

describe("engine helpers", () => {
  it("getPrevPeriod gère le year-wrap janvier → décembre année précédente", () => {
    expect(getPrevPeriod("2026-01")).toBe("2025-12");
    expect(getPrevPeriod("2026-05")).toBe("2026-04");
    expect(getPrevPeriod("2026-12")).toBe("2026-11");
  });

  it("makeInWindow accepte une bankDate null (fenêtre ouverte)", () => {
    const enc: Encaissement = { id: "e1", mode: "cheque", montant: 100, date: { seconds: sec("2026-05-15") } };
    const inWin = makeInWindow(null);
    expect(inWin(enc)).toBe(true);
  });

  it("makeInWindow respecte la limite ±N jours", () => {
    const enc: Encaissement = { id: "e1", mode: "cheque", montant: 100, date: { seconds: sec("2026-05-15") } };
    const inWin3 = makeInWindow(new Date("2026-05-18"), 3); // 3 jours OK
    expect(inWin3(enc)).toBe(true);
    const inWin1 = makeInWindow(new Date("2026-05-18"), 1); // 1 jour KO
    expect(inWin1(enc)).toBe(false);
  });

  it("findSubsetSum trouve un sous-ensemble = target", () => {
    const encs: Encaissement[] = [
      { id: "e1", mode: "cheque", montant: 30, date: null },
      { id: "e2", mode: "cheque", montant: 50, date: null },
      { id: "e3", mode: "cheque", montant: 70, date: null },
    ];
    const subset = findSubsetSum(encs, 8000); // 80€ = 30+50
    expect(subset).not.toBeNull();
    expect(subset!.length).toBe(2);
    expect(subset!.reduce((s, e) => s + (e.montant || 0), 0)).toBe(80);
  });

  it("findSubsetSum retourne null si pas de sous-ensemble", () => {
    const encs: Encaissement[] = [
      { id: "e1", mode: "cheque", montant: 30, date: null },
      { id: "e2", mode: "cheque", montant: 50, date: null },
    ];
    expect(findSubsetSum(encs, 9999)).toBeNull(); // 99.99€ impossible
  });

  it("encToDetail formate un Encaissement", () => {
    const enc: Encaissement = {
      id: "e1", mode: "cheque", montant: 100,
      date: { seconds: sec("2026-05-15") },
      familyName: "Dupont", activityTitle: "Carte 10h",
    };
    const detail = encToDetail(enc);
    expect(detail.familyName).toBe("Dupont");
    expect(detail.montant).toBe(100);
    expect(detail.activityTitle).toBe("Carte 10h");
    expect(detail.mode).toBe("cheque");
    // date format DD/MM/YYYY (toLocaleDateString fr-FR)
    expect(detail.date).toMatch(/15\/05\/2026/);
  });
});
