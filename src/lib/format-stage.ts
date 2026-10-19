/**
 * Génère un libellé descriptif pour un stage multi-jours
 * Ex: "du lun. 14 au ven. 18 avril · 10h00–12h00"
 * ou si horaires variés: "lun. 14 10h00–12h00, mar. 15 14h00–16h00, ..."
 */
export function formatStageSchedule(
  creneaux: { date: string; startTime: string; endTime: string }[]
): string {
  if (!creneaux || creneaux.length === 0) return "";
  const sorted = [...creneaux].sort((a, b) => a.date.localeCompare(b.date));

  const fmt = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  };
  const fmtMonth = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("fr-FR", { month: "long" });
  };

  // Vérifier si tous les horaires sont identiques
  const horairesUniques = [...new Set(sorted.map(c => `${c.startTime}–${c.endTime}`))];
  const allSameHours = horairesUniques.length === 1;

  if (sorted.length === 1) {
    const c = sorted[0];
    return `${fmt(c.date)} ${fmtMonth(c.date)} · ${c.startTime}–${c.endTime}`;
  }

  if (allSameHours) {
    // "du lun. 14 au ven. 18 avril · 10h00–12h00"
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const sameMonth = new Date(first.date).getMonth() === new Date(last.date).getMonth();
    if (sameMonth) {
      return `du ${fmt(first.date)} au ${fmt(last.date)} ${fmtMonth(last.date)} · ${first.startTime}–${first.endTime}`;
    }
    return `du ${fmt(first.date)} ${fmtMonth(first.date)} au ${fmt(last.date)} ${fmtMonth(last.date)} · ${first.startTime}–${first.endTime}`;
  }

  // Horaires variés : détailler chaque jour
  return sorted.map(c => `${fmt(c.date)} ${c.startTime}–${c.endTime}`).join(", ");
}

/**
 * Complète les lignes d'une commande qui n'ont pas de planning lisible
 * (ni `stageSchedule`, ni `stageDates`, ni date à la racine) mais portent
 * leurs créneaux (`creneauIds` ou `creneauId`) : la facture retrouve alors
 * les jours et les horaires depuis les créneaux eux-mêmes.
 *
 * Octobre 2026, COSTEGROSSE : réservation en ligne d'un stage d'un mois que
 * le navigateur n'avait pas chargé — la ligne partait sans planning, et la
 * facture n'affichait ni dates ni horaires.
 */
export function completerHorairesLignes<T extends Record<string, any>>(
  items: T[],
  creneauxParId: Map<string, { date: string; startTime: string; endTime: string }>,
): T[] {
  return (items || []).map((item) => {
    if (!item || item.sousTitre || item.stageSchedule || (Array.isArray(item.stageDates) && item.stageDates.length > 0) || (item.date && item.startTime)) {
      return item;
    }
    const ids: string[] = Array.isArray(item.creneauIds) && item.creneauIds.length
      ? item.creneauIds
      : item.creneauId ? [item.creneauId] : [];
    const creneaux = ids.map((id) => creneauxParId.get(id)).filter((c): c is { date: string; startTime: string; endTime: string } => !!c?.date);
    if (creneaux.length === 0) return item;
    const stageDates = [...creneaux].sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => ({ date: c.date, startTime: c.startTime || "", endTime: c.endTime || "" }));
    return { ...item, stageSchedule: formatStageSchedule(stageDates), stageDates };
  });
}
