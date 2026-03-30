import { test as setup } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_DIR = path.join(__dirname, ".auth");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const FIREBASE_API_KEY = "AIzaSyDy1vrJpa12CrnyGoDkR9t4c3E31CS7Ovc";

setup("Créer session admin", async ({ page }) => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminToken = process.env.TEST_ADMIN_TOKEN;

  if (!adminEmail || !adminToken) {
    console.warn("⚠️  TEST_ADMIN_EMAIL / TEST_ADMIN_TOKEN non définis");
    fs.writeFileSync(path.join(AUTH_DIR, "admin.json"), JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Décoder JWT
  const payload = JSON.parse(Buffer.from(adminToken.split(".")[1], "base64").toString());
  const uid = payload.user_id || payload.sub;

  const firebaseAuthUser = {
    uid,
    email: payload.email,
    emailVerified: true,
    displayName: payload.name || "",
    photoURL: payload.picture || "",
    phoneNumber: null,
    isAnonymous: false,
    tenantId: null,
    providerData: [{
      providerId: "google.com",
      uid: payload.email,
      displayName: payload.name || "",
      email: payload.email,
      phoneNumber: null,
      photoURL: payload.picture || "",
    }],
    stsTokenManager: {
      refreshToken: "dummy-refresh-token",
      accessToken: adminToken,
      expirationTime: payload.exp * 1000,
    },
    createdAt: Date.now().toString(),
    lastLoginAt: Date.now().toString(),
    apiKey: FIREBASE_API_KEY,
    appName: "[DEFAULT]",
  };

  // Charger la page
  await page.goto(`${BASE_URL}/accueil`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1500);

  // Injecter dans localStorage
  const storageKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  await page.evaluate(({ key, value }: { key: string; value: string }) => {
    localStorage.setItem(key, value);
  }, { key: storageKey, value: JSON.stringify(firebaseAuthUser) });

  // Reload avec domcontentloaded (pas networkidle)
  await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(3000);

  // Tenter d'aller sur le dashboard admin
  await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log(`URL après injection: ${url}`);
  if (!url.includes("espace-cavalier")) {
    console.log("✅  Session admin sauvegardée");
  } else {
    console.warn("⚠️  Redirection vers espace-cavalier — token peut-être expiré");
  }

  await page.context().storageState({ path: path.join(AUTH_DIR, "admin.json") });
});

setup("Créer session famille", async ({}) => {
  console.warn("⚠️  Pas de compte famille de test — session vide");
  fs.writeFileSync(path.join(AUTH_DIR, "famille.json"), JSON.stringify({ cookies: [], origins: [] }));
});
