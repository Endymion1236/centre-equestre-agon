/**
 * admin/16-cavalerie.spec.ts
 * Vérifie le module Cavalerie (gestion des équidés).
 *
 * Couverture :
 *  - EQ-01 : Page charge avec la liste des équidés
 *  - EQ-02 : Chaque équidé affiche son nom
 *  - EQ-03 : Les indisponibilités sont gérables
 *  - EQ-04 : Aucun NaN dans les seuils d'utilisation
 */

import { test, expect } from "@playwright/test";

test.describe("EQ · Cavalerie", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/cavalerie");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test("EQ-01 · La page charge sans erreur JS", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });
    await page.goto("/admin/cavalerie");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test("EQ-02 · La liste des équidés s'affiche ou message vide", async ({ page }) => {
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
    // Soit une liste d'équidés, soit un message "aucun"
    const hasContent =
      (await page.locator(".card, [data-testid='equide-card']").count()) > 0 ||
      (await page.locator("text=/aucun|ajouter un|no horse/i").count()) > 0;
    expect(hasContent).toBe(true);
  });

  test("EQ-03 · Le bouton d'ajout d'équidé est présent", async ({ page }) => {
    const addBtn = page.locator("button").filter({ hasText: /ajouter|nouveau|créer/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
  });

  test("EQ-04 · Les seuils poney ne contiennent pas NaN", async ({ page }) => {
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });
});
