/**
 * admin/04-cartes.spec.ts
 * Vérifie le module Cartes de séances.
 */

import { test, expect } from "@playwright/test";

// Helper — skip si session Firebase expirée
async function checkAuth(page: any) {
  const blocked = await page.locator("text=Accès restreint").or(page.locator("text=Accès réservé")).isVisible();
  if (blocked) test.skip(true, "Session expirée — relancer auth.setup");
  return !blocked;
}

test.describe("CA · Cartes de séances", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/cartes");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(300);
  });

  test("CA-01 · Les 3 onglets sont présents", async ({ page }) => {
    if (!await checkAuth(page)) return;
    await expect(page.locator("text=Actives").or(page.locator("text=Active")).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("text=Créer").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Historique").first()).toBeVisible({ timeout: 5_000 });
  });

  test("CA-02 · L'onglet Créer affiche les templates (5, 10, 20 séances)", async ({ page }) => {
    if (!await checkAuth(page)) return;
    // Cliquer sur l'onglet Créer — trouver le bon bouton parmi les 3 onglets
    const tabs = page.locator("button").filter({ hasText: /^Créer$/ });
    const tabCount = await tabs.count();
    if (tabCount === 0) {
      // Fallback : chercher par index dans les boutons d'onglet
      const allTabs = page.locator("button.cursor-pointer").filter({ hasText: /créer/i });
      await allTabs.first().click();
    } else {
      await tabs.first().click();
    }
    await page.waitForTimeout(500);
    // Le h3 doit apparaître immédiatement (pas de Firestore nécessaire)
    await expect(page.locator("h3").filter({ hasText: /carte de séances/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Carte 5 séances")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Carte 10 séances")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Carte 20 séances")).toBeVisible({ timeout: 5_000 });
  });

  test("CA-03 · Aucun montant NaN/undefined dans la page", async ({ page }) => {
    if (!await checkAuth(page)) return;
    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);
  });

  test("CA-04 · L'onglet Créer contient un champ famille", async ({ page }) => {
    if (!await checkAuth(page)) return;
    const tabs = page.locator("button").filter({ hasText: /^Créer$/ });
    const tabCount = await tabs.count();
    if (tabCount > 0) await tabs.first().click();
    else await page.locator("button").filter({ hasText: /créer/i }).first().click();
    await page.waitForTimeout(500);
    // Un input de recherche famille doit être présent
    const familleInput = page.locator("input[placeholder*='Rechercher'], input[placeholder*='famille']").first();
    await expect(familleInput).toBeVisible({ timeout: 10_000 });
  });

  test("CA-05 · L'onglet Historique se charge sans erreur", async ({ page }) => {
    if (!await checkAuth(page)) return;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const histTab = page.locator("button").filter({ hasText: /historique/i }).first();
    await histTab.click();
    await page.waitForTimeout(1500);
    const criticalErrors = errors.filter((e) => !e.includes("Firebase") && !e.includes("network"));
    expect(criticalErrors).toHaveLength(0);
  });
});
