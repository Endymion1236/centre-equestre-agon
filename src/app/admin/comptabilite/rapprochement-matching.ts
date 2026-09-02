/**
 * src/app/admin/comptabilite/rapprochement-matching.ts
 *
 * Le rapprochement automatique : à chaque ligne du relevé, retrouver la
 * recette qui lui correspond.
 *
 * C'est le calcul le plus délicat de la comptabilité, et il vivait dans le
 * gestionnaire d'import du fichier, donc hors de portée de tout test. Il est
 * ici sans aucune écriture ni lecture de base : on lui donne le relevé et
 * l'état des recettes, il rend les lignes rapprochées. Ce qu'il faut ensuite
 * écrire en base se déduit des ensembles qu'il renvoie.
 *
 * La règle qui tient tout : un encaissement, un bordereau, une remise SEPA ou
 * un paiement ne peut être consommé qu'une seule fois. Sans elle, deux lignes
 * bancaires de même montant se partageaient la même recette et le mois
 * paraissait équilibré alors qu'il manquait un versement.
 *
 * Les cas traités, dans l'ordre où ils sont tentés :
 *   1. versement CAWL (CB en ligne), net de commission ;
 *   2. remise CB terminal, par total de la journée puis par sous-ensemble ;
 *   3. virement, prélèvement et remise SEPA, par nom puis par montant ;
 *   4. remise de chèques ou d'espèces, par bordereau puis par sous-ensemble.
 */

import {
  cleLigneBancaire,
  encaissementEnDetail,
  estDansFenetreBancaire,
  parserDateBancaire,
  periodePrecedente,
  trouverSousEnsembleMontant,
} from "./rapprochement-utils";
import type { LigneBancaire } from "./useRapprochement";

export interface EtatRecettes {
  encaissementsCompta: any[];
  payments: any[];
  remises: any[];
  remisesSepa: any[];
  /** Mois traité (YYYY-MM). */
  period: string;
  /** Lignes déjà présentes : leurs pointages manuels sont préservés. */
  bankLines: LigneBancaire[];
}

export interface ResultatRapprochement {
  /** Les lignes du relevé, rapprochées, pointages manuels conservés. */
  finalMatched: LigneBancaire[];
  /** Nombre de lignes auto-rapprochées recalculées par ce nouvel import. */
  autoOverwritten: number;
  /** Nombre de pointages manuels préservés. */
  manuelsPreserves: number;
  usedEncIds: Set<string>;
  usedRemiseSepaIds: Set<string>;
  usedPaymentIds: Set<string>;
  usedRemiseIds: Set<string>;
}

/**
 * Rapproche les lignes d'un relevé avec les recettes connues.
 * Ne lit ni n'écrit aucune donnée : tout entre par `etat`, tout sort du retour.
 */
