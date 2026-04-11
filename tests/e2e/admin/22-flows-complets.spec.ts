/**
 * admin/22-flows-complets.spec.ts
 * Tests des flux fonctionnels complets — vérifie que l'app fonctionne
 * de bout en bout après le hardening sécurité.
 *
 * Couverture :
 *  FLUX-01 : Planning → voir créneaux → ouvrir un créneau → fermer
 *  FLUX-02 : Cavaliers → rechercher → ouvrir fiche → onglets
 *  FLUX-03 : Paiements → onglets → recherche → encaissement modale
 *  FLUX-04 : Montoir → chargement → affectation visible
 *  FLUX-05 : Communication → composer email → ciblage disponible
 *  FLUX-06 : Compétitions → chargement liste (appel /api/challenges)
 *  FLUX-07 : Forfaits → chargement → liste familles
 *  FLUX-08 : Email templates → chargement → sélection template
 *  FLUX-09 : Comptabilité → chargement → onglets
 *  FLUX-10 : Statistiques → chargement → filtres
 *  FLUX-11 : Management → chargement → vues planning
 *  FLUX-12 : Cavalerie → chargement → fiches équidés
 *  FLUX-13 : SEPA → chargement → onglets mandats/échéancier
 *  FLUX-14 : Paramètres → chargement → onglets
 */

import { test, expect, Page } from "@playwright/test";

// Helper : attendre chargement complet d'une page admin
async function loadAdminPage(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    const msg = e.message;
    // Ignorer les erreurs réseau/Firebase normales
    if (msg.includes("Firebase") || msg.includes("network") || msg.includes("ERR_BLOCKED") || msg.includes("quota")) return;
    errors.push(msg);
  });

  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Vérifications de base
  await expect(page).not.toHaveURL(/espace-cavalier/);
  await expect(page.locator("text=NaN")).toHaveCount(0);

  return errors;
}

// Helper : vérifier qu'un appel API via authFetch ne cause pas d'erreur 401 visible
async function expectNoAuthError(page: Page) {
  // Vérifier qu'il n'y a pas de toast/alerte "Non authentifié" ou "401"
  const authError = page.locator("text=/non authentifié|401|unauthorized|token invalide/i");
  await expect(authError).toHaveCount(0);
}

