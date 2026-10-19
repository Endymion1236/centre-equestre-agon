/**
 * src/lib/cavalerie-mouvements.ts — entrées et sorties des équidés
 * (registre d'élevage, onglet « Mouvements » de la cavalerie).
 *
 * Trois questions, sans base ni écran :
 *   - où en est chaque équidé d'après ses mouvements (présent, parti pour un
 *     temps, sorti pour de bon) ;
 *   - quelles sorties temporaires attendent encore un retour, et lesquelles
 *     sont en retard ;
 *   - ce qu'un mouvement change sur la fiche de l'équidé (statut, dates), pour
 *     que la fiche et le registre racontent la même histoire.
 *
 * Testé seul : tests/unit/cavalerie-mouvements.test.ts.
 */

export interface MouvementLike {
  id?: string;
  equideId: string;
  equideName?: string;
  type: "entree" | "sortie";
  /** Timestamp Firestore, Date ou « AAAA-MM-JJ ». */
  date: any;
  motif?: string;
  temporaire?: boolean;
  dateRetour?: any;
  destination?: string;
  provenance?: string;
}

export interface EquideLike {
  id: string;
  name?: string;
  status?: string;
  dateArrivee?: any;
}

/** « AAAA-MM-JJ » d'un Timestamp Firestore, d'une Date ou d'une chaîne. */
export function dateISO(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (typeof d?.toDate === "function") return d.toDate().toISOString().slice(0, 10);
  const s = Number(d?.seconds ?? d?._seconds);
  if (s) return new Date(s * 1000).toISOString().slice(0, 10);
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

/** Du plus ancien au plus récent ; à date égale, l'ordre de saisie. */
export function trierMouvements<T extends MouvementLike>(mouvements: T[]): T[] {
  return mouvements
    .map((m, i) => ({ m, i }))
    .sort((a, b) => dateISO(a.m.date).localeCompare(dateISO(b.m.date)) || a.i - b.i)
    .map((x) => x.m);
}

/** Les motifs proposés, écrits une seule fois (modale de mouvement, fiche). */
export const MOTIFS_ENTREE = ["Achat", "Naissance", "Retour de prêt", "Retour concours", "Retour pension", "Demi-pension", "Don", "Autre"];
export const MOTIFS_SORTIE = ["Vente", "Départ définitif", "Retraite", "Décès", "Prêt extérieur", "Concours", "Pension extérieure", "Fin demi-pension", "Autre"];
/** Les motifs qui ne valent que pour une sortie temporaire (l'équidé revient). */
export const MOTIFS_SORTIE_TEMPORAIRE = ["Prêt extérieur", "Concours", "Pension extérieure"];
/** Les motifs d'une sortie définitive, tels que la fiche les propose. */
export const MOTIFS_SORTIE_DEFINITIVE = MOTIFS_SORTIE.filter((m) => !MOTIFS_SORTIE_TEMPORAIRE.includes(m));

export type EtatPresence = "present" | "sorti_temporaire" | "sorti";

export interface SituationEquide {
  equideId: string;
  etat: EtatPresence;
  /** Le mouvement qui fixe l'état (le dernier), s'il y en a un. */
  dernier: MouvementLike | null;
  /** Sortie temporaire : date de retour prévue, et retard par rapport à `aujourdhui`. */
  retourPrevu: string;
  enRetard: boolean;
}

/** L'état de chaque équidé d'après son dernier mouvement. Sans mouvement : présent. */
export function situationEquides(equides: EquideLike[], mouvements: MouvementLike[], aujourdhui: string): Map<string, SituationEquide> {
  const parEquide = new Map<string, MouvementLike[]>();
  for (const m of trierMouvements(mouvements)) {
    if (!m?.equideId) continue;
    const l = parEquide.get(m.equideId) || [];
    l.push(m);
    parEquide.set(m.equideId, l);
  }
  const resultat = new Map<string, SituationEquide>();
  const ids = new Set<string>([...equides.map((e) => e.id), ...parEquide.keys()]);
  for (const id of ids) {
    const liste = parEquide.get(id) || [];
    const dernier = liste.length ? liste[liste.length - 1] : null;
    let etat: EtatPresence = "present";
    let retourPrevu = "";
    let enRetard = false;
    if (dernier?.type === "sortie") {
      if (dernier.temporaire) {
        etat = "sorti_temporaire";
        retourPrevu = dateISO(dernier.dateRetour);
        enRetard = !!retourPrevu && retourPrevu < aujourdhui;
      } else {
        etat = "sorti";
      }
    }
    resultat.set(id, { equideId: id, etat, dernier, retourPrevu, enRetard });
  }
  return resultat;
}

/** Les sorties temporaires qui n'ont pas encore été suivies d'une entrée. */
export function sortiesTemporairesEnCours(mouvements: MouvementLike[]): MouvementLike[] {
  const situation = situationEquides([], mouvements, "9999-12-31");
  return [...situation.values()]
    .filter((s) => s.etat === "sorti_temporaire" && s.dernier)
    .map((s) => s.dernier as MouvementLike);
}

/** Le motif d'entrée qui répond à un motif de sortie temporaire. */
export function motifRetour(motifSortie: string | undefined): string {
  switch (motifSortie) {
    case "Prêt extérieur": return "Retour de prêt";
    case "Concours": return "Retour concours";
    case "Pension extérieure": return "Retour pension";
    default: return "Autre";
  }
}

/**
 * Ce qu'un mouvement change sur la fiche de l'équidé.
 *  - sortie définitive : statut « sorti » (« deces » pour un décès, « retraite »
 *    pour une retraite), date et motif de sortie ;
 *  - sortie temporaire : rien sur la fiche (l'indisponibilité, elle, se
 *    déclare dans son onglet) ;
 *  - entrée : date d'arrivée si la fiche n'en a pas, retour à « actif » si
 *    l'équidé était sorti, et la sortie précédente effacée.
 */
export function champsEquideApresMouvement(equide: EquideLike, m: MouvementLike): Record<string, unknown> {
  const jour = dateISO(m.date);
  if (m.type === "sortie") {
    if (m.temporaire) return {};
    const status = m.motif === "Décès" ? "deces" : m.motif === "Retraite" ? "retraite" : "sorti";
    return { status, dateSortie: jour || null, motifSortie: m.motif || null, destinationSortie: m.destination || "", available: false };
  }
  const champs: Record<string, unknown> = { dateSortie: null, motifSortie: null, destinationSortie: "" };
  if (!dateISO(equide.dateArrivee)) champs.dateArrivee = jour || null;
  if (equide.status === "sorti" || equide.status === "deces" || equide.status === "retraite") {
    champs.status = "actif";
    champs.available = true;
  }
  return champs;
}

// ─── Impression du registre (contrôles) ────────────────────────────────────

export interface EquideRegistre extends EquideLike {
  sire?: string;
  puce?: string;
  type?: string;
  sex?: string;
  race?: string;
  robe?: string;
  birthDate?: any;
  provenance?: string;
  proprietaire?: string;
  dateSortie?: any;
  motifSortie?: string | null;
}

export interface ClubRegistre {
  nom: string;
  legalName?: string;
  address?: string;
  siret?: string;
  tel?: string;
  email?: string;
}

const echapper = (t: unknown) =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** « 16/10/2026 » depuis « AAAA-MM-JJ », Timestamp ou Date. */
export function dateFr(d: any): string {
  const iso = dateISO(d);
  return iso ? iso.split("-").reverse().join("/") : "";
}

const LIBELLE_TYPE: Record<string, string> = { poney: "Poney", shetland: "Shetland", cheval: "Cheval", ane: "Âne" };
const LIBELLE_SEXE: Record<string, string> = { male: "Mâle", femelle: "Femelle", hongre: "Hongre" };

/**
 * La page imprimable du registre d'élevage, à présenter lors d'un contrôle :
 * l'identité du détenteur, les équidés présents, ceux qui sont sortis, puis
 * toutes les entrées et sorties dans l'ordre. A4 portrait, impression lancée
 * à l'ouverture.
 */
export function htmlRegistre(params: {
  club: ClubRegistre;
  equides: EquideRegistre[];
  mouvements: MouvementLike[];
  aujourdhui: string;
}): string {
  const { club, equides, mouvements, aujourdhui } = params;
  const situation = situationEquides(equides, mouvements, aujourdhui);
  const parNom = (a: EquideLike, b: EquideLike) => String(a.name || "").localeCompare(String(b.name || ""), "fr");
  const presents = equides.filter((e) => situation.get(e.id)?.etat !== "sorti" && !["sorti", "deces"].includes(String(e.status))).sort(parNom);
  const sortis = equides.filter((e) => !presents.includes(e)).sort(parNom);
  const nomDe = (id: string) => equides.find((e) => e.id === id)?.name || mouvements.find((m) => m.equideId === id)?.equideName || "?";

  const cellule = (t: unknown) => `<td>${echapper(t) || "&nbsp;"}</td>`;
  const ligneEquide = (e: EquideRegistre) => {
    const s = situation.get(e.id);
    const presence = s?.etat === "sorti_temporaire"
      ? `Sorti temporairement (${echapper(s.dernier?.motif || "")}${s.retourPrevu ? `, retour prévu le ${dateFr(s.retourPrevu)}` : ""})`
      : "Présent";
    return `<tr>${cellule(e.name)}${cellule(e.sire)}${cellule(e.puce)}${cellule([LIBELLE_TYPE[String(e.type)] || e.type, LIBELLE_SEXE[String(e.sex)] || e.sex].filter(Boolean).join(" · "))}${cellule([e.race, e.robe].filter(Boolean).join(" · "))}${cellule(dateFr(e.birthDate))}${cellule(dateFr(e.dateArrivee))}${cellule(e.provenance)}${cellule(e.proprietaire)}<td>${presence}</td></tr>`;
  };
  const ligneSorti = (e: EquideRegistre) =>
    `<tr>${cellule(e.name)}${cellule(e.sire)}${cellule(e.puce)}${cellule(dateFr(e.dateArrivee))}${cellule(dateFr(e.dateSortie))}${cellule(e.motifSortie || (e.status === "deces" ? "Décès" : ""))}</tr>`;
  const ligneMouvement = (m: MouvementLike & { observations?: string; prixAchat?: number | null; prixVente?: number | null }) => {
    const sens = m.type === "entree" ? "Entrée" : m.temporaire ? "Sortie temporaire" : "Sortie définitive";
    const lieu = m.type === "entree" ? m.provenance : m.destination;
    const complement = [
      m.temporaire && m.dateRetour ? `retour prévu le ${dateFr(m.dateRetour)}` : "",
      m.observations || "",
    ].filter(Boolean).join(" — ");
    return `<tr>${cellule(dateFr(m.date))}${cellule(m.equideName || nomDe(m.equideId))}<td class="${m.type === "entree" ? "entree" : "sortie"}">${sens}</td>${cellule(m.motif)}${cellule(lieu)}${cellule(complement)}</tr>`;
  };
  const chronologie = trierMouvements(mouvements);

  const vide = (n: number, texte: string) => `<tr><td colspan="${n}" class="vide">${texte}</td></tr>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Registre d'élevage — ${echapper(club.nom)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10.5px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
  .detenteur { font-size: 10.5px; color: #333; line-height: 1.4; }
  .meta { font-size: 9.5px; color: #555; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 9.5px; }
  tr { page-break-inside: avoid; }
  td.entree { color: #166534; font-weight: bold; }
  td.sortie { color: #991b1b; font-weight: bold; }
  td.vide { color: #777; font-style: italic; text-align: center; }
  .pied { margin-top: 18px; font-size: 9px; color: #555; }
  .signature { margin-top: 24px; display: flex; justify-content: space-between; font-size: 10px; }
  .signature div { width: 45%; border-top: 1px solid #999; padding-top: 4px; }
  @media print { .no-print { display: none; } }
</style></head>
<body onload="window.print()">
<h1>Registre d'élevage — équidés</h1>
<div class="detenteur">
  <strong>${echapper(club.legalName || club.nom)}</strong>${club.legalName && club.legalName !== club.nom ? ` (${echapper(club.nom)})` : ""}<br>
  ${echapper(club.address || "")}${club.siret ? ` · SIRET ${echapper(club.siret)}` : ""}${club.tel ? ` · ${echapper(club.tel)}` : ""}${club.email ? ` · ${echapper(club.email)}` : ""}
</div>
<div class="meta">Édité le ${dateFr(aujourdhui)} · ${presents.length} équidé(s) présent(s) · ${sortis.length} sorti(s) · ${chronologie.length} mouvement(s) enregistré(s)</div>

<h2>1. Équidés détenus (${presents.length})</h2>
<table><thead><tr><th>Nom</th><th>N° SIRE / UELN</th><th>Transpondeur</th><th>Type · sexe</th><th>Race · robe</th><th>Naissance</th><th>Arrivée</th><th>Provenance</th><th>Propriétaire</th><th>Situation</th></tr></thead>
<tbody>${presents.length ? presents.map(ligneEquide).join("") : vide(10, "Aucun équidé")}</tbody></table>

<h2>2. Équidés sortis définitivement (${sortis.length})</h2>
<table><thead><tr><th>Nom</th><th>N° SIRE / UELN</th><th>Transpondeur</th><th>Arrivée</th><th>Sortie</th><th>Motif</th></tr></thead>
<tbody>${sortis.length ? sortis.map(ligneSorti).join("") : vide(6, "Aucune sortie définitive")}</tbody></table>

<h2>3. Entrées et sorties, dans l'ordre (${chronologie.length})</h2>
<table><thead><tr><th>Date</th><th>Équidé</th><th>Mouvement</th><th>Motif</th><th>Provenance / destination</th><th>Précisions</th></tr></thead>
<tbody>${chronologie.length ? chronologie.map(ligneMouvement).join("") : vide(6, "Aucun mouvement enregistré")}</tbody></table>

<p class="pied">Registre tenu conformément à l'arrêté du 5 juin 2000 relatif au registre d'élevage. Les interventions sanitaires (vaccins, vermifuges, soins vétérinaires) sont tenues dans le registre des soins de l'application.</p>
<div class="signature"><div>Le détenteur</div><div>Visa du contrôle</div></div>
</body></html>`;
}
