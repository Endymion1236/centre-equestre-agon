/**
 * src/app/admin/management/planning-impression.ts
 *
 * Les feuilles de style d'impression du semainier d'équipe.
 *
 * Deux impressions très différentes cohabitent :
 *   - CSS_IMPRESSION_SEMAINIER : injecté dans la page ; il masque tout le
 *     chrome de l'application (barre latérale, en-têtes, boutons) pour ne
 *     laisser que le tableau, en A4 paysage. Les sélecteurs échappés
 *     (`.md\\:hidden`) visent des classes Tailwind : ne pas les « nettoyer ».
 *   - CSS_IMPRESSION_FICHE : embarqué dans la fenêtre ouverte par le bouton
 *     « Imprimer la fiche », qui ne partage aucun style avec l'application.
 *
 * Pourquoi séparé : ce sont des chaînes de CSS, illisibles au milieu du JSX,
 * et qu'on ne touche que lorsqu'une impression sort mal.
 */

/** Styles injectés dans la page pour l'impression du semainier (vue courante). */
export const CSS_IMPRESSION_SEMAINIER = `
        @media print {
          aside, nav, header,
          [data-sidebar], [data-header],
          .no-print, .print-hide,
          .md\\:hidden, .sticky {
            display: none !important;
          }
          .min-h-screen.bg-cream.flex > :first-child {
            display: none !important;
          }
          .min-h-screen.bg-cream.flex {
            display: block !important;
          }
          .min-h-screen.bg-cream.flex > .flex-1 {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          h1, .flex.flex-col.sm\\:flex-row,
          .flex.flex-wrap.gap-2:not(.print-keep) {
            display: none !important;
          }
          body, body > div, main, [role="main"], div {
            background: white !important;
          }
          body { padding: 0 !important; margin: 0 !important; }
          .print-header { display: block !important; }
          .print-keep {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
          .print-keep button { display: none !important; }
          table { font-size: 10px !important; }
          td, th { padding: 3px 4px !important; }
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          @page { size: A4 landscape; margin: 8mm; }
        }
      `;

/** Styles de la fenêtre d'impression d'une fiche individuelle (document autonome). */
export const CSS_IMPRESSION_FICHE = `
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; background: white; color: #1e293b; }
          h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
          .subtitle { font-size: 12px; color: #64748b; margin-bottom: 20px; }
          .day-section { margin-bottom: 18px; page-break-inside: avoid; }
          .day-title { font-size: 14px; font-weight: 800; color: #1e3a5f; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
          .task-row { display: flex; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
          .task-time { width: 70px; font-size: 13px; font-weight: 700; color: #475569; flex-shrink: 0; }
          .task-name { flex: 1; font-size: 13px; font-weight: 600; }
          .task-dur { width: 60px; font-size: 11px; color: #64748b; text-align: right; flex-shrink: 0; }
          .task-cat { font-size: 10px; color: #94a3b8; margin-left: 8px; }
          .task-note { font-size: 11px; color: #92400e; background: #fef3c7; border-left: 3px solid #f59e0b; padding: 4px 8px; margin: 4px 0 4px 50px; border-radius: 0 4px 4px 0; white-space: pre-wrap; line-height: 1.4; }
          .activity-row { display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid #f1f5f9; background: #f0f7ff; margin: 0 -8px; padding: 5px 8px; border-radius: 4px; }
          .activity-row .task-name { color: #1d4ed8; }
          .total { margin-top: 6px; font-size: 12px; font-weight: 700; color: #475569; text-align: right; }
          .empty-day { font-size: 11px; color: #94a3b8; font-style: italic; padding: 4px 0; }
          @media print { body { padding: 10px; } .day-section { page-break-inside: avoid; } }
        `;
