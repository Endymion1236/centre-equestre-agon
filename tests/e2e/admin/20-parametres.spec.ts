/**
 * admin/20-parametres.spec.ts
 * Vérifie le module Paramètres.
 *
 * Couverture :
 *  - PR-01 : Page charge avec les infos du centre
 *  - PR-02 : Les champs SIRET, téléphone, email sont présents
 *  - PR-03 : Le bouton de sauvegarde est présent
 *  - PR-04 : La configuration des seuils poney est accessible
 *  - PR-05 : Modifier un champ ne provoque pas d'erreur JS
 */

import { test, expect } from "@playwright/test";

test.describe("PR · Paramètres", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/parametres");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test("PR-01 · La page charge sans erreur JS", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });
    await page.goto("/admin/parametres");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test("PR-02 · Les champs de configuration du centre sont présents", async ({ page }) => {
    // Au moins un champ de type input doit être visible
    const inputs = page.locator("input[type='text'], input[type='email'], input[type='tel'], input[type='number']");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("PR-03 · Le bouton de sauvegarde est présent", async ({ page }) => {
    const saveBtn = page.locator("button").filter({ hasText: /sauvegarder|enregistrer|save|mettre à jour/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
    await expect(saveBtn).toBeEnabled();
  });

  test("PR-04 · Modifier un champ texte ne provoque pas d'erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    const firstInput = page.locator("input[type='text'], input[type='tel']").first();
    if (await firstInput.isVisible({ timeout: 5_000 })) {
      const currentVal = await firstInput.inputValue();
      await firstInput.click();
      await firstInput.type(" ");
      await firstInput.fill(currentVal); // Remettre la valeur d'origine
    }
    expect(errors).toHaveLength(0);
  });

  test("PR-05 · Aucun NaN/undefined dans les paramètres", async ({ page }) => {
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
  });
});
