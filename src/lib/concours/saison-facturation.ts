/**
 * src/lib/concours/saison-facturation.ts — combien de tours chaque cavalier
 * court à un concours de la saison, pour facturer les engagements.
 *
 * Demande de Nicolas (20/11/2026) : onglet « Facturation » du concours. Un
 * tour = un passage d'une équipe dont le cavalier fait partie ; un cavalier
 * engagé dans deux équipes (une paire et une équipe) fait deux tours. Le
 * cavalier du poney remplaçant est noté à part : il prépare et échauffe le
 * poney sans courir, ce n'est pas un tour.
 *
 * Pur, sans import d'écran (tests/unit/saison-facturation.test.ts).
 */
import { minutes, heureLisible } from "./saison-organisation";
import type { EngagementConcours, ResultatConcours, SaisonPonyGames } from "./saisons";

export interface TourCavalier { equipe: string; categorie: string; heure: string; poney: string }
export interface LigneFacturation {
  cavalierId: string;
  nom: string;
  tours: number;
  detail: TourCavalier[];
  /** Passages où il s'occupe du poney remplaçant (pas un tour). */
  remplacant: string[];
}

const nom = (s: SaisonPonyGames, id: string) => {
  const c = s.cavaliers.find((x) => x.id === id);
  return c ? [c.prenom, c.nom].filter(Boolean).join(" ") : "";
};

/** Une ligne par cavalier qui court ou tient le remplaçant, triée par nom. */
export function toursParCavalier(s: SaisonPonyGames, r: ResultatConcours): LigneFacturation[] {
  // Engagements du concours ; sans organisation saisie, les équipes classées.
  const engagements: EngagementConcours[] = (r.engagements?.length ? r.engagements : r.classements.map((c): EngagementConcours => ({ equipeId: c.equipeId, poneys: {} })))
    .slice().sort((a, b) => (minutes(a.heure) ?? 1e9) - (minutes(b.heure) ?? 1e9));
  const lignes = new Map<string, LigneFacturation>();
  const ligne = (id: string) => {
    let l = lignes.get(id);
    if (!l) { l = { cavalierId: id, nom: nom(s, id), tours: 0, detail: [], remplacant: [] }; lignes.set(id, l); }
    return l;
  };
  for (const g of engagements) {
    const equipe = s.equipes.find((e) => e.id === g.equipeId);
    if (!equipe) continue;
    const categorie = r.categoriesFigees?.[equipe.id]?.categorie ?? equipe.categorie;
    const heure = minutes(g.heure) === undefined ? "" : heureLisible(g.heure);
    for (const id of equipe.cavalierIds) {
      if (!s.cavaliers.some((c) => c.id === id)) continue;
      const l = ligne(id);
      l.tours++;
      l.detail.push({ equipe: equipe.nom, categorie, heure, poney: g.poneys?.[id]?.trim() || "" });
    }
    const pr = g.roles?.cavalierRemplacant;
    if (pr && s.cavaliers.some((c) => c.id === pr)) ligne(pr).remplacant.push(`${equipe.nom}${heure ? ` (${heure})` : ""}`);
  }
  return [...lignes.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Texte à copier : une ligne par cavalier. */
export function texteFacturation(r: ResultatConcours, lignes: LigneFacturation[]): string {
  const date = r.date ? r.date.split("-").reverse().join("/") : "";
  const total = lignes.reduce((n, l) => n + l.tours, 0);
  return [
    `${r.nom}${date ? ` — ${date}` : ""} : ${total} tour${total > 1 ? "s" : ""}`,
    ...lignes.filter((l) => l.tours > 0).map((l) => `${l.nom} : ${l.tours} tour${l.tours > 1 ? "s" : ""} (${l.detail.map((d) => d.equipe).join(", ")})`),
  ].join("\n");
}
