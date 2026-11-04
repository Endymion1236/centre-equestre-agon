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
  releveSeul: MouvementReleve[];
  fecSeul: LigneBanqueFec[];
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
  const ordre = [...releve.keys()].sort((a, b) => releve[a].date.localeCompare(releve[b].date));
  let apparies = 0;

  // 1. Une pour une.
  for (const i of ordre) {
    const r = releve[i];
    let meilleur = -1, ecartMin = Infinity;
    for (const j of libresFec) {
      if (ct(fec[j].montant) !== ct(r.montant)) continue;
      const d = jours(fec[j].date, r.date);
      if (d <= 7 && d < ecartMin) { meilleur = j; ecartMin = d; }
    }
    if (meilleur >= 0) { libresFec.delete(meilleur); libresReleve.delete(i); apparies++; }
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

  const totalReleve = total(releve), totalFec = total(fec);
  return {
    totalReleve, totalFec, ecart: Math.round((totalFec - totalReleve) * 100) / 100,
    apparies, decales,
    releveSeul: [...libresReleve].map((i) => releve[i]).sort((a, b) => a.date.localeCompare(b.date)),
    fecSeul: [...libresFec].map((j) => fec[j]).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Le contrôle en texte, à copier pour la comptable. */
export function texteControleBanque(mois: string, c: ControleBanque): string {
  const e = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const d = (iso: string) => iso.split("-").reverse().join("/");
  const lignes = [
    `Contrôle de banque — ${mois}`,
    `Mouvements du relevé : ${e(c.totalReleve)}`,
    `Compte 512 du FEC : ${e(c.totalFec)}`,
    `Écart (FEC − relevé) : ${e(c.ecart)}`,
    `${c.apparies} mouvement(s) rapproché(s).`,
  ];
  if (c.releveSeul.length) lignes.push("", "Au relevé, absent du FEC :", ...c.releveSeul.map((r) => `  ${d(r.date)}  ${r.libelle}  ${e(r.montant)}${r.note ? ` (${r.note})` : ""}`));
  if (c.fecSeul.length) lignes.push("", "Dans le FEC, absent du relevé :", ...c.fecSeul.map((f) => `  ${d(f.date)}  ${f.journal} n° ${f.numero}  ${f.libelle}  ${e(f.montant)}`));
  if (c.decales.length) lignes.push("", "Même montant, dates différentes (décalage, sans écart d'argent) :", ...c.decales.map((x) => `  relevé ${d(x.releve.date)} / FEC ${d(x.fec.date)}  ${x.releve.libelle}  ${e(x.releve.montant)}`));
  return lignes.join("\n");
}
