import type { BankLine, MatchContext, MatchResult } from "../types";
import { parseBankDate, encToDetail, makeInWindow, getPeriodEncs } from "../engine";

/**
 * Règle 3 — Virement / SEPA / Prélèvement (extrait depuis page.tsx:870-1000).
 *
 * Comportement (figé par les tests, ne PAS modifier dans ce refactor) :
 * 1. Trigger label : contient "VIR" || "SEPA" || "PRLV". Sinon return null.
 * 2. Sous-bloc a : remise SEPA groupée — match par montantTotal sur ctx.remisesSepa, fenêtre 7j ou même période. Mute usedRemiseSepaIds.
 * 3. Sous-bloc b.1 : encaissements virement par nom dans le libellé + montant — fenêtre ±3j prioritaire, sinon sans fenêtre. Mute usedEncIds.
 * 4. Sous-bloc b.2 : paiements pending/partial par nom + montant. Si 1 seul candidat par nom : match même si montant approximatif (avec warning ⚠️). Mute usedPaymentIds.
 * 5. Sous-bloc c : si pas de match par nom, encaissement par montant exact unique dans la fenêtre → uncertain=true. Mute usedEncIds.
 * 6. Sous-bloc d : si pas de match par nom, paiement pending par montant exact unique → uncertain=true. Mute usedPaymentIds.
 *
 * Premier sous-bloc qui match gagne. Aucun → return null.
 */

/** Vérifie si une partie significative (>2 chars) du nom de famille apparaît dans le libellé. */
const nameMatchesLabel = (familyName: string | undefined, label: string): boolean => {
  if (!familyName) return false;
  const parts = familyName.toUpperCase().split(/\s+/).filter(n => n.length > 2);
  return parts.some(p => label.includes(p));
};

export function matchVirement(bl: BankLine, ctx: MatchContext): MatchResult {
  const label = bl.label.toUpperCase();
  const bankDate = parseBankDate(bl.date);
  const { remisesSepa, payments, period, usedEncIds, usedRemiseSepaIds, usedPaymentIds } = ctx;

  // Encaissements de la période, avec leur date
  // On EXCLUT les encaissements déjà consommés par une autre bankLine
  const periodEnc = getPeriodEncs(ctx);

  // Fenêtre de ±3 jours autour de la date bancaire
  const inWindow = makeInWindow(bankDate);

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
        return { matchType: "Prélèvement SEPA", matchDetail: `Remise SEPA n°${remiseMatch.numero} — ${remiseMatch.nbTransactions} prélèvements` };
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
    const encNameMatches = virEncs.filter(e => nameMatchesLabel(e.familyName, label));
    // Nom + montant exact + fenêtre → idéal
    const encNameAmountInWindow = encNameMatches.find(e => inWindow(e) && Math.abs((e.montant || 0) - bl.amount) < 0.02);
    if (encNameAmountInWindow) {
      usedEncIds.add(encNameAmountInWindow.id);
      return { matchType: "Virement", matchDetail: `Virement ${encNameAmountInWindow.familyName}`, matchedEncs: [encToDetail(encNameAmountInWindow)] };
    }
    // Nom + montant exact (même hors fenêtre, jusqu'à 15j)
    const encNameAmount = encNameMatches.find(e => Math.abs((e.montant || 0) - bl.amount) < 0.02);
    if (encNameAmount) {
      usedEncIds.add(encNameAmount.id);
      return { matchType: "Virement", matchDetail: `Virement ${encNameAmount.familyName}`, matchedEncs: [encToDetail(encNameAmount)] };
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
    const paymentNameMatches = virPayments.filter(p => nameMatchesLabel(p.familyName, label));
    // Nom + montant exact
    const paymentNameAmount = paymentNameMatches.find(p => Math.abs((p.totalTTC || 0) - bl.amount) < 0.02);
    if (paymentNameAmount) {
      usedPaymentIds.add(paymentNameAmount.id);
      return {
        matchType: "Virement",
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
        matchType: "Virement",
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
        matchType: "Virement",
        matchDetail: `Virement ${match.familyName} (montant seul)`,
        matchedEncs: [encToDetail(match)],
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
        matchType: "Virement",
        matchDetail: `Virement ${p.familyName} (montant seul)`,
        manualPaymentId: p.id,
        uncertain: true, // nom absent du libellé → à vérifier
      };
    }
  }

  return null;
}
