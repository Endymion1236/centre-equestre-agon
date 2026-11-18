/**
 * src/lib/travail-bilan.ts — bilan mensuel du travail des poneys.
 *
 * Novembre 2026, demande de Nicolas : à la fin du mois, un récapitulatif et
 * une analyse par l'IA du travail des chevaux — points travaillés, points à
 * retravailler. Les chiffres (séances, durées, types, qui) sont calculés ici,
 * sans IA ; l'IA ne lit que les séances et leurs remarques pour en tirer la
 * synthèse, et n'invente rien : un poney sans remarque n'a pas de « point à
 * retravailler » fabriqué.
 *
 * Pur, testé (tests/unit/travail-bilan.test.ts).
 */
import { typeTravail, type SeanceTravail } from "./travail-equides";

export interface StatsEquide {
  equideId: string; nom: string;
  nb: number; minutes: number;
  parType: { type: string; label: string; nb: number }[];
  parQui: { qui: string; nb: number }[];
  dernier: string | null;
  /** Plus longue période sans séance dans le mois, en jours. */
  plusLongRepos: number;
}
export interface StatsMois {
  mois: string;
  nbSeances: number; minutes: number;
  equides: StatsEquide[];
  /** Équidés de la cavalerie sans aucune séance notée dans le mois. */
  sansTravail: string[];
  parQui: { qui: string; nb: number }[];
}

const JOUR = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const compter = (valeurs: string[]) => {
  const m = new Map<string, number>();
  for (const v of valeurs) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
export const finDeMois = (mois: string) => {
  const [a, m] = mois.split("-").map(Number);
  return `${mois}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
export const moisPrecedent = (mois: string) => {
  const [a, m] = mois.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
export const nomMois = (mois: string) => new Date(`${mois}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

export function statsMois(seances: SeanceTravail[], equides: { id: string; name: string }[], mois: string): StatsMois {
  const duMois = seances.filter((s) => s.date.startsWith(`${mois}-`));
  const debut = t(`${mois}-01`), fin = t(finDeMois(mois));
  const lignes: StatsEquide[] = [];
  const sansTravail: string[] = [];
  for (const e of [...equides].sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
    const ss = duMois.filter((s) => s.equideId === e.id).sort((a, b) => a.date.localeCompare(b.date));
    if (!ss.length) { sansTravail.push(e.name); continue; }
    const jours = [...new Set(ss.map((s) => s.date))];
    const bornes = [debut - JOUR, ...jours.map(t), fin + JOUR];
    let repos = 0;
    for (let i = 1; i < bornes.length; i++) repos = Math.max(repos, Math.round((bornes[i] - bornes[i - 1]) / JOUR) - 1);
    lignes.push({
      equideId: e.id, nom: e.name, nb: ss.length,
      minutes: ss.reduce((x, s) => x + (s.duree || 0), 0),
      parType: compter(ss.map((s) => s.type)).map(([type, nb]) => ({ type, label: typeTravail(type).label, nb })),
      parQui: compter(ss.map((s) => s.qui).filter(Boolean)).map(([qui, nb]) => ({ qui, nb })),
      dernier: jours[jours.length - 1] || null,
      plusLongRepos: repos,
    });
  }
  return {
    mois, nbSeances: duMois.length, minutes: duMois.reduce((x, s) => x + (s.duree || 0), 0),
    equides: lignes.sort((a, b) => b.nb - a.nb || a.nom.localeCompare(b.nom, "fr")),
    sansTravail,
    parQui: compter(duMois.map((s) => s.qui).filter(Boolean)).map(([qui, nb]) => ({ qui, nb })),
  };
}

/** Consigne de l'analyse : les séances du mois, poney par poney, avec leurs remarques. */
export function consigneBilanTravail(stats: StatsMois, seances: SeanceTravail[]): string {
  const parPoney = stats.equides.map((e) => {
    const ss = seances.filter((s) => s.equideId === e.equideId && s.date.startsWith(`${stats.mois}-`)).sort((a, b) => a.date.localeCompare(b.date));
    return `### ${e.nom} — ${e.nb} séance(s), ${e.minutes} min, plus longue coupure ${e.plusLongRepos} j\n` +
      ss.map((s) => `- ${s.date.slice(8)}/${s.date.slice(5, 7)} ${typeTravail(s.type).label}${s.duree ? ` ${s.duree} min` : ""}${s.qui ? ` (${s.qui})` : ""}${s.notes ? ` : ${s.notes}` : ""}`).join("\n");
  }).join("\n\n");
  return `Tu es le conseiller technique d'un centre équestre (poneys d'école et de Pony Games). Voici le travail noté par les moniteurs en ${nomMois(stats.mois)}.
${stats.sansTravail.length ? `Sans aucune séance notée ce mois-ci : ${stats.sansTravail.join(", ")}.\n` : ""}
${parPoney}

Rédige le bilan du mois, en français simple, pour le gérant. Réponds UNIQUEMENT en JSON :
{"synthese":"3 à 5 phrases sur le mois","equides":[{"nom":"","pointsTravailles":[""],"aRetravailler":[""],"conseil":""}],"alertes":[""]}
Règles :
- Appuie-toi UNIQUEMENT sur les séances et remarques ci-dessus ; n'invente aucun fait, aucune séance, aucun défaut.
- "pointsTravailles" : ce qui a réellement été travaillé (d'après les types de séance et les remarques), 1 à 4 éléments courts.
- "aRetravailler" : seulement ce que les remarques signalent (difficulté, tension, refus…) ou un déséquilibre visible dans les chiffres (toujours le même type de travail, longue coupure, très peu de séances). Liste vide si rien ne le justifie.
- "conseil" : une phrase concrète pour le mois suivant, ou "" si rien à dire.
- "alertes" : ce qui demande l'attention du gérant (poney peu ou pas travaillé, remarque de santé ou de comportement répétée, travail reposant sur une seule personne). Liste vide sinon.
- Un équidé par entrée, dans l'ordre donné, avec le nom exact.`;
}

export interface AnalyseBilan {
  synthese: string;
  equides: { nom: string; pointsTravailles: string[]; aRetravailler: string[]; conseil: string }[];
  alertes: string[];
}

const liste = (v: unknown, max = 6) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, max) : []);

