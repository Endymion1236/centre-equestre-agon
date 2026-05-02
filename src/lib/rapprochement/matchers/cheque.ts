import type { BankLine, MatchContext, MatchResult } from "../types";
import { parseBankDate, encToDetail, makeInWindow, getPeriodEncs, findSubsetSum } from "../engine";

/**
 * Règle 4 — Chèque (extrait depuis page.tsx:887-1021).
 *
 * Comportement (figé par les tests, ne PAS modifier dans ce refactor) :
 * 1. Trigger label : contient "CHQ" || "CHEQUE" || "REMISE CHQ". Sinon return null.
 * 2. Sous-bloc a0 (priorité absolue) : bordereau de remise chèque (paymentMode "cheque" ou "mixte"), montant ±0.02€, fenêtre [-1, +15]j. matchType="Chèques" (PLURAL).
 * 3. Pool : encaissements `mode === "cheque"` non consommés, période courante OU précédente (periodEncExtended).
 * 4. Sous-bloc a : chèque unitaire dans fenêtre ±3j, matchType="Chèque" (SINGULAR).
 * 5. Sous-bloc b : jour exact, fenêtre [-1, +10]j. matchType="Chèques".
 * 6. Sous-bloc b.bis : sous-ensemble d'un jour via findSubsetSum, fenêtre [-1, +10]j. matchType="Chèques".
 * 7. Sous-bloc c : agrégat multi-jours (max 3 jours consécutifs dans sortedDays). matchType="Chèques".
 * 8. Sous-bloc d : total du mois entier. matchType="Chèques".
 *
 * Premier sous-bloc qui match gagne. Aucun → return null.
 */

