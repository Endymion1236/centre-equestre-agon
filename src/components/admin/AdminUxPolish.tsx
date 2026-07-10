"use client";

/**
 * Couche visuelle commune au back-office.
 *
 * Elle n'altère aucune logique métier : elle harmonise uniquement la densité,
 * les formulaires, les cartes, les tableaux et les comportements tactiles sur
 * l'ensemble des écrans admin.
 */
export default function AdminUxPolish() {
  return (
    <style jsx global>{`
      [data-admin-page] {
        min-width: 0;
      }

      [data-admin-page] > * {
        min-width: 0;
      }

      [data-admin-page] h1 {
        letter-spacing: -0.025em;
        line-height: 1.12;
      }

      [data-admin-page] h2,
      [data-admin-page] h3 {
        letter-spacing: -0.012em;
      }

      [data-admin-page] .card {
        border: 1px solid rgba(32, 80, 160, 0.08);
        border-radius: 18px;
        box-shadow: 0 8px 30px rgba(12, 26, 46, 0.045);
      }

      [data-admin-page] .card-hover:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 36px rgba(12, 26, 46, 0.09);
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

      [data-admin-page] input:not([type="checkbox"]):not([type="radio"]):focus,
      [data-admin-page] select:focus,
      [data-admin-page] textarea:focus {
        border-color: rgba(32, 80, 160, 0.55) !important;
        box-shadow: 0 0 0 3px rgba(32, 80, 160, 0.1);
        outline: none;
      }

      [data-admin-page] button,
      [data-admin-page] a {
        -webkit-tap-highlight-color: transparent;
      }

      [data-admin-page] button:focus-visible,
      [data-admin-page] a:focus-visible {
        outline: 3px solid rgba(240, 160, 16, 0.35);
        outline-offset: 2px;
      }

      [data-admin-page] table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }

      [data-admin-page] thead th {
        background: rgba(237, 242, 250, 0.78);
        color: #3f5875;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.055em;
        text-transform: uppercase;
      }

      [data-admin-page] tbody tr {
        transition: background 140ms ease;
      }

      [data-admin-page] tbody tr:hover {
        background: rgba(237, 242, 250, 0.42);
      }

      [data-admin-page] th,
      [data-admin-page] td {
        padding-top: 0.78rem;
        padding-bottom: 0.78rem;
      }

      [data-admin-page] .overflow-x-auto,
      [data-admin-page] .hide-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(32, 80, 160, 0.22) transparent;
      }

      [data-admin-page] .overflow-x-auto::-webkit-scrollbar {
        height: 6px;
      }

      [data-admin-page] .overflow-x-auto::-webkit-scrollbar-thumb {
        background: rgba(32, 80, 160, 0.22);
        border-radius: 999px;
      }

      [data-admin-page] [class*="rounded-lg"] {
        transition-property: background-color, border-color, color, box-shadow, transform;
        transition-duration: 150ms;
      }

      @media (max-width: 767px) {
        [data-admin-page] h1 {
          font-size: 1.65rem !important;
        }

        [data-admin-page] h2 {
          line-height: 1.2;
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
      }

      @media (prefers-reduced-motion: reduce) {
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
