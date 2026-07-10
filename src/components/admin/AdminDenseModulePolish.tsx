"use client";

/**
 * Finitions ciblées pour les écrans historiques les plus denses.
 * Les sélecteurs restent purement visuels et ne modifient aucune interaction.
 */
export default function AdminDenseModulePolish() {
  return (
    <style jsx global>{`
      /* ───────────────────────── Planning ───────────────────────── */
      [data-admin-section="planning"] > div {
        padding-bottom: 1rem;
      }

      [data-admin-section="planning"] > div > div:first-child {
        margin-bottom: 1rem !important;
      }

      [data-admin-section="planning"] button[aria-label="Plus d'actions"] {
        border: 1px solid rgba(148, 163, 184, 0.16) !important;
        box-shadow: 0 3px 12px rgba(12, 26, 46, 0.04);
      }

      [data-admin-section="planning"] [class*="min-w-[820px]"] {
        scroll-margin-inline: 1rem;
      }

      /* ───────────────────────── Montoir ───────────────────────── */
      [data-admin-section="montoir"] > div > div:nth-child(2) {
        border: 1px solid rgba(32, 80, 160, 0.075);
        border-radius: 18px;
        background: rgba(255,255,255,.92);
        padding: .75rem .85rem;
        box-shadow: 0 6px 24px rgba(12,26,46,.035);
      }

      [data-admin-section="montoir"] > div > div:nth-child(2) > div:first-child {
        min-width: 210px;
      }

      [data-admin-section="montoir"] .card {
        position: relative;
      }

      [data-admin-section="montoir"] .card[class*="bg-gray-50"] {
        filter: saturate(.72);
      }

      [data-admin-section="montoir"] .card > div[class*="border-b"] {
        background: linear-gradient(180deg, rgba(248,250,252,.72), rgba(255,255,255,0));
        margin: -1rem -1rem .85rem;
        padding: 1rem 1rem .8rem;
      }

      [data-admin-section="montoir"] .card .rounded-lg[class*="bg-sand"] {
        background: rgba(248,250,252,.86) !important;
      }

      [data-admin-section="montoir"] .card .rounded-lg[class*="bg-sand"]:hover {
        background: rgba(237,242,250,.74) !important;
      }

      [data-admin-section="montoir"] .card button[class*="bg-blue-600"],
      [data-admin-section="montoir"] .card button[class*="bg-green-600"] {
        box-shadow: 0 5px 15px rgba(32,80,160,.14);
      }

      /* ───────────────────────── Cavaliers ─────────────────────── */
      [data-admin-section="cavaliers"] > div > div:first-child {
        border-radius: 22px;
        background: linear-gradient(135deg, rgba(255,255,255,.98), rgba(244,248,255,.88));
        border: 1px solid rgba(32,80,160,.07);
        padding: 1rem 1.1rem;
        box-shadow: 0 8px 30px rgba(12,26,46,.035);
      }

      [data-admin-section="cavaliers"] .card {
        isolation: isolate;
      }

      [data-admin-section="cavaliers"] .card:hover {
        border-color: rgba(32,80,160,.14);
      }

      [data-admin-section="cavaliers"] .card button[class*="bg-red-50"] {
        opacity: .72;
      }

      [data-admin-section="cavaliers"] .card:hover button[class*="bg-red-50"],
      [data-admin-section="cavaliers"] .card button[class*="bg-red-50"]:focus-visible {
        opacity: 1;
      }

      [data-admin-section="cavaliers"] .card [class*="grid-cols-4"] > div {
        border: 1px solid rgba(148,163,184,.08);
      }

      /* ───────────────────────── Paiements ─────────────────────── */
      [data-admin-section="paiements"] > div > div:first-child {
        align-items: center;
      }

      [data-admin-section="paiements"] > div > div:nth-child(2) {
        border-radius: 16px;
        background: rgba(255,255,255,.88);
        padding: .4rem;
        border: 1px solid rgba(32,80,160,.07);
        box-shadow: 0 5px 22px rgba(12,26,46,.03);
      }

      [data-admin-section="paiements"] .flex.gap-6.flex-wrap > .flex-1 {
        min-width: min(400px, 100%);
      }

      [data-admin-section="paiements"] .flex.gap-6.flex-wrap > div:last-child {
        align-self: flex-start;
      }

      [data-admin-section="paiements"] h3 {
        color: #12346b;
        letter-spacing: -.01em;
      }

      [data-admin-section="paiements"] h3:first-letter {
        color: #2050a0;
      }

      [data-admin-section="paiements"] .card[class*="border-orange"] {
        box-shadow: 0 10px 30px rgba(234,88,12,.06);
      }

      [data-admin-section="paiements"] button[class*="bg-green-600"] {
        box-shadow: 0 8px 22px rgba(22,163,74,.16);
      }

      [data-admin-section="paiements"] button[class*="bg-blue-500"],
      [data-admin-section="paiements"] button[class*="bg-blue-600"] {
        box-shadow: 0 6px 18px rgba(32,80,160,.12);
      }

      /* ───────────────────────── Comptabilité ──────────────────── */
      [data-admin-section="comptabilite"] > div > div:first-child {
        margin-bottom: 1rem !important;
      }

      [data-admin-section="comptabilite"] table {
        background: white;
      }

      [data-admin-section="comptabilite"] thead th:first-child {
        border-top-left-radius: 12px;
      }

      [data-admin-section="comptabilite"] thead th:last-child {
        border-top-right-radius: 12px;
      }

      [data-admin-section="comptabilite"] button[class*="bg-blue-500"],
      [data-admin-section="comptabilite"] button[class*="bg-blue-600"] {
        box-shadow: 0 5px 16px rgba(32,80,160,.11);
      }

      /* ───────────────────── Statistiques / Pédagogie ─────────── */
      [data-admin-section="statistiques"] [class*="grid-cols"] > .card,
      [data-admin-section="pedagogie"] [class*="grid-cols"] > .card {
        background-image: linear-gradient(150deg, rgba(255,255,255,1), rgba(248,250,252,.75));
      }

      [data-admin-section="pedagogie"] .card > div:first-child[class*="cursor-pointer"] {
        padding: .15rem;
      }

      /* ───────────────────────── Responsive ────────────────────── */
      @media (min-width: 1280px) {
        [data-admin-section="paiements"] .flex.gap-6.flex-wrap > div:last-child {
          position: sticky;
          top: 1rem;
        }
      }

      @media (max-width: 767px) {
        [data-admin-section="planning"] > div > div:first-child,
        [data-admin-section="montoir"] > div > div:first-child,
        [data-admin-section="cavaliers"] > div > div:first-child,
        [data-admin-section="paiements"] > div > div:first-child {
          margin-left: -.15rem;
          margin-right: -.15rem;
        }

        [data-admin-section="montoir"] > div > div:nth-child(2) {
          padding: .7rem;
        }

        [data-admin-section="montoir"] > div > div:nth-child(2) > div:first-child {
          min-width: 100%;
        }

        [data-admin-section="montoir"] .card > div[class*="border-b"] {
          margin: -.85rem -.85rem .75rem;
          padding: .85rem;
        }

        [data-admin-section="cavaliers"] .card .flex.justify-end.mb-2 {
          flex-wrap: nowrap !important;
          overflow-x: auto;
          justify-content: flex-start !important;
          margin-left: -.25rem;
          margin-right: -.25rem;
          padding: .25rem;
          scrollbar-width: none;
        }

        [data-admin-section="cavaliers"] .card .flex.justify-end.mb-2::-webkit-scrollbar {
          display: none;
        }

        [data-admin-section="cavaliers"] .card .flex.justify-end.mb-2 > button {
          flex-shrink: 0;
        }

        [data-admin-section="paiements"] .flex.gap-6.flex-wrap {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) !important;
          width: 100%;
        }

        [data-admin-section="paiements"] .flex.gap-6.flex-wrap > .flex-1,
        [data-admin-section="paiements"] .flex.gap-6.flex-wrap > div {
          min-width: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        [data-admin-section="paiements"] .card {
          padding-left: .85rem !important;
          padding-right: .85rem !important;
        }

        [data-admin-section="comptabilite"] .overflow-x-auto {
          border: 1px solid rgba(148,163,184,.12);
          border-radius: 14px;
        }
      }
    `}</style>
  );
}
