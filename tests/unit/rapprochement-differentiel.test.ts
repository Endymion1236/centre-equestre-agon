/**
 * tests/unit/rapprochement-differentiel.test.ts
 *
 * Le rapprochement bancaire a été déplacé de l'écran de comptabilité vers
 * rapprochement-matching.ts sans être réécrit. Les tests unitaires du module
 * n'exercent ni les chèques ni les espèces, les deux modes les plus courants
 * au centre. Ce test fait autre chose : il génère des relevés et des recettes
 * au hasard (graine fixe, donc rejouable), fait tourner l'ANCIEN code figé
 * dans tests/fixtures et le nouveau sur les mêmes données, et exige le même
 * résultat ligne à ligne, ensembles consommés compris.
 *
 * RAPPROCHEMENT_DIFF_N=2000 pour une passe plus longue.
 */
import { rapprocherReleve } from "../../src/app/admin/comptabilite/rapprochement-matching";
import { rapprocherReleveAncien } from "../fixtures/rapprochement-ancien-main";

let seed = 20260902;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const r2 = (n: number) => Math.round(n * 100) / 100;

const FAMILLES = ["DUPONT", "LE MOAL", "MARTIN", "GARCIA", "LEFEBVRE", "BERNARD", "ROUX", "PETIT"];
const MONTANTS = [15, 20, 25, 30, 45, 57, 60, 114, 150, 175, 200, 350];
const MODES = ["cheque", "especes", "cb_terminal", "cb_online", "cb_cawl", "virement", "sepa", "prelevement_sepa"];
const ts = (y: number, m: number, d: number) => ({ seconds: Math.floor(new Date(y, m - 1, d, 10).getTime() / 1000) });
const fr = (y: number, m: number, d: number) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;

function scenario(k: number) {
  const period = "2026-05";
  const encs: any[] = [];
  const n = int(4, 30);
  for (let i = 0; i < n; i++) {
    const prev = rnd() < 0.2;
    const m = prev ? 4 : 5, d = int(1, 28);
    encs.push({ id: `enc${k}_${i}`, mode: pick(MODES), montant: rnd() < 0.8 ? pick(MONTANTS) : r2(rnd() * 400),
      familyName: pick(FAMILLES), date: rnd() < 0.03 ? null : ts(2026, m, d), activityTitle: pick(["Cours", "Stage", "Balade"]) });
  }
  const byMode = (mode: string) => encs.filter(e => e.mode === mode);
  const remises: any[] = [];
  for (const pm of ["cheque", "especes", "mixte", "cb"]) {
    if (rnd() < 0.6) {
      const pool = pm === "mixte" ? encs.filter(e => e.mode === "cheque" || e.mode === "especes") : byMode(pm === "cb" ? "cb_terminal" : pm);
      const ids = pool.filter(() => rnd() < 0.6).map(e => e.id);
      const total = r2(pool.filter(e => ids.includes(e.id)).reduce((s, e) => s + e.montant, 0));
      remises.push({ id: `rem${k}_${pm}`, paymentMode: pm, encaissementIds: ids, total, montantTotal: rnd() < 0.5 ? total : undefined, date: ts(2026, 5, int(1, 28)) });
    }
  }
  const remisesSepa: any[] = [];
  for (let i = 0; i < int(0, 3); i++) {
    const pool = encs.filter(e => e.mode === "sepa" || e.mode === "prelevement_sepa");
    const ids = pool.filter(() => rnd() < 0.7).map(e => e.id);
    const total = r2(pool.filter(e => ids.includes(e.id)).reduce((s, e) => s + e.montant, 0));
    const dp = int(1, 28); remisesSepa.push({ id: `rs${k}_${i}`, numero: i + 1, nbTransactions: ids.length, encaissementIds: ids, total, montantTotal: rnd() < 0.85 ? total : r2(rnd() * 500), datePrelevement: rnd() < 0.7 ? `2026-05-${String(dp).padStart(2, "0")}` : `2026-04-${String(dp).padStart(2, "0")}`, date: ts(2026, 5, dp), statut: pick(["envoyee", "rejetee", "ok"]) });
  }
  const payments: any[] = [];
  for (let i = 0; i < int(0, 8); i++) {
    payments.push({ id: `pay${k}_${i}`, familyName: pick(FAMILLES), totalTTC: pick(MONTANTS), paymentMode: pick(["virement", "virement", "sepa", "cheque", "cb_online"]),
      status: pick(["pending", "partial", "paid", "en_attente"]), date: rnd() < 0.7 ? ts(2026, 5, int(1, 28)) : fr(2026, 5, int(1, 28)), matchType: rnd() < 0.1 ? "Manuel" : undefined });
  }
  const dayTotal = (mode: string, d: number) => r2(encs.filter(e => e.mode === mode && e.date && new Date(e.date.seconds * 1000).getDate() === d && new Date(e.date.seconds * 1000).getMonth() === 4).reduce((s, e) => s + e.montant, 0));
  const parsed: any[] = [];
  for (let i = 0; i < int(3, 14); i++) {
    const d = int(1, 31);
    const fam = pick(FAMILLES);
    const kind = pick(["chq", "chq2", "esp", "esp2", "cbt", "cbt2", "cawl", "vir", "prlv", "sepa", "autre"]);
    let label = "", amount = 0;
    const anyEnc = encs.length ? pick(encs) : null;
    const rem = (pm: string) => remises.find(r => r.paymentMode === pm);
    switch (kind) {
      case "chq": label = `REMISE CHQ N°${int(100, 999)}`; amount = rem("cheque")?.total || dayTotal("cheque", d) || (anyEnc?.montant ?? 50); break;
      case "chq2": label = `REMISE DE CHEQUES ${int(1, 9)}`; amount = dayTotal("cheque", d) || r2(rnd() * 300); break;
      case "esp": label = `VERSEMENT ESPECES`; amount = rem("especes")?.total || dayTotal("especes", d) || (anyEnc?.montant ?? 20); break;
      case "esp2": label = `REMISE ESP GAB`; amount = dayTotal("especes", d) || r2(rnd() * 200); break;
      case "cbt": label = `REMISE CB TPE ${int(1000, 9999)}`; amount = dayTotal("cb_terminal", d) || r2(rnd() * 500); break;
      case "cbt2": label = `REMISE CARTE ${fr(2026, 5, Math.min(d, 28))}`; amount = r2(byMode("cb_terminal").filter(() => rnd() < 0.5).reduce((s, e) => s + e.montant, 0)) || 42; break;
      case "cawl": { const cb = byMode("cb_online").concat(byMode("cb_cawl")); const g = cb.reduce((s, e) => s + e.montant, 0); label = `VIR WORLDLINE CAWL ${int(1, 99)}`; amount = r2(g - cb.reduce((s, e) => s + e.montant * 0.029 + 0.25, 0)) || 99; break; }
      case "vir": label = `VIR SEPA ${fam} COURS`; amount = payments.find(p => p.familyName === fam)?.totalTTC || byMode("virement").find(e => e.familyName === fam)?.montant || pick(MONTANTS); break;
      case "prlv": label = `PRLV SEPA REMISE ${int(1, 9)}`; amount = (remisesSepa.length ? pick(remisesSepa).montantTotal : 0) || pick(MONTANTS); break;
      case "sepa": label = `REMISE SEPA ICS FR12ZZZ`; amount = (remisesSepa.length ? pick(remisesSepa).montantTotal : 0) || (byMode("sepa").concat(byMode("prelevement_sepa"))[0]?.montant) || pick(MONTANTS); break;
      default: label = pick(["INTERETS", "AVOIR", "REGUL", "REMBOURSEMENT ASSURANCE"]); amount = pick(MONTANTS); break;
    }
    if (rnd() < 0.15) amount = r2(amount + pick([-0.01, 0.01, 0.5, -5, 10]));
    if (amount <= 0) amount = 12.5;
    parsed.push({ date: fr(2026, 5, Math.min(d, 31)), label, amount: r2(amount), matched: false, matchType: "", matchDetail: "" });
  }
  const bankLines: any[] = parsed.filter(() => rnd() < 0.3).map(bl => ({ ...bl, matched: rnd() < 0.7, matchType: pick(["Manuel", "Ignoré", "Chèque", "Auto"]), matchDetail: "ancien", matchedEncs: [{ familyName: "X" }], manualPaymentId: rnd() < 0.5 ? "p1" : undefined }));
  return { parsed, etat: { encaissementsCompta: encs, payments, remises, remisesSepa, period, bankLines } };
}

