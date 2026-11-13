/**
 * src/lib/travail-equides.ts — feuille de travail des poneys.
 *
 * Novembre 2026, demande de Nicolas : après avoir travaillé un poney, dicter
 * le jour, le nom du poney et ce qui a été fait ; l'application remplit la
 * feuille de travail de la semaine (Cavalerie → « Travail des poneys »).
 * La dictée passe par /api/whisper, l'IA la découpe en séances
 * (api/admin/travail-equides) ; ce module écrit la consigne, contrôle la
 * réponse (poney reconnu dans la cavalerie, date plausible, type connu) et
 * construit la grille et la page imprimable.
 *
 * Pur, sans import, testé (tests/unit/travail-equides.test.ts).
 */

export const TYPES_TRAVAIL = [
  { id: "monte", label: "Monté", icone: "🏇" },
  { id: "plat", label: "Plat / dressage", icone: "🎯" },
  { id: "obstacle", label: "Obstacle", icone: "🚧" },
  { id: "exterieur", label: "Extérieur / balade", icone: "🌲" },
  { id: "pony_games", label: "Pony Games", icone: "🏁" },
  { id: "longe", label: "Longe", icone: "⭕" },
  { id: "pied", label: "Travail à pied", icone: "🚶" },
  { id: "liberte", label: "Liberté", icone: "🐎" },
  { id: "debourrage", label: "Débourrage", icone: "🌱" },
  { id: "marcheur", label: "Marcheur", icone: "🔄" },
  { id: "autre", label: "Autre", icone: "📝" },
] as const;
export type TypeTravail = (typeof TYPES_TRAVAIL)[number]["id"];

export interface SeanceTravail {
  id?: string;
  date: string;          // AAAA-MM-JJ
  equideId: string;
  equideNom: string;
  type: TypeTravail;
  duree: number | null;  // minutes
  qui: string;
  notes: string;
}

export interface SeanceProposee extends SeanceTravail {
  /** Nom entendu dans la dictée, quand le poney n'a pas été reconnu. */
  nomEntendu?: string;
  alertes: string[];
}

const sansAccents = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Le poney de la cavalerie dont le nom correspond à ce qui a été entendu (dictée approximative tolérée). */
export function trouverEquide<T extends { id: string; name: string }>(nom: string, equides: T[]): T | null {
  const n = sansAccents(nom);
  if (!n) return null;
  const exact = equides.find((e) => sansAccents(e.name) === n);
  if (exact) return exact;
  const debut = equides.filter((e) => sansAccents(e.name).startsWith(n) || n.startsWith(sansAccents(e.name)));
  if (debut.length === 1) return debut[0];
  // Faute de transcription (« Caramelle » pour « Caramel ») : une ou deux lettres.
  const proches = equides
    .map((e) => ({ e, d: distance(n, sansAccents(e.name)) }))
    .filter((x) => x.d <= (n.length >= 6 ? 2 : 1))
    .sort((a, b) => a.d - b.d);
  return proches.length && (proches.length === 1 || proches[0].d < proches[1].d) ? proches[0].e : null;
}

const JOUR_MS = 86_400_000;
export const isoJour = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const versDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Lundi de la semaine d'un jour. */
export function lundiDe(iso: string): string {
  const d = versDate(iso);
  return isoJour(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * JOUR_MS));
}
export const joursSemaine = (lundi: string) => Array.from({ length: 7 }, (_, k) => isoJour(new Date(versDate(lundi).getTime() + k * JOUR_MS)));

/** Consigne donnée à l'IA pour découper la dictée en séances. */
export function consigneDicteeTravail(texte: string, nomsEquides: string[], aujourdhui: string, moi = ""): string {
  const jour = versDate(aujourdhui).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `Un moniteur de centre équestre a dicté le travail fait avec les poneys et chevaux. Aujourd'hui : ${jour} (${aujourdhui}).
Poneys et chevaux du club : ${nomsEquides.join(", ")}.

Découpe la dictée en séances : une par équidé et par jour. Pour chacune :
- "date" : AAAA-MM-JJ (« aujourd'hui », « hier », « lundi »… se calculent depuis aujourd'hui ; sans date dite, aujourd'hui) ;
- "poney" : le nom tel qu'il figure dans la liste du club si tu le reconnais (dictée approximative), sinon tel qu'entendu ;
- "type" : un de ${TYPES_TRAVAIL.map((t) => t.id).join(", ")} ;
- "duree" : en minutes si elle est dite, sinon null ;
- "qui" : qui l'a travaillé (obligatoire sur la feuille) ; « je », « j'ai » = ${moi ? `« ${moi} », la personne qui dicte` : "la personne qui dicte : laisse \"\""} ; pas dit du tout : "" ;
- "notes" : ce qui a été fait ou observé, en quelques mots, sans rien inventer.
Plusieurs poneys travaillés de la même façon (« j'ai longé Caramel et Pistache ») : une séance chacun.
Réponds UNIQUEMENT en JSON : {"seances":[{"date":"","poney":"","type":"","duree":null,"qui":"","notes":""}],"remarques":[]}.
"remarques" : ce qui n'a pas été compris. N'invente aucune séance.

Dictée :
"""
${String(texte || "").slice(0, 4000)}
"""`;
}

