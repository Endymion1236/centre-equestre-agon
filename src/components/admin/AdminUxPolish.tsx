"use client";

/**
 * Finition visuelle commune au back-office.
 *
 * Cette couche ne modifie aucune règle métier. Elle harmonise les surfaces,
 * les formulaires, les tableaux, les barres d'outils, les modales et les
 * interactions tactiles de l'ensemble des écrans admin.
 */
export default function AdminUxPolish() {
  return (
    <style jsx global>{`
      @keyframes admin-page-in {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes admin-soft-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(240, 160, 16, 0); }
        50% { box-shadow: 0 0 0 5px rgba(240, 160, 16, 0.08); }
      }

      @keyframes admin-shimmer {
        0% { background-position: 180% 0; }
        100% { background-position: -180% 0; }
      }

      .admin-page-shell,
      [data-admin-page] {
        width: 100%;
        min-width: 0;
      }

      .admin-page-shell {
        animation: admin-page-in 260ms ease-out both;
      }

      [data-admin-page] > * {
        min-width: 0;
      }

      [data-admin-page] h1 {
        letter-spacing: -0.035em;
        line-height: 1.08;
        text-wrap: balance;
      }

      [data-admin-page] h2,
      [data-admin-page] h3 {
        letter-spacing: -0.018em;
        text-wrap: balance;
      }

      [data-admin-page] p {
        text-wrap: pretty;
      }

      [data-admin-page] .card {
        border: 1px solid rgba(32, 80, 160, 0.075);
        border-radius: 18px;
        box-shadow: 0 8px 30px rgba(12, 26, 46, 0.045);
        transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease;
      }

      [data-admin-page] .card:hover {
        border-color: rgba(32, 80, 160, 0.12);
      }

      [data-admin-page] .card-hover:hover {
        transform: translateY(-2px);
        border-color: rgba(32, 80, 160, 0.15);
        box-shadow: 0 16px 42px rgba(12, 26, 46, 0.095);
      }

      [data-admin-page] input:not([type="checkbox"]):not([type="radio"]),
      [data-admin-page] select,
      [data-admin-page] textarea {
        min-height: 42px;
        border-radius: 12px !important;
        transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }

      [data-admin-page] textarea {
        min-height: 96px;
      }

      [data-admin-page] input::placeholder,
      [data-admin-page] textarea::placeholder {
        color: #9aa8b7;
      }

      [data-admin-page] input:not([type="checkbox"]):not([type="radio"]):focus,
      [data-admin-page] select:focus,
      [data-admin-page] textarea:focus {
        border-color: rgba(32, 80, 160, 0.55) !important;
        background-color: #fff !important;
        box-shadow: 0 0 0 3px rgba(32, 80, 160, 0.1);
        outline: none;
      }

      [data-admin-page] button,
      [data-admin-page] a {
        -webkit-tap-highlight-color: transparent;
      }

      [data-admin-page] button {
        transition: transform 140ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
      }

      [data-admin-page] button:not(:disabled):active {
        transform: scale(0.975);
      }

      [data-admin-page] button:focus-visible,
      [data-admin-page] a:focus-visible {
        outline: 3px solid rgba(240, 160, 16, 0.35);
        outline-offset: 2px;
      }

      [data-admin-page] button:disabled {
        filter: saturate(0.72);
        cursor: not-allowed;
      }

      [data-admin-page] details {
        overflow: hidden;
        border-radius: 14px;
      }

      [data-admin-page] summary {
        list-style: none;
      }

      [data-admin-page] summary::-webkit-details-marker {
        display: none;
      }

      [data-admin-page] table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }

      [data-admin-page] thead th {
        position: relative;
        background: rgba(237, 242, 250, 0.82);
        color: #3f5875;
        font-size: 10.5px;
        font-weight: 750;
        letter-spacing: 0.065em;
        text-transform: uppercase;
      }

      [data-admin-page] tbody tr {
        transition: background 140ms ease, box-shadow 140ms ease;
      }

      [data-admin-page] tbody tr:hover {
        background: rgba(237, 242, 250, 0.48);
      }

      [data-admin-page] th,
      [data-admin-page] td {
        padding-top: 0.78rem;
        padding-bottom: 0.78rem;
      }

      [data-admin-page] tbody td {
        border-bottom-color: rgba(148, 163, 184, 0.13) !important;
      }

      [data-admin-page] .overflow-x-auto,
      [data-admin-page] .hide-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(32, 80, 160, 0.22) transparent;
        scroll-snap-type: x proximity;
        overscroll-behavior-inline: contain;
      }

      [data-admin-page] .overflow-x-auto::-webkit-scrollbar,
      [data-admin-page] .hide-scrollbar::-webkit-scrollbar {
        height: 6px;
      }

      [data-admin-page] .overflow-x-auto::-webkit-scrollbar-thumb,
      [data-admin-page] .hide-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(32, 80, 160, 0.22);
        border-radius: 999px;
      }

      [data-admin-page] .overflow-x-auto > button,
      [data-admin-page] .hide-scrollbar > button {
        scroll-snap-align: start;
      }

      [data-admin-page] [class*="rounded-lg"] {
        transition-property: background-color, border-color, color, box-shadow, transform;
        transition-duration: 150ms;
      }

      [data-admin-page] .animate-pulse > * {
        background-image: linear-gradient(90deg, rgba(226,232,240,.76) 0%, rgba(248,250,252,.96) 48%, rgba(226,232,240,.76) 100%);
        background-size: 220% 100%;
        animation: admin-shimmer 1.6s linear infinite;
      }

      /* En-têtes des gros espaces historiques */
      [data-admin-section="planning"] > div > div:first-child,
      [data-admin-section="montoir"] > div > div:first-child,
      [data-admin-section="paiements"] > div > div:first-child,
      [data-admin-section="comptabilite"] > div > div:first-child,
      [data-admin-section="statistiques"] > div > div:first-child,
      [data-admin-section="pedagogie"] > div > div:first-child {
        border: 1px solid rgba(32, 80, 160, 0.075);
        border-radius: 20px;
        background: linear-gradient(135deg, rgba(255,255,255,.98) 0%, rgba(247,250,255,.96) 72%, rgba(237,242,250,.82) 100%);
        padding: 0.9rem 1rem;
        box-shadow: 0 8px 28px rgba(12, 26, 46, 0.04);
      }

      /* Les gros modules historiques utilisent plusieurs barres d'onglets. */
      [data-admin-section="paiements"] .hide-scrollbar,
      [data-admin-section="comptabilite"] .hide-scrollbar,
      [data-admin-section="planning"] .hide-scrollbar,
      [data-admin-section="statistiques"] .hide-scrollbar {
        border-radius: 16px;
      }

      [data-admin-section="paiements"] .hide-scrollbar > button,
      [data-admin-section="comptabilite"] .hide-scrollbar > button,
      [data-admin-section="planning"] .hide-scrollbar > button,
      [data-admin-section="statistiques"] .hide-scrollbar > button {
        min-height: 40px;
        border-radius: 12px !important;
        padding-left: 0.85rem !important;
        padding-right: 0.85rem !important;
      }

      [data-admin-section="planning"] .card,
      [data-admin-section="montoir"] .card,
      [data-admin-section="paiements"] .card,
      [data-admin-section="comptabilite"] .card {
        overflow: hidden;
      }

      [data-admin-section="planning"] button[aria-label="Ajouter"] {
        animation: admin-soft-pulse 3.2s ease-in-out infinite;
      }

      [data-admin-section="planning"] .card:hover,
      [data-admin-section="montoir"] .card:hover {
        border-color: rgba(32, 80, 160, 0.16);
      }

      [data-admin-section="montoir"] button,
      [data-admin-section="planning"] button {
        touch-action: manipulation;
      }

      [data-admin-section="montoir"] .card > div:first-child,
      [data-admin-section="planning"] .card > div:first-child {
        position: relative;
      }

      [data-admin-section="pedagogie"] .card,
      [data-admin-section="statistiques"] .card,
      [data-admin-section="satisfaction"] .card {
        background: rgba(255, 255, 255, 0.97);
      }

      [data-admin-section="paiements"] .card,
      [data-admin-section="comptabilite"] .card {
        box-shadow: 0 7px 26px rgba(12, 26, 46, 0.038);
      }

      [data-admin-section="paiements"] input[type="search"],
      [data-admin-section="cavaliers"] input[type="search"] {
        background-image: linear-gradient(180deg, #fff, #fbfdff);
      }

      /* Modales : profondeur, verre et confort mobile */
      [data-admin-page] .fixed.inset-0 {
        backdrop-filter: blur(5px);
      }

      [data-admin-page] .fixed.inset-0 > div[class*="max-w"] {
        border: 1px solid rgba(255,255,255,.72);
        border-radius: 22px !important;
        box-shadow: 0 30px 90px rgba(6, 13, 23, 0.26) !important;
      }

      /* Les deux raccourcis sont déjà disponibles dans la navigation principale. */
      [data-testid="admin-nav"] nav > div:last-child a[href="/admin/cavaliers"],
      [data-testid="admin-nav"] nav > div:last-child a[href="/admin/paiements"],
      .md\\:hidden section a[href="/admin/cavaliers"],
      .md\\:hidden section a[href="/admin/paiements"] {
        display: none !important;
      }

      /* Le plan de tests reste accessible par URL et depuis le manuel. */
      [data-testid="admin-nav"] a[href="/admin/tests"],
      .md\\:hidden section a[href="/admin/tests"] {
        display: none !important;
      }

      @media (max-width: 1023px) {
        [data-admin-page] .fixed.inset-0 {
          padding: 0.75rem !important;
        }
      }

      @media (max-width: 767px) {
        .admin-page-shell {
          animation-duration: 180ms;
        }

        [data-admin-page] h1 {
          font-size: 1.65rem !important;
        }

        [data-admin-page] h2 {
          line-height: 1.18;
        }

        [data-admin-page] .card {
          border-radius: 16px;
          box-shadow: 0 5px 22px rgba(12, 26, 46, 0.04);
        }

        [data-admin-page] input:not([type="checkbox"]):not([type="radio"]),
        [data-admin-page] select,
        [data-admin-page] textarea {
          font-size: 16px !important;
        }

        [data-admin-page] th,
        [data-admin-page] td {
          padding-top: 0.68rem;
          padding-bottom: 0.68rem;
        }

        [data-admin-page] table {
          font-size: 12px;
        }

        [data-admin-section="planning"] > div > div:first-child,
        [data-admin-section="montoir"] > div > div:first-child,
        [data-admin-section="paiements"] > div > div:first-child,
        [data-admin-section="comptabilite"] > div > div:first-child,
        [data-admin-section="statistiques"] > div > div:first-child,
        [data-admin-section="pedagogie"] > div > div:first-child {
          border-radius: 17px;
          padding: 0.8rem;
        }

        [data-admin-page] .fixed.inset-0 > div[class*="max-w"] {
          width: 100% !important;
          max-height: calc(100dvh - 1.5rem) !important;
          border-radius: 20px !important;
        }

        [data-admin-section="paiements"] .hide-scrollbar,
        [data-admin-section="comptabilite"] .hide-scrollbar,
        [data-admin-section="planning"] .hide-scrollbar,
        [data-admin-section="statistiques"] .hide-scrollbar {
          margin-left: -0.25rem;
          margin-right: -0.25rem;
          padding-left: 0.25rem;
          padding-right: 0.25rem;
        }

        [data-admin-section="montoir"] button:not([class*="w-"]),
        [data-admin-section="planning"] button:not([class*="w-"]),
        [data-admin-section="paiements"] button:not([class*="w-"]) {
          min-height: 40px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .admin-page-shell,
        [data-admin-page] *,
        [data-admin-page] *::before,
        [data-admin-page] *::after {
          scroll-behavior: auto !important;
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    `}</style>
  );
}