export function matchCheque(bl: BankLine, ctx: MatchContext): MatchResult {
  const label = bl.label.toUpperCase();
  const bankDate = parseBankDate(bl.date);
  const { remises, usedRemiseIds, usedEncIds } = ctx;

  // Fenêtre de ±3 jours autour de la date bancaire
  const inWindow = makeInWindow(bankDate);

  // Pool élargi : période courante + précédente (utile pour chèques/CB
  // remis en début de mois mais datés du mois d'avant)
  const periodEncExtended = getPeriodEncs(ctx, { extended: true });

  // ── 4. Chèque ─────────────────────────────────────────────────────
  if (label.includes("CHQ") || label.includes("CHEQUE") || label.includes("REMISE CHQ")) {

    // a0) PRIORITÉ ABSOLUE : chercher un bordereau de remise chèque qui
    //     correspond EXACTEMENT à ce mouvement bancaire. Les bordereaux
    //     sont créés manuellement via l'onglet "Bordereaux remise" et
    //     contiennent la liste exacte des chèques remis à la banque.
    const remiseMatch = (remises || []).find((r: any) => {
      if (usedRemiseIds.has(r.id)) return false;
      if (r.paymentMode !== "cheque" && r.paymentMode !== "mixte") return false;
      if (Math.abs((r.total || 0) - bl.amount) >= 0.02) return false;
      // Fenêtre : la remise bancaire arrive dans les 10 jours après la création du bordereau
      if (bankDate && r.date?.seconds) {
        const rd = new Date(r.date.seconds * 1000);
        const diff = (bankDate.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < -1 || diff > 15) return false;
      }
      return true;
    });
    if (remiseMatch) {
      usedRemiseIds.add(remiseMatch.id);
      // Marquer les encaissements du bordereau comme consommés
      const encIds = remiseMatch.encaissementIds || [];
      encIds.forEach((id: string) => usedEncIds.add(id));
      // Récupérer les détails des encaissements pour l'affichage
      const remiseEncs = ctx.encs.filter(e => encIds.includes(e.id));
      const dayLabel = remiseMatch.date?.seconds
        ? new Date(remiseMatch.date.seconds * 1000).toLocaleDateString("fr-FR")
        : "?";
      return {
        matchType: "Chèques",
        matchDetail: `Bordereau du ${dayLabel} — ${remiseMatch.nbPaiements || encIds.length} chèque(s) = ${(remiseMatch.total || 0).toFixed(2)}€`,
        matchedEncs: remiseEncs.map(encToDetail),
      };
    }

    // Pool élargi : une remise chèque peut contenir des chèques du mois d'avant
    const allChqEncs = periodEncExtended.filter(e => e.mode === "cheque");

    // a) Chèque unitaire (montant exact)
    const match = allChqEncs.filter(inWindow).find(e =>
      Math.abs((e.montant || 0) - bl.amount) < 0.02
    );
    if (match) {
      usedEncIds.add(match.id);
      return {
        matchType: "Chèque",
        matchDetail: `Chèque ${match.familyName}`,
        matchedEncs: [encToDetail(match)],
      };
    }

    // b) Remise chèques groupée par JOUR EXACT
    //    La banque remet souvent tous les chèques d'une journée en 1 virement.
    //    On groupe d'abord par jour et on cherche un jour dont la somme = montant remise.
    const chqByDay: Record<string, { total: number; count: number; encs: any[] }> = {};
    for (const e of allChqEncs) {
      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
      if (!d) continue;
      const dayKey = d.toISOString().split("T")[0];
      if (!chqByDay[dayKey]) chqByDay[dayKey] = { total: 0, count: 0, encs: [] };
      chqByDay[dayKey].total += (e.montant || 0);
      chqByDay[dayKey].count++;
      chqByDay[dayKey].encs.push(e);
    }
    // Chercher un jour dont le total = montant de la remise (fenêtre J-0 à J+7)
    for (const [dayKey, dayData] of Object.entries(chqByDay)) {
      const dayTotal = Math.round(dayData.total * 100) / 100;
      if (Math.abs(dayTotal - bl.amount) < 0.02) {
        if (bankDate) {
          const encDay = new Date(dayKey);
          const diff = (bankDate.getTime() - encDay.getTime()) / (1000 * 60 * 60 * 24);
          // La remise arrive J+0 à J+7 après la saisie des chèques
          if (diff < -1 || diff > 10) continue;
        }
        const dayLabel = dayKey.split("-").reverse().join("/");
        dayData.encs.forEach(e => usedEncIds.add(e.id));
        return {
          matchType: "Chèques",
          matchDetail: `${dayData.count} chèque(s) du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
          matchedEncs: dayData.encs.map(encToDetail),
        };
      }
    }

    // b.bis) Sous-ensemble d'un jour : si tu as saisi 7 chèques mais que ta
    //        remise n'en contient que 6, on cherche la combinaison qui fait
    //        le montant exact. Utile si tu as oublié d'inclure un chèque.
    const chqTargetCents = Math.round(bl.amount * 100);
    for (const [dayKey, dayData] of Object.entries(chqByDay)) {
      if (bankDate) {
        const encDay = new Date(dayKey);
        const diff = (bankDate.getTime() - encDay.getTime()) / (1000 * 60 * 60 * 24);
        if (diff < -1 || diff > 10) continue;
      }
      if (dayData.total < bl.amount - 0.02) continue;
      const freeEncs = dayData.encs.filter(e => !usedEncIds.has(e.id));
      const subset = findSubsetSum(freeEncs, chqTargetCents);
      if (subset && subset.length > 0) {
        const subsetSum = subset.reduce((s, e) => s + (e.montant || 0), 0);
        subset.forEach(e => usedEncIds.add(e.id));
        const dayLabel = dayKey.split("-").reverse().join("/");
        return {
          matchType: "Chèques",
          matchDetail: `Sous-ensemble ${subset.length}/${dayData.encs.length} chèque(s) du ${dayLabel} = ${subsetSum.toFixed(2)}€`,
          matchedEncs: subset.map(encToDetail),
        };
      }
    }

    // c) Agrégat multi-jours : 2-3 jours consécutifs
    const sortedDays = Object.keys(chqByDay).sort();
    for (let i = 0; i < sortedDays.length; i++) {
      let runningTotal = 0;
      let runningCount = 0;
      for (let j = i; j < Math.min(i + 3, sortedDays.length); j++) {
        runningTotal += chqByDay[sortedDays[j]].total;
        runningCount += chqByDay[sortedDays[j]].count;
        const roundedTotal = Math.round(runningTotal * 100) / 100;
        if (Math.abs(roundedTotal - bl.amount) < 0.02) {
          const days = sortedDays.slice(i, j + 1).map(d => d.split("-")[2] + "/" + d.split("-")[1]).join(", ");
          const allEncs = sortedDays.slice(i, j + 1).flatMap(d => chqByDay[d].encs);
          allEncs.forEach(e => usedEncIds.add(e.id));
          return {
            matchType: "Chèques",
            matchDetail: `Agrégat ${runningCount} chèque(s) (${days}) = ${roundedTotal.toFixed(2)}€`,
            matchedEncs: allEncs.map(encToDetail),
          };
        }
      }
    }

    // d) Total de TOUS les chèques du mois (rare mais possible)
    const totalMois = Math.round(allChqEncs.reduce((s, e) => s + (e.montant || 0), 0) * 100) / 100;
    if (totalMois > 0 && Math.abs(totalMois - bl.amount) < 0.02) {
      allChqEncs.forEach(e => usedEncIds.add(e.id));
      return {
        matchType: "Chèques",
        matchDetail: `Remise ${allChqEncs.length} chèque(s) du mois = ${totalMois.toFixed(2)}€`,
        matchedEncs: allChqEncs.map(encToDetail),
      };
    }
  }

  return null;
}
