import type { BankLine, MatchContext, MatchResult, Encaissement, EncDetail } from "../types";

/**
 * Règle 1 — CB en ligne / payout CAWL (extrait depuis page.tsx:835-891).
 *
 * Comportement (figé par les tests, ne PAS modifier dans ce refactor) :
 * 1. Trigger label : contient "CAWL", "WORLDLINE", "STRIPE" ou "STP". Sinon return null.
 * 2. Pool : encaissements `mode === "cb_online"` ou `"cb_cawl"` non encore consommés, dans la période courante (PAS extended).
 * 3. Sous-bloc a : un encaissement de montant exact (±0.02€). Mute usedEncIds (1 enc).
 * 4. Sous-bloc b : total des encs CB de la période = montant bancaire (±0.02€). Mute usedEncIds (tous).
 * 5. Sous-bloc c : total net de commissions ~2.9% + 0.25€/tx, tolérance 1€. Mute usedEncIds (tous).
 * 6. Sous-bloc d : si bankDate, cherche payout fenêtre J-2 à J-14 (exact ±0.02€ ou net ±1€). Mute window encs.
 *
 * Premier sous-bloc qui match gagne. Si aucun, return null.
 *
 * NB : `parseBankDate` et `encToDetail` sont dupliqués localement depuis page.tsx ;
 * ils seront centralisés dans engine.ts lors de la Task 9.
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

export function matchCbOnline(bl: BankLine, ctx: MatchContext): MatchResult {
  const label = bl.label.toUpperCase();
  const bankDate = parseBankDate(bl.date);

  const periodEnc = ctx.encs.filter(e => {
    if (ctx.usedEncIds.has(e.id)) return false;
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) return false;
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return pm === ctx.period;
  });

  // ── 1. CB en ligne (CAWL) payout ─────────────────────────────────
  // CAWL verse les fonds ~2-7 jours après les paiements, regroupés,
  // net de commissions (~2.9% + 0.25€). On cherche dans une fenêtre large.
  if (label.includes("CAWL") || label.includes("WORLDLINE") || label.includes("STRIPE") || label.includes("STP")) {
    const cbEncs = periodEnc.filter(e =>
      e.mode === "cb_online" || e.mode === "cb_cawl"
    );

    // a) Match exact (montant identique, rare mais possible)
    const exactCb = cbEncs.find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
    if (exactCb) {
      ctx.usedEncIds.add(exactCb.id);
      return { matchType: "CB en ligne", matchDetail: `CB en ligne ${exactCb.familyName} — ${exactCb.montant?.toFixed(2)}€`, matchedEncs: [encToDetail(exactCb)] };
    }

    // b) Total CB en ligne de la période (payout global)
    const cbTotal = cbEncs.reduce((s, e) => s + (e.montant || 0), 0);
    if (cbTotal > 0 && Math.abs(cbTotal - bl.amount) < 0.02) {
      cbEncs.forEach(e => ctx.usedEncIds.add(e.id));
      return { matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbEncs.length} transaction(s) = ${cbTotal.toFixed(2)}€`, matchedEncs: cbEncs.map(encToDetail) };
    }

    // c) Total CB en ligne net de commissions
    if (cbTotal > 0) {
      const estimatedFees = cbEncs.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
      const cbNet = Math.round((cbTotal - estimatedFees) * 100) / 100;
      if (Math.abs(cbNet - bl.amount) < 1.00) { // tolérance 1€ sur les commissions
        cbEncs.forEach(e => ctx.usedEncIds.add(e.id));
        return { matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbEncs.length} tx = ${cbTotal.toFixed(2)}€ brut − ~${estimatedFees.toFixed(2)}€ frais ≈ ${cbNet.toFixed(2)}€`, matchedEncs: cbEncs.map(encToDetail) };
      }
    }

    // d) Grouper par semaine et chercher un sous-ensemble
    if (bankDate && cbEncs.length > 0) {
      // Chercher les paiements CB en ligne des 7-14 jours avant le payout
      const cbWindow = cbEncs.filter(e => {
        const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
        if (!d) return false;
        const diff = (bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 2 && diff <= 14; // payout arrive 2-14 jours après
      });
      const windowTotal = cbWindow.reduce((s, e) => s + (e.montant || 0), 0);
      if (windowTotal > 0 && Math.abs(windowTotal - bl.amount) < 0.02) {
        cbWindow.forEach(e => ctx.usedEncIds.add(e.id));
        return { matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbWindow.length} tx (J-2 à J-14) = ${windowTotal.toFixed(2)}€`, matchedEncs: cbWindow.map(encToDetail) };
      }
      // Net de commissions
      if (windowTotal > 0) {
        const wFees = cbWindow.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
        const wNet = Math.round((windowTotal - wFees) * 100) / 100;
        if (Math.abs(wNet - bl.amount) < 1.00) {
          cbWindow.forEach(e => ctx.usedEncIds.add(e.id));
          return { matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbWindow.length} tx = ${windowTotal.toFixed(2)}€ − ~${wFees.toFixed(2)}€ frais`, matchedEncs: cbWindow.map(encToDetail) };
        }
      }
    }
  }

  return null;
}
