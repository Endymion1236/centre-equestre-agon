/**
 * src/app/admin/management/planning-textes.ts
 *
 * Les textes longs générés par le semainier : les récapitulatifs affichés dans
 * les `confirm()` avant une action irréversible (compactage d'une journée,
 * synchronisation des cours/stages) et le prompt envoyé à l'IA de vérification.
 *
 * Pourquoi séparé : ces blocs de texte sont volumineux, entièrement décoratifs
 * du point de vue du code, et c'est pourtant sur eux que l'admin s'appuie pour
 * dire oui ou non. Les sortir du composant évite qu'ils noient la logique
 * d'écriture Firestore, et permet de relire une formulation sans risquer de
 * toucher au calcul qu'elle décrit.
 */

import type { JourSemaine, Salarie, TachePlanifiee, TacheType } from "./types";
import { JOURS_LABELS, fmtDuree } from "./types";
import type { CreneauCible } from "./planning-utils";
import { heureToMin, minToHeure } from "./planning-utils";

/** Récapitulatif du compactage d'une journée : 5 décalages détaillés max, puis le reste en nombre. */
export function messageConfirmationCompactage(params: {
  jour: JourSemaine;
  nomSalarie: string | undefined;
  updates: { id: string; oldHeure: string; newHeure: string }[];
  dayTaches: TachePlanifiee[];
  conflits: string[];
}): string {
  const { jour, nomSalarie, updates, dayTaches, conflits } = params;
  const recap = updates.slice(0, 5).map(u => {
    const t = dayTaches.find(x => x.id === u.id)!;
    return `• ${t.tacheLabel} : ${u.oldHeure} → ${u.newHeure}`;
  }).join("\n");
  return (
    `Compacter ${JOURS_LABELS[jour]} pour ${nomSalarie} ?\n\n` +
    `${updates.length} tâche(s) seront décalées :\n${recap}` +
    (updates.length > 5 ? `\n… et ${updates.length - 5} autres` : "") +
    (conflits.length > 0
      ? `\n\n⚠️ ${conflits.length} tâche(s) ne peuvent pas être déplacées (déborderaient sur un cours)`
      : "")
  );
}

/**
 * Récapitulatif de la synchronisation des cours/stages.
 * Insiste explicitement sur le fait que les tâches manuelles ne bougent pas :
 * c'est la crainte n°1 avant de cliquer, et le message doit y répondre.
 */
export function messageConfirmationSynchro(params: {
  nbGardees: number;
  aCreer: CreneauCible[];
  aSupprimer: TachePlanifiee[];
}): string {
  const { nbGardees, aCreer, aSupprimer } = params;
  return (
    `Synchroniser le planning de la semaine ?\n\n` +
    (nbGardees > 0 ? `✅ ${nbGardees} cours/stage déjà présent(s) CONSERVÉS (statut 'fait' gardé)\n` : "") +
    (aCreer.length > 0 ? `📥 ${aCreer.length} nouveau(x) cours/stage ajouté(s)\n` : "") +
    (aSupprimer.length > 0 ? `🗑️ ${aSupprimer.length} cours/stage obsolète(s) (plus au planning) supprimé(s)\n` : "") +
    (aCreer.length > 0
      ? "\n" + aCreer.slice(0, 6).map(m =>
          `• ${JOURS_LABELS[m.jour]} ${m.creneau.startTime}→${m.creneau.endTime} : ${m.creneau.activityTitle} (${m.salarieName})`
        ).join("\n") +
        (aCreer.length > 6 ? `\n… et ${aCreer.length - 6} autres` : "")
      : "") +
    `\n\nLes tâches manuelles (non issues du planning) ne sont PAS touchées.`
  );
}

/**
 * Prompt de vérification IA : on lui donne l'équipe, les tâches déclarées
 * obligatoires, le planning jour par jour et les manques déjà repérés
 * automatiquement, pour qu'elle se concentre sur ce que le code ne sait pas
 * voir (surcharge, oublis de bon sens, déséquilibres).
 */
export function construirePromptVerificationIA(params: {
  joursActifs: JourSemaine[];
  taches: TachePlanifiee[];
  tachesObligatoires: TacheType[];
  salaries: Salarie[];
  semaine: string;
  tachesManquantes: { tache: TacheType; jour: JourSemaine }[];
}): string {
  const { joursActifs, taches, tachesObligatoires, salaries, semaine, tachesManquantes } = params;

  const planningResume = joursActifs.map(jour => {
    const jourTaches = taches.filter(t => t.jour === jour);
    return `${JOURS_LABELS[jour]} :\n` + (jourTaches.length === 0
      ? "  (aucune tâche)"
      : jourTaches.map(t => `  - ${t.tacheLabel} → ${t.salarieName} (${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)})`).join("\n"));
  }).join("\n");

  const obligatoiresListe = tachesObligatoires.map(t =>
    `- ${t.label} (${t.categorie}, ${fmtDuree(t.dureeMinutes)}, jours: ${(t.joursDefaut || []).map(j => JOURS_LABELS[j].slice(0, 3)).join(", ") || "lun-ven"})`
  ).join("\n");

  const salariesListe = salaries.filter(s => s.actif).map(s => s.nom).join(", ");

  return `Tu es l'assistant de gestion du centre équestre. Vérifie ce planning hebdomadaire de l'équipe.

SALARIÉS ACTIFS : ${salariesListe}

TÂCHES OBLIGATOIRES (doivent être assignées chaque jour prévu) :
${obligatoiresListe || "(aucune tâche marquée obligatoire)"}

PLANNING DE LA SEMAINE ${semaine} :
${planningResume}

TÂCHES MANQUANTES DÉTECTÉES AUTOMATIQUEMENT : ${tachesManquantes.length === 0 ? "Aucune" : tachesManquantes.map(m => `${m.tache.label} le ${JOURS_LABELS[m.jour]}`).join(", ")}

Analyse ce planning et donne :
1. ✅ Ce qui est bien couvert
2. ⚠️ Les tâches obligatoires manquantes ou incomplètes
3. 💡 Des suggestions d'amélioration (charge équilibrée, tâches oubliées, surcharge d'un salarié)

Réponds de façon concise et pratique, en français.`;
}
