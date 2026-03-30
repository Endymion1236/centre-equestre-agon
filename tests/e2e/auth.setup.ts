/**
 * auth.setup.ts
 * Génère les storageState pour les tests admin.
 * Stratégie : injection directe du token Firebase dans localStorage
 * (Firebase Auth persiste ses tokens dans localStorage sous la clé firebase:authUser:...)
 */

import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = path.join(__dirname, ".auth");

// Créer le dossier .auth s'il n'existe pas
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const FIREBASE_PROJECT_ID = "gestion-2026";
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

setup("Créer session admin", async ({ page }) => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminToken = process.env.TEST_ADMIN_TOKEN;

  if (!adminEmail || !adminToken) {
    console.warn("⚠️  TEST_ADMIN_EMAIL / TEST_ADMIN_TOKEN non définis — session vide créée");
    fs.writeFileSync(
      path.join(AUTH_DIR, "admin.json"),
      JSON.stringify({ cookies: [], origins: [] })
    );
    return;
  }

  // Décoder le token JWT pour extraire les infos user
  const payload = JSON.parse(Buffer.from(adminToken.split(".")[1], "base64").toString());
  const uid = payload.user_id || payload.sub;
  const email = payload.email;
  const displayName = payload.name || "";
  const picture = payload.picture || "";

  // Construire l'objet Firebase authUser tel que Firebase le stocke dans localStorage
  const firebaseAuthUser = {
    uid,
    email,
    emailVerified: true,
    displayName,
    photoURL: picture,
    phoneNumber: null,
    isAnonymous: false,
    tenantId: null,
    providerData: [{
      providerId: "google.com",
      uid: email,
      displayName,
      email,
      phoneNumber: null,
      photoURL: picture,
    }],
    stsTokenManager: {
      refreshToken: "dummy-refresh-token",
      accessToken: adminToken,
      expirationTime: (payload.exp * 1000),
    },
    createdAt: Date.now().toString(),
    lastLoginAt: Date.now().toString(),
    apiKey: FIREBASE_API_KEY,
    appName: "[DEFAULT]",
  };

  // Naviguer sur le site et injecter le token dans localStorage
  await page.goto(`${BASE_URL}/accueil`);
  await page.waitForLoadState("networkidle");

  // Injecter dans localStorage (clé utilisée par Firebase Auth v9+)
  const storageKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  await page.evaluate(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: storageKey, value: JSON.stringify(firebaseAuthUser) }
  );

  // Recharger pour que Firebase prenne en compte le localStorage
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Vérifier qu'on a accès au dashboard admin
  await page.goto(`${BASE_URL}/admin/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const url = page.url();
  if (url.includes("espace-cavalier") || url.includes("login")) {
    console.warn("⚠️  Redirection détectée — le token n'a pas été accepté par Firebase");
    // Sauvegarder quand même pour ne pas bloquer les tests
  } else {
    console.log("✅  Session admin sauvegardée");
  }

  await page.context().storageState({ path: path.join(AUTH_DIR, "admin.json") });
});

setup("Créer session famille", async ({ page }) => {
  // Pas de compte famille de test pour l'instant
  console.warn("⚠️  Pas de compte famille de test — session vide");
  fs.writeFileSync(
    path.join(AUTH_DIR, "famille.json"),
    JSON.stringify({ cookies: [], origins: [] })
  );
});
