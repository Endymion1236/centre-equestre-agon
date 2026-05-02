import { describe, it, expect } from "vitest";
import { matchVirement } from "../matchers/virement";
import { mkCtx, mkLine, mkEnc } from "./factories";
import type { RemiseSepa, Payment } from "../types";

const sec = (date: string, h: number = 12) =>
  Math.floor(new Date(`${date}T${String(h).padStart(2, "0")}:00:00`).getTime() / 1000);

describe("matchVirement", () => {
  it("ne s'applique pas si le label ne contient pas VIR/SEPA/PRLV", () => {
    const enc = mkEnc({ id: "e1", mode: "virement", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchVirement(mkLine({ label: "REMISE CB", amount: 100 }), ctx)).toBeNull();
  });

  it("matche une remise SEPA groupée (sous-bloc a)", () => {
    const remise: RemiseSepa = {
      id: "rs1",
      montantTotal: 250,
      datePrelevement: "2026-05-15",
      numero: 42,
      nbTransactions: 5,
    };
    const ctx = mkCtx([], "2026-05");
    ctx.remisesSepa = [remise];
    const result = matchVirement(mkLine({ label: "PRLV SEPA ICS123", amount: 250, date: "16/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Prélèvement SEPA");
    expect(result!.matchDetail).toContain("Remise SEPA n°42");
    expect(result!.matchDetail).toContain("5 prélèvements");
    expect(ctx.usedRemiseSepaIds.has("rs1")).toBe(true);
  });

  it("matche un encaissement virement par nom + montant + fenêtre (b.1.i)", () => {
    const enc = mkEnc({
      id: "e1", mode: "virement", montant: 50,
      familyName: "JOUSSE Marie",
      date: { seconds: sec("2026-05-14") }, // J-1 within ±3 day window
    });
    const ctx = mkCtx([enc]);
    const result = matchVirement(mkLine({ label: "VIR DE MLLE MARIE JOUSSE", amount: 50, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Virement");
    expect(result!.matchDetail).toBe("Virement JOUSSE Marie");
    expect(result!.matchDetail).not.toContain("montant seul"); // not sub-bloc c
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("matche un encaissement virement par nom + montant hors fenêtre (b.1.ii fallback)", () => {
    // enc dated J-10 (out of ±3 window), but in current period.
    const enc = mkEnc({
      id: "e1", mode: "virement", montant: 50,
      familyName: "DUPONT",
      date: { seconds: sec("2026-05-05") }, // 10 days before bank
    });
    const ctx = mkCtx([enc]);
    const result = matchVirement(mkLine({ label: "VIR DE M DUPONT", amount: 50, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Virement");
    expect(result!.matchDetail).toBe("Virement DUPONT");
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("matche un paiement pending/partial par nom + montant (b.2.i)", () => {
    const payment: Payment = {
      id: "p1", paymentMode: "virement", status: "partial",
      familyName: "MARTIN", totalTTC: 80,
      date: { seconds: sec("2026-05-10") },
    };
    const ctx = mkCtx([]);
    ctx.payments = [payment];
    const result = matchVirement(mkLine({ label: "VIR DE M MARTIN", amount: 80, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Virement");
    expect(result!.matchDetail).toBe("Virement MARTIN");
    expect(result!.manualPaymentId).toBe("p1");
    expect(ctx.usedPaymentIds.has("p1")).toBe(true);
  });

  it("matche un paiement par nom seul (single candidate) avec montant proche (b.2.ii)", () => {
    // amount different but close: amountClose=false
    const payment: Payment = {
      id: "p1", paymentMode: "virement", status: "pending",
      familyName: "BERNARD", totalTTC: 100,
      date: { seconds: sec("2026-05-10") },
    };
    const ctx = mkCtx([]);
    ctx.payments = [payment];
    const result = matchVirement(mkLine({ label: "VIR DE M BERNARD", amount: 95, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Virement");
    expect(result!.matchDetail).toContain("BERNARD");
    expect(result!.matchDetail).toContain("⚠️"); // warning emoji
    expect(result!.matchDetail).toContain("attendu 100.00€");
    expect(result!.matchDetail).toContain("reçu 95.00€");
    expect(result!.uncertain).toBe(true);
    expect(result!.manualPaymentId).toBe("p1");
  });

  it("matche un encaissement par montant seul si UN SEUL candidat (sous-bloc c, uncertain)", () => {
    const enc = mkEnc({
      id: "e1", mode: "virement", montant: 50,
      familyName: "DURAND",
      date: { seconds: sec("2026-05-14") },
    });
    const ctx = mkCtx([enc]);
    // Label sans nom de famille connu → nom-match échoue → fallback en c
    const result = matchVirement(mkLine({ label: "VIR INCONNU", amount: 50, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Virement");
    expect(result!.matchDetail).toContain("DURAND");
    expect(result!.matchDetail).toContain("(montant seul)");
    expect(result!.uncertain).toBe(true);
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("ne matche PAS si plusieurs encs ont le même montant (ambigu, sous-bloc c)", () => {
    const e1 = mkEnc({ id: "e1", mode: "virement", montant: 50, familyName: "ALPHA", date: { seconds: sec("2026-05-14") } });
    const e2 = mkEnc({ id: "e2", mode: "virement", montant: 50, familyName: "BETA", date: { seconds: sec("2026-05-14") } });
    const ctx = mkCtx([e1, e2]);
    expect(matchVirement(mkLine({ label: "VIR INCONNU", amount: 50, date: "15/05/2026" }), ctx)).toBeNull();
  });

  it("ne matche PAS si plusieurs paiements pending ont le même montant (ambigu, sous-bloc d)", () => {
    const p1: Payment = {
      id: "p1", paymentMode: "virement", status: "pending",
      familyName: "ALPHA", totalTTC: 75,
      date: { seconds: sec("2026-05-10") },
    };
    const p2: Payment = {
      id: "p2", paymentMode: "virement", status: "pending",
      familyName: "BETA", totalTTC: 75,
      date: { seconds: sec("2026-05-10") },
    };
    const ctx = mkCtx([]);
    ctx.payments = [p1, p2];
    expect(matchVirement(mkLine({ label: "VIR INCONNU REF456", amount: 75, date: "15/05/2026" }), ctx)).toBeNull();
  });

  it("matche un paiement pending par montant seul si UN SEUL candidat (sous-bloc d, uncertain)", () => {
    // Aucun enc, juste un paiement pending. Label sans nom matchant.
    const payment: Payment = {
      id: "p1", paymentMode: "virement", status: "pending",
      familyName: "GAMMA", totalTTC: 75,
      date: { seconds: sec("2026-05-10") },
    };
    const ctx = mkCtx([]);
    ctx.payments = [payment];
    const result = matchVirement(mkLine({ label: "VIR INCONNU REF123", amount: 75, date: "15/05/2026" }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Virement");
    expect(result!.matchDetail).toContain("GAMMA");
    expect(result!.matchDetail).toContain("(montant seul)");
    expect(result!.uncertain).toBe(true);
    expect(result!.manualPaymentId).toBe("p1");
    expect(ctx.usedPaymentIds.has("p1")).toBe(true);
  });

  it("exclut les remises SEPA déjà consommées et les paiements déjà consommés", () => {
    const remise: RemiseSepa = { id: "rs1", montantTotal: 100, datePrelevement: "2026-05-15", numero: 1, nbTransactions: 1 };
    const payment: Payment = {
      id: "p1", paymentMode: "virement", status: "pending",
      familyName: "DELTA", totalTTC: 50,
      date: { seconds: sec("2026-05-10") },
    };
    const ctx = mkCtx([]);
    ctx.remisesSepa = [remise];
    ctx.payments = [payment];
    ctx.usedRemiseSepaIds.add("rs1");
    ctx.usedPaymentIds.add("p1");
    expect(matchVirement(mkLine({ label: "PRLV SEPA", amount: 100 }), ctx)).toBeNull();
    expect(matchVirement(mkLine({ label: "VIR DE DELTA", amount: 50 }), ctx)).toBeNull();
  });
});
