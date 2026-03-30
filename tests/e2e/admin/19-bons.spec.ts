/**
 * admin/19-bons.spec.ts
 * Vérifie les modules Bons cadeaux et Bons récupération.
 *
 * Couverture :
 *  - BG-01 : Page bons-cadeaux charge
 *  - BG-02 : Créer un bon cadeau — formulaire accessible
 *  - BR-01 : Page bons-recup charge
 *  - BR-02 : La liste des bons est affichée
 */

import { test, expect } from "@playwright/test";

test.describe("BG · Bons cadeaux", () => {
  test("BG-01 · La page charge sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    await page.goto("/admin/bons-cadeaux");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("BG-02 · Un bouton de création est présent", async ({ page }) => {
    await page.goto("/admin/bons-cadeaux");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});

    const btn = page.locator("button").filter({ hasText: /nouveau|créer|ajouter|générer/i }).first();
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("BR · Bons récupération", () => {
  test("BR-01 · La page charge sans erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      if (!e.message.includes("Firebase") && !e.message.includes("network")) errors.push(e.message);
    });

    await page.goto("/admin/bons-recup");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("BR-02 · Aucun undefined dans la liste des bons", async ({ page }) => {
    await page.goto("/admin/bons-recup");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});

    await expect(page.locator("text=undefined")).toHaveCount(0);
  });
});
