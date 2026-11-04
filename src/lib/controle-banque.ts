/**
 * src/lib/controle-banque.ts — le relevé du mois face au compte de banque du FEC.
 *
 * Novembre 2026, la comptable : « le solde en banque ne correspond pas à
 * celui du FEC ». Le 512 du FEC vient de deux chemins (journal RG pour les
 * virements, prélèvements SEPA et versements d'espèces, à la date saisie ;
 * journal BQ pour le reste, depuis le relevé). Ce contrôle met chaque
 * mouvement du relevé en face de sa ligne de banque dans le FEC et liste ce
 * qui manque d'un côté ou de l'autre : c'est le « solde de banque à valider
 * chaque fin de mois » demandé par le cabinet (16/10/2026).
 *
 * Rapprochement, dans l'ordre :
 *  1. une ligne pour une ligne, même montant, 7 jours au plus d'écart ;
 *  2. une ligne du relevé pour plusieurs lignes du FEC (un virement qui règle
 *     trois échéances, une remise SEPA de plusieurs prélèvements) : même jour,
 *     ou au plus 4 lignes dont la somme fait le montant, à 7 jours ;
 *  3. même montant mais plus de 7 jours d'écart (45 au plus) : un décalage de
 *     date, à vérifier mais sans écart d'argent.
 * Sans import, testé (tests/unit/controle-banque.test.ts).
 */

export interface MouvementReleve {
  id: string;
  /** AAAA-MM-JJ */
  date: string;
  libelle: string;
  /** Signé : positif = crédit (entrée d'argent), négatif = débit. */
  montant: number;
  note?: string;
  /**
   * Mouvement que le FEC laisse volontairement de côté (doublon probable du
   * relevé, pas encore tranché) : il reste « au relevé seulement » et ne prend
   * jamais la ligne du FEC d'un autre mouvement au même montant.
   */
  horsFec?: boolean;
}

export interface LigneBanqueFec {
  journal: string;
  numero: string;
  date: string;
  libelle: string;
  piece: string;
  /** Signé : positif = débit du 512 (entrée d'argent). */
  montant: number;
}

const ct = (n: number) => Math.round(n * 100);
const jours = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
const montantFec = (v: string) => (v ? Number(v.replace(/\s/g, "").replace(",", ".")) || 0 : 0);

/** Les lignes du compte de banque (512…) d'un FEC aux 18 colonnes. */
export function lignesBanqueDuFec(contenu: string, compte: RegExp = /^512/): LigneBanqueFec[] {
  return String(contenu || "").split(/\r?\n/).slice(1)
    .map((l) => l.split("\t"))
    .filter((c) => c.length >= 13 && compte.test(c[4] || ""))
    .map((c) => ({
      journal: c[0], numero: c[2],
      date: /^\d{8}$/.test(c[3]) ? `${c[3].slice(0, 4)}-${c[3].slice(4, 6)}-${c[3].slice(6, 8)}` : c[3],
      libelle: c[10] || "", piece: c[8] || "",
      montant: Math.round((montantFec(c[11]) - montantFec(c[12])) * 100) / 100,
    }));
}

export interface ControleBanque {
  totalReleve: number;
  totalFec: number;
  /** FEC − relevé. Positif : le FEC compte plus d'argent en banque que le relevé. */
  ecart: number;
  apparies: number;
  decales: { releve: MouvementReleve; fec: LigneBanqueFec; jours: number }[];
  /** Même mouvement des deux côtés (même libellé, 3 jours), montants différents. */
  montantsDifferents: { releve: MouvementReleve; fec: LigneBanqueFec; ecart: number }[];
  /** Une remise du relevé dont le FEC n'a qu'une partie (lignes du même jour) : il manque `ecart`. */
  remisesIncompletes: { releve: MouvementReleve; date: string; nb: number; total: number; ecart: number }[];
  /** Lignes du FEC qui s'annulent entre elles (correction puis ressaisie) : aucun effet sur la banque. */
  annulations: { a: LigneBanqueFec; b: LigneBanqueFec }[];
  releveSeul: MouvementReleve[];
  fecSeul: LigneBanqueFec[];
}

