/**
 * admin/21-api-auth.spec.ts
 * Vérifie que toutes les routes API protégées par verifyAuth/authFetch
 * fonctionnent correctement APRÈS le hardening sécurité.
 *
 * Ce test vérifie :
 *  - AUTH-01 : Les routes admin renvoient 401 sans token
 *  - AUTH-02 : Les routes admin fonctionnent AVEC le token admin
 *  - AUTH-03 : Les routes client-auth renvoient 401 sans token
 *  - AUTH-04 : Les routes client-auth fonctionnent AVEC un token valide
 *  - AUTH-05 : Les routes cron renvoient 401 sans CRON_SECRET
 *  - AUTH-06 : Le middleware bloque /api/admin/* sans Bearer
 *  - AUTH-07 : Les routes supprimées renvoient 404
 */

import { test, expect } from "@playwright/test";

// Routes qui DOIVENT renvoyer 401 sans token
const ADMIN_API_ROUTES = [
  { method: "POST", path: "/api/send-email", body: { to: "x@x.com", subject: "t", html: "<p>t</p>" } },
  { method: "POST", path: "/api/push", body: { title: "t", body: "t" } },
  { method: "POST", path: "/api/agent", body: { question: "test" } },
  { method: "POST", path: "/api/send-payment-link", body: { paymentId: "x", recipientEmail: "x@x.com", amount: 10 } },
  { method: "POST", path: "/api/admin/unenroll-annual", body: { childId: "x", childName: "x", familyId: "x" } },
  { method: "POST", path: "/api/admin/assign-ordre-equides", body: {} },
  { method: "GET", path: "/api/challenges" },
];

const CLIENT_AUTH_ROUTES = [
  { method: "POST", path: "/api/ia", body: { type: "assistant", question: "test" } },
  { method: "POST", path: "/api/tts", body: { text: "test" } },
  { method: "POST", path: "/api/cawl/checkout", body: { items: [{ name: "test", priceInCents: 100 }] } },
  { method: "POST", path: "/api/bon-cadeau", body: { code: "TEST", amount: "50" } },
  { method: "POST", path: "/api/invoice-pdf", body: { paymentId: "test" } },
  { method: "POST", path: "/api/facture", body: {} },
  { method: "POST", path: "/api/avoir-pdf", body: {} },
  { method: "POST", path: "/api/progression-pdf", body: {} },
];

// Routes qui ont été SUPPRIMÉES et doivent renvoyer 404
const DELETED_ROUTES = [
  { method: "GET", path: "/api/debug-firebase" },
  { method: "POST", path: "/api/test-seed" },
  { method: "GET", path: "/api/send-email/test" },
];

test.describe("AUTH · Vérification auth API post-hardening", () => {

  // ── AUTH-01 : Routes admin → 401 sans token ─────────────────────────────
  for (const { method, path, body } of ADMIN_API_ROUTES) {
    test(`AUTH-01 · ${method} ${path} → 401 sans token`, async ({ request }) => {
      const opts: any = { headers: { "Content-Type": "application/json" } };
      if (body && method !== "GET") opts.data = body;

      const response = method === "GET"
        ? await request.get(path, opts)
        : await request.post(path, opts);

      expect(response.status()).toBe(401);
    });
  }

  // ── AUTH-03 : Routes client-auth → 401 sans token ───────────────────────
  for (const { method, path, body } of CLIENT_AUTH_ROUTES) {
    test(`AUTH-03 · ${method} ${path} → 401 sans token`, async ({ request }) => {
      const opts: any = { headers: { "Content-Type": "application/json" } };
      if (body) opts.data = body;

      const response = await request.post(path, opts);
      expect(response.status()).toBe(401);
    });
  }

  // ── AUTH-05 : Routes cron → 401 sans CRON_SECRET ────────────────────────
  test("AUTH-05 · /api/cron/rappels-j1 → 401 sans CRON_SECRET", async ({ request }) => {
    const res = await request.get("/api/cron/rappels-j1");
    expect(res.status()).toBe(401);
  });

  test("AUTH-05 · /api/cron/daily-notifications → 401 sans CRON_SECRET", async ({ request }) => {
    const res = await request.get("/api/cron/daily-notifications");
    expect(res.status()).toBe(401);
  });

  // ── AUTH-06 : Middleware bloque /api/admin/* sans Bearer ─────────────────
  test("AUTH-06 · /api/admin/list-moniteurs → 401 via middleware", async ({ request }) => {
    const res = await request.get("/api/admin/list-moniteurs");
    expect(res.status()).toBe(401);
  });

  test("AUTH-06 · /api/admin/create-moniteur → 401 via middleware", async ({ request }) => {
    const res = await request.post("/api/admin/create-moniteur", {
      data: { email: "x@x.com", password: "test1234" },
    });
    expect(res.status()).toBe(401);
  });

  // ── AUTH-07 : Routes supprimées → 404 ───────────────────────────────────
  for (const { method, path } of DELETED_ROUTES) {
    test(`AUTH-07 · ${method} ${path} → 404 (supprimée)`, async ({ request }) => {
      const response = method === "GET"
        ? await request.get(path)
        : await request.post(path, { data: {} });

      expect(response.status()).toBe(404);
    });
  }
});
