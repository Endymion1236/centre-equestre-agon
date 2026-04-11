/**
 * public/24-securite-hardening.spec.ts
 * Tests de sécurité post-hardening — vérifie que toutes les protections
 * sont en place et fonctionnelles SANS aucune authentification.
 *
 * Couverture :
 *  SEC-10 : Toutes les routes admin /api/admin/* → 401 sans token
 *  SEC-11 : Les routes IA (coûteuses) → 401 sans token
 *  SEC-12 : Les routes email/push → 401 sans token
 *  SEC-13 : Les routes PDF → 401 sans token
 *  SEC-14 : Le webhook CAWL rejette les requêtes non signées
 *  SEC-15 : Les fichiers sensibles ne sont plus dans /public
 *  SEC-16 : Les routes de debug/test sont supprimées
 *  SEC-17 : Les routes cron sont protégées
 *  SEC-18 : Les pages publiques restent accessibles
 *  SEC-19 : Les erreurs API ne leakent pas d'info interne
 */

import { test, expect } from "@playwright/test";

test.describe("SEC-HARDENING · Sécurité post-hardening", () => {

  // ── SEC-10 : Routes admin API ───────────────────────────────────────────
  test("SEC-10 · /api/admin/* → 401 sans Bearer token", async ({ request }) => {
    const routes = [
      "/api/admin/list-moniteurs",
      "/api/admin/create-moniteur",
      "/api/admin/unenroll-annual",
      "/api/admin/assign-ordre-equides",
      "/api/admin/set-claims",
    ];

    for (const route of routes) {
      const res = await request.get(route);
      expect(res.status(), `${route} devrait renvoyer 401`).toBe(401);
    }
  });

  // ── SEC-11 : Routes IA (consommation API payante) ──────────────────────
  test("SEC-11 · Routes IA → 401 sans token", async ({ request }) => {
    const res1 = await request.post("/api/ia", {
      data: { type: "assistant", question: "test" },
    });
    expect(res1.status()).toBe(401);

    const res2 = await request.post("/api/tts", {
      data: { text: "test" },
    });
    expect(res2.status()).toBe(401);

    // Whisper attend un FormData mais doit quand même rejeter sans auth
    const res3 = await request.post("/api/whisper", {
      data: {},
    });
    expect(res3.status()).toBe(401);

    const res4 = await request.post("/api/agent", {
      data: { question: "test" },
    });
    expect(res4.status()).toBe(401);
  });

  // ── SEC-12 : Routes email/push ──────────────────────────────────────────
  test("SEC-12 · /api/send-email et /api/push → 401 sans token", async ({ request }) => {
    const emailRes = await request.post("/api/send-email", {
      data: { to: "attacker@evil.com", subject: "spam", html: "<p>test</p>" },
    });
    expect(emailRes.status()).toBe(401);

    const pushRes = await request.post("/api/push", {
      data: { title: "spam", body: "test", broadcast: true },
    });
    expect(pushRes.status()).toBe(401);

    const payLinkRes = await request.post("/api/send-payment-link", {
      data: { paymentId: "x", recipientEmail: "x@x.com", amount: 999 },
    });
    expect(payLinkRes.status()).toBe(401);
  });

  // ── SEC-13 : Routes PDF ─────────────────────────────────────────────────
  test("SEC-13 · Routes PDF → 401 sans token", async ({ request }) => {
    const routes = [
      { path: "/api/invoice-pdf", data: { paymentId: "test" } },
      { path: "/api/avoir-pdf", data: {} },
      { path: "/api/bon-cadeau", data: { code: "TEST" } },
      { path: "/api/progression-pdf", data: {} },
    ];

    for (const { path, data } of routes) {
      const res = await request.post(path, { data });
      expect(res.status(), `${path} devrait renvoyer 401`).toBe(401);
    }
  });

  // ── SEC-14 : Webhook CAWL ──────────────────────────────────────────────
  test("SEC-14 · Webhook CAWL rejette sans signature", async ({ request }) => {
    const res = await request.post("/api/cawl/webhook", {
      data: { type: "payment.completed", payment: { id: "fake" } },
      headers: { "Content-Type": "text/plain" },
    });
    // Doit renvoyer 400 (signature absente) ou 500 (secret non configuré)
    expect([400, 500]).toContain(res.status());
  });

  // ── SEC-15 : Fichiers sensibles pas dans /public ────────────────────────
  test("SEC-15 · equides-import.json n'est plus accessible publiquement", async ({ request }) => {
    const res = await request.get("/equides-import.json");
    expect(res.status()).toBe(404);
  });

  test("SEC-15 · push-debug.html n'est plus accessible", async ({ request }) => {
    const res = await request.get("/push-debug.html");
    expect(res.status()).toBe(404);
  });

  // ── SEC-16 : Routes debug/test supprimées ───────────────────────────────
  test("SEC-16 · /api/debug-firebase supprimée → 404", async ({ request }) => {
    const res = await request.get("/api/debug-firebase");
    expect(res.status()).toBe(404);
  });

  test("SEC-16 · /api/test-seed supprimée → 404", async ({ request }) => {
    const res = await request.post("/api/test-seed", {
      data: { action: "seed", data: [] },
    });
    expect(res.status()).toBe(404);
  });

  test("SEC-16 · /api/send-email/test supprimée → 404", async ({ request }) => {
    const res = await request.get("/api/send-email/test");
    expect(res.status()).toBe(404);
  });

  // ── SEC-17 : Routes cron protégées ──────────────────────────────────────
  test("SEC-17 · Routes cron → 401 sans CRON_SECRET", async ({ request }) => {
    const cronRoutes = [
      "/api/cron/rappels-j1",
      "/api/cron/daily-notifications",
      "/api/cron/daily-monitor-recap",
      "/api/cron/charge-stage-balances",
    ];

    for (const route of cronRoutes) {
      const res = await request.get(route);
      expect(res.status(), `${route} devrait renvoyer 401`).toBe(401);
    }
  });

  // ── SEC-18 : Pages publiques restent accessibles ────────────────────────
  test("SEC-18 · Pages publiques accessibles sans auth", async ({ page }) => {
    const publicPages = [
      { path: "/accueil", check: /centre|équestre|agon/i },
      { path: "/mentions-legales", check: /mention|légal/i },
      { path: "/confidentialite", check: /confidentialité|rgpd|données/i },
    ];

    for (const { path, check } of publicPages) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
      const bodyText = await page.textContent("body") || "";
      expect(check.test(bodyText), `${path} devrait contenir du contenu public`).toBe(true);
    }
  });

  // ── SEC-19 : Erreurs API ne leakent pas d'info interne ──────────────────
  test("SEC-19 · Les erreurs API renvoient 'Erreur interne' pas error.message", async ({ request }) => {
    // Envoyer une requête malformée avec un faux token
    const res = await request.post("/api/ia", {
      headers: {
        "Authorization": "Bearer fake-invalid-token-12345",
        "Content-Type": "application/json",
      },
      data: { type: "assistant", question: "test" },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    // Le message d'erreur ne doit PAS contenir de chemin, stack trace, ou détail interne
    expect(body.error).not.toContain("/");
    expect(body.error).not.toContain("node_modules");
    expect(body.error).not.toContain("firebase-admin");
  });
});