const libelleCle = (l: string) => String(l || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().slice(0, 40);

// Mots qui décrivent l'opération, pas la personne.
const MOTS_GENERIQUES = new Set(["VIREMENT", "REGLEMENT", "FAVEUR", "VOTRE", "INST", "PRELEVEMENT", "SEPA", "STAGE", "REMISE", "CARTE", "AVIS", "EMIS", "FACTURE", "ECHEANCE", "FORFAIT", "COMMISSION", "VENTE", "DISTANCE", "CONTRE", "PASSATION"]);
// Libellé entier (libelleCle s'arrête à 40 caractères : « … VIR INST DE ODI »).
const motsNom = (l: string) => new Set(String(l || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter((m) => m.length >= 4 && !/\d/.test(m) && !MOTS_GENERIQUES.has(m)));
/** Les deux libellés partagent-ils un nom (« SIMON », « ODILE ») ? */
function memeNom(a: string, b: string): boolean {
  const ma = motsNom(a);
  for (const m of motsNom(b)) if (ma.has(m)) return true;
  return false;
}

/** Au plus `max` éléments dont la somme (centimes) vaut `cible`. */
function sousEnsemble(cands: LigneBanqueFec[], cible: number, max = 4): LigneBanqueFec[] | null {
  const n = Math.min(cands.length, 14);
  const rec = (debut: number, reste: number, pris: LigneBanqueFec[]): LigneBanqueFec[] | null => {
    if (reste === 0 && pris.length > 0) return pris;
    if (pris.length >= max) return null;
    for (let i = debut; i < n; i++) {
      const v = ct(cands[i].montant);
      if (Math.sign(v) !== Math.sign(cible) || Math.abs(v) > Math.abs(reste)) continue;
      const r = rec(i + 1, reste - v, [...pris, cands[i]]);
      if (r) return r;
    }
    return null;
  };
  return rec(0, cible, []);
}

export function comparerBanque(releve: MouvementReleve[], fec: LigneBanqueFec[]): ControleBanque {
  const total = (l: { montant: number }[]) => Math.round(l.reduce((s, x) => s + ct(x.montant), 0)) / 100;
  const libresFec = new Set(fec.map((_, i) => i));
  const libresReleve = new Set(releve.map((_, i) => i));
  const ordre = [...releve.keys()].filter((i) => !releve[i].horsFec).sort((a, b) => releve[a].date.localeCompare(releve[b].date));
  let apparies = 0;

  // 1. Une pour une : d'abord même montant ET même nom (SIMON, 10/2026 : le
  //    virement du 17/10 prenait la ligne d'un autre 180 € plus proche en date,
  //    et le règlement SIMON du 24/10 restait « absent du relevé »), puis même
  //    montant seul.
  for (const avecNom of [true, false]) {
    for (const i of ordre) {
      if (!libresReleve.has(i)) continue;
      const r = releve[i];
      let meilleur = -1, ecartMin = Infinity;
      for (const j of libresFec) {
        if (ct(fec[j].montant) !== ct(r.montant)) continue;
        if (avecNom && !memeNom(fec[j].libelle, r.libelle)) continue;
        const d = jours(fec[j].date, r.date);
        if (d <= 7 && d < ecartMin) { meilleur = j; ecartMin = d; }
      }
      if (meilleur >= 0) { libresFec.delete(meilleur); libresReleve.delete(i); apparies++; }
    }
  }
  // 2. Une ligne du relevé pour plusieurs lignes du FEC.
  for (const i of ordre) {
    if (!libresReleve.has(i)) continue;
    const r = releve[i];
    const proches = [...libresFec].filter((j) => Math.sign(fec[j].montant) === Math.sign(r.montant) && jours(fec[j].date, r.date) <= 7);
    const parJour = new Map<string, number[]>();
    for (const j of proches) parJour.set(fec[j].date, [...(parJour.get(fec[j].date) || []), j]);
    let groupe: number[] | null = null;
    for (const js of parJour.values()) {
      if (js.length > 1 && js.reduce((s, j) => s + ct(fec[j].montant), 0) === ct(r.montant)) { groupe = js; break; }
    }
    if (!groupe) {
      const tri = proches.sort((a, b) => jours(fec[a].date, r.date) - jours(fec[b].date, r.date));
      const sol = sousEnsemble(tri.map((j) => fec[j]), ct(r.montant));
      if (sol && sol.length > 1) groupe = sol.map((l) => fec.indexOf(l));
    }
    if (groupe) { for (const j of groupe) libresFec.delete(j); libresReleve.delete(i); apparies++; }
  }
  // 3. Même montant, dates éloignées.
  const decales: ControleBanque["decales"] = [];
  for (const i of ordre) {
    if (!libresReleve.has(i)) continue;
    const r = releve[i];
    let meilleur = -1, ecartMin = Infinity;
    for (const j of libresFec) {
      if (ct(fec[j].montant) !== ct(r.montant)) continue;
      const d = jours(fec[j].date, r.date);
      if (d <= 45 && d < ecartMin) { meilleur = j; ecartMin = d; }
    }
    if (meilleur >= 0) { decales.push({ releve: r, fec: fec[meilleur], jours: Math.round(ecartMin) }); libresFec.delete(meilleur); libresReleve.delete(i); }
  }

  // 4. Lignes du FEC qui s'annulent (une correction et sa ressaisie).
  const annulations: ControleBanque["annulations"] = [];
  for (const a of [...libresFec]) {
    if (!libresFec.has(a)) continue;
    for (const b of libresFec) {
      if (b === a || ct(fec[b].montant) !== -ct(fec[a].montant) || jours(fec[a].date, fec[b].date) > 7) continue;
      annulations.push({ a: fec[a], b: fec[b] }); libresFec.delete(a); libresFec.delete(b); break;
    }
  }
  // 5. Même mouvement, montants différents (la ligne de banque du FEC reprend le libellé du relevé).
  const montantsDifferents: ControleBanque["montantsDifferents"] = [];
  for (const i of ordre) {
    if (!libresReleve.has(i)) continue;
    const r = releve[i];
    const j = [...libresFec].find((k) => libelleCle(fec[k].libelle) === libelleCle(r.libelle) && libelleCle(r.libelle).length >= 8
      && Math.sign(fec[k].montant) === Math.sign(r.montant) && jours(fec[k].date, r.date) <= 3);
    if (j === undefined) continue;
    montantsDifferents.push({ releve: r, fec: fec[j], ecart: Math.round((fec[j].montant - r.montant) * 100) / 100 });
    libresFec.delete(j); libresReleve.delete(i);
  }
  // 6. Remise du relevé dont le FEC n'a qu'une partie : les lignes d'un même jour,
  //    au moins 3, pour 50 % à 125 % du montant.
  const remisesIncompletes: ControleBanque["remisesIncompletes"] = [];
  for (const i of ordre) {
    if (!libresReleve.has(i)) continue;
    const r = releve[i];
    const parJour = new Map<string, number[]>();
    for (const j of libresFec) {
      if (Math.sign(fec[j].montant) !== Math.sign(r.montant) || jours(fec[j].date, r.date) > 7) continue;
      parJour.set(fec[j].date, [...(parJour.get(fec[j].date) || []), j]);
    }
    let meilleur: { date: string; js: number[]; somme: number } | null = null;
    for (const [date, js] of parJour) {
      if (js.length < 3) continue;
      const somme = js.reduce((t, j) => t + ct(fec[j].montant), 0);
      const ratio = somme / ct(r.montant);
      if (ratio < 0.5 || ratio > 1.25) continue;
      if (!meilleur || Math.abs(somme - ct(r.montant)) < Math.abs(meilleur.somme - ct(r.montant))) meilleur = { date, js, somme };
    }
    if (!meilleur) continue;
    remisesIncompletes.push({ releve: r, date: meilleur.date, nb: meilleur.js.length, total: meilleur.somme / 100, ecart: Math.round(meilleur.somme - ct(r.montant)) / 100 });
    for (const j of meilleur.js) libresFec.delete(j);
    libresReleve.delete(i);
  }

  const totalReleve = total(releve), totalFec = total(fec);
  return {
    totalReleve, totalFec, ecart: Math.round((totalFec - totalReleve) * 100) / 100,
    apparies, decales, montantsDifferents, remisesIncompletes, annulations,
    releveSeul: [...libresReleve].map((i) => releve[i]).sort((a, b) => a.date.localeCompare(b.date)),
    fecSeul: [...libresFec].map((j) => fec[j]).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Ce qui rend le contrôle incomplet, dit avant les chiffres. Août 2026 : aucun
 * crédit du relevé au rapprochement, et un mois tenu dans Céleris — 28 159 €
 * de recettes « sans relevé » qui n'étaient que l'absence des crédits.
 */
export function avertissementsControle(p: { debits: number; credits: number; tableauIncomplet: boolean; moisCeleris: boolean; autresComptes?: number }): string[] {
  const a: string[] = [];
  if (p.autresComptes) a.push(`${p.autresComptes} débit(s) du mois portent sur un autre compte que le Crédit Agricole (FFE club, FFE compétition) : ils sont passés au FEC sur ce compte-là et restent hors de ce contrôle, qui ne compare que le 512.`);
  if (p.credits === 0) a.push("Aucun crédit du relevé pour ce mois dans le Rapprochement : le contrôle ne voit que les débits. Importez le relevé du mois dans l'onglet Rapprochement, puis relancez.");
  if (p.debits === 0) a.push("Aucun débit du relevé pour ce mois dans Dépenses : le contrôle ne voit que les crédits. Importez le relevé du mois dans Dépenses, puis relancez.");
  if (p.tableauIncomplet) a.push("Le tableau des opérations n'a pas pu être lu en entier.");
  if (p.moisCeleris) a.push("Mois tenu dans Céleris : ses encaissements CB y sont passés un par un et en brut, alors que la banque crédite une remise par jour, nette de commission. Ils ne se rapprochent pas ligne à ligne ; les remises apparaissent « en partie », l'écart étant la commission.");
  return a;
}

/** Le contrôle en texte, à copier pour la comptable. */
export function texteControleBanque(mois: string, c: ControleBanque, avertissements: string[] = []): string {
  const e = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const d = (iso: string) => iso.split("-").reverse().join("/");
  const lignes = [
    `Contrôle de banque — ${mois}`,
    `Mouvements du relevé : ${e(c.totalReleve)}`,
    `Compte 512 du FEC : ${e(c.totalFec)}`,
    `Écart (FEC − relevé) : ${e(c.ecart)}`,
    `${c.apparies} mouvement(s) rapproché(s).`,
    ...(avertissements.length ? ["", "À savoir avant de lire :", ...avertissements.map((x) => `  ${x}`)] : []),
  ];
  if (c.releveSeul.length) lignes.push("", "Au relevé, absent du FEC :", ...c.releveSeul.map((r) => `  ${d(r.date)}  ${r.libelle}  ${e(r.montant)}${r.note ? ` (${r.note})` : ""}`));
  if (c.fecSeul.length) lignes.push("", "Dans le FEC, absent du relevé :", ...c.fecSeul.map((f) => `  ${d(f.date)}  ${f.journal} n° ${f.numero}  ${f.libelle}  ${e(f.montant)}`));
  if (c.remisesIncompletes.length) lignes.push("", "Remises du relevé que le FEC n'a qu'en partie :", ...c.remisesIncompletes.map((x) => `  ${d(x.releve.date)}  ${x.releve.libelle}  ${e(x.releve.montant)} : ${x.nb} ligne(s) du ${d(x.date)} au FEC pour ${e(x.total)}, écart ${e(x.ecart)}`));
  if (c.montantsDifferents.length) lignes.push("", "Même mouvement, montants différents :", ...c.montantsDifferents.map((x) => `  ${d(x.releve.date)}  ${x.releve.libelle} : relevé ${e(x.releve.montant)}, FEC ${e(x.fec.montant)}, écart ${e(x.ecart)}`));
  if (c.annulations.length) lignes.push("", "Lignes du FEC qui s'annulent (sans effet sur la banque) :", ...c.annulations.map((x) => `  ${d(x.a.date)}  ${x.a.libelle} ${e(x.a.montant)} / ${x.b.libelle} ${e(x.b.montant)}`));
  if (c.decales.length) lignes.push("", "Même montant, dates différentes (décalage, sans écart d'argent) :", ...c.decales.map((x) => `  relevé ${d(x.releve.date)} / FEC ${d(x.fec.date)}  ${x.releve.libelle}  ${e(x.releve.montant)}`));
  return lignes.join("\n");
}
