/**
 * src/lib/produits-annexes.ts — les produits qui ne sont pas des activités
 * (licence FFE, adhésion), à ajouter d'un clic à une commande ou au panier.
 *
 * Octobre 2026, Nicolas : « hier, j'ai voulu rajouter à un impayé une
 * licence, mais à part la taper en texte libre, je ne peux pas trouver le
 * produit licence, et je ne suis pas sûr que ça rentre dans mes comptes
 * correctement ». Une ligne tapée à la main dépendait de son libellé pour
 * trouver son compte, et de la TVA choisie à la main.
 *
 * Ici, chaque produit porte son prix (réglages de l'inscription, comme à
 * l'inscription annuelle), sa TVA et son compte du plan Celeris :
 *   - licence FFE : TVA 0 %, 70100000 « Refacturation FFE » ;
 *   - adhésion    : TVA 5,5 %, 70611110 « Cotisations / Adhésions ».
 * Mêmes libellés que les lignes de l'inscription annuelle.
 *
 * Module pur, testé seul (tests/unit/produits-annexes.test.ts).
 */
import { tauxTva } from "@/lib/tva-taux";

/** Champs utiles du document settings/inscription. */
export interface TarifsAnnexes {
  licenceMoins18?: number | null;
  licencePlus18?: number | null;
  adhesion1?: number | null;
  adhesion2?: number | null;
  adhesion3?: number | null;
}

/** Valeurs par défaut, les mêmes que l'inscription annuelle et les devis. */
export const TARIFS_ANNEXES_DEFAUT: Required<{ [K in keyof TarifsAnnexes]: number }> = {
  licenceMoins18: 25, licencePlus18: 36, adhesion1: 60, adhesion2: 40, adhesion3: 20,
};

export interface ProduitAnnexe {
  id: string;
  label: string;
  priceTTC: number;
  tva: number;
  category: string;
  compteComptable: string;
}

const prix = (v: unknown, defaut: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && v !== null && v !== "" && v !== undefined ? Math.round(n * 100) / 100 : defaut;
};

/** Les produits proposés, au prix des réglages (un prix à 0 n'est pas proposé). */
export function produitsAnnexes(t: TarifsAnnexes | null | undefined): ProduitAnnexe[] {
  const r = t || {};
  const d = TARIFS_ANNEXES_DEFAUT;
  const licence = (id: string, label: string, p: number): ProduitAnnexe =>
    ({ id, label, priceTTC: p, tva: 0, category: "licence", compteComptable: "70100000" });
  const adhesion = (rang: number, p: number): ProduitAnnexe =>
    ({ id: `adhesion${rang}`, label: `Adhésion annuelle (enfant ${rang})`, priceTTC: p, tva: 5.5, category: "adhesion", compteComptable: "70611110" });
  return [
    licence("licenceMoins18", "Licence FFE -18ans", prix(r.licenceMoins18, d.licenceMoins18)),
    licence("licencePlus18", "Licence FFE +18ans", prix(r.licencePlus18, d.licencePlus18)),
    adhesion(1, prix(r.adhesion1, d.adhesion1)),
    adhesion(2, prix(r.adhesion2, d.adhesion2)),
    adhesion(3, prix(r.adhesion3, d.adhesion3)),
  ].filter((p) => p.priceTTC > 0);
}

/** La ligne de commande d'un produit, pour un cavalier ou pour la famille. */
export function ligneProduitAnnexe(p: ProduitAnnexe, cavalier?: { id?: string; prenom?: string } | null) {
  const taux = tauxTva(p.tva);
  return {
    activityTitle: p.label,
    childId: cavalier?.id || "",
    childName: cavalier?.prenom || "",
    priceTTC: p.priceTTC,
    priceHT: Math.round((p.priceTTC / (1 + taux / 100)) * 100) / 100,
    tva: taux,
    category: p.category,
    compteComptable: p.compteComptable,
  };
}
