export interface ReleveClotureMois {
  id: string;
  mois: string;
  compte: string;
  montant: number;
  creditsClients?: number | null;
}

export interface LigneMasseSalarialeCloture {
  type: "salaire" | "charge";
  mois: string;
}

export interface MoisResultatCloture {
  mois: string;
  ca: number;
  masse: number;
  depenses: number;
}

export type EtatCloture = "ok" | "manque" | "info" | "neutre";

export interface PointCloture {
  etat: EtatCloture;
  titre: string;
  detail: string;
  href: string;
  lien: string;
}

export const NOMS_MOIS_CLOTURE: Record<string, string> = {
  "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril", "05": "Mai", "06": "Juin",
  "07": "Juillet", "08": "Août", "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre",
};

export function moisCourantCloture(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function moisDecale(mois: string, delta: number): string {
  const [annee, numeroMois] = mois.split("-").map(Number);
  const date = new Date(annee, numeroMois - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formaterEurosCloture(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
}

export function construirePointsCloture(params: {
  mois: string;
  releves: ReleveClotureMois[];
  comptes: string[];
  horsTotal: string[];
  lignesMS: LigneMasseSalarialeCloture[];
  resultat: MoisResultatCloture[];
}): PointCloture[] {
  const { mois, releves, comptes, horsTotal, lignesMS, resultat } = params;
  const ligneResultat = resultat.find((ligne) => ligne.mois === mois);
  const comptesComptes = comptes.filter((compte) => !horsTotal.includes(compte));
  const relevesMois = releves.filter((releve) => releve.mois === mois);
  const manquants = comptesComptes.filter(
    (compte) => !relevesMois.some((releve) => releve.compte === compte),
  );
  const fiches = lignesMS.filter((ligne) => ligne.mois === mois && ligne.type !== "charge").length;
  const charges = lignesMS.filter((ligne) => ligne.mois === mois && ligne.type === "charge").length;
  const ca = Number(ligneResultat?.ca || 0);
  const depenses = Number(ligneResultat?.depenses || 0);
  const creditsLus = relevesMois.filter(
    (releve) => !horsTotal.includes(releve.compte) && releve.creditsClients != null,
  );
  const credits = creditsLus.reduce((total, releve) => total + Number(releve.creditsClients || 0), 0);

  const points: PointCloture[] = [
    {
      etat: manquants.length === 0 && comptesComptes.length > 0 ? "ok" : "manque",
      titre: "Soldes bancaires saisis",
      detail: manquants.length === 0
        ? `${comptesComptes.length}/${comptesComptes.length} comptes — ${comptesComptes.map((compte) => {
            const releve = relevesMois.find((ligne) => ligne.compte === compte);
            return `${compte} : ${releve ? formaterEurosCloture(releve.montant) : "?"}`;
          }).join(" · ")}`
        : `Il manque : ${manquants.join(", ")} — dépose le(s) relevé(s) PDF.`,
      href: "/admin/comptabilite/tresorerie",
      lien: "Trésorerie",
    },
    {
      etat: fiches > 0 ? "ok" : "manque",
      titre: "Fiches de paie",
      detail: fiches > 0 ? `${fiches} salaire(s) enregistré(s).` : "Aucune fiche de paie déposée pour ce mois.",
      href: "/admin/comptabilite/masse-salariale",
      lien: "Masse salariale",
    },
    {
      etat: charges > 0 ? "ok" : "info",
      titre: "Charges sociales versées à part (MSA/TESA)",
      detail: charges > 0
        ? `${charges} charge(s) enregistrée(s).`
        : "Aucune — normal s'il n'y a pas de saisonniers ce mois-ci, sinon dépose le récapitulatif.",
      href: "/admin/comptabilite/masse-salariale",
      lien: "Masse salariale",
    },
    {
      etat: depenses > 0 ? "ok" : "manque",
      titre: "Dépenses du mois",
      detail: depenses > 0
        ? `${formaterEurosCloture(depenses)} saisis sur les postes.`
        : "Aucune dépense saisie — le relevé déposé les propose tout seul.",
      href: "/admin/comptabilite/depenses",
      lien: "Dépenses",
    },
  ];

  if (ca === 0) {
    points.push({
      etat: "neutre",
      titre: "Rapprochement banque ↔ caisse",
      detail: "Sans objet : aucun encaissement en caisse ce mois-ci (période Céleris, ou mois sans activité).",
      href: "/admin/comptabilite?tab=rapprochement",
      lien: "Pointage bancaire",
    });
  } else if (creditsLus.length === 0) {
    points.push({
      etat: "info",
      titre: "Rapprochement banque ↔ caisse",
      detail: `La caisse dit ${formaterEurosCloture(ca)} encaissés, mais aucun relevé du mois ne porte les encaissements clients — redépose le relevé PDF (le champ est lu automatiquement).`,
      href: "/admin/comptabilite/tresorerie",
      lien: "Trésorerie",
    });
  } else {
    const ecart = credits - ca;
    const pct = ca > 0 ? Math.abs(ecart) / ca : 0;
    points.push({
      etat: pct <= 0.05 ? "ok" : "info",
      titre: "Rapprochement banque ↔ caisse",
      detail: `Banque : ${formaterEurosCloture(credits)} d'encaissements clients · Caisse : ${formaterEurosCloture(ca)} — écart ${ecart >= 0 ? "+" : "−"}${formaterEurosCloture(Math.abs(ecart))} (${(pct * 100).toFixed(1)} %).`
        + (pct > 0.05
          ? " À creuser : remises CB à cheval sur deux mois, chèques non déposés, impayé… ou relevé partiel."
          : " Cohérent."),
      href: "/admin/comptabilite?tab=rapprochement",
      lien: "Pointage bancaire",
    });
  }

  return points;
}

export function resumerCloture(points: PointCloture[]) {
  const bloquants = points.filter((point) => point.etat === "manque").length;
  return { bloquants, boucle: bloquants === 0 };
}
