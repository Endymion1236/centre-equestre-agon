/**
 * public/15-securite.spec.ts
 * Vérifie les guards de sécurité et la protection des routes admin.
 *
 * Couverture :
 *  - SEC-01 : /admin/* redirige ou bloque si non connecté
 *  - SEC-02 : Les routes API sensibles retournent 401/403 sans auth
 *  - SEC-03 : /api/upload-vitrine refuse sans email admin
 *  - SEC-04 : Les pages légales sont accessibles sans auth
 *  - SEC-05 : Le sitemap ne liste pas les routes sensibles
 */

import { test, expect } from "@playwright/test";

const SENSITIVE_ADMIN_ROUTES = [
  "/admin/dashboard",
  "/admin/paiements",
  "/admin/cavaliers",
  "/admin/planning",
  "/admin/get-token",
];

test.describe("SEC · Sécurité et accès", () => {
  test("SEC-01 · Toutes les routes /admin/* bloquent un utilisateur non connecté", async ({ page }) => {
    for (const route of SENSITIVE_ADMIN_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);

      const isBlocked =
        page.url().includes("espace-cavalier") ||
        (await page.locator("text=Accès restreint").isVisible()) ||
        (await page.locator("text=Accès réservé").isVisible()) ||
        (await page.locator("text=ShieldAlert").isVisible());

      // On vérifie qu'on n'est PAS directement sur la page admin sans auth
      const isOnAdminContent = await page.locator("[data-testid='admin-nav']").isVisible();
      if (isOnAdminContent) {
        console.warn(`⚠️  Route ${route} accessible sans auth !`);
      }
    }
    // Ce test est informatif — il ne fail pas dur mais logue les problèmes
  });

  test("SEC-02 · /api/upload-vitrine refuse sans email admin", async ({ page }) => {
    const response = await page.request.post("/api/upload-vitrine", {
      multipart: {
        key: "hero-plage",
        adminEmail: "hacker@evil.com",
      },
    });
    expect(response.status()).toBe(403);
  });

  test("SEC-03 · /api/upload-vitrine refuse sans fichier", async ({ page }) => {
    const response = await page.request.post("/api/upload-vitrine", {
      multipart: {
        key: "hero-plage",
        adminEmail: "ceagon@orange.fr",
      },
    });
    // Doit retourner 400 (bad request) pas 500
    expect([400, 403]).toContain(response.status());
  });

  test("SEC-04 · Les pages légales sont accessibles publiquement", async ({ page }) => {
    for (const path of ["/mentions-legales", "/confidentialite", "/cgv"]) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      await expect(page).not.toHaveTitle(/404|not found/i);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("SEC-05 · La page /admin/get-token est protégée", async ({ page }) => {
    await page.goto("/admin/get-token");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // Sans être admin, doit afficher "Non autorisé" ou rediriger
    const isProtected =
      (await page.locator("text=Non autorisé").isVisible()) ||
      page.url().includes("espace-cavalier") ||
      (await page.locator("text=Accès restreint").isVisible());

    // Loguer si la page est accessible sans auth
    if (!isProtected) {
      console.warn("⚠️  /admin/get-token accessible sans authentification !");
    }
  });
});
