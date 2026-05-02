import { describe, it, expect } from "vitest";
import { matchEspeces } from "../matchers/especes";
import { mkCtx, mkLine, mkEnc } from "./factories";
import type { Remise } from "../types";

describe("matchEspeces", () => {
  it("ne s'applique pas si le label ne contient pas ESP/VERSEMENT", () => {
    const enc = mkEnc({ id: "e1", mode: "especes", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchEspeces(mkLine({ label: "VIR DUPONT", amount: 100 }), ctx)).toBeNull();
    expect(ctx.usedEncIds.size).toBe(0);
  });

  it("matche un bordereau de remise espèces (sous-bloc a0, priorité)", () => {
    const e1 = mkEnc({ id: "e1", mode: "especes", montant: 30 });
    const e2 = mkEnc({ id: "e2", mode: "especes", montant: 70 });
    const remise: Remise = {
      id: "r1",
      total: 100,
      paymentMode: "especes",
      encaissementIds: ["e1", "e2"],
      nbPaiements: 2,
      date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) },
    };
    const ctx = mkCtx([e1, e2]);
    ctx.remises = [remise];
    const result = matchEspeces(mkLine({ label: "VERSEMENT ESPECES", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Espèces");
    expect(result!.matchDetail).toContain("Bordereau");
    expect(result!.matchDetail).not.toContain("Dépôt"); // verrouille le chemin sous-bloc a0
    expect(ctx.usedRemiseIds.has("r1")).toBe(true);
    expect(ctx.usedEncIds.has("e1")).toBe(true);
    expect(ctx.usedEncIds.has("e2")).toBe(true);
  });

  it("matche un bordereau avec paymentMode=mixte", () => {
    const e1 = mkEnc({ id: "e1", mode: "especes", montant: 50 });
    const remise: Remise = {
      id: "r1", total: 50, paymentMode: "mixte",
      encaissementIds: ["e1"], nbPaiements: 1,
      date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) },
    };
    const ctx = mkCtx([e1]);
    ctx.remises = [remise];
    const result = matchEspeces(mkLine({ label: "ESP REMISE", amount: 50 }), ctx);
    expect(result).not.toBeNull();
    expect(ctx.usedRemiseIds.has("r1")).toBe(true);
  });

  it("ignore un bordereau cheque/CB pour cette règle", () => {
    const e1 = mkEnc({ id: "e1", mode: "especes", montant: 100 });
    const remiseCheque: Remise = {
      id: "r1", total: 100, paymentMode: "cheque",
      encaissementIds: ["e1"],
      date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) },
    };
    const ctx = mkCtx([e1]);
    ctx.remises = [remiseCheque];
    const result = matchEspeces(mkLine({ label: "VERSEMENT ESP", amount: 100 }), ctx);
    // Doit fallback sur sous-bloc b, qui matche e1 (1 enc espèces de 100€ le même jour)
    expect(result).not.toBeNull();
    expect(result!.matchDetail).toContain("Dépôt"); // pas le bordereau (paymentMode=cheque)
    expect(ctx.usedRemiseIds.size).toBe(0);
  });

  it("matche par jour exact (sous-bloc b)", () => {
    const sameDay = (h: number) => Math.floor(new Date(`2026-05-15T${String(h).padStart(2, "0")}:00:00`).getTime() / 1000);
    const e1 = mkEnc({ id: "e1", mode: "especes", montant: 30, date: { seconds: sameDay(10) } });
    const e2 = mkEnc({ id: "e2", mode: "especes", montant: 50, date: { seconds: sameDay(14) } });
    const e3 = mkEnc({ id: "e3", mode: "especes", montant: 20, date: { seconds: sameDay(18) } });
    const ctx = mkCtx([e1, e2, e3]);
    const result = matchEspeces(mkLine({ label: "VERSEMENT ESPECES", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Espèces");
    expect(result!.matchDetail).toContain("Dépôt espèces du 15/05/2026");
    expect(result!.matchDetail).not.toContain("Bordereau"); // verrouille le chemin sous-bloc b
    expect(result!.matchedEncs).toHaveLength(3);
    expect(ctx.usedEncIds.size).toBe(3);
  });

  it("ne matche pas si aucun jour n'a un total exact", () => {
    const sameDay = (d: string) => Math.floor(new Date(`${d}T12:00:00`).getTime() / 1000);
    const e1 = mkEnc({ id: "e1", mode: "especes", montant: 30, date: { seconds: sameDay("2026-05-14") } });
    const e2 = mkEnc({ id: "e2", mode: "especes", montant: 50, date: { seconds: sameDay("2026-05-15") } });
    const ctx = mkCtx([e1, e2]);
    expect(matchEspeces(mkLine({ label: "VERSEMENT ESP", amount: 100 }), ctx)).toBeNull();
    expect(ctx.usedEncIds.size).toBe(0);
  });

  it("ignore un bordereau déjà consommé (usedRemiseIds), fallback sur jour exact", () => {
    const e1 = mkEnc({ id: "e1", mode: "especes", montant: 100 });
    const remise: Remise = {
      id: "r1", total: 100, paymentMode: "especes",
      encaissementIds: ["e1"],
      date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) },
    };
    const ctx = mkCtx([e1]);
    ctx.remises = [remise];
    ctx.usedRemiseIds.add("r1"); // bordereau déjà consommé
    const result = matchEspeces(mkLine({ label: "VERSEMENT ESP", amount: 100 }), ctx);
    // Doit tomber en sous-bloc b
    expect(result).not.toBeNull();
    expect(result!.matchDetail).toContain("Dépôt");
    expect(ctx.usedRemiseIds.has("r1")).toBe(true); // toujours là
  });

  it("ignore les encs déjà consommés dans le pool (sous-bloc b)", () => {
    const sameDay = Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000);
    const e1 = mkEnc({ id: "e1", mode: "especes", montant: 50, date: { seconds: sameDay } });
    const e2 = mkEnc({ id: "e2", mode: "especes", montant: 50, date: { seconds: sameDay } });
    const ctx = mkCtx([e1, e2]);
    ctx.usedEncIds.add("e1"); // déjà consommé
    // Sans e1, le total du jour = 50 ≠ 100 → pas de match
    expect(matchEspeces(mkLine({ label: "VERSEMENT ESP", amount: 100 }), ctx)).toBeNull();
  });
});
