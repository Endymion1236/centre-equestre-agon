"use client";

/**
 * src/app/admin/comptabilite/detail-ca.ts
 *
 * Lecture du « détail d'une remise carte » copié-collé depuis le site du
 * Crédit Agricole, et rapprochement transaction par transaction.
 *
 * Pourquoi ce chemin manuel existe : le rapprochement automatique des remises
 * CB par sous-ensembles a été désactivé (option retenue par Nicolas le 28/04
 * après le cas des 495 € attribués à la mauvaise remise). Les encaissements
 * enregistrés dans l'application ne portent pas l'HEURE de la transaction ; on
 * ne peut donc pas distinguer deux CB de même montant le même jour, et
 * l'algorithme « mélangeait » les transactions entre remises. Le détail copié
 * depuis la banque, lui, fait foi.
 *
 * ⚠️ Le parsing est plus retors qu'il n'y paraît : le site du CA affiche
 * date, heure, montant, n° de carte et n° de ticket collés les uns aux autres.
 * Une regex gloutonne lit « 09 175,00 » (heure + montant) comme 9 175 €. D'où
 * l'ancrage systématique sur le motif horaire HH:MM[:SS] qui précède TOUJOURS
 * le montant.
 */

import type { BankLine, CaDetailPreview } from "./types";

/**
 * Extrait les montants d'un détail de remise collé depuis le site du CA.
 *
 * Deux passes : la première s'ancre sur l'heure (fiable dans tous les cas),
 * la seconde, ligne par ligne, sert de secours quand l'admin n'a copié que la
 * colonne des montants. Bornes de sécurité : 0,01 € à 50 000 €, et on saute
 * les lignes de total/récapitulatif.
 */
export function parseCaText(text: string): number[] {
  const amounts: number[] = [];

  // PASSE 1 : ancrage HH:MM:SS (la plus fiable, marche dans tous les cas)
  //   Matches : "17:02:34 95,00 EUR", "09:59:09175,00 EUR", "10:00145,00 EUR", etc.
  const anchored = /\d{2}:\d{2}(?::\d{2})?\s*(\d{1,6})[,.](\d{2})\s*(?:EUR|€)/gi;
  let m;
  while ((m = anchored.exec(text)) !== null) {
    const val = parseFloat(`${m[1]}.${m[2]}`);
    if (!isNaN(val) && val > 0 && val < 50000) amounts.push(val);
  }
  if (amounts.length > 0) return amounts;

  // PASSE 2 (fallback) : ligne par ligne, regex stricte avec bord de ligne
  //   Cas où l'utilisateur copie juste les montants sans les heures
  const lines = text.split(/[\r\n]+/);
  const single = /(?:^|[\s\u00A0\t])(\d{1,3}(?:[\s\u00A0]\d{3})*|\d{1,6})[,.](\d{2})\s*(?:EUR|€)/i;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("total") || lower.includes("somme") || lower.includes("récap") || lower.includes("recap")) continue;
    const mm = line.match(single);
    if (!mm) continue;
    const intPart = mm[1].replace(/[\s\u00A0]/g, "");
    const val = parseFloat(`${intPart}.${mm[2]}`);
    if (!isNaN(val) && val > 0 && val < 50000) amounts.push(val);
  }
  return amounts;
}

/**
 * Relie les montants collés aux encaissements CB terminal réellement
 * enregistrés, et retourne l'aperçu affiché dans la modale.
 *
 * Retourne `null` quand rien n'a pu être extrait du texte.
 *
 * ANTI-FUITE : on exclut du vivier les encaissements déjà revendiqués par une
 * AUTRE ligne bancaire. Sans ça, valider le détail du 24/04 puis celui du
 * 25/04 réinjectait les mêmes encaissements dans les deux rapprochements, et
 * le compteur « Encaissements à remettre » ne retombait jamais juste.
 *
 * @param indexCourant index de la ligne bancaire en cours de traitement — la
 *   seule qu'on n'oppose pas à elle-même dans le décompte des triplets.
 */
export function chercherCorrespondancesDetailCa(params: {
  text: string;
  bl: BankLine;
  bankLines: BankLine[];
  indexCourant: number;
  encaissementsCompta: any[];
}): CaDetailPreview | null {
  const { text, bl, bankLines, indexCourant, encaissementsCompta } = params;
  const amounts = parseCaText(text);
  if (amounts.length === 0) return null;

  // Date bancaire (pour la fenêtre)
  const bankDateParsed = (() => {
    const p1 = bl.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (p1) return new Date(`${p1[3]}-${p1[2].padStart(2,"0")}-${p1[1].padStart(2,"0")}`);
    return null;
  })();

  // ───────────────────────────────────────────────────────────────────
  // Anti-fuite : construire un compteur des triplets (famille|montant|date)
  // déjà revendiqués par d'AUTRES bankLines matchées. On exclut ensuite
  // de cbPool les encs dont le triplet est déjà "consommé" autant de fois
  // qu'il apparaît ailleurs.
  //
  // Sans ça, valider Détail CA sur la bankLine du 24/04 puis sur celle
  // du 25/04 pouvait réinjecter les mêmes encs dans les 2 matchedEncs,
  // créant des références fantômes qui pourrissent le compteur
  // "Encaissements à remettre".
  // ───────────────────────────────────────────────────────────────────
  const triplet = (e: any) => {
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "";
    return `${e.familyName || ""}|${(e.montant || 0).toFixed(2)}|${d}`;
  };
  const claimedTripletCount = new Map<string, number>();
  for (let blIdx = 0; blIdx < bankLines.length; blIdx++) {
    if (blIdx === indexCourant) continue; // on ignore la bankLine en cours
    const otherBl = bankLines[blIdx];
    if (!otherBl.matched) continue;
    if (otherBl.matchType === "Ignoré") continue;
    for (const enc of (otherBl.matchedEncs || [])) {
      const k = `${enc.familyName || ""}|${(enc.montant || 0).toFixed(2)}|${enc.date || ""}`;
      claimedTripletCount.set(k, (claimedTripletCount.get(k) || 0) + 1);
    }
  }

  // Encaissements CB terminal libres dans la fenêtre ±7j (large pour ne rien rater)
  // On accumule les "consommations" de triplets au fur et à mesure pour
  // exclure correctement les encs en surplus quand il y a des doublons légitimes.
  const tripletConsumed = new Map<string, number>();
  const cbPool = encaissementsCompta.filter(e => {
    if (e.mode !== "cb_terminal") return false;
    if (e.remiseId) return false; // déjà dans une remise
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) return false;
    if (bankDateParsed) {
      const diff = Math.abs(bankDateParsed.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 7) return false;
    }
    // Filtre anti-fuite : ce triplet est-il revendiqué par une autre bankLine ?
    const k = triplet(e);
    const claimed = claimedTripletCount.get(k) || 0;
    const consumed = tripletConsumed.get(k) || 0;
    if (consumed < claimed) {
      tripletConsumed.set(k, consumed + 1);
      return false; // exclu : un autre rapprochement le revendique déjà
    }
    return true;
  });

  // Pour chaque montant, trouve le meilleur candidat (sans réutilisation)
  const used = new Set<string>();
  const found: any[] = [];
  const missing: number[] = [];
  for (const amount of amounts) {
    const candidate = cbPool.find(e => !used.has(e.id) && Math.abs((e.montant || 0) - amount) < 0.02);
    if (candidate) {
      used.add(candidate.id);
      found.push({ ...candidate, _amount: amount });
    } else {
      missing.push(amount);
    }
  }
  const total = amounts.reduce((s, a) => s + a, 0);
  return { found, missing, total };
}
