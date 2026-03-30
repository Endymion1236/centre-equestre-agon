/**
 * public/18-espace-cavalier-flows.spec.ts
 * Vérifie les flows de l'espace cavalier public (sans auth famille).
 *
 * Couverture :
 *  - EC-05 : La page de réservation affiche les activités disponibles
 *  - EC-06 : La page inscription-annuelle est accessible
 *  - EC-07 : La page factures redirige vers login
 *  - EC-08 : La page progression redirige vers login
 *  - EC-09 : La page satisfaction charge correctement
 *  - EC-10 : Les formulaires publics ne crashent pas
 */

import { test, expect } from "@playwright/test";

test.describe("EC-FLOWS · Espace cavalier flows", () => {
  test("EC-05 · La page /reserver affiche des activités ou login", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    await page.goto("/espace-cavalier/reserver");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // Soit login, soit activités
    const isLogin = await page.locator("text=Continuer avec Google").isVisible();
    const hasActivities = await page.locator("text=/stage|balade|cours|activité/i").count() > 0;

    expect(isLogin || hasActivities).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test("EC-06 · La page inscription-annuelle est accessible", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    await page.goto("/espace-cavalier/inscription-annuelle");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    expect(errors).toHaveLength(0);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("EC-07 · /factures redirige vers login si non connecté", async ({ page }) => {
    await page.goto("/espace-cavalier/factures");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    const loginScreen = await page.locator("text=Continuer avec Google").isVisible();
    expect(loginScreen).toBe(true);
  });

  test("EC-08 · /progression redirige vers login si non connecté", async ({ page }) => {
    await page.goto("/espace-cavalier/progression");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    const loginScreen = await page.locator("text=Continuer avec Google").isVisible();
    expect(loginScreen).toBe(true);
  });

  test("EC-09 · La page satisfaction charge sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    await page.goto("/espace-cavalier/satisfaction");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    expect(errors).toHaveLength(0);
  });

  test("EC-10 · La page contact charge et a un formulaire", async ({ page }) => {
    await page.goto("/contact");
    await page.waitForLoadState("domcontentloaded");

    // Un formulaire ou des coordonnées doivent être présents
    const hasForm = await page.locator("form, input[type='email'], input[type='tel']").count() > 0;
    const hasContact = await page.locator("text=/téléphone|email|contact|02 44/i").count() > 0;
    expect(hasForm || hasContact).toBe(true);
  });
});
