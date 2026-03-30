/**
 * admin/10-dashboard.spec.ts
 * Vérifie le tableau de bord admin.
 *
 * Couverture :
 *  - DB-01 : Page charge, titre et date présents
 *  - DB-02 : Les stats (familles, activités) sont numériques
 *  - DB-03 : Les raccourcis de navigation sont cliquables
 *  - DB-04 : Aucun NaN/undefined visible
 */

import { test, expect } from "@playwright/test";

test.describe("DB · Dashboard admin", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 20_000 }).catch(() => {});
  });

  test("DB-01 · Le titre et la date du jour sont présents", async ({ page }) => {
    await expect(page.locator("text=Tableau de bord")).toBeVisible({ timeout: 10_000 });
    // La date du jour doit être affichée (ex: "lundi 30 mars 2026")
    const datePattern = /lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i;
    const bodyText = await page.textContent("body");
    expect(datePattern.test(bodyText || "")).toBe(true);
  });

  test("DB-02 · Les compteurs de stats sont numériques (pas NaN)", async ({ page }) => {
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
  });

  test("DB-03 · Les raccourcis de navigation existent", async ({ page }) => {
    // Au moins 5 liens de navigation rapide
    const links = page.locator("a[href^='/admin/']");
    const count = await links.count();
    expect(count).toBeGreaterThan(4);
  });

  test("DB-04 · Cliquer sur un raccourci navigue sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    // Cliquer sur le lien Paiements
    const paiementsLink = page.locator("a[href='/admin/paiements']").first();
    if (await paiementsLink.isVisible()) {
      await paiementsLink.click();
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(/paiements/);
    }
    expect(errors).toHaveLength(0);
  });
});
