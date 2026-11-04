/**
 * src/lib/remise-sepa-controle.ts — une remise de prélèvements SEPA, échéance
 * par échéance, face au journal des encaissements.
 *
 * Octobre 2026 : la banque crédite 3 806,15 € le 28/10, la remise de
 * l'application dit aussi 3 806,15 €, mais le FEC n'a que 3 440,55 € le 27/10.
 * Le contrôle de banque voyait l'écart sans dire QUELLES échéances
 * manquaient. Ce module le dit : échéance sans encaissement, encaissement
 * annulé, encaissé un autre mois ou un autre jour, montant différent.
 *
 * Rappel du circuit (admin/sepa, markDeposited) : déposer une remise crée un
 * encaissement par échéance, au jour du dépôt, sauf si l'échéance en a déjà un
 * (`sepaEcheanceId`). Un prélèvement rejeté reste dans la remise créditée par
 * la banque : son annulation (« Rejet bancaire ») passe au compte de liaison,
 * pas au 512 (lib/rejet-prelevement). Il compte donc comme présent ici.
 *
 * Sans import, testé (tests/unit/remise-sepa-controle.test.ts).
 */

export interface EcheanceDeRemise {
  id: string;
  familyName?: string;
  montant: number;
  status?: string;
}

export interface EncaissementSepa {
  id: string;
  sepaEcheanceId?: string | null;
  montant: number;
  /** AAAA-MM-JJ, heure de Paris. */
  dateIso: string;
  correctionDe?: string | null;
  raison?: string | null;
}

export type EtatEcheanceRemise = "ok" | "autre-jour" | "autre-mois" | "annule" | "sans-encaissement" | "montant";

export interface LigneRemiseSepa {
  echeanceId: string;
  famille: string;
  montant: number;
  etat: EtatEcheanceRemise;
  /** Ce qui manque au FEC du mois pour cette échéance (0 si rien). */
  manque: number;
  detail: string;
}

export interface DetailRemiseSepa {
  /** Total des échéances de la remise. */
  total: number;
  /** Ce que le FEC du mois porte pour ces échéances. */
  auFec: number;
  /** Total − auFec. */
  manque: number;
  /** Jour où le FEC porte l'essentiel de la remise. */
  jourRemise: string | null;
  /** Échéances qui posent question (les « ok » ne sont pas listées). */
  lignes: LigneRemiseSepa[];
  /** Nombre d'échéances sans rien à signaler. */
  ok: number;
}

const ct = (n: number) => Math.round((Number(n) || 0) * 100);
const eur = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
const fr = (iso: string) => String(iso || "").split("-").reverse().join("/");
const estRejet = (e: EncaissementSepa) => /rejet bancaire/i.test(String(e.raison || ""));

export function detailRemiseSepa(p: {
  echeances: EcheanceDeRemise[];
  encaissements: EncaissementSepa[];
  /** AAAA-MM du FEC contrôlé. */
  mois: string;
  /** Jour où le FEC porte la remise (date des encaissements du dépôt), AAAA-MM-JJ. */
  jourRemise?: string;
}): DetailRemiseSepa {
  const contrePassees = new Map<string, EncaissementSepa>();
  for (const e of p.encaissements) if (e.correctionDe && ct(e.montant) < 0) contrePassees.set(e.correctionDe, e);

  // Jour de la remise au FEC : celui que donne le plus d'encaissements du dépôt.
  const ids = new Set(p.echeances.map((e) => e.id));
  const parJour = new Map<string, number>();
  for (const e of p.encaissements) if (e.sepaEcheanceId && ids.has(e.sepaEcheanceId) && ct(e.montant) > 0 && e.dateIso.startsWith(p.mois)) parJour.set(e.dateIso, (parJour.get(e.dateIso) || 0) + 1);
  const jourRemise = p.jourRemise || [...parJour].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

  let total = 0, auFec = 0, ok = 0;
  const lignes: LigneRemiseSepa[] = [];
  for (const ech of p.echeances) {
    const attendu = ct(ech.montant);
    total += attendu;
    const famille = ech.familyName || "Famille ?";
    const siens = p.encaissements.filter((e) => e.sepaEcheanceId === ech.id && ct(e.montant) > 0);
    // Un encaissement annulé pour rejet bancaire reste dans la remise créditée.
    const actifs = siens.filter((e) => { const cp = contrePassees.get(e.id); return !cp || estRejet(cp); });
    const ligne = (etat: EtatEcheanceRemise, manque: number, detail: string) => lignes.push({ echeanceId: ech.id, famille, montant: attendu / 100, etat, manque: manque / 100, detail });

    if (!actifs.length) {
      if (siens.length) {
        const cp = contrePassees.get(siens[0].id);
        ligne("annule", attendu, `encaissement du ${fr(siens[0].dateIso)} annulé le ${fr(cp?.dateIso || "")}${cp?.raison ? ` (« ${cp.raison} »)` : ""}, sans nouvel encaissement`);
      } else {
        ligne("sans-encaissement", attendu, "prélevée par la banque, aucun encaissement au journal");
      }
      continue;
    }
    const duMois = actifs.filter((e) => e.dateIso.startsWith(p.mois));
    if (!duMois.length) {
      ligne("autre-mois", attendu, `encaissée le ${fr(actifs[0].dateIso)} : au FEC de ce mois-là, pas de celui-ci`);
      continue;
    }
    const recu = duMois.reduce((s, e) => s + ct(e.montant), 0);
    auFec += Math.min(recu, attendu);
    if (recu !== attendu) {
      ligne("montant", Math.max(attendu - recu, 0), `${eur(recu)} encaissé${duMois.length > 1 ? `s en ${duMois.length} fois` : ""} pour une échéance de ${eur(attendu)}`);
      continue;
    }
    if (jourRemise && duMois.some((e) => e.dateIso !== jourRemise)) {
      ligne("autre-jour", 0, `encaissée le ${fr(duMois[0].dateIso)}, pas le jour de la remise (${fr(jourRemise)}) : présente au FEC, rapprochée à part`);
      continue;
    }
    ok++;
  }
  return { total: total / 100, auFec: auFec / 100, manque: (total - auFec) / 100, jourRemise: jourRemise || null, lignes, ok };
}

/** La remise de l'application qui correspond à un crédit du relevé : même montant, prélèvement à 7 jours au plus. */
export function remisePourCredit<R extends { montantTotal?: number; datePrelevement?: string; dateRemise?: string }>(remises: R[], credit: { montant: number; date: string }): R | null {
  const jours = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
  const candidates = remises.filter((r) => ct(r.montantTotal ?? 0) === ct(credit.montant));
  const date = (r: R) => String(r.datePrelevement || r.dateRemise || "").slice(0, 10);
  const proches = candidates.filter((r) => date(r) && jours(date(r), credit.date) <= 7)
    .sort((a, b) => jours(date(a), credit.date) - jours(date(b), credit.date));
  return proches[0] || null;
}
