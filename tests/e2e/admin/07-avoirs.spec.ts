/**
 * admin/07-avoirs.spec.ts
 * Vérifie le module Avoirs.
 */

import { test, expect } from "@playwright/test";

async function checkAuth(page: any) {
  const blocked = await page.locator("text=Accès restreint").or(page.locator("text=Accès réservé")).isVisible();
  if (blocked) test.skip(true, "Session expirée — relancer auth.setup");
  return !blocked;
}

test.describe("AV · Avoirs", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/avoirs");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(300);
  });

  test("AV-01 · La page charge avec les 3 onglets", async ({ page }) => {
    if (!await checkAuth(page)) return;
    await expect(page.locator("text=Actifs").first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("text=Créer").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Historique").first()).toBeVisible({ timeout: 5_000 });
  });

  test("AV-02 · L'onglet Créer affiche les champs requis", async ({ page }) => {
    if (!await checkAuth(page)) return;
    // Cliquer sur l'onglet Créer
    const creerTab = page.locator("button").filter({ hasText: /^Créer$|créer un avoir/i }).first();
    await creerTab.click();
    await page.waitForTimeout(500);
    // Le h3 est statique — pas besoin de Firestore
    await expect(page.locator("h3").filter({ hasText: /avoir|avance/i })).toBeVisible({ timeout: 10_000 });
    // Champ montant — statique
    const montantInput = page.locator("input[type='number'], input[placeholder*='montant']").first();
    await expect(montantInput).toBeVisible({ timeout: 5_000 });
  });

  test("AV-03 · Aucun NaN dans les montants", async ({ page }) => {
    if (!await checkAuth(page)) return;
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
  });

  test("AV-04 · Changer d'onglet ne provoque pas d'erreur", async ({ page }) => {
    if (!await checkAuth(page)) return;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const tabText of ["Créer", "Historique", "Actifs"]) {
      const tab = page.locator("button").filter({ hasText: new RegExp(`^${tabText}$`, "i") }).first();
      if (await tab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(400);
      }
    }
    const criticalErrors = errors.filter((e) => !e.includes("Firebase") && !e.includes("network"));
    expect(criticalErrors).toHaveLength(0);
  });
});
