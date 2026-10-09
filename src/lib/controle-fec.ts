/**
 * src/lib/controle-fec.ts — le contrôle de structure de Test Compta Démat,
 * refait avant chaque téléchargement ou envoi du FEC.
 *
 * Octobre 2026 : Test Compta Démat (DGFiP) a rejeté le FEC de septembre,
 * « vérifiez le nom des champs et le nombre de séparateurs ». Les règles
 * ci-dessous sont celles de son code source (src/testeur/trt_txt.pl et
 * fmt_arrete, github.com/DGFiP/Test-Compta-Demat) :
 *   - en-tête : les 18 champs de l'arrêté, dans l'ordre ;
 *   - chaque ligne : autant de champs que l'en-tête (une tabulation ou un
 *     retour à la ligne dans un libellé décale tout) ;
 *   - dates au format AAAAMMJJ ; montants numériques, point ou virgule ;
 *   - champs obligatoires non vides ;
 *   - chaque écriture équilibrée (art. A.47 A-1 du LPF).
 * Module pur : il ne corrige rien, il dit ce qui ne va pas.
 */

export const CHAMPS_FEC = [
  "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib",
  "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit",
  "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
] as const;

const OBLIGATOIRES = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "PieceRef", "PieceDate", "EcritureLib", "ValidDate"];
const DATES = ["EcritureDate", "PieceDate", "ValidDate", "DateLet"];
const MONTANTS = ["Debit", "Credit", "Montantdevise"];

function dateValide(v: string): boolean {
  if (!/^\d{8}$/.test(v)) return false;
  const a = Number(v.slice(0, 4)), m = Number(v.slice(4, 6)), j = Number(v.slice(6, 8));
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/** Les anomalies de structure, en clair ; vide si le fichier passe. */
export function controlerStructureFec(contenu: string, max = 20): string[] {
  const erreurs: string[] = [];
  const ajouter = (e: string) => { if (erreurs.length < max) erreurs.push(e); };
  const lignes = contenu.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  if (lignes[lignes.length - 1] === "") lignes.pop();
  const entete = (lignes[0] || "").split("\t");
  if (entete.join("\t") !== CHAMPS_FEC.join("\t")) {
    ajouter(`En-tête non conforme : ${entete.length} champ(s) au lieu des ${CHAMPS_FEC.length} de l'arrêté, ou noms différents.`);
    return erreurs;
  }
  const idx = (c: string) => CHAMPS_FEC.indexOf(c as (typeof CHAMPS_FEC)[number]);
  const soldes = new Map<string, number>();
  lignes.slice(1).forEach((ligne, i) => {
    const n = i + 2;
    if (ligne === "") { ajouter(`Ligne ${n} vide.`); return; }
    const v = ligne.split("\t");
    if (v.length !== CHAMPS_FEC.length) {
      ajouter(`Ligne ${n} : ${v.length} champs au lieu de ${CHAMPS_FEC.length} (tabulation ou retour à la ligne dans un libellé ?) — « ${ligne.slice(0, 80)} »`);
      return;
    }
    for (const c of OBLIGATOIRES) if (!v[idx(c)].trim()) ajouter(`Ligne ${n} : ${c} vide.`);
    for (const c of DATES) if (v[idx(c)] && !dateValide(v[idx(c)])) ajouter(`Ligne ${n} : ${c} « ${v[idx(c)]} » n'est pas une date AAAAMMJJ.`);
    // Virgule décimale exigée : Test Compta Démat rejette « 12.50 ».
    for (const c of MONTANTS) if (v[idx(c)] && !/^-?\d+(,\d{1,2})?$/.test(v[idx(c)])) ajouter(`Ligne ${n} : ${c} « ${v[idx(c)]} » n'est pas un montant au format du FEC (virgule décimale attendue).`);
    const cts = (s: string) => Math.round(Number((s || "0").replace(",", ".")) * 100);
    const cle = `${v[idx("JournalCode")]}|${v[idx("EcritureNum")]}`;
    soldes.set(cle, (soldes.get(cle) || 0) + cts(v[idx("Debit")]) - cts(v[idx("Credit")]));
  });
  for (const [cle, solde] of soldes) {
    if (solde !== 0) ajouter(`Écriture ${cle.replace("|", " n° ")} déséquilibrée de ${(solde / 100).toFixed(2)} €.`);
  }
  return erreurs;
}
