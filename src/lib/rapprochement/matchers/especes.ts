import type { BankLine, MatchContext, MatchResult, Encaissement, EncDetail } from "../types";

/**
 * Règle 5 — Espèces (extrait depuis page.tsx:1188-1236).
 *
 * Comportement (figé par les tests, ne PAS modifier dans ce refactor) :
 * 1. Trigger label : contient "ESP" ou "VERSEMENT". Sinon return null.
 * 2. Sous-bloc a0 (priorité) : match par bordereau de remise (paymentMode "especes" ou "mixte"), montant ±0.02€, fenêtre [-1, +15] jours autour de la bankLine.
 * 3. Si match a0 : mute usedRemiseIds + tous les usedEncIds des encaissementIds.
 * 4. Sous-bloc b (fallback) : groupe les encs `mode === "especes"` du pool periodEnc par jour ISO, cherche un jour dont la somme = montant ±0.02€.
 * 5. Si match b : mute les usedEncIds du jour.
 * 6. Premier sous-bloc qui matche gagne. Aucun → return null.
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

export function matchEspeces(bl: BankLine, ctx: MatchContext): MatchResult {
  const label = bl.label.toUpperCase();
  if (!(label.includes("ESP") || label.includes("VERSEMENT"))) return null;

  const bankDate = parseBankDate(bl.date);

  const periodEnc = ctx.encs.filter(e => {
    if (ctx.usedEncIds.has(e.id)) return false;
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) return false;
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return pm === ctx.period;
  });

  // a0) PRIORITÉ : chercher un bordereau de remise espèces qui correspond
  const remiseEspMatch = (ctx.remises || []).find((r: any) => {
    if (ctx.usedRemiseIds.has(r.id)) return false;
    if (r.paymentMode !== "especes" && r.paymentMode !== "mixte") return false;
    if (Math.abs((r.total || 0) - bl.amount) >= 0.02) return false;
    if (bankDate && r.date?.seconds) {
      const rd = new Date(r.date.seconds * 1000);
      const diff = (bankDate.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < -1 || diff > 15) return false;
    }
    return true;
  });
  if (remiseEspMatch) {
    ctx.usedRemiseIds.add(remiseEspMatch.id);
    const encIds = remiseEspMatch.encaissementIds || [];
    encIds.forEach((id: string) => ctx.usedEncIds.add(id));
    const remiseEncs = ctx.encs.filter(e => encIds.includes(e.id));
    const dayLabel = remiseEspMatch.date?.seconds
      ? new Date(remiseEspMatch.date.seconds * 1000).toLocaleDateString("fr-FR")
      : "?";
    return {
      matchType: "Espèces",
      matchDetail: `Bordereau du ${dayLabel} — ${remiseEspMatch.nbPaiements || encIds.length} enc. espèces = ${(remiseEspMatch.total || 0).toFixed(2)}€`,
      matchedEncs: remiseEncs.map(encToDetail),
    };
  }

  // b) On cherche un jour dont la somme des encaissements en espèces = montant du dépôt
  const espByDay: Record<string, { total: number; encs: any[] }> = {};
  for (const e of periodEnc.filter(e => e.mode === "especes")) {
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) continue;
    const dayKey = d.toISOString().split("T")[0];
    if (!espByDay[dayKey]) espByDay[dayKey] = { total: 0, encs: [] };
    espByDay[dayKey].total += (e.montant || 0);
    espByDay[dayKey].encs.push(e);
  }
  for (const [dayKey, dayData] of Object.entries(espByDay)) {
    const dayTotal = Math.round(dayData.total * 100) / 100;
    if (Math.abs(dayTotal - bl.amount) < 0.02) {
      const dayLabel = dayKey.split("-").reverse().join("/");
      dayData.encs.forEach(e => ctx.usedEncIds.add(e.id));
      return {
        matchType: "Espèces",
        matchDetail: `Dépôt espèces du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
        matchedEncs: dayData.encs.map(encToDetail),
      };
    }
  }

  return null;
}
