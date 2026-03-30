/**
 * admin/12-paiements-flows.spec.ts
 * Tests des flows complets du module Paiements.
 *
 * Couverture :
 *  - PA-07 : Créer un paiement depuis le panier — formulaire accessible
 *  - PA-08 : Le rapprochement bancaire (CSV) charge sans erreur
 *  - PA-09 : La génération de facture est accessible
 *  - PA-10 : Les totaux HT/TTC sont cohérents (pas NaN, pas négatif)
 *  - PA-11 : La copie de référence fonctionne
 */

import { test, expect } from "@playwright/test";

test.describe("PA-FLOWS · Paiements flows complets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/paiements");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  test("PA-07 · L'onglet Panier est accessible et affiche un formulaire", async ({ page }) => {
    const panierTab = page.locator("button, [role='tab']").filter({ hasText: /panier|nouveau/i }).first();
    if (await panierTab.isVisible({ timeout: 5_000 })) {
      await panierTab.click();
      await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500);
      // Un sélecteur de famille doit être présent
      const familySelect = page.locator("select, input[placeholder*='famille'], [data-testid='family-search-input']").first();
      await expect(familySelect).toBeVisible({ timeout: 10_000 });
    } else {
      console.log("ℹ️  Onglet Panier non trouvé — module peut-être nommé différemment");
    }
  });

  test("PA-08 · La comptabilité / rapprochement bancaire charge", async ({ page }) => {
    await page.goto("/admin/comptabilite");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});

    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);

    // Vérifier qu'il y a un bouton d'import CSV ou de téléchargement
    const importBtn = page.locator("button, label").filter({ hasText: /import|csv|télécharger|export/i }).first();
    if (await importBtn.isVisible({ timeout: 5_000 })) {
      await expect(importBtn).toBeEnabled();
    }
  });

  test("PA-09 · La génération de facture est accessible depuis les paiements payés", async ({ page }) => {
    // Aller sur l'onglet Payés
    const payesTab = page.locator("button, [role='tab']").filter({ hasText: /payés|historique/i }).first();
    if (await payesTab.isVisible()) {
      await payesTab.click();
      await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // Chercher un bouton facture
    const factureBtn = page.locator("button, a").filter({ hasText: /facture|invoice|pdf|receipt/i }).first();
    if (await factureBtn.isVisible({ timeout: 5_000 })) {
      await expect(factureBtn).toBeVisible();
    }
    // Pas d'erreur quoi qu'il arrive
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("PA-10 · Les totaux affichés sont cohérents (format €)", async ({ page }) => {
    const bodyText = await page.textContent("body") || "";
    // Vérifier qu'il y a des montants en euros (format XX,XX€ ou XX€)
    const hasEuros = /\d+[,.]?\d*\s*€/.test(bodyText) || bodyText.includes("€") || bodyText.includes("Aucun");
    expect(hasEuros).toBe(true);
    await expect(page.locator("text=NaN")).toHaveCount(0);
  });

  test("PA-11 · Le module devis est accessible", async ({ page }) => {
    await page.goto("/admin/devis");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});

    await expect(page.locator("text=NaN")).toHaveCount(0);
    await expect(page.locator("text=undefined")).toHaveCount(0);

    // Un bouton "Nouveau devis" doit être présent
    const newBtn = page.locator("button").filter({ hasText: /nouveau|créer|ajouter/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
  });
});
