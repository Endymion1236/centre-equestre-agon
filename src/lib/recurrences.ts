/**
 * src/lib/recurrences.ts
 *
 * L'historique de facturation d'une récurrence, confronté à la réalité.
 *
 * Une récurrence garde dans `facturesGenerees` la trace des paiements qu'elle
 * a créés, mois par mois. Cette trace servait à deux choses à la fois : dire
 * combien de factures ont été émises, et interdire de facturer deux fois le
 * même mois. Or elle survit à la disparition du paiement qu'elle désigne — une
 * réinitialisation des données financières efface la collection `payments` et
 * laisse la récurrence intacte.
 *
 * La récurrence annonçait alors « 1 facture générée » sans qu'aucune facture
 * n'existe, et, plus grave, refusait de refacturer ce mois-là : ni le cron ni
 * la modale ne pouvaient rattraper le mois perdu. Le mois restait impayé sans
 * que rien ne le réclame.
 *
 * D'où la règle tenue ici : une facture n'est générée que si son paiement
 * existe encore. Une trace dont le paiement a disparu est orpheline — elle ne
 * compte pas, et elle ne bloque rien.
 */

export interface TraceFacture {
  mois: string;         // "2026-09"
  paymentId: string;
  generatedAt?: unknown;
}

export interface HistoriqueRecurrence {
  /** Traces dont le paiement existe encore : les vraies factures. */
  vivantes: TraceFacture[];
  /** Traces dont le paiement a disparu : à ne plus croire. */
  orphelines: TraceFacture[];
}

/**
 * Trie les traces d'une récurrence selon que leur paiement existe encore.
 * `paiementsExistants` est l'ensemble des identifiants de paiements lus en base.
 */
export function historiqueRecurrence(
  traces: TraceFacture[] | undefined | null,
  paiementsExistants: Set<string>,
): HistoriqueRecurrence {
  const vivantes: TraceFacture[] = [];
  const orphelines: TraceFacture[] = [];
  for (const t of traces || []) {
    if (!t || !t.mois) continue;
    if (t.paymentId && paiementsExistants.has(t.paymentId)) vivantes.push(t);
    else orphelines.push(t);
  }
  return { vivantes, orphelines };
}

/**
 * Ce mois est-il réellement facturé ? Garde-fou de l'idempotence.
 *
 * Vrai seulement si une trace de ce mois désigne un paiement qui existe. Une
 * trace orpheline laisse le mois à facturer : c'est ce qui permet de rattraper
 * un mois perdu par une réinitialisation.
 */
export function moisDejaFacture(
  traces: TraceFacture[] | undefined | null,
  moisKey: string,
  paiementsExistants: Set<string>,
): boolean {
  return (traces || []).some(
    (t) => t && t.mois === moisKey && !!t.paymentId && paiementsExistants.has(t.paymentId),
  );
}

/**
 * L'historique débarrassé de ses traces orphelines, prêt à être réécrit.
 * Renvoie `null` quand il n'y a rien à nettoyer, pour éviter une écriture inutile.
 */
export function historiqueNettoye(
  traces: TraceFacture[] | undefined | null,
  paiementsExistants: Set<string>,
): TraceFacture[] | null {
  const { vivantes, orphelines } = historiqueRecurrence(traces, paiementsExistants);
  if (orphelines.length === 0) return null;
  return vivantes;
}
