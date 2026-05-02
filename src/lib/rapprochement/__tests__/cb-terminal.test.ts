import { describe, it, expect } from "vitest";
import { matchCbTerminal } from "../matchers/cb-terminal";
import { mkCtx, mkLine, mkEnc } from "./factories";

describe("matchCbTerminal", () => {
  const sameDayAt = (date: string, h: number = 12) =>
    Math.floor(new Date(`${date}T${String(h).padStart(2, "0")}:00:00`).getTime() / 1000);

  it("ne s'applique pas si le label ne contient pas REMISE/CB/TPE/CARTE", () => {
    const enc = mkEnc({ id: "e1", mode: "cb_terminal", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchCbTerminal(mkLine({ label: "VIR DUPONT", amount: 100 }), ctx)).toBeNull();
    expect(ctx.usedEncIds.size).toBe(0);
  });

  it("matche par jour exact (sous-bloc b)", () => {
    // 3 CB le même jour 14/05/2026, total 100€. Bank line le 15/05 (J+1).
    const e1 = mkEnc({ id: "e1", mode: "cb_terminal", montant: 30, date: { seconds: sameDayAt("2026-05-14", 10) } });
    const e2 = mkEnc({ id: "e2", mode: "cb_terminal", montant: 50, date: { seconds: sameDayAt("2026-05-14", 14) } });
    const e3 = mkEnc({ id: "e3", mode: "cb_terminal", montant: 20, date: { seconds: sameDayAt("2026-05-14", 18) } });
    const ctx = mkCtx([e1, e2, e3]);
    const result = matchCbTerminal(mkLine({ label: "REMISE CARTES", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("CB Terminal");
    expect(result!.matchDetail).toContain("3 transaction(s) CB du 14/05/2026");
    expect(result!.matchDetail).not.toContain("CB Dupont"); // not sub-bloc d
    expect(result!.matchedEncs).toHaveLength(3);
    expect(ctx.usedEncIds.size).toBe(3);
  });

  it("rejette le match si le jour est trop ancien (> 5 jours avant la bankLine)", () => {
    const e1 = mkEnc({ id: "e1", mode: "cb_terminal", montant: 100, date: { seconds: sameDayAt("2026-05-08", 12) } }); // J-7
    const ctx = mkCtx([e1]);
    const result = matchCbTerminal(mkLine({ label: "REMISE CB", amount: 100, date: "2026-05-15" }), ctx);
    expect(result).toBeNull();
  });

  it("rejette le match si le jour est plus de 1 jour après la bankLine", () => {
    // NB : on utilise 2 encs de montants distincts dont la somme = bank amount,
    // pour cibler exclusivement la branche sous-bloc b. Si on plaçait un seul
    // enc de 100€ dans la fenêtre ±3 jours, le sous-bloc d (match unitaire)
    // l'attraperait quand même via la fenêtre ±3 jours plus large.
    const e1 = mkEnc({ id: "e1", mode: "cb_terminal", montant: 30, date: { seconds: sameDayAt("2026-05-17", 12) } }); // J+2 après bank
    const e2 = mkEnc({ id: "e2", mode: "cb_terminal", montant: 70, date: { seconds: sameDayAt("2026-05-17", 14) } });
    const ctx = mkCtx([e1, e2]);
    const result = matchCbTerminal(mkLine({ label: "REMISE CB", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).toBeNull();
  });

  it("dernier recours : match exact unitaire (sous-bloc d)", () => {
    // 2 encs dans la fenêtre ±3 jours, montants différents et somme journalière ≠ amount.
    // Bank amount = 30. Un enc à 30€, un autre à 70€. Le total du jour = 100 ≠ 30 → b échoue.
    // Sous-bloc d : exactCB = enc 30€ → match.
    const e1 = mkEnc({ id: "e1", mode: "cb_terminal", montant: 30, date: { seconds: sameDayAt("2026-05-14", 10) }, familyName: "Martin", activityTitle: "Carte 5h" });
    const e2 = mkEnc({ id: "e2", mode: "cb_terminal", montant: 70, date: { seconds: sameDayAt("2026-05-14", 14) } });
    const ctx = mkCtx([e1, e2]);
    const result = matchCbTerminal(mkLine({ label: "CB MARTIN", amount: 30, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchDetail).toContain("CB Martin");
    expect(result!.matchDetail).toContain("Carte 5h");
    expect(result!.matchDetail).not.toContain("transaction(s)"); // not sub-bloc b
    expect(result!.matchedEncs).toHaveLength(1);
    expect(ctx.usedEncIds.has("e1")).toBe(true);
    expect(ctx.usedEncIds.has("e2")).toBe(false);
  });

  it("ne matche pas si aucun jour ne totalise et aucun enc unitaire ne match", () => {
    const e1 = mkEnc({ id: "e1", mode: "cb_terminal", montant: 30, date: { seconds: sameDayAt("2026-05-14", 10) } });
    const e2 = mkEnc({ id: "e2", mode: "cb_terminal", montant: 50, date: { seconds: sameDayAt("2026-05-14", 14) } });
    const ctx = mkCtx([e1, e2]);
    expect(matchCbTerminal(mkLine({ label: "REMISE CB", amount: 999, date: "15/05/2026" }), ctx)).toBeNull();
  });

  it("accepte les encs de la période précédente (pool periodEncExtended)", () => {
    // Bank en mai 2026, encs CB du 30 avril (mois précédent). Le pool extended doit inclure avril.
    const eApril = mkEnc({ id: "e1", mode: "cb_terminal", montant: 100, date: { seconds: sameDayAt("2026-04-30", 12) } });
    const ctx = mkCtx([eApril], "2026-05");
    const result = matchCbTerminal(mkLine({ label: "REMISE CB", amount: 100, date: "01/05/2026" }), ctx);
    // Note: si la fenêtre [-1, +5] j est respectée. 30/04 vs 01/05 = diff = 1 jour → OK.
    expect(result).not.toBeNull();
    expect(result!.matchDetail).toContain("30/04/2026");
  });

  it("gère correctement le year-wrap (janvier → décembre de l'année précédente)", () => {
    // Bank line en janvier 2026, encs CB du 30 décembre 2025.
    // periodEncExtended doit inclure prevPeriod = "2025-12" (m === 1 → pm=12, py=y-1).
    const eDec = mkEnc({
      id: "e1", mode: "cb_terminal", montant: 100,
      date: { seconds: sameDayAt("2025-12-30", 12) },
    });
    const ctx = mkCtx([eDec], "2026-01");
    const result = matchCbTerminal(mkLine({ label: "REMISE CB", amount: 100, date: "02/01/2026" }), ctx);
    // diff = (02/01/2026 - 30/12/2025) = 3 jours → fenêtre [-1, +5] OK
    expect(result).not.toBeNull();
    expect(result!.matchDetail).toContain("30/12/2025");
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("exclut les encs déjà consommés", () => {
    const e1 = mkEnc({ id: "e1", mode: "cb_terminal", montant: 100, date: { seconds: sameDayAt("2026-05-14", 12) } });
    const ctx = mkCtx([e1]);
    ctx.usedEncIds.add("e1");
    expect(matchCbTerminal(mkLine({ label: "REMISE CB", amount: 100, date: "15/05/2026" }), ctx)).toBeNull();
  });
});