const clone = (o: any) => JSON.parse(JSON.stringify(o));
const setEq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));
const N = Number(process.env.RAPPROCHEMENT_DIFF_N || 400);
let divergences = 0, lignes = 0, rapprochees = 0;
const exemples: string[] = [];
const parType: Record<string, number> = {};
const silence = console.log; console.log = () => {};
for (let k = 0; k < N; k++) {
  const sc = scenario(k);
  const A = rapprocherReleveAncien(clone(sc.parsed), clone(sc.etat));
  const B = rapprocherReleve(clone(sc.parsed), clone(sc.etat));
  lignes += sc.parsed.length;
  rapprochees += B.finalMatched.filter(l => l.matched).length;
  for (const l of B.finalMatched) { const t = l.matchType || "(non rapprochée)"; parType[t] = (parType[t] || 0) + 1; }
  const a = JSON.stringify(A.finalMatched), b = JSON.stringify(B.finalMatched);
  const sets = setEq(A.usedEncIds, B.usedEncIds) && setEq(A.usedRemiseIds, B.usedRemiseIds) && setEq(A.usedRemiseSepaIds, B.usedRemiseSepaIds) && setEq(A.usedPaymentIds, B.usedPaymentIds);
  if (a !== b || !sets || A.autoOverwritten !== B.autoOverwritten || A.manuelsPreserves !== B.manuelsPreserves) {
    divergences++;
    if (exemples.length < 6) {
      const i = A.finalMatched.findIndex((l: any, j: number) => JSON.stringify(l) !== JSON.stringify(B.finalMatched[j]));
      exemples.push(`scénario ${k} ligne ${i} : ${JSON.stringify(sc.parsed[i])}\n   ANCIEN → ${JSON.stringify({ matched: A.finalMatched[i]?.matched, type: A.finalMatched[i]?.matchType, detail: A.finalMatched[i]?.matchDetail })}\n   NOUVEAU → ${JSON.stringify({ matched: B.finalMatched[i]?.matched, type: B.finalMatched[i]?.matchType, detail: B.finalMatched[i]?.matchDetail })}${sets ? "" : "\n   (ensembles used* différents)"}`);
    }
  }
}
console.log = silence;
console.log(`rapprochement différentiel : ${N} scénarios, ${lignes} lignes bancaires, ${rapprochees} rapprochées — ${divergences} divergence(s) ancien/nouveau`);
if (divergences) console.log("Répartition par type (nouveau) :", parType);
for (const e of exemples) console.log(" - " + e);
process.exit(divergences ? 1 : 0);
