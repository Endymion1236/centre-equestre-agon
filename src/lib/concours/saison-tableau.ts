// =============================================================================
// Tableau de la journée d'un concours de la saison — logique pure
// -----------------------------------------------------------------------------
// À partir des horaires, des durées, des cavaliers et des poneys, une ligne
// par passage : préparation des poneys (30 min) puis échauffement (30 min)
// juste avant le passage, chacun avec un responsable ; placeurs de matériel
// (1 à 2 cavaliers), juge de ligne, facteur et 1 à 2 coachs pendant le passage ;
// l'échauffement peut avoir 2 responsables ;
// un cavalier pour le poney remplaçant (préparation, échauffement et passage).
// Les vérifications signalent une personne prise à deux endroits à la fois.
// =============================================================================

import type { EngagementConcours, ResultatConcours, RolesPassage, SaisonPonyGames } from "./saisons";
import { dureePassage, minutes, versHeure } from "./saison-organisation";

export const DUREE_PREPA_MIN = 30;
export const DUREE_ECHAUFFEMENT_MIN = 30;
export const PLACEURS_MAX = 2;

export interface Plage {
  debut: number;
  fin: number;
}

export interface LigneTableau {
  equipeId: string;
  equipe: string;
  categorie: string;
  /** Absentes quand le passage n'a pas d'horaire. */
  passage?: Plage;
  prepa?: Plage;
  echauffement?: Plage;
  cavaliers: {
    id: string;
    nom: string;
    poney?: string;
    /**
     * Heure d'un passage plus tôt dans la journée où ce cavalier montait déjà
     * ce poney : le poney est prêt, le cavalier ne refait ni prépa ni échauffement.
     */
    dejaPretDepuis?: string;
    /**
     * Passage que ce cavalier joue pendant la prépa ou l'échauffement de
     * celui-ci, avec un autre poney : quelqu'un doit préparer ce poney à sa place.
     */
    enchaineAvec?: string;
    /** Qui prépare et échauffe le poney à sa place (id de cavalier, ou « X »). */
    preparateur?: string;
  }[];
  remplacant?: string;
  roles: RolesPassage;
}

/** « 09h00–09h30 ». */
export function plageLisible(p?: Plage): string {
  if (!p) return "—";
  const h = (m: number) => versHeure(m).replace(":", "h");
  return `${h(p.debut)}–${h(p.fin)}`;
}

/** Valeur à choisir quand il n'y a personne sur un rôle. */
export const PERSONNE = "X";

/**
 * « X » (ou « personne », « aucun », « - ») veut dire qu'il n'y a personne :
 * le rôle est tranché, et ce n'est pas quelqu'un qui pourrait être pris ailleurs.
 */
export function estPersonne(nom?: string): boolean {
  return /^\s*(x|personne|aucun|aucune|-|—)\s*$/i.test(nom ?? "");
}

export function nomCavalier(s: SaisonPonyGames, id: string): string {
  if (estPersonne(id)) return PERSONNE;
  const c = s.cavaliers.find((x) => x.id === id);
  return c ? [c.prenom, c.nom].filter(Boolean).join(" ") : "?";
}

