/**
 * admin/01-login.spec.ts
 * Vérifie les guards d'authentification et l'accès au back-office.
 */

import { test, expect } from "@playwright/test";

test.describe("AUTH-01 · Accès admin", () => {
  test("La page /admin redirige vers /admin/dashboard", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/admin\/dashboard/);
  });

  test("Un utilisateur non connecté voit le bloc 'Accès restreint'", async ({ page }) => {
    // Utilise une page sans storageState admin
    await page.goto("/admin/dashboard");
    // Soit redirect vers espace-cavalier, soit affichage du bloc ShieldAlert
    const isBlocked =
      page.url().includes("espace-cavalier") ||
      (await page.locator("text=Accès restreint").isVisible()) ||
      (await page.locator("text=Accès réservé").isVisible());
    expect(isBlocked).toBe(true);
  });

  test("Un admin connecté accède au dashboard sans blocage", async ({ page }) => {
    // Ce test nécessite le storageState admin (projet 'admin' dans playwright.config)
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/espace-cavalier/);
    // Le dashboard contient au moins un lien de navigation
    const nav = page.locator('[data-testid="admin-nav"]');
    if (await nav.isVisible()) {
      await expect(nav).toBeVisible();
    } else {
      // Fallback : vérifier qu'on n'est pas sur l'écran d'erreur
      await expect(page.locator("text=Tableau de bord")).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("AUTH-02 · Espace cavalier", () => {
  test("La page /espace-cavalier affiche le bouton Google si non connecté", async ({ page }) => {
    await page.goto("/espace-cavalier");
    // L'écran de login doit afficher les boutons OAuth
    const loginText = page.locator("text=Continuer avec Google");
    await expect(loginText).toBeVisible({ timeout: 8_000 });
  });

  test("La page /espace-cavalier/dashboard redirige si non connecté", async ({ page }) => {
    await page.goto("/espace-cavalier/dashboard");
    // Doit afficher l'écran de connexion
    const loginScreen = page.locator("text=Continuer avec Google");
    await expect(loginScreen).toBeVisible({ timeout: 8_000 });
  });
});
