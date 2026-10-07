/**
 * src/app/admin/comptabilite/releve-partage.ts — un seul export bancaire pour
 * les dépenses ET le rapprochement des recettes.
 *
 * Octobre 2026, Nicolas : « est-ce que le CSV des dépenses et justificatifs
 * pourrait être lu en même temps pour le rapprochement bancaire ? ». Le même
 * fichier de la banque s'importait deux fois : dans Dépenses (qui ne garde
 * que les débits) puis dans Comptabilité → Rapprochement (qui ne garde que
 * les crédits). Depuis Dépenses, un bouton passe désormais le fichier au
 * rapprochement, qui le lit avec ses propres règles : les crédits
 * s'ajoutent au relevé du mois, sans doublon si le fichier y avait déjà été
 * importé (fusion par date, libellé et montant).
 *
 * Le fichier transite par le stockage local du navigateur (partagé entre
 * onglets) le temps d'ouvrir l'autre écran ; il est effacé dès qu'il est lu.
 *
 * Module pur, testé seul (tests/unit/releve-partage.test.ts).
 */
import { parserCsvBancaire } from "./rapprochement-utils";

export const CLE_RELEVE_A_RAPPROCHER = "releve-a-rapprocher";
/** Au-delà, un relevé oublié dans le navigateur n'est plus repris. */
const VALIDITE_MS = 60 * 60 * 1000;

export interface ResumeCreditsReleve {
  credits: number;
  totalCentimes: number;
  /** Mois (AAAA-MM) qui porte le plus de crédits : celui à ouvrir au rapprochement. */
  mois: string | null;
}

/** Ce que le rapprochement lira dans ce fichier : ses crédits, et leur mois principal. */
export function resumeCreditsReleve(texte: string): ResumeCreditsReleve {
  const lignes = parserCsvBancaire(texte || "");
  const parMois = new Map<string, number>();
  for (const l of lignes) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(l.date);
    if (!m) continue;
    const mois = `${m[3]}-${m[2].padStart(2, "0")}`;
    parMois.set(mois, (parMois.get(mois) || 0) + 1);
  }
  let mois: string | null = null;
  for (const [m, n] of parMois) if (!mois || n > parMois.get(mois)! || (n === parMois.get(mois) && m > mois)) mois = m;
  return {
    credits: lignes.length,
    totalCentimes: lignes.reduce((s, l) => s + Math.round(l.amount * 100), 0),
    mois,
  };
}

export interface ReleveEnAttente { texte: string; nom: string; mois: string; deposeLe: number }

export function emballerReleve(texte: string, nom: string, mois: string, maintenant = Date.now()): string {
  return JSON.stringify({ texte, nom, mois, deposeLe: maintenant } satisfies ReleveEnAttente);
}

/** Le relevé déposé par Dépenses, s'il est complet et récent ; null sinon. */
export function deballerReleve(brut: string | null, maintenant = Date.now()): ReleveEnAttente | null {
  if (!brut) return null;
  try {
    const r = JSON.parse(brut);
    if (typeof r?.texte !== "string" || !r.texte || !/^\d{4}-\d{2}$/.test(String(r.mois))) return null;
    if (typeof r.deposeLe !== "number" || maintenant - r.deposeLe > VALIDITE_MS || r.deposeLe > maintenant + 60_000) return null;
    return { texte: r.texte, nom: String(r.nom || ""), mois: r.mois, deposeLe: r.deposeLe };
  } catch {
    return null;
  }
}
