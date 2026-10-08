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
 * S'y ajoutent les produits créés par le club (Paramètres → Produits,
 * document settings/produits) : libellé, prix, TVA et compte choisi DANS le
 * plan comptable du cabinet — un compte hors plan est refusé.
 *
 * Module pur, testé seul (tests/unit/produits-annexes.test.ts).
 */
import { tauxTva } from "@/lib/tva-taux";
import { PLAN_COMPTABLE } from "@/lib/ventilation-comptable";

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

/** Un produit créé par le club (Paramètres → Produits). */
export interface ProduitCatalogue {
  id: string;
  label: string;
  priceTTC: number;
  tva: number;
  compteComptable: string;
  actif: boolean;
}

export const TAUX_TVA_PRODUIT = [0, 5.5, 10, 20];

/** Pourquoi un produit ne peut pas être enregistré ; null s'il est complet. */
export function erreurProduit(p: Partial<ProduitCatalogue>): string | null {
  if (!String(p.label || "").trim()) return "Donnez un nom au produit.";
  if (!(Number(p.priceTTC) > 0)) return "Le prix doit être supérieur à 0.";
  if (!TAUX_TVA_PRODUIT.includes(Number(p.tva))) return "Choisissez un taux de TVA.";
  if (!PLAN_COMPTABLE.some((c) => c.code === p.compteComptable)) return "Choisissez le compte dans le plan comptable.";
  return null;
}

/** Le catalogue lu en base, sans les produits incomplets (compte hors plan, prix nul…). */
export function nettoyerCatalogue(brut: unknown): ProduitCatalogue[] {
  const liste = Array.isArray(brut) ? brut : [];
  return liste
    .map((p: any) => ({
      id: String(p?.id || "").trim(),
      label: String(p?.label || "").trim().slice(0, 80),
      priceTTC: Math.round((Number(String(p?.priceTTC ?? "").replace(",", ".")) || 0) * 100) / 100,
      tva: Number(p?.tva),
      compteComptable: String(p?.compteComptable || ""),
      actif: p?.actif !== false,
    }))
    .filter((p) => p.id && erreurProduit(p) === null);
}

/** Les produits actifs du catalogue, prêts pour les boutons. */
export function produitsDuCatalogue(brut: unknown): ProduitAnnexe[] {
  return nettoyerCatalogue(brut)
    .filter((p) => p.actif)
    .map((p) => ({ id: `cat-${p.id}`, label: p.label, priceTTC: p.priceTTC, tva: p.tva, category: "produit", compteComptable: p.compteComptable }));
}