/** Une ligne par équipe engagée, dans l'ordre de passage. */
export function lignesTableau(s: SaisonPonyGames, r: ResultatConcours): LigneTableau[] {
  const lignes: LigneTableau[] = [];
  for (const g of r.engagements ?? []) {
    const equipe = s.equipes.find((e) => e.id === g.equipeId);
    if (!equipe) continue;
    const debut = minutes(g.heure);
    const plages = debut === undefined ? {} : {
      passage: { debut, fin: debut + dureePassage(s, g) },
      echauffement: { debut: debut - DUREE_ECHAUFFEMENT_MIN, fin: debut },
      prepa: { debut: debut - DUREE_ECHAUFFEMENT_MIN - DUREE_PREPA_MIN, fin: debut - DUREE_ECHAUFFEMENT_MIN },
    };
    lignes.push({
      equipeId: equipe.id,
      equipe: equipe.nom,
      categorie: equipe.categorie,
      ...plages,
      cavaliers: equipe.cavalierIds
        .filter((id) => s.cavaliers.some((c) => c.id === id))
        .map((id) => ({ id, nom: nomCavalier(s, id), poney: g.poneys[id]?.trim() || undefined })),
      remplacant: g.remplacant?.trim() || undefined,
      roles: g.roles ?? {},
    });
  }

  // Même cavalier, même poney, passage précédent terminé : poney déjà préparé et échauffé.
  const memePoney = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const l of lignes) {
    if (!l.passage) continue;
    for (const c of l.cavaliers) {
      if (!c.poney) continue;
      const avant = lignes
        .filter((m) => m !== l && m.passage && m.passage.fin <= l.passage!.debut)
        .filter((m) => m.cavaliers.some((x) => cleCavalier(s, x.id) === cleCavalier(s, c.id) && memePoney(x.poney, c.poney)))
        .sort((a, b) => b.passage!.debut - a.passage!.debut)[0];
      if (avant) c.dejaPretDepuis = plageLisible(avant.passage).split("–")[0];
    }
  }

  // Cavalier qui joue ailleurs pendant la prépa ou l'échauffement de ce passage, avec un autre poney.
  for (const l of lignes) {
    if (!l.passage || !l.prepa || !l.echauffement) continue;
    const avantJeu = { debut: l.prepa.debut, fin: l.echauffement.fin };
    for (const c of l.cavaliers) {
      if (c.dejaPretDepuis) continue;
      const autre = lignes.find((m) => m !== l && m.passage && chevauche(m.passage, avantJeu)
        && m.cavaliers.some((x) => cleCavalier(s, x.id) === cleCavalier(s, c.id)));
      if (!autre) continue;
      c.enchaineAvec = `${autre.equipe} (${plageLisible(autre.passage)})`;
      const prep = l.roles.preparateurs?.[c.id];
      if (prep) c.preparateur = prep;
    }
  }
  return lignes;
}

// ─── Saisie des rôles ──────────────────────────────────────────────────────

type RoleTexte = "respPrepa" | "respEchauffement" | "respEchauffement2" | "juge" | "facteur" | "coach" | "coach2" | "cavalierRemplacant";

function majRoles(r: ResultatConcours, equipeId: string, f: (roles: RolesPassage) => RolesPassage): ResultatConcours {
  return {
    ...r,
    engagements: (r.engagements ?? []).map((g): EngagementConcours => {
      if (g.equipeId !== equipeId) return g;
      const roles = f({ ...(g.roles ?? {}) });
      // On ne garde que les rôles remplis.
      const propres = Object.fromEntries(
        Object.entries(roles).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v)),
      ) as RolesPassage;
      const { roles: _anciens, ...reste } = g;
      return Object.keys(propres).length ? { ...reste, roles: propres } : reste;
    }),
  };
}

export function poserRole(r: ResultatConcours, equipeId: string, role: RoleTexte, nom: string): ResultatConcours {
  return majRoles(r, equipeId, (roles) => ({ ...roles, [role]: nom.trim() || undefined }));
}

/** Place (ou retire, avec "") le placeur n° `index` (0 ou 1) ; pas de doublon. */
export function poserPlaceur(r: ResultatConcours, equipeId: string, index: number, cavalierId: string): ResultatConcours {
  return majRoles(r, equipeId, (roles) => {
    const liste = [...(roles.placeurs ?? [])];
    if (cavalierId) liste[index] = cavalierId;
    else liste.splice(index, 1);
    const uniques = liste.filter((id, i) => id && (estPersonne(id) || liste.indexOf(id) === i)).slice(0, PLACEURS_MAX);
    return { ...roles, placeurs: uniques };
  });
}

/** Qui prépare et échauffe le poney de `cavalierId` pour ce passage ("" pour retirer). */
export function poserPreparateur(r: ResultatConcours, equipeId: string, cavalierId: string, preparateur: string): ResultatConcours {
  return majRoles(r, equipeId, (roles) => {
    const { [cavalierId]: _ancien, ...autres } = roles.preparateurs ?? {};
    const liste = preparateur.trim() ? { ...autres, [cavalierId]: preparateur.trim() } : autres;
    return { ...roles, preparateurs: Object.keys(liste).length ? liste : undefined };
  });
}

// ─── Vérifications ─────────────────────────────────────────────────────────

