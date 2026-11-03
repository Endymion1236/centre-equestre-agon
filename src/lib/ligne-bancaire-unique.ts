/**
 * src/lib/ligne-bancaire-unique.ts — une ligne du relevé n'encaisse qu'une fois.
 *
 * Novembre 2026, GAGNARD : un seul virement de 69,90 € (30/09, réf.
 * C08V26273) a été encaissé TROIS fois, sur les échéances 3/10, 2/10 puis
 * 10/10. Les relevés importés se chevauchent d'un mois à l'autre : à chaque
 * import, le rapprochement ne cherchait l'écriture déjà faite que dans le
 * mois affiché, ne la trouvait pas, rattachait la ligne à l'échéance GAGNARD
 * suivante encore due et l'encaissait. L'anti-doublon ne regardait que cette
 * échéance, pas la ligne du relevé.
 *
 * Règle : l'écriture créée par un pointage porte la clé de sa ligne
 * (`bankLineKey`, cleLigneBancaire) ; tant qu'une écriture active porte
 * cette clé, la ligne est déjà encaissée, quel que soit le mois affiché.
 * Une écriture contre-passée (une autre la cite en `correctionDe`) ne compte
 * plus. Module sans import, testé (tests/unit/ligne-bancaire-unique.test.ts).
 */

export interface EcritureAvecLigne {
  id?: string;
  paymentId?: string | null;
  familyName?: string | null;
  montant?: number | null;
  bankLineKey?: string | null;
  correctionDe?: string | null;
  date?: { seconds?: number } | null;
}

/** Écritures annulées par une contre-passation (citées en `correctionDe`). */
export function idsContrePasses(ecritures: EcritureAvecLigne[]): Set<string> {
  return new Set(ecritures.map((e) => e.correctionDe).filter((x): x is string => !!x));
}

/** Les écritures actives (positives, non contre-passées) créées par cette ligne du relevé. */
export function ecrituresDeLaLigne<T extends EcritureAvecLigne>(cle: string, ecritures: T[]): T[] {
  if (!cle) return [];
  const annulees = idsContrePasses(ecritures);
  return ecritures.filter((e) => e.bankLineKey === cle && (Number(e.montant) || 0) > 0 && !e.correctionDe && !(e.id && annulees.has(e.id)));
}

/** La ligne a-t-elle déjà été encaissée ? Renvoie la première écriture qui l'a fait. */
export function ligneDejaEncaissee<T extends EcritureAvecLigne>(cle: string, ecritures: T[]): T | null {
  return ecrituresDeLaLigne(cle, ecritures)[0] || null;
}

/** Une ligne du relevé encaissée sur plusieurs commandes (à corriger). */
export interface LigneEncaisseePlusieursFois<T> {
  cle: string;
  ecritures: T[];
}

/**
 * Lignes du relevé encaissées plus d'une fois — le défaut GAGNARD, pour le
 * retrouver chez d'autres familles. La plus ancienne écriture est la bonne,
 * les suivantes sont en trop (triées par date).
 */
export function lignesEncaisseesPlusieursFois<T extends EcritureAvecLigne>(ecritures: T[]): LigneEncaisseePlusieursFois<T>[] {
  const annulees = idsContrePasses(ecritures);
  const parCle = new Map<string, T[]>();
  for (const e of ecritures) {
    if (!e.bankLineKey || e.correctionDe || (e.id && annulees.has(e.id)) || !((Number(e.montant) || 0) > 0)) continue;
    const l = parCle.get(e.bankLineKey) || [];
    l.push(e);
    parCle.set(e.bankLineKey, l);
  }
  return [...parCle.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([cle, l]) => ({ cle, ecritures: [...l].sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0) || String(a.id).localeCompare(String(b.id))) }));
}
