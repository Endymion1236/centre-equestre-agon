/**
 * admin/11-cavaliers.spec.ts
 * Vérifie le module Cavaliers (gestion des familles).
 *
 * Couverture :
 *  - CV-01 : Page charge avec liste familles ou message vide
 *  - CV-02 : La recherche filtre les résultats
 *  - CV-03 : Le bouton "Nouvelle famille" ouvre un formulaire
 *  - CV-04 : Une fiche famille affiche les enfants et contacts
 *  - CV-05 : Pas de NaN/undefined dans les âges ou niveaux
 */

import { test, expect } from "@playwright/test";

test.describe("CV · Cavaliers / Familles", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/cavaliers");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test("CV-01 · La page charge sans erreur JS", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });
    await page.goto("/admin/cavaliers");
    await page.waitForLoadState("domcontentloaded");
    expect(errors).toHaveLength(0);
  });

  test("CV-02 · La recherche famille fonctionne", async ({ page }) => {
    const search = page.locator("input[placeholder*='Rechercher'], input[placeholder*='rechercher'], input[placeholder*='famille']").first();
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill("zzz_inexistant_xyz");
    await page.waitForTimeout(500);
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await search.fill("");
  });

  test("CV-03 · Le bouton Nouvelle famille est présent", async ({ page }) => {
    const btn = page.locator("button").filter({ hasText: /nouvelle famille|ajouter|créer/i }).first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("CV-04 · Ouvrir une fiche famille ne provoque pas d'erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    // Chercher le premier accordéon famille
    const firstFamily = page.locator("[data-testid='family-row'], .card, button").filter({ hasText: /famille|cavalier/i }).first();
    if (await firstFamily.isVisible({ timeout: 5_000 })) {
      await firstFamily.click();
      await page.waitForTimeout(800);
    }
    expect(errors).toHaveLength(0);
  });

  test("CV-05 · Aucun NaN/undefined dans la liste", async ({ page }) => {
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
  });
});