/** Réponse de l'IA contrôlée : seuls les équidés du mois sont gardés. */
export function lireAnalyseBilan(brut: string, stats: StatsMois): AnalyseBilan | null {
  const m = String(brut || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d: any;
  try { d = JSON.parse(m[0]); } catch { return null; }
  if (typeof d?.synthese !== "string") return null;
  const connus = new Map(stats.equides.map((e) => [e.nom.toLowerCase(), e.nom]));
  return {
    synthese: d.synthese.trim().slice(0, 1500),
    equides: (Array.isArray(d.equides) ? d.equides : [])
      .map((e: any) => ({ nom: connus.get(String(e?.nom || "").toLowerCase()) || "", pointsTravailles: liste(e?.pointsTravailles), aRetravailler: liste(e?.aRetravailler), conseil: String(e?.conseil || "").trim().slice(0, 300) }))
      .filter((e: any) => e.nom),
    alertes: liste(d.alertes, 10),
  };
}

const echap = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const heures = (min: number) => (min ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : "—");

/** Le bilan en HTML : corps d'email et page à imprimer (`imprimer` ajoute l'en-tête de page). */
export function htmlBilanTravail(stats: StatsMois, analyse: AnalyseBilan | null, nomClub: string, imprimer = false): string {
  const parNom = new Map((analyse?.equides || []).map((e) => [e.nom, e]));
  const puces = (xs: string[]) => (xs.length ? `<ul style="margin:2px 0 6px 18px;padding:0">${xs.map((x) => `<li>${echap(x)}</li>`).join("")}</ul>` : `<p style="margin:2px 0 6px;color:#64748b">—</p>`);
  const blocs = stats.equides.map((e) => {
    const a = parNom.get(e.nom);
    return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:8px;page-break-inside:avoid">
<div style="font-weight:700;color:#1e3a5f">${echap(e.nom)} <span style="font-weight:400;color:#475569">— ${e.nb} séance${e.nb > 1 ? "s" : ""}, ${heures(e.minutes)}${e.plusLongRepos >= 7 ? `, jusqu'à ${e.plusLongRepos} jours sans travail noté` : ""}</span></div>
<div style="font-size:12px;color:#475569;margin:2px 0 6px">${e.parType.map((p) => `${echap(p.label)} × ${p.nb}`).join(" · ")}${e.parQui.length ? ` — par ${e.parQui.map((q) => `${echap(q.qui)} (${q.nb})`).join(", ")}` : ""}</div>
${a ? `<b>Points travaillés</b>${puces(a.pointsTravailles)}<b>À retravailler</b>${puces(a.aRetravailler)}${a.conseil ? `<p style="margin:2px 0;color:#1e3a5f"><i>Conseil : ${echap(a.conseil)}</i></p>` : ""}` : ""}
</div>`;
  }).join("");
  const corps = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#1f2937;max-width:760px">
<h2 style="color:#1e3a5f;margin:0 0 6px">Travail des poneys — ${echap(nomMois(stats.mois))}</h2>
<p style="margin:0 0 10px"><b>${stats.nbSeances}</b> séance${stats.nbSeances > 1 ? "s" : ""} notée${stats.nbSeances > 1 ? "s" : ""} (${heures(stats.minutes)}) sur <b>${stats.equides.length}</b> équidé${stats.equides.length > 1 ? "s" : ""}${stats.parQui.length ? ` — par ${stats.parQui.map((q) => `${echap(q.qui)} (${q.nb})`).join(", ")}` : ""}.</p>
${analyse ? `<p style="margin:0 0 10px;line-height:1.5">${echap(analyse.synthese)}</p>` : ""}
${analyse?.alertes.length ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin-bottom:10px"><b>À surveiller</b>${puces(analyse.alertes)}</div>` : ""}
${stats.sansTravail.length ? `<p style="margin:0 0 10px;color:#92400e"><b>Sans séance notée ce mois-ci :</b> ${stats.sansTravail.map(echap).join(", ")}.</p>` : ""}
${blocs}
<p style="font-size:11px;color:#64748b">${echap(nomClub)} — chiffres calculés sur les séances dictées ; synthèse rédigée par l'IA à partir des remarques des moniteurs.</p>
</div>`;
  return imprimer
    ? `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Travail des poneys — ${echap(nomMois(stats.mois))}</title><style>@page{size:A4;margin:12mm}</style></head><body>${corps}<script>window.onload=()=>window.print()</script></body></html>`
    : corps;
}
