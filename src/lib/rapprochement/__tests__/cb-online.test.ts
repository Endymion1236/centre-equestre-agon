import { describe, it, expect } from "vitest";
import { matchCbOnline } from "../matchers/cb-online";
import { mkCtx, mkLine, mkEnc } from "./factories";

describe("matchCbOnline", () => {
  it("ne s'applique pas si le label ne contient pas CAWL/WORLDLINE/STRIPE/STP", () => {
    const enc = mkEnc({ id: "e1", mode: "cb_online", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchCbOnline(mkLine({ label: "VIR DUPONT", amount: 100 }), ctx)).toBeNull();
    expect(ctx.usedEncIds.size).toBe(0);
  });

  it("matche un encaissement exact (sous-bloc a)", () => {
    const enc = mkEnc({ id: "e1", mode: "cb_online", montant: 50, familyName: "Dupont" });
    const ctx = mkCtx([enc]);
    const result = matchCbOnline(mkLine({ label: "VIR CAWL PAYOUT", amount: 50 }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("CB en ligne");
    expect(result!.matchDetail).toContain("Dupont");
    expect(result!.matchedEncs).toHaveLength(1);
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("matche le total exact des encs CB de la période (sous-bloc b)", () => {
    const e1 = mkEnc({ id: "e1", mode: "cb_online", montant: 30 });
    const e2 = mkEnc({ id: "e2", mode: "cb_cawl", montant: 70 });
    const ctx = mkCtx([e1, e2]);
    const result = matchCbOnline(mkLine({ label: "WORLDLINE PAYOUT", amount: 100 }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchedEncs).toHaveLength(2);
    expect(result!.matchDetail).toContain("2 transaction(s)");
    expect(ctx.usedEncIds.has("e1")).toBe(true);
    expect(ctx.usedEncIds.has("e2")).toBe(true);
  });

  it("matche le total net de commissions de la période (sous-bloc c, tolérance 1€)", () => {
    // 3 encs de 100€ = 300€ brut. Frais ≈ 3×(2.9€+0.25€)=9.45€. Net ≈ 290.55€
    const e1 = mkEnc({ id: "e1", mode: "cb_online", montant: 100 });
    const e2 = mkEnc({ id: "e2", mode: "cb_online", montant: 100 });
    const e3 = mkEnc({ id: "e3", mode: "cb_online", montant: 100 });
    const ctx = mkCtx([e1, e2, e3]);
    const result = matchCbOnline(mkLine({ label: "STRIPE", amount: 290.55 }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("CB en ligne");
    expect(result!.matchDetail).toContain("net");
    expect(ctx.usedEncIds.size).toBe(3);
  });

  it("matche un payout fenêtre J-2 à J-14, exact (sous-bloc d.1)", () => {
    // bankDate = 15/05/2026. Encs à J-3 et J-7 dans la fenêtre.
    // Mais il ne faut PAS qu'ils matchent en sous-bloc b ou c. Donc cbTotal ≠ amount.
    // 2 encs en pool: 1 dans la fenêtre (50€) + 1 hors fenêtre (200€) → total = 250€
    // Bank amount = 50€ (= window total exact)
    // Sous-bloc a: pas de match (50 vs 250 et 50 — mais 50 matche un seul → bloc a wins!)
    // Pour forcer sous-bloc d : utiliser un montant qui matche la fenêtre mais pas un enc seul.
    // 2 encs dans fenêtre 30+40=70, 1 hors fenêtre 100. Bank = 70€. Pas d'enc à 70 → bloc a fail. Total 170 ≠ 70 → bloc b fail. Net ≈ 170-(170*0.029+0.75)=170-5.68=164.32 ≠ 70 → bloc c fail.
    // Bloc d : windowTotal = 70 = amount → match!
    const inWindow1 = mkEnc({
      id: "e1", mode: "cb_online", montant: 30,
      date: { seconds: Math.floor(new Date("2026-05-08T12:00:00").getTime() / 1000) }, // J-7
    });
    const inWindow2 = mkEnc({
      id: "e2", mode: "cb_online", montant: 40,
      date: { seconds: Math.floor(new Date("2026-05-12T12:00:00").getTime() / 1000) }, // J-3
    });
    const outOfWindow = mkEnc({
      id: "e3", mode: "cb_online", montant: 100,
      date: { seconds: Math.floor(new Date("2026-05-14T12:00:00").getTime() / 1000) }, // J-1, hors fenêtre 2-14
    });
    const ctx = mkCtx([inWindow1, inWindow2, outOfWindow]);
    const result = matchCbOnline(mkLine({ label: "CAWL", date: "15/05/2026", amount: 70 }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchedEncs).toHaveLength(2);
    expect(result!.matchDetail).toContain("J-2 à J-14");
    expect(ctx.usedEncIds.has("e1")).toBe(true);
    expect(ctx.usedEncIds.has("e2")).toBe(true);
    expect(ctx.usedEncIds.has("e3")).toBe(false); // hors fenêtre, pas consommé
  });

  it("matche un payout fenêtre net de commissions (sous-bloc d.2)", () => {
    // 2 encs dans fenêtre J-3 et J-7, 200€ chacun = 400€ brut.
    // Frais ≈ 2*(5.8+0.25) = 12.10. Net ≈ 387.90.
    // Hors fenêtre : 1000€. Total période = 1400. amount = 387.90.
    // Sous-blocs a/b/c échouent (montants trop divers, pas d'enc à 387.90, total 1400 ≠ 387.90, net période ≈ 1400-(40.85)=1359.15 ≠ 387.90).
    // Sous-bloc d.1 fail (windowTotal=400 ≠ 387.90). Sous-bloc d.2 : net ≈ 387.90 → match.
    const enc1 = mkEnc({
      id: "e1", mode: "cb_online", montant: 200,
      date: { seconds: Math.floor(new Date("2026-05-08T12:00:00").getTime() / 1000) },
    });
    const enc2 = mkEnc({
      id: "e2", mode: "cb_online", montant: 200,
      date: { seconds: Math.floor(new Date("2026-05-12T12:00:00").getTime() / 1000) },
    });
    const big = mkEnc({
      id: "e3", mode: "cb_online", montant: 1000,
      date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) }, // J-0, hors fenêtre
    });
    const ctx = mkCtx([enc1, enc2, big]);
    const result = matchCbOnline(mkLine({ label: "CAWL", date: "15/05/2026", amount: 387.90 }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchDetail).toContain("net");
  });

  it("ne matche pas si aucune enc cb_online/cb_cawl dans la période", () => {
    const enc = mkEnc({ id: "e1", mode: "cheque", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchCbOnline(mkLine({ label: "CAWL", amount: 100 }), ctx)).toBeNull();
    expect(ctx.usedEncIds.size).toBe(0);
  });

  it("exclut les encs déjà consommés", () => {
    const enc = mkEnc({ id: "e1", mode: "cb_online", montant: 50 });
    const ctx = mkCtx([enc]);
    ctx.usedEncIds.add("e1");
    expect(matchCbOnline(mkLine({ label: "CAWL", amount: 50 }), ctx)).toBeNull();
  });
});
