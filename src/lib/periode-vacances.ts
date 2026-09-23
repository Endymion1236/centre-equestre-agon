/**
 * src/lib/periode-vacances.ts — une période de vacances nommée dans un mail.
 *
 * L'assistant de la boîte mail cherchait les activités sur une fenêtre
 * déduite du mail par le modèle. « Pendant les vacances de la Toussaint »
 * ressortait sans dates, la fenêtre par défaut couvrait deux mois à partir
 * du jour, et les promenades du dimanche d'AVANT les vacances entraient dans
 * la liste. Ici, la correspondance entre le nom d'une période et ses dates
 * est déterministe, à partir des périodes configurées dans l'application.
 */

export interface PeriodeVacances {
  id?: string;
  name: string;
  startDate: string; // AAAA-MM-JJ
  endDate: string;   // AAAA-MM-JJ
}

/** Mots qui désignent une période, dans le mail comme dans le nom configuré. */
const MOTS_CLES: { cle: string; motifs: RegExp }[] = [
  { cle: "toussaint", motifs: /toussaint/ },
  { cle: "noel", motifs: /no[eë]l|fin d'ann[ée]e/ },
  { cle: "hiver", motifs: /f[ée]vrier|hiver|ski/ },
  { cle: "printemps", motifs: /p[âa]ques|printemps|avril/ },
  { cle: "ete", motifs: /\bété\b|\bete\b|grandes vacances|juillet|ao[ûu]t/ },
];

function normaliser(s: string): string {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Clés de période présentes dans un texte (mail) ou un nom de période. */
export function clesPeriode(texte: string): string[] {
  const t = normaliser(texte);
  return MOTS_CLES.filter((m) => m.motifs.test(t)).map((m) => m.cle);
}

/**
 * La période configurée que le mail nomme, la prochaine à venir : « les
 * vacances de la Toussaint » un 6 septembre 2026 → Toussaint 2026, pas 2025.
 * `null` si le mail ne nomme rien, ou si rien de configuré ne correspond.
 */
export function trouverPeriodeNommee(texte: string, periodes: PeriodeVacances[], today: string): PeriodeVacances | null {
  const cles = clesPeriode(texte);
  if (cles.length === 0) return null;
  const candidates = periodes
    .filter((p) => p.startDate && p.endDate && p.endDate >= today)
    .filter((p) => clesPeriode(p.name).some((c) => cles.includes(c)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return candidates[0] || null;
}

/** Libellé compact des périodes, pour le prompt d'extraction. */
export function resumePeriodes(periodes: PeriodeVacances[], today: string): string {
  return periodes
    .filter((p) => p.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((p) => `${p.name} : ${p.startDate} → ${p.endDate}`)
    .join(" ; ");
}
