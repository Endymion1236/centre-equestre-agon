/**
 * admin/09-navigation-smoke.spec.ts
 * Smoke test : visite toutes les pages admin et vérifie qu'aucune ne crashe.
 *
 * Ce test est lent mais très utile pour détecter les régressions globales.
 */

import { test, expect } from "@playwright/test";

const ADMIN_PAGES = [
  { path: "/admin/dashboard", label: "Dashboard" },
  { path: "/admin/planning", label: "Planning" },
  { path: "/admin/montoir", label: "Montoir" },
  { path: "/admin/cavaliers", label: "Cavaliers" },
  { path: "/admin/passage", label: "Passage" },
  { path: "/admin/paiements", label: "Paiements" },
  { path: "/admin/forfaits", label: "Forfaits" },
  { path: "/admin/cartes", label: "Cartes" },
  { path: "/admin/avoirs", label: "Avoirs" },
  { path: "/admin/comptabilite", label: "Comptabilité" },
  { path: "/admin/statistiques", label: "Statistiques" },
  { path: "/admin/email-templates", label: "Email templates" },
  { path: "/admin/parametres", label: "Paramètres" },
];

test.describe("SMOKE · Toutes les pages admin chargent", () => {
  for (const { path, label } of ADMIN_PAGES) {
    test(`${label} (${path})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => {
        if (!e.message.includes("Firebase") && !e.message.includes("network") && !e.message.includes("ERR_BLOCKED")) {
          errors.push(e.message);
        }
      });

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      // Attendre max 12s que le spinner disparaisse
      await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 12_000 }).catch(() => {});

      // Pas redirigé vers espace-cavalier (pas de blocage auth)
      await expect(page).not.toHaveURL(/espace-cavalier/);

      // Pas d'erreur JS critique
      expect(errors).toHaveLength(0);

      // Pas de NaN/undefined visible
      await expect(page.locator("text=NaN")).toHaveCount(0);
      await expect(page.locator("text=undefined")).toHaveCount(0);
    });
  }
});
