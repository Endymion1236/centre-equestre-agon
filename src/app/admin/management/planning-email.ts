/**
 * src/app/admin/management/planning-email.ts
 *
 * Le mail « voici ta semaine » envoyé à chaque monitrice : un tableau HTML
 * reprenant la vue Tableau du semainier (jours en colonnes, tâches en cartes,
 * charge en pied de colonne) plus le total de la semaine.
 *
 * Pourquoi séparé : c'est ~100 lignes de HTML inline (les clients mail
 * n'acceptent ni feuille de style ni classes) qui n'ont rien à faire au milieu
 * de la logique d'envoi. Isolé, on peut retoucher la mise en page du mail sans
 * relire la boucle d'envoi, et inversement.
 *
 * ⚠️ Tout le style doit rester en `style="…"` inline : Gmail et Outlook
 * suppriment les balises <style>.
 */

import type { JourSemaine, TachePlanifiee } from "./types";
import { CATEGORIES, JOURS_LABELS, bornesJournee, calcTempsTravailJour, fmtDuree } from "./types";
import { heureToMin, minToHeure } from "./planning-utils";

/** Charge totale de la semaine du moniteur, jour par jour (l'amplitude ne se somme pas d'un jour à l'autre). */
export function calculerChargeSemaine(
  salTaches: TachePlanifiee[],
  joursLabels: { jour: JourSemaine; date: Date }[]
): number {
  return joursLabels.reduce((sum, { jour }) => {
    const dayT = salTaches.filter(t => t.jour === jour);
    return sum + calcTempsTravailJour(dayT);
  }, 0);
}

export function construireEmailPlanningMoniteur(params: {
  nomMoniteur: string;
  salTaches: TachePlanifiee[];
  joursLabels: { jour: JourSemaine; date: Date }[];
  totalCharge: number;
  semaineNum: string;
  dateDebut: string;
  dateFin: string;
  siteUrl: string;
}): string {
  const { nomMoniteur, salTaches, joursLabels, totalCharge, semaineNum, dateDebut, dateFin, siteUrl } = params;
  const getCat = (cat: string) => CATEGORIES.find(c => c.id === cat);

  // Construire le tableau style management (jours en colonnes, tâches en cartes)
  const jourHeaders = joursLabels.map(({ jour, date }) =>
    `<th style="padding:6px 4px;text-align:center;font-size:10px;font-weight:700;color:#475569;background:#f1f5f9;border-bottom:2px solid #e2e8f0;width:${Math.floor(85/6)}%;">${JOURS_LABELS[jour].slice(0,3)} ${date.getDate()}</th>`
  ).join("");

  const jourCells = joursLabels.map(({ jour }) => {
    const dayT = salTaches.filter(t => t.jour === jour);
    if (dayT.length === 0) {
      return `<td style="padding:4px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:center;"><span style="color:#d1d5db;font-size:11px;">—</span></td>`;
    }
    const cards = dayT.map(t => {
      const color = (t as any).color || getCat(t.categorie)?.color || "#64748b";
      const cat = getCat(t.categorie);
      return `<div style="background:${color}12;border:1px solid ${color}25;border-radius:6px;padding:4px 6px;margin-bottom:3px;">
              <div style="font-size:10px;font-weight:600;color:${color};line-height:1.3;">${t.tacheLabel}</div>
              <div style="font-size:9px;color:#94a3b8;">${t.heureDebut}→${minToHeure(heureToMin(t.heureDebut) + t.dureeMinutes)}</div>
            </div>`;
    }).join("");
    return `<td style="padding:3px;border-bottom:1px solid #f1f5f9;vertical-align:top;">${cards}</td>`;
  }).join("");

  // Résumé charge par jour
  const chargeCells = joursLabels.map(({ jour }) => {
    const dayT = salTaches.filter(t => t.jour === jour);
    const charge = calcTempsTravailJour(dayT);
    // Heure de fin de journée (fin de la dernière tâche) sous la charge
    const bornes = bornesJournee(dayT);
    const finStr = bornes ? `<br/><span style="font-weight:400;color:#64748b;">→ ${bornes.fin}</span>` : "";
    return `<td style="padding:4px;text-align:center;font-size:9px;font-weight:700;color:${charge > 0 ? "#1e3a5f" : "#d1d5db"};border-top:1px solid #e2e8f0;">${charge > 0 ? fmtDuree(charge) + finStr : "—"}</td>`;
  }).join("");

  return `
<div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto;background:#ffffff;">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#2050A0);padding:20px 24px;border-radius:12px 12px 0 0;">
    <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-bottom:2px;">🐴 Centre Équestre d'Agon-Coutainville</div>
    <div style="font-size:20px;font-weight:800;color:#ffffff;">Planning Semaine ${semaineNum}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:3px;">${dateDebut} → ${dateFin}</div>
  </div>
  
  <!-- Salutation -->
  <div style="padding:16px 24px 10px;">
    <div style="font-size:14px;color:#1e293b;">Bonjour <strong>${nomMoniteur}</strong>,</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;">
      ${totalCharge > 0 ? `Votre semaine : <strong style="color:#1e3a5f;">${fmtDuree(totalCharge)}</strong> de travail.` : "Aucune tâche assignée cette semaine."}
    </div>
  </div>

  <!-- Tableau style management -->
  ${totalCharge > 0 ? `
  <div style="padding:8px 24px 16px;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr>
          ${jourHeaders}
        </tr>
      </thead>
      <tbody>
        <tr>${jourCells}</tr>
      </tbody>
      <tfoot>
        <tr style="background:#f8fafc;">${chargeCells}</tr>
        <tr style="background:#f1f5f9;">
          <td colspan="${joursLabels.length}" style="padding:8px 12px;text-align:center;font-weight:800;color:#1e3a5f;font-size:13px;border-top:2px solid #e2e8f0;">
            Total : ${fmtDuree(totalCharge)}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
  ` : ""}

  <!-- Bouton -->
  <div style="padding:4px 24px 20px;text-align:center;">
    <a href="${siteUrl}/espace-moniteur/planning" style="display:inline-block;background:#2050A0;color:#ffffff;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">
      📋 Voir mon planning
    </a>
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:12px 24px;border-radius:0 0 12px 12px;border-top:1px solid #e2e8f0;">
    <div style="font-size:10px;color:#94a3b8;text-align:center;">
      Ce planning peut être modifié. En cas de question, contactez Nicolas.
      <br>Centre Équestre d'Agon-Coutainville · <a href="${siteUrl}" style="color:#2050A0;text-decoration:none;">centreequestreagon.com</a>
    </div>
  </div>
</div>`;
}