test.describe("FLUX · Flows fonctionnels complets (post-hardening)", () => {

  // ── FLUX-01 : Planning ──────────────────────────────────────────────────
  test("FLUX-01 · Planning : navigation + ouverture créneau", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/planning");
    await expectNoAuthError(page);

    // Navigation semaine doit fonctionner
    const nextBtn = page.locator("button").filter({ hasText: /›|suivant|>/ }).first();
    if (await nextBtn.isVisible({ timeout: 3_000 })) {
      await nextBtn.click();
      await page.waitForTimeout(800);
      await expect(page.locator("text=NaN")).toHaveCount(0);
      await expectNoAuthError(page);
    }

    // Ouvrir un créneau si disponible
    const creneau = page.locator("[data-creneau-id], .cursor-pointer").first();
    if (await creneau.isVisible({ timeout: 3_000 })) {
      await creneau.click();
      await page.waitForTimeout(800);
      await expectNoAuthError(page);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-02 : Cavaliers → recherche → fiche ────────────────────────────
  test("FLUX-02 · Cavaliers : recherche + ouverture fiche famille", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/cavaliers");
    await expectNoAuthError(page);

    // Le champ de recherche est visible
    const searchInput = page.locator("input[placeholder*='echerch'], input[placeholder*='famille'], input[type='search']").first();
    await expect(searchInput).toBeVisible({ timeout: 8_000 });

    // Taper une lettre pour déclencher la recherche
    await searchInput.fill("a");
    await page.waitForTimeout(600);
    await expectNoAuthError(page);

    // Cliquer sur la première famille trouvée
    const familyRow = page.locator("tr, [data-family-id], .cursor-pointer").first();
    if (await familyRow.isVisible({ timeout: 5_000 })) {
      await familyRow.click();
      await page.waitForTimeout(800);

      // La fiche famille doit s'ouvrir sans erreur d'auth
      await expectNoAuthError(page);
      await expect(page.locator("text=NaN")).toHaveCount(0);

      // Vérifier qu'il y a des onglets (réservations, paiements, etc.)
      const tabs = page.locator("button, [role='tab']").filter({ hasText: /réservation|paiement|avoir|carte|fidéli/i });
      if (await tabs.first().isVisible({ timeout: 3_000 })) {
        // Cliquer sur chaque onglet pour vérifier qu'il charge
        const count = await tabs.count();
        for (let i = 0; i < Math.min(count, 4); i++) {
          await tabs.nth(i).click();
          await page.waitForTimeout(400);
          await expectNoAuthError(page);
        }
      }
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-03 : Paiements → onglets → encaissement ──────────────────────
  test("FLUX-03 · Paiements : navigation onglets + encaissement", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/paiements");
    await expectNoAuthError(page);

    // Naviguer entre les onglets
    const onglets = ["Impayés", "Payés", "Échéances", "Déclarations"];
    for (const label of onglets) {
      const tab = page.locator("button, [role='tab']").filter({ hasText: new RegExp(label, "i") }).first();
      if (await tab.isVisible({ timeout: 3_000 })) {
        await tab.click();
        await page.waitForTimeout(600);
        await expectNoAuthError(page);
        await expect(page.locator("text=NaN")).toHaveCount(0);
      }
    }

    // Tenter d'ouvrir un encaissement
    const encaisserBtn = page.locator("button").filter({ hasText: /encaisser|régler/i }).first();
    if (await encaisserBtn.isVisible({ timeout: 3_000 })) {
      await encaisserBtn.click();
      await page.waitForTimeout(500);
      await expectNoAuthError(page);

      // Fermer la modale
      const closeBtn = page.locator("button").filter({ hasText: /fermer|annuler|×/ }).first();
      if (await closeBtn.isVisible({ timeout: 2_000 })) {
        await closeBtn.click();
      }
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-04 : Montoir ──────────────────────────────────────────────────
  test("FLUX-04 · Montoir : chargement + vue charge poneys", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/montoir");
    await expectNoAuthError(page);

    // L'affichage des poneys/chevaux doit charger
    const bodyText = await page.textContent("body") || "";
    const hasMontoir = /montoir|affectation|poney|cheval/i.test(bodyText);
    expect(hasMontoir).toBe(true);

    // Le bouton charge poneys doit être accessible
    const chargeBtn = page.locator("button").filter({ hasText: /charge|timeline|vue/i }).first();
    if (await chargeBtn.isVisible({ timeout: 3_000 })) {
      await chargeBtn.click();
      await page.waitForTimeout(800);
      await expectNoAuthError(page);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-05 : Communication ────────────────────────────────────────────
  test("FLUX-05 · Communication : ciblage + composition email", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/communication");
    await expectNoAuthError(page);

    // Le sélecteur de ciblage doit être présent
    const ciblage = page.locator("select, [data-testid='ciblage']").first();
    if (await ciblage.isVisible({ timeout: 5_000 })) {
      await expect(ciblage).toBeEnabled();
    }

    // Le champ sujet / zone de texte doit être visible
    const subjectField = page.locator("input[placeholder*='ujet'], input[placeholder*='subject']").first();
    if (await subjectField.isVisible({ timeout: 3_000 })) {
      await subjectField.fill("Test sujet");
      await page.waitForTimeout(300);
      await expectNoAuthError(page);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-06 : Compétitions (appel authFetch /api/challenges) ───────────
  test("FLUX-06 · Compétitions : chargement liste via authFetch", async ({ page }) => {
    const apiErrors: string[] = [];

    // Intercepter les appels API pour vérifier qu'il n'y a pas de 401
    page.on("response", (res) => {
      if (res.url().includes("/api/challenges") && res.status() === 401) {
        apiErrors.push(`401 on ${res.url()}`);
      }
    });

    const errors = await loadAdminPage(page, "/admin/competitions");
    await expectNoAuthError(page);
    await page.waitForTimeout(2000); // laisser le temps au fetch

    expect(apiErrors).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  // ── FLUX-07 : Forfaits ─────────────────────────────────────────────────
  test("FLUX-07 · Forfaits : chargement + liste familles", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/forfaits");
    await expectNoAuthError(page);

    // Au moins un titre ou sélecteur visible
    const bodyText = await page.textContent("body") || "";
    expect(/forfait|abonnement|annuel/i.test(bodyText)).toBe(true);

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-08 : Email templates ──────────────────────────────────────────
  test("FLUX-08 · Email templates : chargement + sélection", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/email-templates");
    await expectNoAuthError(page);

    // Un template ou un bouton nouveau doit être visible
    const templateOrNew = page.locator("button, [data-testid='template-card']").filter({ hasText: /template|modèle|nouveau|confirmation|bienvenue/i }).first();
    if (await templateOrNew.isVisible({ timeout: 5_000 })) {
      await templateOrNew.click();
      await page.waitForTimeout(500);
      await expectNoAuthError(page);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-09 : Comptabilité ─────────────────────────────────────────────
  test("FLUX-09 · Comptabilité : chargement + onglets", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/comptabilite");
    await expectNoAuthError(page);

    // Naviguer entre les onglets (Rapprochement, Journal, etc.)
    const tabs = page.locator("button, [role='tab']").filter({ hasText: /rapprochement|journal|ventilation|assistant/i });
    const count = await tabs.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(600);
      await expectNoAuthError(page);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-10 : Statistiques ─────────────────────────────────────────────
  test("FLUX-10 · Statistiques : chargement + filtres", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/statistiques");
    await expectNoAuthError(page);

    const bodyText = await page.textContent("body") || "";
    expect(/statistique|chiffre|analyse|CA|période/i.test(bodyText)).toBe(true);

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-11 : Management ───────────────────────────────────────────────
  test("FLUX-11 · Management : chargement + vues planning équipe", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/management");
    await expectNoAuthError(page);

    // Vérifier que les vues (Tableau, Timeline, Journalier, Fiche) sont présentes
    const vues = page.locator("button, [role='tab']").filter({ hasText: /tableau|timeline|journalier|fiche|agent/i });
    const count = await vues.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await vues.nth(i).click();
      await page.waitForTimeout(600);
      await expectNoAuthError(page);
      await expect(page.locator("text=NaN")).toHaveCount(0);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-12 : Cavalerie ────────────────────────────────────────────────
  test("FLUX-12 · Cavalerie : chargement + fiches équidés", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/cavalerie");
    await expectNoAuthError(page);

    // Au moins un équidé doit être visible
    const equide = page.locator("[data-equide-id], .cursor-pointer, tr").first();
    if (await equide.isVisible({ timeout: 5_000 })) {
      await equide.click();
      await page.waitForTimeout(800);
      await expectNoAuthError(page);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-13 : SEPA ─────────────────────────────────────────────────────
  test("FLUX-13 · SEPA : chargement + onglets", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/sepa");
    await expectNoAuthError(page);

    // Onglets mandats / échéancier / remises
    const tabs = page.locator("button, [role='tab']").filter({ hasText: /mandat|échéancier|remise/i });
    const count = await tabs.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(600);
      await expectNoAuthError(page);
    }

    expect(errors).toHaveLength(0);
  });

  // ── FLUX-14 : Paramètres ───────────────────────────────────────────────
  test("FLUX-14 · Paramètres : chargement + onglets", async ({ page }) => {
    const errors = await loadAdminPage(page, "/admin/parametres");
    await expectNoAuthError(page);

    // Onglets paramètres
    const tabs = page.locator("button, [role='tab']").filter({ hasText: /centre|tarif|réduction|moniteur|fidélité|horaire/i });
    const count = await tabs.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(600);
      await expectNoAuthError(page);
      await expect(page.locator("text=NaN")).toHaveCount(0);
    }

    expect(errors).toHaveLength(0);
  });
});
