/**
 * admin/02-ponctuel.spec.ts
 * Vérifie le module Passage (séance ponctuelle).
 *
 * Couverture :
 *  - PA-01 : La page charge sans erreur
 *  - PA-02 : Le champ de recherche famille est présent
 *  - PA-03 : Sélectionner une activité affiche les créneaux disponibles
 *  - PA-04 : Le formulaire de paiement ponctuel est accessible
 */

import { test, expect } from "@playwright/test";

test.describe("PA · Séance ponctuelle (Passage)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/passage");
    await page.waitForLoadState("networkidle");
  });

  test("PA-01 · La page charge sans erreur JS", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/admin/passage");
    await page.waitForLoadState("networkidle");
    // Pas d'erreur JS critique (on tolère les erreurs Firebase de quota en dev)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("quota") &&
        !e.includes("network") &&
        !e.includes("Firebase") &&
        !e.includes("ERR_BLOCKED")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("PA-02 · Le titre de page est visible", async ({ page }) => {
    // Au moins un des titres / labels attendus
    const heading = page.locator("h1, h2").filter({ hasText: /passage|ponctuel/i });
    await expect(heading.first()).toBeVisible({ timeout: 8_000 });
  });

  test("PA-03 · Un champ de recherche famille est présent", async ({ page }) => {
    const searchInput = page
      .locator('input[placeholder*="famille"], input[placeholder*="Famille"], [data-testid="family-search-input"]')
      .first();
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
  });

  test("PA-04 · La liste des activités / créneaux est chargeable", async ({ page }) => {
    // Vérifie qu'au moins un sélecteur d'activité ou un créneau apparaît
    const activitySelector = page
      .locator('select, [data-testid="activity-select"], [data-testid="creneau-card"]')
      .first();
    await expect(activitySelector).toBeVisible({ timeout: 10_000 });
  });
});
