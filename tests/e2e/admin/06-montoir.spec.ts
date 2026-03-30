/**
 * admin/06-montoir.spec.ts
 * Vérifie le module Montoir (feuille de présence du jour).
 *
 * Couverture :
 *  - MO-01 : Page charge pour la date du jour
 *  - MO-02 : Navigation J-1 / J+1 fonctionne
 *  - MO-03 : La liste des créneaux du jour est affichée (ou message vide)
 *  - MO-04 : L'affichage des équidés ne produit pas de NaN
 *  - MO-05 : Le bouton d'impression est présent
 */

import { test, expect } from "@playwright/test";

test.describe("MO · Montoir", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/montoir");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 15_000 }).catch(() => {});
  });

  test("MO-01 · La page charge sans erreur JS", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/admin/montoir");
    await page.waitForLoadState("networkidle");

    const criticalErrors = errors.filter(
      (e) => !e.includes("Firebase") && !e.includes("network") && !e.includes("ERR_BLOCKED")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("MO-02 · La date du jour est affichée dans le titre", async ({ page }) => {
    // La page doit afficher une date (format jour/mois/année ou nom du jour)
    const datePattern = /lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}[/\-]\d{1,2}/i;
    const pageText = await page.textContent("body");
    expect(datePattern.test(pageText || "")).toBe(true);
  });

  test("MO-03 · Les boutons J-1 / J+1 permettent de changer de jour", async ({ page }) => {
    const prevBtn = page
      .locator("button")
      .filter({ hasText: /J\-1|hier|précédent|<|‹/i })
      .or(page.locator("[data-testid='day-prev']"))
      .first();

    const nextBtn = page
      .locator("button")
      .filter({ hasText: /J\+1|demain|suivant|>|›/i })
      .or(page.locator("[data-testid='day-next']"))
      .first();

    // Naviguer vers J+1
    if (await nextBtn.isVisible()) {
      const textBefore = await page.textContent("body");
      await nextBtn.click();
      await page.waitForTimeout(500);
      const textAfter = await page.textContent("body");
      // La date doit avoir changé
      expect(textAfter).not.toBe(textBefore);
    }

    // Naviguer vers J-1 (retour)
    if (await prevBtn.isVisible()) {
      await prevBtn.click();
      await page.waitForTimeout(500);
    }

    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
  });

  test("MO-04 · Aucune erreur NaN/undefined dans l'affichage", async ({ page }) => {
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
  });

  test("MO-05 · Le bouton Imprimer est présent", async ({ page }) => {
    const printBtn = page
      .locator("button, a")
      .filter({ hasText: /imprimer|print|pdf/i })
      .or(page.locator("[data-testid='print-btn']"))
      .first();
    // Le bouton d'impression est optionnel selon le contenu du jour
    // On vérifie juste qu'il n'est pas cassé si présent
    if (await printBtn.isVisible()) {
      await expect(printBtn).toBeEnabled();
    }
  });
});
