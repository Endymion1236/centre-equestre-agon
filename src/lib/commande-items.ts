/**
 * src/lib/commande-items.ts
 *
 * Une ligne de commande (`payments.items[]`) telle que le reste de
 * l'application la lit, quel que soit le chemin qui l'a créée.
 *
 * Incident : une maman avait déclaré un règlement en espèces (« je paierai
 * au bureau »), puis réglé la même commande par carte depuis ses factures.
 * L'email de confirmation reçu listait les prestations sans date, sans
 * horaire, sans déroulé de stage ni conditions d'annulation. Cause : la
 * commande créée par la déclaration ne portait ni `activityType`, ni `date`,
 * ni `stageDates` — les routes de confirmation CAWL, qui choisissent le
 * gabarit sur `activityType === "stage"` et lisent les dates dans
 * `stageDates`, la traitaient comme un paiement quelconque.
 *
 * Le panier CB construit ses lignes dans le navigateur
 * (espace-cavalier/reserver/panier-paiement.ts) ; ici la même forme, côté
 * serveur, à partir des créneaux relus en base. Module pur, testable.
 */

import { formatStageSchedule } from "@/lib/format-stage";

export interface ArticlePanier {
  childId: string;
  childName: string;
  activityTitle: string;
  isStage: boolean;
  creneauIds: string[];
  prixFinal: number;
}

export interface CreneauLu {
  id: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  monitor?: string;
}

const TVA_ENSEIGNEMENT = 5.5;

export function construireLigneCommande(article: ArticlePanier, creneaux: CreneauLu[]) {
  const parId = new Map(creneaux.map((c) => [c.id, c]));
  const jours = article.creneauIds.map((id) => parId.get(id)).filter((c): c is CreneauLu => !!c);
  const premier = jours[0] || null;
  const stageDates = article.isStage
    ? jours
      .filter((c) => c.date)
      .map((c) => ({ date: String(c.date), startTime: c.startTime || "", endTime: c.endTime || "" }))
      .sort((a, b) => a.date.localeCompare(b.date))
    : null;
  return {
    activityTitle: `${article.activityTitle} — ${article.childName}`,
    childId: article.childId,
    childName: article.childName,
    creneauId: article.creneauIds[0],
    // TOUS les jours : nécessaires à la levée des places tenues.
    creneauIds: article.creneauIds,
    activityType: article.isStage ? "stage" : "cours",
    stageKey: article.isStage ? `${article.activityTitle}_${stageDates?.[0]?.date || ""}` : null,
    stageSchedule: stageDates && stageDates.length ? formatStageSchedule(stageDates) || null : null,
    stageDates,
    priceHT: article.prixFinal / (1 + TVA_ENSEIGNEMENT / 100),
    tva: TVA_ENSEIGNEMENT,
    priceTTC: article.prixFinal,
    originalPriceTTC: article.prixFinal,
    date: stageDates?.[0]?.date || premier?.date || null,
    startTime: stageDates?.[0]?.startTime || premier?.startTime || null,
    endTime: stageDates?.[0]?.endTime || premier?.endTime || null,
    monitor: premier?.monitor || null,
  };
}

/** Champs de commande propres aux stages (premier jour, titre), lus par les confirmations et le cron du solde. */
export function champsStageCommande(lignes: ReturnType<typeof construireLigneCommande>[]) {
  const stage = lignes.find((l) => l.activityType === "stage");
  if (!stage) return {};
  return {
    stageDate: stage.date || "",
    stageTitle: stage.activityTitle.replace(/ — [^—]*$/, ""),
  };
}
