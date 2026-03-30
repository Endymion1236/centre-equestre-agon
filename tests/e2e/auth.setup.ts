/**
 * auth.setup.ts
 *
 * Génère les fichiers storageState (.auth/admin.json et .auth/famille.json)
 * qui simulent une session Firebase authentifiée.
 *
 * ⚠️  Pour fonctionner, ce setup injecte directement un faux user dans
 *     localStorage (clé Firebase IndexedDB) via une API route de test.
 *
 * Pré-requis : créer un compte de test dans Firebase Console avec
 *   - admin@test.ce-agon.fr (email dans ADMIN_EMAILS)
 *   - famille@test.ce-agon.fr (email famille classique)
 * et stocker les tokens dans .env.local :
 *   TEST_ADMIN_EMAIL=ceagon50@gmail.com
 *   TEST_ADMIN_TOKEN=<Firebase ID token>
 *   TEST_FAMILLE_EMAIL=famille-test@gmail.com
 *   TEST_FAMILLE_TOKEN=<Firebase ID token>
 *
 * Pour générer un token manuellement :
 *   firebase auth:sign-in --email xxx --password yyy
 * ou via l'API REST Firebase :
 *   https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword
 */

import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = path.join(__dirname, ".auth");

// ── Helper : injecte une session Firebase via la page ──
async function injectFirebaseAuth(page: any, idToken: string, email: string) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Appelle l'API route de test qui échange le token contre une session cookie
  const response = await page.request.post("/api/test-auth", {
    data: { idToken, email },
  });

  if (!response.ok()) {
    console.warn(
      `⚠️  /api/test-auth a retourné ${response.status()} — vérifier que la route existe`
    );
  }
}

setup("Créer session admin", async ({ page }) => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminToken = process.env.TEST_ADMIN_TOKEN;

  if (!adminEmail || !adminToken) {
    console.warn(
      "⚠️  TEST_ADMIN_EMAIL / TEST_ADMIN_TOKEN non définis dans .env.local\n" +
        "    Les tests admin passeront en mode SKIP."
    );
    // Créer un storageState vide pour éviter l'erreur de fichier manquant
    fs.writeFileSync(
      path.join(AUTH_DIR, "admin.json"),
      JSON.stringify({ cookies: [], origins: [] })
    );
    return;
  }

  await injectFirebaseAuth(page, adminToken, adminEmail);
  await page.goto("/admin/dashboard");
  await expect(page).not.toHaveURL(/espace-cavalier/);

  await page.context().storageState({ path: path.join(AUTH_DIR, "admin.json") });
  console.log("✅  Session admin sauvegardée");
});

setup("Créer session famille", async ({ page }) => {
  const familleEmail = process.env.TEST_FAMILLE_EMAIL;
  const familleToken = process.env.TEST_FAMILLE_TOKEN;

  if (!familleEmail || !familleToken) {
    console.warn(
      "⚠️  TEST_FAMILLE_EMAIL / TEST_FAMILLE_TOKEN non définis dans .env.local\n" +
        "    Les tests famille passeront en mode SKIP."
    );
    fs.writeFileSync(
      path.join(AUTH_DIR, "famille.json"),
      JSON.stringify({ cookies: [], origins: [] })
    );
    return;
  }

  await injectFirebaseAuth(page, familleToken, familleEmail);
  await page.goto("/espace-cavalier/dashboard");
  await expect(page).not.toHaveURL(/login/);

  await page.context().storageState({ path: path.join(AUTH_DIR, "famille.json") });
  console.log("✅  Session famille sauvegardée");
});
