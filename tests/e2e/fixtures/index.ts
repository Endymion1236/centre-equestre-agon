/**
 * fixtures/index.ts
 * Helpers et fixtures partagés entre tous les specs Playwright.
 */

import { test as base, expect, Page } from "@playwright/test";

// ── Types ──────────────────────────────────────────────────────────────────

export type TestFixtures = {
  adminPage: Page;
  famillePage: Page;
};

// ── Extension du test de base ──────────────────────────────────────────────

export const test = base.extend<TestFixtures>({
  adminPage: async ({ page }, use) => {
    await use(page);
  },
  famillePage: async ({ page }, use) => {
    await use(page);
  },
});

export { expect };

// ── Helpers réutilisables ──────────────────────────────────────────────────

/**
 * Attend que le spinner de chargement disparaisse.
 */
export async function waitForLoad(page: Page) {
  await page.waitForSelector('[data-testid="loading-spinner"]', {
    state: "hidden",
    timeout: 10_000,
  }).catch(() => {
    // Pas de spinner = déjà chargé, on continue
  });
  await page.waitForLoadState("networkidle");
}

/**
 * Vérifie qu'un toast de succès apparaît.
 */
export async function expectSuccessToast(page: Page, messageContains?: string) {
  const toast = page.locator('[data-testid="toast-success"]');
  await expect(toast).toBeVisible({ timeout: 8_000 });
  if (messageContains) {
    await expect(toast).toContainText(messageContains);
  }
}

/**
 * Vérifie qu'un toast d'erreur apparaît.
 */
export async function expectErrorToast(page: Page, messageContains?: string) {
  const toast = page.locator('[data-testid="toast-error"]');
  await expect(toast).toBeVisible({ timeout: 8_000 });
  if (messageContains) {
    await expect(toast).toContainText(messageContains);
  }
}

/**
 * Sélectionne une famille dans un champ de recherche famille.
 */
export async function selectFamily(page: Page, searchName: string) {
  const input = page.locator('[data-testid="family-search-input"]');
  await input.fill(searchName);
  await page.waitForTimeout(400); // debounce
  const first = page.locator('[data-testid="family-search-result"]').first();
  await expect(first).toBeVisible({ timeout: 5_000 });
  await first.click();
}

/**
 * Vérifie qu'une page admin est accessible (pas de redirect vers espace-cavalier).
 */
export async function expectAdminPageLoaded(page: Page, path: string) {
  await page.goto(path);
  await expect(page).not.toHaveURL(/espace-cavalier/);
  await expect(page).not.toHaveURL(/login/);
}
