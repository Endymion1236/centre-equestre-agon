import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // ── Étape 1 : setup auth (génère les storageState) ──
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    // ── Tests admin (nécessite auth admin) ──
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/admin.json",
      },
    },
    // ── Tests famille (nécessite auth famille) ──
    {
      name: "famille",
      testMatch: /famille\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/famille.json",
      },
    },
    // ── Tests publics (sans auth) ──
    {
      name: "public",
      testMatch: /public\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
