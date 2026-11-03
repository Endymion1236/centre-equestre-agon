/**
 * src/lib/virements-releve-famille.ts — les virements d'une famille, relevé
 * contre journal.
 *
 * Novembre 2026, GAGNARD : trois échéances réglées « par virement », trois
 * factures, et Nicolas pas sûr qu'il y ait eu trois virements. La réponse
 * était dans les relevés importés (rapprochements/{mois}) : un seul
 * virement, encaissé trois fois. Diagnostic famille fait désormais la
 * comparaison : chaque virement du relevé au nom de la famille, avec les
 * écritures qu'il a réglées, et chaque écriture de virement du journal qui
 * ne correspond à aucun virement reçu.
 *
 * Module sans import, testé (tests/unit/virements-releve-famille.test.ts).
 */

/** Une ligne au crédit du relevé, date déjà ramenée en AAAA-MM-JJ. */
export interface LigneReleve {
  dateIso: string;
  date: string;
  label: string;
  amount: number;
  cle: string;
}

/** Une écriture du journal (encaissement). */
export interface EcritureJournal {
  id: string;
  paymentId?: string | null;
  invoiceNumber?: string | null;
  mode?: string | null;
  montant: number;
  dateIso: string | null;
  bankLineKey?: string | null;
  correctionDe?: string | null;
  ref?: string | null;
}

export interface VirementCompare {
  ligne: LigneReleve;
  /** Écritures réglées par ce virement (par sa clé, sinon par montant et date). */
  ecritures: EcritureJournal[];
  /** Écritures en trop : un virement ne règle qu'une fois son montant. */
  enTrop: number;
}

export interface ComparaisonVirements {
  virements: VirementCompare[];
  /** Écritures de virement sans virement correspondant dans les relevés importés. */
  sansVirement: EcritureSansVirement[];
}

/**
 * Une écriture de virement qu'aucun virement reçu n'explique, avec ce qui
 * aide à trancher (BARBEY, 11/2026 : deux écritures de 80 € au 12/10 pour un
 * seul virement ce jour-là, et un virement du 03/11 encaissé nulle part).
 */
export interface EcritureSansVirement extends EcritureJournal {
  moisImporte: boolean;
  /** Un virement du même montant, à 15 jours près, déjà rattaché à une autre écriture : doublon probable. */
  virementDejaPris: { date: string; ecritures: EcritureJournal[] } | null;
  /** Un virement du même montant, à 60 jours près, rattaché à rien : peut-être celui-ci, saisi à une autre date. */
  virementLibre: { date: string } | null;
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * Les mots du nom de famille à chercher dans les libellés bancaires : les
 * mots écrits en majuscules dans le nom du parent (convention « NOM Prénom »)
 * et les noms des enfants ; à défaut de majuscules, tous les mots. Trois
 * lettres au moins, pour ne pas reconnaître « LE » ou « DE ».
 */
export function motsDuNom(parentNames: (string | null | undefined)[], nomsEnfants: (string | null | undefined)[] = []): string[] {
  const mots = new Set<string>();
  for (const nom of parentNames) {
    const brut = String(nom || "").split(/[\s,/-]+/).filter((m) => m.length >= 3);
    const enMajuscules = brut.filter((m) => m === m.toUpperCase() && /[A-Z]/i.test(m));
    for (const m of (enMajuscules.length ? enMajuscules : brut)) mots.add(sansAccents(m));
  }
  for (const nom of nomsEnfants) {
    for (const m of String(nom || "").split(/[\s,/-]+/)) {
      if (m.length >= 3 && m === m.toUpperCase() && /[A-Z]/i.test(m)) mots.add(sansAccents(m));
    }
  }
  return [...mots];
}

/** Le libellé contient-il l'un des mots, en mot entier ? */
export function libelleDeLaFamille(label: string, mots: string[]): boolean {
  const l = ` ${sansAccents(label).replace(/[^A-Z0-9]+/g, " ")} `;
  return mots.some((m) => l.includes(` ${m.replace(/[^A-Z0-9]+/g, " ")} `));
}

const jours = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

/**
 * Compare les virements reçus (lignes du relevé de la famille) aux écritures
 * de virement de la famille. Une écriture va d'abord à la ligne dont elle
 * porte la clé ; sinon à une ligne du même montant à 15 jours près qui n'a
 * encore rien réglé. Les écritures contre-passées sont ignorées.
 */
export function comparerVirements(
  lignes: LigneReleve[],
  ecritures: EcritureJournal[],
  moisImportes: string[],
): ComparaisonVirements {
  const annulees = new Set(ecritures.map((e) => e.correctionDe).filter(Boolean) as string[]);
  const actives = ecritures
    .filter((e) => e.mode === "virement" && e.montant > 0 && !e.correctionDe && !annulees.has(e.id))
    .sort((a, b) => String(a.dateIso || "").localeCompare(String(b.dateIso || "")) || a.id.localeCompare(b.id));
  const triees = [...lignes].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  const parLigne = new Map<string, EcritureJournal[]>(triees.map((l) => [l.cle, []]));

  const restantes: EcritureJournal[] = [];
  for (const e of actives) {
    if (e.bankLineKey && parLigne.has(e.bankLineKey)) parLigne.get(e.bankLineKey)!.push(e);
    else restantes.push(e);
  }
  const orphelines: EcritureJournal[] = [];
  for (const e of restantes) {
    const ligne = triees.find((l) => parLigne.get(l.cle)!.length === 0
      && Math.abs(l.amount - e.montant) < 0.01
      && !!e.dateIso && jours(l.dateIso, e.dateIso.slice(0, 10)) <= 15);
    if (ligne) parLigne.get(ligne.cle)!.push(e);
    else orphelines.push(e);
  }
  // Ce qui aide à trancher, une fois toutes les écritures placées.
  const memeMontant = (l: LigneReleve, e: EcritureJournal, max: number) =>
    Math.abs(l.amount - e.montant) < 0.01 && !!e.dateIso && jours(l.dateIso, e.dateIso.slice(0, 10)) <= max;
  const sansVirement: EcritureSansVirement[] = orphelines.map((e) => {
    const prise = triees.find((l) => memeMontant(l, e, 15) && parLigne.get(l.cle)!.length > 0);
    const libre = triees.find((l) => memeMontant(l, e, 60) && parLigne.get(l.cle)!.length === 0);
    return {
      ...e,
      moisImporte: !!e.dateIso && moisImportes.includes(e.dateIso.slice(0, 7)),
      virementDejaPris: prise ? { date: prise.date, ecritures: parLigne.get(prise.cle)! } : null,
      virementLibre: libre ? { date: libre.date } : null,
    };
  });

  return {
    virements: triees.map((ligne) => {
      const l = parLigne.get(ligne.cle)!;
      const regle = l.reduce((s, e) => s + Math.round(e.montant * 100), 0);
      // Un virement de 209,70 € peut régler trois échéances de 69,90 € : on
      // ne compte « en trop » que ce qui dépasse le montant reçu.
      let enTrop = 0;
      if (regle > Math.round(ligne.amount * 100) + 1) {
        let cumul = 0;
        for (const e of l) { cumul += Math.round(e.montant * 100); if (cumul > Math.round(ligne.amount * 100) + 1) enTrop++; }
      }
      return { ligne, ecritures: l, enTrop };
    }),
    sansVirement,
  };
}
