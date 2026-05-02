import type { BankLine, MatchContext, MatchResult, Encaissement, EncDetail } from "../types";

/**
 * Règle 2 — CB terminal / agrégat par jour (extrait depuis page.tsx:853-919).
 *
 * Comportement (figé par les tests, ne PAS modifier dans ce refactor) :
 * 1. Trigger label : contient "REMISE" || "CB" || "TPE" || "CARTE". Sinon return null.
 * 2. Pool : encaissements `mode === "cb_terminal"` non consommés, période courante OU précédente (periodEncExtended).
 * 3. Sous-bloc a : groupe les encs CB par jour (ISO date).
 * 4. Sous-bloc b : pour chaque jour, si total ≈ montant ±0.02€, vérifie fenêtre [-1, +5] jours autour de bankDate. Match → mute encs du jour.
 * 5. Sous-blocs b.bis et c : DESACTIVES (fix c55c7b5, force "Détail CA" pour éviter mélanges entre remises). Comments-only, à PRESERVER.
 * 6. Sous-bloc d (dernier recours) : enc unitaire de même montant ±0.02€ dans la fenêtre ±3 jours. Match → mute 1 enc.
 *
 * Premier sous-bloc qui match gagne. Aucun → return null.
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

export function matchCbTerminal(bl: BankLine, ctx: MatchContext): MatchResult {
  const label = bl.label.toUpperCase();
  const bankDate = parseBankDate(bl.date);

  // Fenêtre de ±3 jours autour de la date bancaire
  const inWindow = (enc: Encaissement) => {
    if (!bankDate) return true; // pas de date → on essaie quand même
    const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
    if (!d) return false;
    const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 3;
  };

  // Calcul de la période précédente pour élargir le pool
  // (les chèques / CB terminal peuvent être datés du mois d'avant)
  const prevPeriod = (() => {
    const [y, m] = ctx.period.split("-").map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  })();

  // Pool élargi : période courante + précédente (utile pour chèques/CB
  // remis en début de mois mais datés du mois d'avant)
  const periodEncExtended = ctx.encs.filter(e => {
    if (ctx.usedEncIds.has(e.id)) return false;
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) return false;
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return pm === ctx.period || pm === prevPeriod;
  });

  // ── 2. CB terminal — matching agrégat par jour ───────────────────
  // La banque remet en 1 virement le total CB d'une journée (J-1, J-2, etc.)
  if (label.includes("REMISE") || label.includes("CB") || label.includes("TPE") || label.includes("CARTE")) {
    // Pool élargi : un virement de remise CB du 3 novembre peut concerner des CB du 30 octobre
    const cbEncs = periodEncExtended.filter(e => e.mode === "cb_terminal");

    // a) Grouper les encaissements CB par jour
    const cbByDay: Record<string, { total: number; count: number; encs: any[] }> = {};
    for (const e of cbEncs) {
      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
      if (!d) continue;
      const dayKey = d.toISOString().split("T")[0];
      if (!cbByDay[dayKey]) cbByDay[dayKey] = { total: 0, count: 0, encs: [] };
      cbByDay[dayKey].total += (e.montant || 0);
      cbByDay[dayKey].count++;
      cbByDay[dayKey].encs.push(e);
    }

    // b) Chercher un jour dont le total CB = montant de la remise (dans une fenêtre J-3)
    for (const [dayKey, dayData] of Object.entries(cbByDay)) {
      const dayTotal = Math.round(dayData.total * 100) / 100;
      if (Math.abs(dayTotal - bl.amount) < 0.02) {
        // Vérifier que ce jour est dans la fenêtre (la remise arrive J+1 ou J+2 après les CB)
        if (bankDate) {
          const encDay = new Date(dayKey);
          const diff = (bankDate.getTime() - encDay.getTime()) / (1000 * 60 * 60 * 24);
          if (diff < -1 || diff > 5) continue; // la remise doit être APRÈS les CB (J+0 à J+5)
        }
        const dayLabel = dayKey.split("-").reverse().join("/");
        dayData.encs.forEach(e => ctx.usedEncIds.add(e.id));
        return {
          matchType: "CB Terminal",
          matchDetail: `${dayData.count} transaction(s) CB du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
          matchedEncs: dayData.encs.map(encToDetail),
        };
      }
    }

    // b.bis) Sous-ensemble d'un jour : DÉSACTIVÉ (option B retenue par
    //        Nicolas le 28/04). Ce matching trouvait n'importe quelle
    //        combinaison d'encaissements CB du jour qui faisait tomber
    //        le total juste, sans tenir compte de l'heure réelle des
    //        transactions. Résultat : il "mélangeait" les transactions
    //        entre remises bancaires, créant de fausses associations
    //        (cas vécu : 495€ gourmelon attribués à la mauvaise remise).
    //
    //        Désormais, ces remises CB arrivent en "À traiter" et il
    //        faut utiliser le bouton Détail CA pour coller le détail
    //        copié depuis le site Crédit Agricole, qui produit un
    //        matching transaction par transaction fiable.
    //
    //        Si tu lis ce code et que tu veux réactiver, sache que la
    //        cause de la défaillance est qu'on ne dispose pas de
    //        l'horaire des transactions dans encaissements, donc on
    //        ne peut pas distinguer 2 CB de même montant le même jour.

    // c) Agrégat multi-jours : DÉSACTIVÉ aussi (cohérent avec b.bis).
    //    Combinait 2-3 jours consécutifs pour matcher une remise.
    //    Risque similaire de mélange entre remises bancaires.

    // d) Dernier recours : match exact montant unitaire
    const exactCB = cbEncs.filter(inWindow).find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
    if (exactCB) {
      ctx.usedEncIds.add(exactCB.id);
      return {
        matchType: "CB Terminal",
        matchDetail: `CB ${exactCB.familyName} — ${exactCB.activityTitle || ""}`,
        matchedEncs: [encToDetail(exactCB)],
      };
    }
  }

  return null;
}