export function rapprocherReleve(
  parsed: LigneBancaire[],
  etat: EtatRecettes,
): ResultatRapprochement {
  const { encaissementsCompta, payments, remises, remisesSepa, period, bankLines } = etat;

  // ─────────────────────────────────────────────────────────────────────
  // Principe : chaque encaissement et chaque remise SEPA ne peut être
  // consommé qu'UNE SEULE FOIS. On utilise des Sets pour tracker ce qui
  // a déjà été matché, afin que deux lignes bancaires de même montant ne
  // se partagent pas le même encaissement.

  const usedEncIds = new Set<string>();        // ids des encaissements déjà rapprochés
  const usedRemiseSepaIds = new Set<string>(); // ids des remises SEPA déjà rapprochées
  const usedPaymentIds = new Set<string>();    // ids des paiements (virements) déjà rapprochés
  const usedRemiseIds = new Set<string>();     // ids des bordereaux de remise (chèques/espèces) déjà rapprochés

  // ─────────────────────────────────────────────────────────────────────
  const matched = parsed.map((bl) => {
    const label = bl.label.toUpperCase();
    const bankDate = parserDateBancaire(bl.date);

    // Calcul de la période précédente pour élargir le pool
    // (les chèques / CB terminal peuvent être datés du mois d'avant)
    const prevPeriod = periodePrecedente(period);

    // Encaissements de la période, avec leur date
    // On EXCLUT les encaissements déjà consommés par une autre bankLine
    const periodEnc = encaissementsCompta.filter(e => {
      if (usedEncIds.has(e.id)) return false;
      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
      if (!d) return false;
      const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return pm === period;
    });

    // Pool élargi : période courante + précédente (utile pour chèques/CB
    // remis en début de mois mais datés du mois d'avant)
    const periodEncExtended = encaissementsCompta.filter(e => {
      if (usedEncIds.has(e.id)) return false;
      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
      if (!d) return false;
      const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return pm === period || pm === prevPeriod;
    });

    // Fenêtre de ±3 jours autour de la date bancaire
    const inWindow = (enc: any) => estDansFenetreBancaire(enc, bankDate);

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
        usedEncIds.add(exactCb.id);
        return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `CB en ligne ${exactCb.familyName} — ${exactCb.montant?.toFixed(2)}€`, matchedEncs: [encaissementEnDetail(exactCb)] };
      }

      // b) Total CB en ligne de la période (payout global)
      const cbTotal = cbEncs.reduce((s, e) => s + (e.montant || 0), 0);
      if (cbTotal > 0 && Math.abs(cbTotal - bl.amount) < 0.02) {
        cbEncs.forEach(e => usedEncIds.add(e.id));
        return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbEncs.length} transaction(s) = ${cbTotal.toFixed(2)}€`, matchedEncs: cbEncs.map(encaissementEnDetail) };
      }

      // c) Total CB en ligne net de commissions
      if (cbTotal > 0) {
        const estimatedFees = cbEncs.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
        const cbNet = Math.round((cbTotal - estimatedFees) * 100) / 100;
        if (Math.abs(cbNet - bl.amount) < 1.00) { // tolérance 1€ sur les commissions
          cbEncs.forEach(e => usedEncIds.add(e.id));
          return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbEncs.length} tx = ${cbTotal.toFixed(2)}€ brut − ~${estimatedFees.toFixed(2)}€ frais ≈ ${cbNet.toFixed(2)}€`, matchedEncs: cbEncs.map(encaissementEnDetail) };
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
          cbWindow.forEach(e => usedEncIds.add(e.id));
          return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne — ${cbWindow.length} tx (J-2 à J-14) = ${windowTotal.toFixed(2)}€`, matchedEncs: cbWindow.map(encaissementEnDetail) };
        }
        // Net de commissions
        if (windowTotal > 0) {
          const wFees = cbWindow.reduce((s, e) => s + ((e.montant || 0) * 0.029 + 0.25), 0);
          const wNet = Math.round((windowTotal - wFees) * 100) / 100;
          if (Math.abs(wNet - bl.amount) < 1.00) {
            cbWindow.forEach(e => usedEncIds.add(e.id));
            return { ...bl, matched: true, matchType: "CB en ligne", matchDetail: `Virement CB en ligne net — ${cbWindow.length} tx = ${windowTotal.toFixed(2)}€ − ~${wFees.toFixed(2)}€ frais`, matchedEncs: cbWindow.map(encaissementEnDetail) };
          }
        }
      }
    }

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
          dayData.encs.forEach(e => usedEncIds.add(e.id));
          return {
            ...bl, matched: true, matchType: "CB Terminal",
            matchDetail: `${dayData.count} transaction(s) CB du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
            matchedEncs: dayData.encs.map(encaissementEnDetail),
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
        usedEncIds.add(exactCB.id);
        return { ...bl, matched: true, matchType: "CB Terminal", matchDetail: `CB ${exactCB.familyName} — ${exactCB.activityTitle || ""}`, matchedEncs: [encaissementEnDetail(exactCB)] };
      }
    }

    // ── 3. Virement / SEPA / Prélèvement ──────────────────────────────
    if (label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV")) {

      // a) Match remise SEPA (somme des prélèvements groupés) — priorité maximum
      //    Les remises SEPA sont typiquement reçues sous forme "PRLV SEPA" ou avec la référence ICS
      if (label.includes("PRLV") || label.includes("SEPA") || label.includes("ICS")) {
        const remiseMatch = remisesSepa.find(r => {
          if (usedRemiseSepaIds.has(r.id)) return false; // déjà consommée
          if (Math.abs((r.montantTotal || 0) - bl.amount) >= 0.02) return false;
          // La remise doit être dans la même période OU dans une fenêtre proche de la date bancaire
          if (r.datePrelevement?.startsWith(period)) return true;
          if (bankDate && r.datePrelevement) {
            const rd = new Date(r.datePrelevement);
            const diff = Math.abs(bankDate.getTime() - rd.getTime()) / (1000 * 60 * 60 * 24);
            return diff <= 7;
          }
          return false;
        });
        if (remiseMatch) {
          usedRemiseSepaIds.add(remiseMatch.id);
          return { ...bl, matched: true, matchType: "Prélèvement SEPA", matchDetail: `Remise SEPA n°${remiseMatch.numero} — ${remiseMatch.nbTransactions} prélèvements` };
        }
      }

      // b) Match par NOM de famille dans le libellé bancaire — PRIORITÉ ABSOLUE
      //    Ex: "VIR DE MLLE MARIE JOUSSE" → on cherche un encaissement ou paiement virement
      //    dont la famille correspond, dans une fenêtre ±30 jours.
      //    CRITIQUE : on fait CE match AVANT le match par montant seul, sinon on risque
      //    de matcher un faux positif (encaissement d'une autre famille de même montant).

      // b.1) Parmi les ENCAISSEMENTS virement/sepa de la période, priorité au nom qui matche le libellé
      const virEncs = periodEnc.filter(e =>
        e.mode === "virement" || e.mode === "sepa" || e.mode === "prelevement_sepa"
      );
      const encNameMatches = virEncs.filter(e => {
        if (!e.familyName) return false;
        const nameParts = e.familyName.toUpperCase().split(/\s+/).filter((n: string) => n.length > 2);
        return nameParts.some((part: string) => label.includes(part));
      });
      // Nom + montant exact + fenêtre → idéal
      const encNameAmountInWindow = encNameMatches.find(e => inWindow(e) && Math.abs((e.montant || 0) - bl.amount) < 0.02);
      if (encNameAmountInWindow) {
        usedEncIds.add(encNameAmountInWindow.id);
        return { ...bl, matched: true, matchType: "Virement", matchDetail: `Virement ${encNameAmountInWindow.familyName}`, matchedEncs: [encaissementEnDetail(encNameAmountInWindow)] };
      }
      // Nom + montant exact (même hors fenêtre, jusqu'à 15j)
      const encNameAmount = encNameMatches.find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
      if (encNameAmount) {
        usedEncIds.add(encNameAmount.id);
        return { ...bl, matched: true, matchType: "Virement", matchDetail: `Virement ${encNameAmount.familyName}`, matchedEncs: [encaissementEnDetail(encNameAmount)] };
      }

      // b.2) Parmi les PAIEMENTS virement en attente (pending/partial), match par nom
      const virPayments = payments.filter(p => {
        if (p.paymentMode !== "virement") return false;
        if (p.status !== "pending" && p.status !== "partial") return false;
        if (usedPaymentIds.has(p.id)) return false;
        if (bankDate && p.date?.seconds) {
          const d = new Date(p.date.seconds * 1000);
          const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
          if (diff > 60) return false; // au-delà de 60j, on considère que ce n'est pas lié
        }
        return true;
      });
      const paymentNameMatches = virPayments.filter(p => {
        if (!p.familyName) return false;
        const nameParts = p.familyName.toUpperCase().split(/\s+/).filter((n: string) => n.length > 2);
        return nameParts.some((part: string) => label.includes(part));
      });
      // Nom + montant exact
      const paymentNameAmount = paymentNameMatches.find(p => Math.abs((p.totalTTC || 0) - bl.amount) < 0.02);
      if (paymentNameAmount) {
        usedPaymentIds.add(paymentNameAmount.id);
        return {
          ...bl, matched: true, matchType: "Virement",
          matchDetail: `Virement ${paymentNameAmount.familyName}`,
          manualPaymentId: paymentNameAmount.id,
        };
      }
      // Nom uniquement si UN SEUL candidat (avertissement si montant différent)
      if (paymentNameMatches.length === 1) {
        const nameMatch = paymentNameMatches[0];
        const amountClose = Math.abs((nameMatch.totalTTC || 0) - bl.amount) < 0.02;
        usedPaymentIds.add(nameMatch.id);
        return {
          ...bl, matched: true, matchType: "Virement",
          matchDetail: `Virement ${nameMatch.familyName}${amountClose ? "" : ` ⚠️ montant: attendu ${nameMatch.totalTTC?.toFixed(2)}€, reçu ${bl.amount.toFixed(2)}€`}`,
          manualPaymentId: nameMatch.id,
          uncertain: !amountClose, // douteux si montant différent
        };
      }

      // c) Match individuel encaissement virement/sepa par MONTANT EXACT dans la fenêtre
      //    ATTENTION : ce bloc ne s'exécute QUE si aucun nom n'a été trouvé dans le libellé,
      //    pour éviter qu'un virement "JOUSSE 50€" soit faussement matché à un encaissement
      //    "GUYON 50€". On impose aussi qu'il n'y ait qu'UN SEUL candidat (pas d'ambigüité).
      const amountMatches = virEncs.filter(e =>
        inWindow(e) && Math.abs((e.montant || 0) - bl.amount) < 0.02
      );
      if (amountMatches.length === 1) {
        const match = amountMatches[0];
        usedEncIds.add(match.id);
        return {
          ...bl, matched: true, matchType: "Virement",
          matchDetail: `Virement ${match.familyName} (montant seul)`,
          matchedEncs: [encaissementEnDetail(match)],
          uncertain: true, // nom absent du libellé → à vérifier
        };
      }
      // Si plusieurs encaissements de même montant → ambigu, on laisse au pointage manuel

      // d) Match par montant exact sur les paiements virement EN ATTENTE uniquement
      const pendingVirPayments = payments.filter(p =>
        p.paymentMode === "virement" &&
        (p.status === "pending" || p.status === "partial") &&
        !usedPaymentIds.has(p.id)
      );
      const pendingAmountMatches = pendingVirPayments.filter(p =>
        Math.abs((p.totalTTC || 0) - bl.amount) < 0.02
      );
      if (pendingAmountMatches.length === 1) {
        const p = pendingAmountMatches[0];
        usedPaymentIds.add(p.id);
        return {
          ...bl, matched: true, matchType: "Virement",
          matchDetail: `Virement ${p.familyName} (montant seul)`,
          manualPaymentId: p.id,
          uncertain: true, // nom absent du libellé → à vérifier
        };
      }
    }

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
        const remiseEncs = encaissementsCompta.filter(e => encIds.includes(e.id));
        const dayLabel = remiseMatch.date?.seconds
          ? new Date(remiseMatch.date.seconds * 1000).toLocaleDateString("fr-FR")
          : "?";
        return {
          ...bl, matched: true, matchType: "Chèques",
          matchDetail: `Bordereau du ${dayLabel} — ${remiseMatch.nbPaiements || encIds.length} chèque(s) = ${(remiseMatch.total || 0).toFixed(2)}€`,
          matchedEncs: remiseEncs.map(encaissementEnDetail),
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
        return { ...bl, matched: true, matchType: "Chèque", matchDetail: `Chèque ${match.familyName}`, matchedEncs: [encaissementEnDetail(match)] };
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
            ...bl, matched: true, matchType: "Chèques",
            matchDetail: `${dayData.count} chèque(s) du ${dayLabel} = ${dayTotal.toFixed(2)}€`,
            matchedEncs: dayData.encs.map(encaissementEnDetail),
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
        const subset = trouverSousEnsembleMontant(freeEncs, chqTargetCents);
        if (subset && subset.length > 0) {
          const subsetSum = subset.reduce((s, e) => s + (e.montant || 0), 0);
          subset.forEach(e => usedEncIds.add(e.id));
          const dayLabel = dayKey.split("-").reverse().join("/");
          return {
            ...bl, matched: true, matchType: "Chèques",
            matchDetail: `Sous-ensemble ${subset.length}/${dayData.encs.length} chèque(s) du ${dayLabel} = ${subsetSum.toFixed(2)}€`,
            matchedEncs: subset.map(encaissementEnDetail),
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
              ...bl, matched: true, matchType: "Chèques",
              matchDetail: `Agrégat ${runningCount} chèque(s) (${days}) = ${roundedTotal.toFixed(2)}€`,
              matchedEncs: allEncs.map(encaissementEnDetail),
            };
          }
        }
      }

      // d) Total de TOUS les chèques du mois (rare mais possible)
      const totalMois = Math.round(allChqEncs.reduce((s, e) => s + (e.montant || 0), 0) * 100) / 100;
      if (totalMois > 0 && Math.abs(totalMois - bl.amount) < 0.02) {
        allChqEncs.forEach(e => usedEncIds.add(e.id));
        return { ...bl, matched: true, matchType: "Chèques", matchDetail: `Remise ${allChqEncs.length} chèque(s) du mois = ${totalMois.toFixed(2)}€`, matchedEncs: allChqEncs.map(encaissementEnDetail) };
      }
    }

    // ── 5. Espèces ────────────────────────────────────────────────────
    if (label.includes("ESP") || label.includes("VERSEMENT")) {

      // a0) PRIORITÉ : chercher un bordereau de remise espèces qui correspond
      const remiseEspMatch = (remises || []).find((r: any) => {
        if (usedRemiseIds.has(r.id)) return false;
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
        usedRemiseIds.add(remiseEspMatch.id);
        const encIds = remiseEspMatch.encaissementIds || [];
        encIds.forEach((id: string) => usedEncIds.add(id));
        const remiseEncs = encaissementsCompta.filter(e => encIds.includes(e.id));
        const dayLabel = remiseEspMatch.date?.seconds
          ? new Date(remiseEspMatch.date.seconds * 1000).toLocaleDateString("fr-FR")
          : "?";
        return {
          ...bl, matched: true, matchType: "Espèces",
          matchDetail: `Bordereau du ${dayLabel} — ${remiseEspMatch.nbPaiements || encIds.length} enc. espèces = ${(remiseEspMatch.total || 0).toFixed(2)}€`,
          matchedEncs: remiseEncs.map(encaissementEnDetail),
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
          dayData.encs.forEach(e => usedEncIds.add(e.id));
          return { ...bl, matched: true, matchType: "Espèces", matchDetail: `Dépôt espèces du ${dayLabel} = ${dayTotal.toFixed(2)}€`, matchedEncs: dayData.encs.map(encaissementEnDetail) };
        }
      }
    }

    // ── 6. Montant exact toutes modes ─────────────────────────────────
    // Dernier recours : trouver un encaissement de même montant dans la fenêtre.
    // EXCLUSION : pour les virements (VIR / SEPA / PRLV), ce fallback est DÉSACTIVÉ.
    // Raison : un virement doit matcher par nom dans le libellé (bloc 3.b). Sans nom
    // qui colle, il vaut mieux laisser non-matché pour éviter les faux positifs
    // (ex : "VIR DE MME ROPIQUET 30€" faussement attribué à un encaissement
    // cb_terminal "Nicolas Richard — animation" de 30€ d'un autre jour).
    // IMPORTANT : même quand on l'accepte, on marque uncertain=true car ce match
    // ne repose que sur le montant, sans confirmation par le nom. Badge ⚠️ visible.
    const isVirementLabel = label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV");
    if (!isVirementLabel) {
      const exactMatch = periodEnc.filter(inWindow).find(e =>
        Math.abs((e.montant || 0) - bl.amount) < 0.02
      );
      if (exactMatch) {
        usedEncIds.add(exactMatch.id);
        return {
          ...bl, matched: true, matchType: "Montant exact",
          matchDetail: `${exactMatch.familyName} — ${exactMatch.activityTitle || ""}`,
          matchedEncs: [encaissementEnDetail(exactMatch)],
          uncertain: true, // match fragile : à vérifier
        };
      }
    }

    // ── DEBUG : ligne non rapprochée → on log pour diagnostic ────────
    // Pourquoi n'a-t-elle pas matché ? On affiche les encaissements du mois
    // qui auraient pu correspondre (même montant, ±5€), leur date, leur mode.
    const periodEncAll = encaissementsCompta.filter(e => {
      const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
      if (!d) return false;
      const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return pm === period;
    });
    const candidatsMontantProche = periodEncAll.filter(e =>
      Math.abs((e.montant || 0) - bl.amount) < 5
    ).map(e => ({
      date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "?",
      mode: e.mode,
      montant: (e.montant || 0).toFixed(2),
      famille: e.familyName || "?",
      id: e.id,
      utilisé: usedEncIds.has(e.id) ? "✅ déjà matché" : "❌ libre",
    }));
    const totalEspecesMois = Math.round(periodEncAll.filter(e => e.mode === "especes").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;
    const totalChequesMois = Math.round(periodEncAll.filter(e => e.mode === "cheque").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;
    const totalCBTerminalMois = Math.round(periodEncAll.filter(e => e.mode === "cb_terminal").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;
    const totalCBOnlineMois = Math.round(periodEncAll.filter(e => e.mode === "cb_online" || e.mode === "cb_cawl").reduce((s,e) => s + (e.montant||0), 0) * 100) / 100;

    // Totaux journaliers par mode pour détecter un jour proche du montant bancaire
    const groupByDayMode = (mode: string | string[]) => {
      const modes = Array.isArray(mode) ? mode : [mode];
      const byDay: Record<string, { total: number; count: number; encs: any[] }> = {};
      for (const e of periodEncAll) {
        if (!modes.includes(e.mode)) continue;
        const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
        if (!d) continue;
        const dayKey = d.toLocaleDateString("fr-FR");
        if (!byDay[dayKey]) byDay[dayKey] = { total: 0, count: 0, encs: [] };
        byDay[dayKey].total += (e.montant || 0);
        byDay[dayKey].count++;
        byDay[dayKey].encs.push(e);
      }
      // Format : { "17/04/2026": "281.00€ (3 tx)", écart: "0.50€" }
      return Object.entries(byDay)
        .sort(([a],[b]) => {
          const pa = a.split("/").reverse().join("-");
          const pb = b.split("/").reverse().join("-");
          return pa.localeCompare(pb);
        })
        .map(([day, d]) => ({
          jour: day,
          total: d.total.toFixed(2) + "€",
          nb: d.count,
          écart_vs_banque: (d.total - bl.amount).toFixed(2) + "€",
          usedIds: d.encs.filter(e => usedEncIds.has(e.id)).length,
        }));
    };

    // Détection du type de ligne bancaire (CB, chèque, espèces, virement)
    const blType = label.includes("REMISE") && (label.includes("CARTE") || label.includes("CB") || label.includes("TPE")) ? "CB_TERMINAL"
      : label.includes("CHQ") || label.includes("CHEQUE") ? "CHEQUE"
      : label.includes("ESP") || label.includes("VERSEMENT") ? "ESPECES"
      : label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV") ? "VIREMENT"
      : "INCONNU";

    // Log à plat (format texte) pour faciliter la lecture/copie sans avoir à dérouler
    const lines: string[] = [];
    lines.push(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🔍 NON RAPPROCHÉE : "${bl.label}"`);
    lines.push(`   Montant : ${bl.amount.toFixed(2)}€ | Date banque : ${bl.date} | Type détecté : ${blType}`);
    lines.push(`   Totaux ${period} : espèces=${totalEspecesMois.toFixed(2)}€ | chèques=${totalChequesMois.toFixed(2)}€ | cb_terminal=${totalCBTerminalMois.toFixed(2)}€ | cb_online=${totalCBOnlineMois.toFixed(2)}€`);

    if (blType === "CB_TERMINAL") {
      const days = groupByDayMode("cb_terminal");
      lines.push(`   CB terminal par jour :`);
      if (days.length === 0) lines.push(`      (aucun encaissement CB terminal sur ${period})`);
      for (const d of days) {
        lines.push(`      → ${d.jour} : ${d.total} (${d.nb} tx) | écart vs banque : ${d.écart_vs_banque} | ${d.usedIds} déjà consommé(s)`);
      }
    }
    if (blType === "CHEQUE") {
      const days = groupByDayMode("cheque");
      lines.push(`   Chèques par jour :`);
      if (days.length === 0) lines.push(`      (aucun chèque enregistré sur ${period})`);
      for (const d of days) {
        lines.push(`      → ${d.jour} : ${d.total} (${d.nb} chèque(s)) | écart vs banque : ${d.écart_vs_banque} | ${d.usedIds} déjà consommé(s)`);
      }
    }
    if (blType === "ESPECES") {
      const days = groupByDayMode("especes");
      lines.push(`   Espèces par jour :`);
      if (days.length === 0) lines.push(`      (aucun encaissement espèces sur ${period})`);
      for (const d of days) {
        lines.push(`      → ${d.jour} : ${d.total} (${d.nb} tx) | écart vs banque : ${d.écart_vs_banque} | ${d.usedIds} déjà consommé(s)`);
      }
    }
    if (blType === "VIREMENT") {
      const vEncs = periodEncAll.filter(e => (e.mode === "virement" || e.mode === "sepa" || e.mode === "prelevement_sepa") && Math.abs((e.montant||0) - bl.amount) < 10);
      lines.push(`   Virements enc. proches (±10€) :`);
      if (vEncs.length === 0) lines.push(`      (aucun encaissement virement proche de ${bl.amount.toFixed(2)}€)`);
      for (const e of vEncs) {
        const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "?";
        lines.push(`      → ${d} : ${(e.montant||0).toFixed(2)}€ | ${e.familyName || "?"}`);
      }
    }

    if (candidatsMontantProche.length > 0) {
      lines.push(`   Candidats ±5€ (tous modes) :`);
      for (const c of candidatsMontantProche.slice(0, 5)) {
        lines.push(`      → ${c.date} | ${c.mode} | ${c.montant}€ | ${c.famille} | ${c.utilisé}`);
      }
    } else {
      lines.push(`   ❌ Aucun encaissement ±5€ dans la base → il manque probablement des saisies`);
    }

    console.log(lines.join("\n"));

    return bl;
  });

  // ─────────────────────────────────────────────────────────────────────
  //  Bug #2 : Fusion avec les matchs manuels existants
  // ─────────────────────────────────────────────────────────────────────
  // Si une ligne identique (même date + libellé + montant) existait déjà
  // dans le rapprochement avec un pointage MANUEL ou IGNORÉ, on conserve
  // ce pointage pour ne pas le perdre au re-import.
  const previousBankLines = bankLines;
  const previousManualByKey = new Map<string, any>();
  for (const prev of previousBankLines) {
    if (prev.matchType === "Manuel" || prev.matchType === "Ignoré") {
      previousManualByKey.set(cleLigneBancaire(prev), prev);
    }
  }

  const finalMatched = matched.map((bl: any) => {
    const prev = previousManualByKey.get(cleLigneBancaire(bl));
    if (prev) {
      // On garde le pointage manuel existant plutôt que l'auto-match
      return {
        ...bl,
        matched: prev.matched,
        matchType: prev.matchType,
        matchDetail: prev.matchDetail,
        matchedEncs: prev.matchedEncs || bl.matchedEncs,
        manualPaymentId: prev.manualPaymentId,
      };
    }
    return bl;
  });

  // ─────────────────────────────────────────────────────────────────────
  //  Avertissement : lignes auto-rapprochées que ce nouvel import recalcule.
  //  Les pointages faits à la main ne sont jamais dans ce compte.
  // ─────────────────────────────────────────────────────────────────────
  const autoOverwritten = previousBankLines.filter((p) =>
    p.matchType !== "Manuel" && p.matchType !== "Ignoré" &&
    finalMatched.some((m: any) => cleLigneBancaire(m) === cleLigneBancaire(p)),
  ).length;

  return {
    finalMatched: finalMatched as LigneBancaire[],
    autoOverwritten,
    manuelsPreserves: previousManualByKey.size,
    usedEncIds,
    usedRemiseSepaIds,
    usedPaymentIds,
    usedRemiseIds,
  };
}
