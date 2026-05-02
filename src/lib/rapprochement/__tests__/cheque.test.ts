import { describe, it, expect } from "vitest";
import { matchCheque } from "../matchers/cheque";
import { mkCtx, mkLine, mkEnc } from "./factories";
import type { Remise } from "../types";

const sec = (date: string, h: number = 12) =>
  Math.floor(new Date(`${date}T${String(h).padStart(2, "0")}:00:00`).getTime() / 1000);

describe("matchCheque", () => {
  it("ne s'applique pas si le label ne contient pas CHQ/CHEQUE", () => {
    const enc = mkEnc({ id: "e1", mode: "cheque", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchCheque(mkLine({ label: "VIR DUPONT", amount: 100 }), ctx)).toBeNull();
  });

  it("matche un bordereau de remise chèque (sous-bloc a0)", () => {
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 30 });
    const e2 = mkEnc({ id: "e2", mode: "cheque", montant: 70 });
    const remise: Remise = {
      id: "r1", total: 100, paymentMode: "cheque",
      encaissementIds: ["e1", "e2"], nbPaiements: 2,
      date: { seconds: sec("2026-05-15") },
    };
    const ctx = mkCtx([e1, e2]);
    ctx.remises = [remise];
    const result = matchCheque(mkLine({ label: "REMISE CHQ", amount: 100, date: "16/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèques");
    expect(result!.matchDetail).toContain("Bordereau");
    expect(result!.matchDetail).not.toContain("Sous-ensemble");
    expect(result!.matchDetail).not.toContain("Agrégat");
    expect(ctx.usedRemiseIds.has("r1")).toBe(true);
    expect(ctx.usedEncIds.has("e1")).toBe(true);
    expect(ctx.usedEncIds.has("e2")).toBe(true);
  });

  it("matche un chèque unitaire (sous-bloc a) avec matchType 'Chèque' SINGULIER", () => {
    const e1 = mkEnc({
      id: "e1", mode: "cheque", montant: 50,
      familyName: "MARTIN",
      date: { seconds: sec("2026-05-14") },
    });
    const ctx = mkCtx([e1]);
    const result = matchCheque(mkLine({ label: "CHEQUE", amount: 50, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèque"); // SINGULIER, pas "Chèques"
    expect(result!.matchDetail).toBe("Chèque MARTIN");
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("matche un jour exact (sous-bloc b)", () => {
    // 3 chèques le 14/05/2026, total 100. Bank line le 15/05/2026 (J+1).
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 30, date: { seconds: sec("2026-05-14", 10) } });
    const e2 = mkEnc({ id: "e2", mode: "cheque", montant: 50, date: { seconds: sec("2026-05-14", 14) } });
    const e3 = mkEnc({ id: "e3", mode: "cheque", montant: 20, date: { seconds: sec("2026-05-14", 18) } });
    const ctx = mkCtx([e1, e2, e3]);
    const result = matchCheque(mkLine({ label: "REMISE CHQ", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèques");
    expect(result!.matchDetail).toContain("3 chèque(s) du 14/05/2026");
    expect(result!.matchDetail).not.toContain("Sous-ensemble");
    expect(result!.matchDetail).not.toContain("Agrégat");
    expect(result!.matchedEncs).toHaveLength(3);
    expect(ctx.usedEncIds.size).toBe(3);
  });

  it("matche un sous-ensemble d'un jour (sous-bloc b.bis)", () => {
    // 3 chèques 30 + 50 + 70 le même jour total 150, bank = 80
    // → ni a (aucun à 80) ni b (jour=150≠80) ne match.
    // b.bis cherche subset {30,50}=80 → match.
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 30, date: { seconds: sec("2026-05-14", 10) }, familyName: "A" });
    const e2 = mkEnc({ id: "e2", mode: "cheque", montant: 50, date: { seconds: sec("2026-05-14", 14) }, familyName: "B" });
    const e3 = mkEnc({ id: "e3", mode: "cheque", montant: 70, date: { seconds: sec("2026-05-14", 18) }, familyName: "C" });
    const ctx = mkCtx([e1, e2, e3]);
    const result = matchCheque(mkLine({ label: "REMISE CHEQUE", amount: 80, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèques");
    expect(result!.matchDetail).toContain("Sous-ensemble");
    expect(result!.matchDetail).toContain("2/3"); // 2 chèques sur 3 du jour
    expect(result!.matchedEncs).toHaveLength(2);
  });

  it("matche un agrégat multi-jours (sous-bloc c)", () => {
    // 2 jours différents, 30 + 70 = 100. Bank = 100.
    // a (unitaire) cherche un enc à 100 → fail.
    // b (jour exact) : ni 30 ni 70 ne fait 100 → fail.
    // b.bis : aucun jour n'a un sous-ensemble = 100 → fail.
    // c (agrégat) : 30 + 70 = 100 sur 2 jours → match.
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 30, date: { seconds: sec("2026-05-13") } });
    const e2 = mkEnc({ id: "e2", mode: "cheque", montant: 70, date: { seconds: sec("2026-05-14") } });
    const ctx = mkCtx([e1, e2]);
    const result = matchCheque(mkLine({ label: "CHEQUE", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèques");
    expect(result!.matchDetail).toContain("Agrégat");
    expect(result!.matchDetail).toContain("13/05, 14/05"); // format DD/MM, DD/MM (sans année)
    expect(result!.matchedEncs).toHaveLength(2);
  });

  it("matche le total du mois (sous-bloc d)", () => {
    // 5 encs de 20€ chacun (5*20=100). Bank=100.
    // sortedDays = ["2026-05-01", "2026-05-05", "2026-05-09", "2026-05-13", "2026-05-17"]
    // b (jour exact) fail (chaque jour a 1 enc de 20).
    // b.bis fail (1 enc par jour, total 20 < 100).
    // c essaie agrégats max 3-jours :
    //   i=0: 20, 40, 60. i=1: 20, 40, 60. ... aucun = 100. c fail.
    // d : total mois = 100 → match.
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 20, date: { seconds: sec("2026-05-01") } });
    const e2 = mkEnc({ id: "e2", mode: "cheque", montant: 20, date: { seconds: sec("2026-05-05") } });
    const e3 = mkEnc({ id: "e3", mode: "cheque", montant: 20, date: { seconds: sec("2026-05-09") } });
    const e4 = mkEnc({ id: "e4", mode: "cheque", montant: 20, date: { seconds: sec("2026-05-13") } });
    const e5 = mkEnc({ id: "e5", mode: "cheque", montant: 20, date: { seconds: sec("2026-05-17") } });
    const ctx = mkCtx([e1, e2, e3, e4, e5]);
    const result = matchCheque(mkLine({ label: "REMISE CHEQUE", amount: 100, date: "25/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèques");
    expect(result!.matchDetail).toContain("Remise 5 chèque(s) du mois");
    expect(result!.matchedEncs).toHaveLength(5);
  });

  it("ne matche pas si rien ne fonctionne", () => {
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 999, date: { seconds: sec("2026-05-14") } });
    const ctx = mkCtx([e1]);
    expect(matchCheque(mkLine({ label: "REMISE CHEQUE", amount: 50, date: "15/05/2026" }), ctx)).toBeNull();
  });

  it("accepte les encs de la période précédente (pool periodEncExtended)", () => {
    const eApril = mkEnc({ id: "e1", mode: "cheque", montant: 100, date: { seconds: sec("2026-04-30") }, familyName: "AVRIL" });
    const ctx = mkCtx([eApril], "2026-05");
    const result = matchCheque(mkLine({ label: "CHEQUE", amount: 100, date: "01/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèque"); // singular, sous-bloc a
    expect(result!.matchDetail).toContain("AVRIL");
  });

  it("ignore un bordereau cheque déjà consommé (usedRemiseIds), fallback", () => {
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 100, date: { seconds: sec("2026-05-14") } });
    const remise: Remise = {
      id: "r1", total: 100, paymentMode: "cheque",
      encaissementIds: ["e1"],
      date: { seconds: sec("2026-05-15") },
    };
    const ctx = mkCtx([e1]);
    ctx.remises = [remise];
    ctx.usedRemiseIds.add("r1"); // bordereau déjà consommé
    // Doit fallback sur sous-bloc a (chèque unitaire).
    const result = matchCheque(mkLine({ label: "CHEQUE", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèque"); // singular - sous-bloc a
    expect(ctx.usedRemiseIds.has("r1")).toBe(true);
  });

  it("rejette le bordereau hors fenêtre [-1, +15] jours", () => {
    const e1 = mkEnc({ id: "e1", mode: "cheque", montant: 100, date: { seconds: sec("2026-05-14") } });
    const remise: Remise = {
      id: "r1", total: 100, paymentMode: "cheque",
      encaissementIds: ["e1"],
      date: { seconds: sec("2026-04-15") }, // 30 jours avant la bank → hors fenêtre 15j
    };
    const ctx = mkCtx([e1]);
    ctx.remises = [remise];
    // a0 rejected (window), fallback a (unitaire)
    const result = matchCheque(mkLine({ label: "CHEQUE", amount: 100, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Chèque"); // sous-bloc a
    expect(ctx.usedRemiseIds.size).toBe(0); // bordereau pas consommé
  });
});
