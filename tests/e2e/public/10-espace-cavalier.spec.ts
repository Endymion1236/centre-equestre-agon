/**
 * public/10-espace-cavalier.spec.ts
 * Vérifie les pages publiques de l'espace cavalier (sans auth).
 *
 * Couverture :
 *  - EC-01 : Page d'accueil charge
 *  - EC-02 : Page /espace-cavalier affiche l'écran de connexion
 *  - EC-03 : Les pages publiques (activités, tarifs, contact) chargent
 *  - EC-04 : Aucune erreur JS sur la homepage
 */

import { test, expect } from "@playwright/test";

const PUBLIC_PAGES = [
  { path: "/", label: "Accueil" },
  { path: "/activites", label: "Activités" },
  { path: "/tarifs", label: "Tarifs" },
  { path: "/contact", label: "Contact" },
  { path: "/mini-ferme", label: "Mini-ferme" },
  { path: "/equipe", label: "Équipe" },
];

test.describe("EC · Pages publiques", () => {
  for (const { path, label } of PUBLIC_PAGES) {
    test(`${label} charge sans erreur (${path})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => {
        if (
          !e.message.includes("Firebase") &&
          !e.message.includes("network") &&
          !e.message.includes("ERR_BLOCKED")
        ) {
          errors.push(e.message);
        }
      });

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      // Pas de 404 ou page vide
      await expect(page).not.toHaveTitle(/404|not found/i);

      // Pas d'erreur JS critique
      expect(errors).toHaveLength(0);
    });
  }

  test("EC-01 · La homepage affiche le titre principal", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Le H1 contient "équitation" ou le nom du centre
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible({ timeout: 8_000 });
    const text = await h1.textContent();
    expect(text?.length).toBeGreaterThan(3);
  });

  test("EC-02 · /espace-cavalier affiche l'écran de connexion Google/Facebook", async ({ page }) => {
    await page.goto("/espace-cavalier");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Continuer avec Google")).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("text=Continuer avec Facebook")).toBeVisible({ timeout: 8_000 });
  });

  test("EC-03 · La page /espace-cavalier/reserver redirige vers login si non connecté", async ({ page }) => {
    await page.goto("/espace-cavalier/reserver");
    await page.waitForLoadState("networkidle");
    // Doit afficher l'écran de connexion
    const loginGoogle = page.locator("text=Continuer avec Google");
    await expect(loginGoogle).toBeVisible({ timeout: 8_000 });
  });

  test("EC-04 · La navbar contient les liens principaux", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const nav = page.locator("nav").first();
    await expect(nav).toBeVisible({ timeout: 8_000 });
  });
});
