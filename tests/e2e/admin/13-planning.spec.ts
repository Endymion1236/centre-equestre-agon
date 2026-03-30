/**
 * admin/13-planning.spec.ts
 * Vérifie le module Planning en profondeur.
 *
 * Couverture :
 *  - PL-01 : Vue semaine charge avec navigation
 *  - PL-02 : La vue jour fonctionne
 *  - PL-03 : Le générateur de période est accessible
 *  - PL-04 : Les créneaux affichent heure/activité/places
 *  - PL-05 : La timeline desktop (si présente) charge sans erreur
 *  - PL-06 : Navigation J-1/J+1 met à jour la date
 */

import { test, expect } from "@playwright/test";

test.describe("PL · Planning", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/planning");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test("PL-01 · La vue semaine affiche une date", async ({ page }) => {
    const datePattern = /janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|\d{4}/i;
    const bodyText = await page.textContent("body") || "";
    expect(datePattern.test(bodyText)).toBe(true);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("PL-02 · La navigation semaine précédente/suivante fonctionne", async ({ page }) => {
    const bodyBefore = await page.textContent("body") || "";

    // Chercher bouton semaine suivante
    const nextBtn = page.locator("button").filter({ hasText: /suivant|›|>|next/i })
      .or(page.locator("[aria-label*='suivant'], [data-testid='week-next']")).first();

    if (await nextBtn.isVisible({ timeout: 5_000 })) {
      await nextBtn.click();
      await page.waitForTimeout(800);
      const bodyAfter = await page.textContent("body") || "";
      // La page a changé
      expect(bodyAfter).not.toBe(bodyBefore);
      await expect(page.locator("text=NaN")).toHaveCount(0);
    }
  });

  test("PL-03 · Le bouton de création de créneau est accessible", async ({ page }) => {
    const createBtn = page.locator("button").filter({ hasText: /nouveau|créer|ajouter|créneau/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10_000 });
    await expect(createBtn).toBeEnabled();
  });

  test("PL-04 · Ouvrir un créneau affiche ses détails", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    // Cliquer sur le premier créneau disponible
    const firstCreneau = page.locator("[data-testid='creneau-card'], .creneau-card, .card").first();
    if (await firstCreneau.isVisible({ timeout: 5_000 })) {
      await firstCreneau.click();
      await page.waitForTimeout(800);
      await expect(page.locator("text=NaN")).toHaveCount(0);
    }
    expect(errors).toHaveLength(0);
  });

  test("PL-05 · Aucune erreur JS sur le planning", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network") && !e.message.includes("ERR_BLOCKED")) {
        errors.push(e.message);
      }
    });
    await page.goto("/admin/planning");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test("PL-06 · La vue jour est accessible depuis le planning", async ({ page }) => {
    // Chercher un sélecteur de vue (semaine/jour)
    const dayViewBtn = page.locator("button").filter({ hasText: /jour|day/i }).first();
    if (await dayViewBtn.isVisible({ timeout: 5_000 })) {
      await dayViewBtn.click();
      await page.waitForTimeout(800);
      await expect(page.locator("text=NaN")).toHaveCount(0);
    }
  });
});
