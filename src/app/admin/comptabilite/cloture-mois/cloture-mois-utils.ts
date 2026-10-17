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
  /** TVA des ventes du mois (API résultat) — encart « TVA à payer ». */
  tvaCollectee?: number;
  tvaCollecteeCeleris?: number;
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
  /** Complétude des justificatifs du tableau des opérations (lib/bilan-justificatifs). Absent : point non affiché. */
  justificatifs?: { total: number; justifies: number; sansPiece: number; montantSansPiece: number; perdues?: number; montantPerdues?: number };
  /** FEC du mois : montants au compte d'attente 47100000 et points signalés. Absent : point non affiché. */
  fec?: { compteAttente: number; anomalies: string[]; attente?: { ventes: number; debits: number; credits: number } } | null;
}): PointCloture[] {
  const { mois, releves, comptes, horsTotal, lignesMS, resultat, justificatifs, fec } = params;
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

  // Compte d'attente du FEC : une sécurité (rien n'est rangé d'office dans un
  // produit). Une VENTE au 47100000 bloque la clôture : c'est au club de lui
  // donner un compte. Octobre 2026 : avec les journaux Achats et Banque, les
  // débits non classés et les crédits non rapprochés y vont aussi — la
  // comptable a accepté de les reclasser (« Oui c'est parfait ») : signalés
  // en orange, avec leur montant, mais non bloquants.
  const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const att = fec?.attente;
  if (fec && att && att.ventes === 0 && fec.compteAttente > 0) {
    // Les plus gros montants d'abord : c'est là que se joue l'essentiel.
    const montant = (a: string) => Number((/\(([\d\s\u202f\u00a0]+,\d{2}) €/.exec(a)?.[1] || "0").replace(/[\s\u202f\u00a0]/g, "").replace(",", ".")) || 0;
    const releve = fec.anomalies.filter((a) => /47100000/.test(a) && !/^Ventes/.test(a)).sort((x, y) => montant(y) - montant(x));
    points.push({
      etat: "info",
      titre: "FEC : compte d'attente côté banque",
      detail: `${eur(fec.compteAttente)} € au 47100000, que la comptable reclassera : ${[
        att.debits ? `${eur(att.debits)} € de débits du relevé sans compte (catégorie « hors dépenses », échéances d'emprunt non ventilées, PER…)` : "",
        att.credits ? `${eur(att.credits)} € de crédits du relevé non rapprochés` : "",
      ].filter(Boolean).join(" et ")}. Les ventes sont toutes sur leur compte. Pour en réduire : classe les débits dans Dépenses, pointe les crédits dans le Rapprochement.${releve.length ? ` Les plus gros : ${releve.slice(0, 5).join(" ; ")}` : ""}`,
      href: "/admin/comptabilite/depenses",
      lien: "Dépenses",
    });
  } else if (fec) {
    const aVentiler = fec.anomalies.filter((a) => /47100000/.test(a) && (!att || /^Ventes|^Règlement/.test(a)));
    points.push({
      etat: fec.compteAttente === 0 ? "ok" : "manque",
      titre: "FEC : rien au compte d'attente",
      detail: fec.compteAttente === 0
        ? `Toutes les ventes et tous les règlements sont sur leur compte.${fec.anomalies.length ? ` ${fec.anomalies.length} point(s) signalé(s) au cabinet dans l'envoi.` : ""}`
        : `⚠️ ${eur(att ? att.ventes : fec.compteAttente)} € de ventes au 47100000 « à ventiler »${aVentiler.length ? ` — ${aVentiler.slice(0, 3).join(" ; ")}` : ""}. Donne un compte à ces prestations (Ventilation des ventes), puis recharge.${att && att.debits + att.credits > 0 ? ` S'y ajoutent ${eur(att.debits + att.credits)} € côté banque (débits sans compte, crédits non rapprochés), que la comptable reclassera.` : ""}`,
      href: "/admin/comptabilite/export-ca",
      lien: "Ventilation des ventes",
    });
  }

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

  if (justificatifs) {
    // Prévient sans bloquer : c'est au gérant de décider d'envoyer un mois
    // incomplet à la comptable, en connaissance de cause.
    points.push({
      etat: justificatifs.total === 0 ? "neutre" : justificatifs.sansPiece === 0 ? "ok" : "info",
      titre: "Justificatifs des dépenses",
      detail: justificatifs.total === 0
        ? "Aucune dépense dans le tableau des opérations pour ce mois."
        : justificatifs.sansPiece === 0
          ? `${justificatifs.justifies}/${justificatifs.total} dépenses justifiées (pièce, relevé ou masse salariale).${justificatifs.perdues ? ` ${justificatifs.perdues} pièce(s) déclarée(s) perdue(s), relevé conservé (${formaterEurosCloture(justificatifs.montantPerdues || 0)}) : la comptable voit le motif.` : ""}`
          : `${justificatifs.justifies}/${justificatifs.total} dépenses justifiées — ${formaterEurosCloture(justificatifs.montantSansPiece)} sans pièce sur ${justificatifs.sansPiece} ligne(s).${justificatifs.perdues ? ` ${justificatifs.perdues} pièce(s) déclarée(s) perdue(s), relevé conservé.` : ""} L'envoi reste possible, la comptable le verra.`,
      href: "/admin/comptabilite/depenses",
      lien: "Ouvrir le tableau des opérations",
    });
  }
  return points;
}

export function resumerCloture(points: PointCloture[]) {
  const bloquants = points.filter((point) => point.etat === "manque").length;
  return { bloquants, boucle: bloquants === 0 };
}
