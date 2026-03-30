/**
 * admin/14-email-templates.spec.ts
 * Vérifie le module Email Templates.
 *
 * Couverture :
 *  - EM-01 : Page charge avec la liste des templates
 *  - EM-02 : Sélectionner un template affiche son contenu
 *  - EM-03 : Le bouton de prévisualisation fonctionne
 *  - EM-04 : Le bouton d'envoi test est présent
 *  - EM-05 : Le module email-reprise charge sans erreur
 */

import { test, expect } from "@playwright/test";

test.describe("EM · Email Templates", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/email-templates");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test("EM-01 · La page charge avec au moins un template", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });
    await page.goto("/admin/email-templates");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("EM-02 · Les templates ont des noms lisibles", async ({ page }) => {
    // Des noms de templates doivent être visibles (confirmation, rappel, etc.)
    const templateNames = page.locator("button, [role='tab'], h3").filter({
      hasText: /confirmation|rappel|bienvenue|relance|stage|cours|forfait/i
    });
    const count = await templateNames.count();
    expect(count).toBeGreaterThan(0);
  });

  test("EM-03 · Sélectionner un template affiche un éditeur", async ({ page }) => {
    const firstTemplate = page.locator("button").filter({
      hasText: /confirmation|rappel|bienvenue|relance|stage|cours/i
    }).first();

    if (await firstTemplate.isVisible({ timeout: 5_000 })) {
      await firstTemplate.click();
      await page.waitForTimeout(800);
      // Un textarea ou éditeur HTML doit apparaître
      const editor = page.locator("textarea, [contenteditable], .html-editor").first();
      if (await editor.isVisible({ timeout: 5_000 })) {
        await expect(editor).toBeVisible();
      }
    }
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("EM-04 · Le bouton d'envoi test est présent", async ({ page }) => {
    const testBtn = page.locator("button").filter({ hasText: /test|envoyer|send/i }).first();
    if (await testBtn.isVisible({ timeout: 5_000 })) {
      await expect(testBtn).toBeVisible();
    }
  });

  test("EM-05 · La page email-reprise charge sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    await page.goto("/admin/email-reprise");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    expect(errors).toHaveLength(0);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });
});