/** Contrôle la réponse de l'IA : poney de la cavalerie, date à moins de 60 jours, type connu. */
export function lireDicteeTravail<T extends { id: string; name: string }>(
  brut: string, equides: T[], aujourdhui: string, moi = "",
): { seances: SeanceProposee[]; remarques: string[] } | null {
  const m = String(brut || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d: any;
  try { d = JSON.parse(m[0]); } catch { return null; }
  if (!Array.isArray(d?.seances)) return null;
  const types = new Set<string>(TYPES_TRAVAIL.map((t) => t.id));
  const seances: SeanceProposee[] = d.seances.slice(0, 40).map((s: any) => {
    const alertes: string[] = [];
    let date = String(s?.date || "");
    const ecart = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Math.abs(versDate(date).getTime() - versDate(aujourdhui).getTime()) / JOUR_MS : Infinity;
    if (ecart > 60) { if (date) alertes.push(`Date « ${date} » invraisemblable : remplacée par aujourd'hui.`); date = aujourdhui; }
    const e = trouverEquide(String(s?.poney || ""), equides);
    if (!e) alertes.push(`Poney « ${s?.poney || "?"} » non trouvé dans la cavalerie : à choisir.`);
    const type = (types.has(String(s?.type)) ? String(s.type) : "autre") as TypeTravail;
    const duree = Number(s?.duree);
    const qui = String(s?.qui || "").trim().slice(0, 60) || moi;
    if (!qui) alertes.push("Qui a travaillé le poney ? À indiquer.");
    return {
      date, type,
      equideId: e?.id || "", equideNom: e?.name || "",
      ...(e ? {} : { nomEntendu: String(s?.poney || "") }),
      duree: Number.isFinite(duree) && duree > 0 && duree <= 300 ? Math.round(duree) : null,
      qui,
      notes: String(s?.notes || "").slice(0, 300),
      alertes,
    };
  });
  return { seances, remarques: Array.isArray(d.remarques) ? d.remarques.map(String).slice(0, 10) : [] };
}

/** Séance prête à enregistrer ? (poney, qui l'a travaillé, date et type valides) */
export function seanceValide(s: Partial<SeanceTravail>): s is SeanceTravail {
  return !!s.equideId && !!String(s.qui || "").trim() && /^\d{4}-\d{2}-\d{2}$/.test(String(s.date)) && TYPES_TRAVAIL.some((t) => t.id === s.type);
}

export interface LigneGrille { equideId: string; nom: string; jours: SeanceTravail[][]; minutes: number; nb: number }

/** Grille de la semaine : une ligne par équidé (ceux sans séance compris), une colonne par jour. */
export function grilleSemaine(seances: SeanceTravail[], equides: { id: string; name: string }[], lundi: string): LigneGrille[] {
  const jours = joursSemaine(lundi);
  return [...equides].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((e) => {
    const siennes = seances.filter((s) => s.equideId === e.id && jours.includes(s.date));
    return {
      equideId: e.id, nom: e.name,
      jours: jours.map((j) => siennes.filter((s) => s.date === j)),
      minutes: siennes.reduce((t, s) => t + (s.duree || 0), 0),
      nb: siennes.length,
    };
  });
}

export const typeTravail = (id: string) => TYPES_TRAVAIL.find((t) => t.id === id) || TYPES_TRAVAIL[TYPES_TRAVAIL.length - 1];

const echap = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Page A4 paysage à imprimer : la feuille de travail de la semaine. */
export function htmlFeuilleTravail(grille: LigneGrille[], lundi: string, nomClub: string): string {
  const jours = joursSemaine(lundi);
  const titreJour = (j: string) => versDate(j).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
  const cellule = (ss: SeanceTravail[]) => ss.map((s) => {
    const t = typeTravail(s.type);
    return `<div class="s"><b>${t.icone} ${echap(t.label)}</b>${s.duree ? ` ${s.duree} min` : ""}${s.qui ? ` · ${echap(s.qui)}` : ""}${s.notes ? `<br><i>${echap(s.notes)}</i>` : ""}</div>`;
  }).join("");
  const lignes = grille.map((l) => `<tr><th>${echap(l.nom)}</th>${l.jours.map((ss) => `<td>${cellule(ss)}</td>`).join("")}<td class="t">${l.nb ? `${l.nb} séance${l.nb > 1 ? "s" : ""}${l.minutes ? `<br>${Math.floor(l.minutes / 60)}h${String(l.minutes % 60).padStart(2, "0")}` : ""}` : "—"}</td></tr>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Travail des poneys — semaine du ${titreJour(lundi)}</title>
<style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px;color:#111}h1{font-size:16px;margin:0 0 6px}
table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #999;padding:3px;vertical-align:top}thead th{background:#eef3fb}
tbody th{text-align:left;width:11%;background:#fafafa}td.t{width:7%;text-align:center}.s{margin-bottom:3px}i{color:#444}</style></head>
<body><h1>${echap(nomClub)} — travail des poneys, semaine du ${titreJour(lundi)} au ${titreJour(jours[6])}</h1>
<table><thead><tr><th>Équidé</th>${jours.map((j) => `<th>${titreJour(j)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${lignes}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`;
}