const simplifier = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Reconnaît une personne tapée à la main : un cavalier de la saison (nom
 * complet, ou prénom s'il est seul à le porter), sinon le nom tel quel.
 */
export function clePersonne(s: SaisonPonyGames, nom: string): string {
  const t = simplifier(nom);
  const complet = s.cavaliers.find((c) => nomSimplifie(c) === t);
  if (complet) return cleCavalier(s, complet.id);
  const memePrenom = s.cavaliers.filter((c) => simplifier(c.prenom) === t);
  // Un prénom ne désigne quelqu'un que s'il n'existe qu'une personne (même saisie en double) à le porter.
  if (memePrenom.length && new Set(memePrenom.map(nomSimplifie)).size === 1) return cleCavalier(s, memePrenom[0].id);
  return `nom:${t}`;
}

const nomSimplifie = (c: { prenom: string; nom?: string }) => simplifier([c.prenom, c.nom].filter(Boolean).join(" "));

/**
 * Clé d'un cavalier de la saison. Un même cavalier saisi deux fois (même
 * prénom et même nom) est une seule personne : il ne peut pas être libre
 * sous une fiche et en jeu sous l'autre.
 */
export function cleCavalier(s: SaisonPonyGames, id: string): string {
  const c = s.cavaliers.find((x) => x.id === id);
  if (!c) return `cav:${id}`;
  const premier = s.cavaliers.find((x) => nomSimplifie(x) === nomSimplifie(c))!;
  return `cav:${premier.id}`;
}

interface Occupation {
  cle: string;
  qui: string;
  quoi: string;
  /** Deux occupations de même genre peuvent se chevaucher (un responsable surveille deux préparations). */
  genre: string;
  plage: Plage;
}

export interface AlerteTableau {
  gravite: "erreur" | "alerte";
  message: string;
}

/**
 * Où est chacun, et quand. Un cavalier est pris avec son équipe pendant la
 * préparation des poneys, l'échauffement et le jeu ; chaque rôle occupe sa
 * plage (prépa, échauffement ou passage).
 */
function occupations(s: SaisonPonyGames, r: ResultatConcours): Occupation[] {
  const occ: Occupation[] = [];
  const parNom = (nom: string | undefined, quoi: string, genre: string, plage?: Plage) => {
    if (!nom?.trim() || !plage || estPersonne(nom)) return;
    occ.push({ cle: clePersonne(s, nom), qui: nom.trim(), quoi, genre, plage });
  };
  for (const l of lignesTableau(s, r)) {
    if (!l.passage) continue;
    for (const c of l.cavaliers) {
      const genre = `cheval:${l.equipeId}`;
      const cle = cleCavalier(s, c.id);
      // Poney déjà monté par ce cavalier plus tôt, ou cavalier en jeu ailleurs : il ne prépare pas lui-même.
      if (!c.dejaPretDepuis && !c.enchaineAvec) {
        occ.push({ cle, qui: c.nom, quoi: `en préparation avec ${l.equipe}`, genre, plage: l.prepa! });
        occ.push({ cle, qui: c.nom, quoi: `en échauffement avec ${l.equipe}`, genre, plage: l.echauffement! });
      }
      occ.push({ cle, qui: c.nom, quoi: `en jeu avec ${l.equipe}`, genre, plage: l.passage });
      // Celui qui prépare et échauffe le poney à sa place.
      if (c.enchaineAvec && c.preparateur && !estPersonne(c.preparateur)) {
        const base = { cle: cleCavalier(s, c.preparateur), qui: nomCavalier(s, c.preparateur), genre: `prepa-poney:${l.equipeId}:${c.id}` };
        const poney = c.poney ?? "le poney";
        occ.push({ ...base, quoi: `prépare ${poney} pour ${c.nom}`, plage: l.prepa! });
        occ.push({ ...base, quoi: `échauffe ${poney} pour ${c.nom}`, plage: l.echauffement! });
      }
    }
    for (const id of (l.roles.placeurs ?? []).filter((x) => !estPersonne(x))) {
      occ.push({ cle: cleCavalier(s, id), qui: nomCavalier(s, id), quoi: `placeur pour ${l.equipe}`, genre: `piste:${l.equipeId}`, plage: l.passage });
    }
    // Le cavalier du poney remplaçant suit l'équipe : préparation, échauffement et toute la session.
    // Compté seulement si un poney remplaçant est prévu.
    const remp = l.roles.cavalierRemplacant;
    if (l.remplacant && remp && !estPersonne(remp) && l.prepa && l.echauffement) {
      const base = { cle: cleCavalier(s, remp), qui: nomCavalier(s, remp), genre: `remplacant:${l.equipeId}` };
      occ.push({ ...base, quoi: `en préparation du remplaçant de ${l.equipe}`, plage: l.prepa });
      occ.push({ ...base, quoi: `en échauffement du remplaçant de ${l.equipe}`, plage: l.echauffement });
      occ.push({ ...base, quoi: `au poney remplaçant de ${l.equipe}`, plage: l.passage });
    }
    parNom(l.roles.coach, `coach de ${l.equipe}`, `coach:${l.equipeId}`, l.passage);
    parNom(l.roles.coach2, `coach de ${l.equipe}`, `coach:${l.equipeId}`, l.passage);
    parNom(l.roles.juge, `juge pour ${l.equipe}`, `piste:${l.equipeId}`, l.passage);
    parNom(l.roles.facteur, `facteur pour ${l.equipe}`, `piste:${l.equipeId}`, l.passage);
    parNom(l.roles.respPrepa, `responsable prépa de ${l.equipe}`, "prepa", l.prepa);
    parNom(l.roles.respEchauffement, `responsable échauffement de ${l.equipe}`, "echauffement", l.echauffement);
    parNom(l.roles.respEchauffement2, `responsable échauffement de ${l.equipe}`, "echauffement", l.echauffement);
  }
  return occ;
}

const chevauche = (a: Plage, b: Plage) => a.debut < b.fin && b.debut < a.fin;

export function verifierTableau(s: SaisonPonyGames, r: ResultatConcours): AlerteTableau[] {
  const out: AlerteTableau[] = [];
  for (const l of lignesTableau(s, r)) {
    if (!l.passage) continue;
    const manque: string[] = [];
    if (!l.roles.respPrepa?.trim()) manque.push("responsable préparation");
    if (!l.roles.respEchauffement?.trim() && !l.roles.respEchauffement2?.trim()) manque.push("responsable échauffement");
    if (!l.roles.placeurs?.length) manque.push("placeur (1 minimum)");
    if (!l.roles.juge?.trim()) manque.push("juge de ligne");
    if (!l.roles.facteur?.trim()) manque.push("facteur");
    if (!l.roles.coach?.trim() && !l.roles.coach2?.trim()) manque.push("coach");
    if (manque.length) out.push({ gravite: "alerte", message: `${l.equipe} : ${manque.join(", ")} à désigner.` });
    for (const c of l.cavaliers) {
      if (!c.enchaineAvec || c.preparateur) continue;
      const poney = c.poney ? `son poney (${c.poney})` : "son poney";
      out.push({
        gravite: "erreur",
        message: `${c.nom} joue avec ${c.enchaineAvec} puis avec ${l.equipe} (${plageLisible(l.passage)}) sur un autre poney : désigner qui prépare et échauffe ${poney}.`,
      });
    }
  }

  const occ = occupations(s, r);
  // Un seul message par personne et par paire d'engagements (le premier temps qui chevauche).
  const dejaDit = new Set<string>();
  for (let i = 0; i < occ.length; i++) {
    for (let j = i + 1; j < occ.length; j++) {
      const a = occ[i];
      const b = occ[j];
      if (a.cle !== b.cle || a.genre === b.genre || !chevauche(a.plage, b.plage)) continue;
      const paire = [a.cle, ...[a.genre, b.genre].sort()].join("|");
      if (dejaDit.has(paire)) continue;
      dejaDit.add(paire);
      out.push({ gravite: "erreur", message: `${a.qui} : ${a.quoi} (${plageLisible(a.plage)}) et ${b.quoi} (${plageLisible(b.plage)}) en même temps.` });
    }
  }
  return out.sort((x, y) => (x.gravite === y.gravite ? 0 : x.gravite === "erreur" ? -1 : 1));
}

// ─── Qui est disponible pour un rôle ───────────────────────────────────────

export type RolePassage =
  | "respPrepa" | "respEchauffement" | "respEchauffement2" | "placeur" | "juge" | "facteur" | "coach" | "coach2" | "cavalierRemplacant"
  | "preparateur";

export interface Candidat {
  /** Nom à inscrire dans la case. */
  nom: string;
  /** Présent pour un cavalier de la saison. */
  cavalierId?: string;
  /** Où est la personne à ce moment-là ; absent si elle est libre. */
  occupe?: string;
  /** Tâches déjà confiées dans ce concours (hors préparation, échauffement et jeu avec son équipe). */
  taches: number;
}

/**
 * Nombre de tâches confiées à chacun dans le concours : placeur, juge,
 * facteur, coach, responsable de prépa ou d'échauffement, cavalier du poney
 * remplaçant. Préparer, s'échauffer et jouer avec son équipe ne comptent pas.
 */
export function compterTaches(s: SaisonPonyGames, r: ResultatConcours): Map<string, number> {
  const n = new Map<string, number>();
  const ajouter = (cle: string) => n.set(cle, (n.get(cle) ?? 0) + 1);
  for (const l of lignesTableau(s, r)) {
    const ro = l.roles;
    for (const id of ro.placeurs ?? []) if (!estPersonne(id)) ajouter(cleCavalier(s, id));
    if (l.remplacant && ro.cavalierRemplacant && !estPersonne(ro.cavalierRemplacant)) ajouter(cleCavalier(s, ro.cavalierRemplacant));
    for (const c of l.cavaliers) if (c.enchaineAvec && c.preparateur && !estPersonne(c.preparateur)) ajouter(cleCavalier(s, c.preparateur));
    for (const nom of [ro.respPrepa, ro.respEchauffement, ro.respEchauffement2, ro.juge, ro.facteur, ro.coach, ro.coach2]) {
      if (nom?.trim() && !estPersonne(nom)) ajouter(clePersonne(s, nom));
    }
  }
  return n;
}

/**
 * Pour un rôle d'un passage : les cavaliers de la saison et les autres
 * personnes déjà désignées dans ce concours, libres d'abord (par ordre
 * alphabétique), puis les occupés avec ce qui les retient.
 */
export function candidatsRole(
  s: SaisonPonyGames,
  r: ResultatConcours,
  equipeId: string,
  roleDemande: RolePassage,
  /** Pour « preparateur » : le cavalier dont on prépare le poney. */
  pourCavalier?: string,
): Candidat[] {
  // Le 2e coach ou 2e responsable a le même créneau que le premier.
  const role = roleDemande === "coach2" ? "coach" : roleDemande === "respEchauffement2" ? "respEchauffement" : roleDemande;
  const l = lignesTableau(s, r).find((x) => x.equipeId === equipeId);
  const plage = !l ? undefined
    : role === "respPrepa" ? l.prepa
    : role === "respEchauffement" ? l.echauffement
    : role === "cavalierRemplacant" ? (l.prepa && l.passage ? { debut: l.prepa.debut, fin: l.passage.fin } : undefined)
    : role === "preparateur" ? (l.prepa && l.echauffement ? { debut: l.prepa.debut, fin: l.echauffement.fin } : undefined)
    : l.passage;
  const genre = role === "respPrepa" ? "prepa"
    : role === "respEchauffement" ? "echauffement"
    : role === "cavalierRemplacant" ? `remplacant:${equipeId}`
    : role === "preparateur" ? `prepa-poney:${equipeId}:${pourCavalier}`
    : role === "coach" ? `coach:${equipeId}`
    : `piste:${equipeId}`;
  const occ = occupations(s, r);

  // Les cavaliers d'une équipe engagée sans horaire : on ne sait pas quand ils jouent, on ne les propose pas.
  const sansHoraire = new Map<string, string>();
  for (const x of lignesTableau(s, r)) {
    if (x.passage || !plage) continue;
    for (const c of x.cavaliers) sansHoraire.set(cleCavalier(s, c.id), `joue avec ${x.equipe} — horaire à saisir`);
  }

  const personnes = new Map<string, Omit<Candidat, "taches">>();
  for (const c of s.cavaliers) {
    const cle = cleCavalier(s, c.id);
    if (!personnes.has(cle)) personnes.set(cle, { nom: nomCavalier(s, c.id), cavalierId: c.id });
  }
  for (const o of occ) if (!personnes.has(o.cle)) personnes.set(o.cle, { nom: o.qui });

  const taches = compterTaches(s, r);
  const out = [...personnes.entries()].map(([cle, sansTaches]): Candidat => {
    const cand = { ...sansTaches, taches: taches.get(cle) ?? 0 };
    const gene = plage && occ.find((o) => o.cle === cle && o.genre !== genre && chevauche(o.plage, plage));
    if (gene) return { ...cand, occupe: `${gene.quoi} (${plageLisible(gene.plage)})` };
    return sansHoraire.has(cle) ? { ...cand, occupe: sansHoraire.get(cle) } : cand;
  });
  return out.sort((a, b) => Number(!!a.occupe) - Number(!!b.occupe) || a.nom.localeCompare(b.nom, "fr"));
}

// ─── Impression ────────────────────────────────────────────────────────────

const echapper = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Page HTML autonome du tableau, prête à imprimer (A4 paysage). */
export function htmlTableau(s: SaisonPonyGames, r: ResultatConcours): string {
  const lignes = lignesTableau(s, r);
  const date = r.date.split("-").reverse().join("/");
  const titre = `${r.nom} — ${date}${r.lieu ? ` — ${r.lieu}` : ""}`;
  const deux = (a?: string, b?: string) => [a, b].filter(Boolean).map((x) => echapper(x!)).join("<br>");
  const cellule = (plage: Plage | undefined, resp?: string) =>
    `<b>${plageLisible(plage)}</b><br>${resp ? echapper(resp) : '<span class="vide">……</span>'}`;
  const corps = lignes.map((l) => `
    <tr>
      <td><b>${plageLisible(l.passage)}</b><br>${echapper(l.equipe)}<br><span class="cat">${echapper(l.categorie)}</span></td>
      <td>${l.cavaliers.map((c) => `${echapper(c.nom)}${c.poney ? ` — <i>${echapper(c.poney)}</i>` : ""}${c.dejaPretDepuis ? ` <span class="cat">(prêt depuis ${c.dejaPretDepuis})</span>` : ""}${c.enchaineAvec ? ` <span class="cat">(prépa : ${c.preparateur ? echapper(nomCavalier(s, c.preparateur)) : "……"})</span>` : ""}`).join("<br>")}
        ${l.remplacant ? `<br><span class="cat">Remplaçant : <i>${echapper(l.remplacant)}</i>${l.roles.cavalierRemplacant ? ` (${echapper(nomCavalier(s, l.roles.cavalierRemplacant))})` : ""}</span>` : ""}</td>
      <td>${deux(l.roles.coach, l.roles.coach2) || '<span class="vide">……</span>'}</td>
      <td>${cellule(l.prepa, l.roles.respPrepa)}</td>
      <td>${cellule(l.echauffement, [l.roles.respEchauffement, l.roles.respEchauffement2].filter(Boolean).join(" et ") || undefined)}</td>
      <td>${(l.roles.placeurs ?? []).map((id) => echapper(nomCavalier(s, id))).join("<br>") || '<span class="vide">……</span>'}</td>
      <td>${l.roles.juge ? echapper(l.roles.juge) : '<span class="vide">……</span>'}</td>
      <td>${l.roles.facteur ? echapper(l.roles.facteur) : '<span class="vide">……</span>'}</td>
    </tr>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 5px; vertical-align: top; text-align: left; }
  th { background: #e8eefc; font-size: 10px; text-transform: uppercase; }
  tr { page-break-inside: avoid; }
  .cat { color: #555; font-size: 10px; }
  .vide { color: #bbb; }
</style></head><body>
<h1>${echapper(titre)}</h1>
<table>
  <thead><tr>
    <th>Passage</th><th>Cavaliers — poneys</th><th>Coach</th><th>Prépa poneys (${DUREE_PREPA_MIN} min)</th>
    <th>Échauffement (${DUREE_ECHAUFFEMENT_MIN} min)</th><th>Placeurs</th><th>Juge de ligne</th><th>Facteur</th>
  </tr></thead>
  <tbody>${corps}</tbody>
</table>
<script>window.onload = () => window.print();</script>
</body></html>`;
}
