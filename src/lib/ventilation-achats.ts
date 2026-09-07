/** Propositions pour la comptable : aucune écriture ni catégorie enregistrée. */
import type { LigneMois } from "./bilan-justificatifs";
import { compteFournisseur, ventilerDepense } from "./plan-comptable-achats";

import { banqueDepense } from "./banque-depense";

export function comptesProposes(ligne: LigneMois) {
  const imputation = ventilerDepense(ligne);
  const banque = banqueDepense(ligne);
  // Les comptes de tiers et les virements internes ne sont pas des achats.
  const achat = /^[26]/.test(imputation.compte) && !/^627/.test(imputation.compte);
  const fournisseur = achat ? compteFournisseur(ligne.fournisseur) : { compte: "", libelle: "" };
  const controles = [
    ...(imputation.source === "a-ventiler" ? [imputation.note || "Imputation à préciser."] : []),
    ...(!banque.compte ? ["Compte de prélèvement à préciser."] : []),
    ...(achat && !fournisseur.compte ? ["Compte fournisseur à identifier."] : []),
    ...(ligne.doublonProbable ? ["Doublon probable à contrôler avant comptabilisation."] : []),
  ];
  return { imputation, banque, fournisseur, controles, aVentiler: controles.length > 0 };
}

export function lignesPourVentilation(lignes: LigneMois[]) {
  return lignes.filter(l => !l.rapprochementExclu && Number.isFinite(l.montant) && l.montant > 0);
}

export function bilanVentilationAchats(lignes: LigneMois[]) {
  const base = lignesPourVentilation(lignes);
  const incompletes = base.filter(l => comptesProposes(l).aVentiler);
  return { total: base.length, aVentiler: incompletes.length, montantAVentiler: Math.round(incompletes.reduce((s, l) => s + l.montant, 0) * 100) / 100 };
}

const champ = (valeur: unknown) => {
  const texte = String(valeur ?? "");
  // Ces colonnes contiennent des libellés importés : Excel ne doit pas les exécuter.
  const texteSur = /^[\s]*[=+@-]/.test(texte) ? "'" + texte : texte;
  return `"${texteSur.replace(/"/g, '""')}"`;
};

/** Tous les débits actifs, y compris salaires, avances FFE et personnel :
 * ce fichier prépare une ventilation, il ne produit pas un journal d'achats. */
export function construireExportVentilationAchats(lignes: LigneMois[]) {
  const entetes = ["Identifiant opération", "Mois", "Date opération", "Fournisseur / libellé", "Catégorie", "Montant débité EUR", "Compte d’imputation proposé", "Libellé compte", "Origine proposition", "Compte fournisseur reconnu", "Compte bancaire source", "Compte banque proposé", "État", "Points à vérifier", "Identifiant pièce", "N° facture", "Origine du compte banque"];
  const rows = lignesPourVentilation(lignes).sort((a, b) => (a.dateOperation || "").localeCompare(b.dateOperation || "") || a.id.localeCompare(b.id)).map(l => {
    const p = comptesProposes(l);
    return [l.id, l.mois || l.dateOperation?.slice(0, 7) || "", l.dateOperation || "", l.fournisseur, l.poste, l.montant.toFixed(2), p.imputation.compte, p.imputation.libelle, p.imputation.source, p.fournisseur.compte, l.compte, p.banque.compte, p.aVentiler ? "À ventiler" : "Proposition à valider", p.controles.join(" "), l.piece?.id, l.piece?.extraction?.numero, p.banque.origine];
  });
  return [entetes, ...rows].map(row => row.map(champ).join(";")).join("\r\n") + "\r\n";
}
