/**
 * src/app/admin/planning/planning-impression.ts
 *
 * Export PDF du planning : construit une page HTML autonome et ouvre la
 * fenêtre d'impression du navigateur.
 *
 * Pourquoi à part : c'est une centaine de lignes de HTML et de CSS en chaîne
 * de caractères, qui n'ont aucun rapport avec le reste de la page mais qui la
 * rendaient illisible. Ce document est celui qu'on affiche à l'écurie, le
 * matin : il doit tenir sur une feuille et rester lisible en noir et blanc —
 * d'où les styles inline et le tableau plutôt qu'une reprise du rendu écran.
 *
 * Le corps est recopié tel quel depuis page.tsx, indentation d'origine
 * comprise : le HTML est écrit dans des gabarits multilignes, et le ré-indenter
 * aurait modifié le document produit.
 */

"use client";

import { Creneau, compareCreneaux } from "./types";

export function exporterPlanningPDF(params: {
  viewMode: "week" | "day" | "month" | "timeline";
  creneaux: (Creneau & { id: string })[];
  dayCreneaux: (Creneau & { id: string })[];
  currentDay: Date;
  weekDates: Date[];
}): void {
  const { viewMode, creneaux, dayCreneaux, currentDay, weekDates } = params;
    const visibleCreneaux = viewMode === "day" ? dayCreneaux : creneaux;
    const titre = viewMode === "day"
      ? `Planning du ${currentDay.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
      : viewMode === "week"
      ? `Planning semaine du ${weekDates[0].toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${weekDates[6].toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : `Planning ${currentDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    const lignes = [...visibleCreneaux]
      .sort((a, b) => a.date.localeCompare(b.date) || compareCreneaux(a, b))
      .map(c => `<tr>
        <td>${new Date(c.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</td>
        <td>${c.startTime}–${c.endTime}</td>
        <td><strong>${c.activityTitle}</strong></td>
        <td>${c.monitor || "—"}</td>
        <td style="text-align:center">${c.enrolledCount||0}/${c.maxPlaces||0}</td>
        <td style="text-align:center;color:${c.status==="closed"?"#16a34a":"#94a3b8"}">${c.status==="closed"?"✓ Clôturé":"—"}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${titre}</title>
      <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#1e3a5f;}
      h1{font-size:16px;color:#0C1A2E;margin-bottom:4px;}p{color:#666;font-size:11px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;}th{background:#0C1A2E;color:white;padding:8px 10px;text-align:left;font-size:11px;}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0;}tr:nth-child(even) td{background:#f8fafc;}
      @media print{body{margin:10px;}}</style></head><body>
      <h1>🐴 ${titre}</h1>
      <p>Centre Équestre d'Agon-Coutainville — Imprimé le ${new Date().toLocaleDateString("fr-FR")}</p>
      <table><thead><tr><th>Date</th><th>Horaire</th><th>Activité</th><th>Moniteur</th><th>Inscrits</th><th>Statut</th></tr></thead>
      <tbody>${lignes||"<tr><td colspan='6' style='text-align:center;color:#999'>Aucun créneau</td></tr>"}</tbody></table>
      </body></html>`;
    const w = window.open("","_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
}
