/**
 * admin/25-parcours-argent.spec.ts
 * Les cinq parcours où une erreur coûte de l'argent ou de la confiance.
 *
 * Pourquoi ces tests-là — journées des 31 août et 1er septembre 2026
 * ────────────────────────────────────────────────────────────────────
 * Une douzaine de défauts ont été trouvés par hasard, en production : une
 * famille réglant 350 € sans apparaître au planning, une facture refusant de
 * sortir faute d'une police sur le serveur, un prélèvement compté sur trois
 * forfaits à la fois. Les calculs sont désormais couverts par des tests
 * unitaires ; restent deux choses qu'eux ne verront jamais :
 *
 *   - ce qui casse au DÉPLOIEMENT et non dans le code (la police manquante :
 *     tout marchait en local) ;
 *   - ce qui se DÉSACCORDE entre collections (l'argent d'un côté, le planning
 *     de l'autre).
 *
 * D'où ces vérifications, volontairement peu nombreuses et peu bavardes : la
 * base de test doit rester cohérente, les documents doivent réellement sortir,
 * et les écrans d'argent doivent s'ouvrir sans montrer de « NaN » ni d'erreur.
 */

import { test, expect } from "@playwright/test";
import { jetonAdmin } from "../fixtures/jeton-admin";

/** Écrans où passe l'argent — tous doivent s'ouvrir proprement. */
const ECRANS_ARGENT = [
  { chemin: "/admin/paiements", nom: "Paiements" },
  { chemin: "/admin/forfaits", nom: "Forfaits" },
  { chemin: "/admin/cartes", nom: "Cartes de séances" },
  { chemin: "/admin/sepa", nom: "Prélèvements SEPA" },
  { chemin: "/admin/coherence", nom: "Cohérence" },
];

test.describe("ARGENT · les cinq parcours", () => {

  // ── ARG-01 : la base de test reste cohérente ────────────────────────────
  // Le filet le plus large : cette analyse compare l'argent encaissé, le
  // journal, le planning et les prélèvements. Une anomalie « bloquante »
  // signifie qu'un de ces quatre ne dit plus la même chose que les autres.
  test("ARG-01 · Aucune anomalie bloquante dans l'analyse de cohérence", async ({ page, request }) => {
    const jeton = await jetonAdmin(page);
    test.skip(!jeton, "Jeton d'administration indisponible — session de test non initialisée");

    const res = await request.get("/api/admin/coherence", {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    expect(res.status(), await res.text()).toBe(200);

    const rapport = await res.json();
    const bloquants = (rapport.groupes || [])
      .filter((g: any) => g.gravite === "bloquant")
      .flatMap((g: any) => g.items.map((i: any) => `${g.titre} — ${i.detail}`));

    expect(bloquants, `Anomalies bloquantes :\n${bloquants.join("\n")}`).toHaveLength(0);
  });

  // ── ARG-02 : une facture sort vraiment ──────────────────────────────────
  // Le 01/09/2026, plus aucune facture ne sortait en production : pdfkit
  // charge ses polices par un chemin construit à l'exécution, que le traceur
  // de Next ne devine pas. Aucun test unitaire ne pouvait le voir — le code
  // était juste, c'est le déploiement qui était incomplet.
  test("ARG-02 · La facture PDF est réellement produite", async ({ page, request }) => {
    const jeton = await jetonAdmin(page);
    test.skip(!jeton, "Jeton d'administration indisponible");

    const res = await request.post("/api/invoice-pdf", {
      headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      data: {
        invoiceNumber: "F-TEST-0001",
        date: "01/09/2026",
        familyName: "TEST Playwright",
        familyEmail: "test@example.com",
        items: [{ activityTitle: "Séance de test", childName: "Cavalier", priceHT: 54.03, tva: 5.5, priceTTC: 57 }],
        totalHT: 54.03, totalTVA: 2.97, totalTTC: 57,
        paidAmount: 57, paymentMode: "CB", paymentDate: "01/09/2026",
      },
    });

    expect(res.status(), await res.text()).toBe(200);
    expect(res.headers()["content-type"]).toContain("pdf");
    const pdf = await res.body();
    // Un PDF commence par %PDF- ; en dessous de 1 ko, c'est une coquille vide.
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1024);
  });

  // ── ARG-03 : un avoir aussi ─────────────────────────────────────────────
  test("ARG-03 · L'avoir PDF est réellement produit", async ({ page, request }) => {
    const jeton = await jetonAdmin(page);
    test.skip(!jeton, "Jeton d'administration indisponible");

    const res = await request.post("/api/avoir-pdf", {
      headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      data: {
        avoirNumber: "A-TEST-0001",
        date: "01/09/2026",
        familyName: "TEST Playwright",
        familyEmail: "test@example.com",
        reason: "Test automatisé",
        items: [{ activityTitle: "Séance annulée", priceHT: 54.03, tva: 5.5, priceTTC: 57 }],
        totalHT: 54.03, totalTVA: 2.97, totalTTC: 57,
      },
    });

    expect(res.status(), await res.text()).toBe(200);
    const pdf = await res.body();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1024);
  });

  // ── ARG-04 à 08 : les écrans d'argent s'ouvrent proprement ──────────────
  // « NaN », « undefined » et « Erreur interne » à l'écran sont les signes
  // d'un calcul cassé ou d'une route en échec. Aucun ne doit apparaître.
  for (const ecran of ECRANS_ARGENT) {
    test(`ARG · ${ecran.nom} s'ouvre sans montant cassé`, async ({ page }) => {
      const erreursConsole: string[] = [];
      page.on("pageerror", (e) => erreursConsole.push(e.message));

      await page.goto(ecran.chemin);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(800);

      const corps = await page.locator("body").innerText();
      expect(corps, `${ecran.nom} affiche « NaN »`).not.toContain("NaN");
      expect(corps, `${ecran.nom} affiche « undefined »`).not.toContain("undefined");
      expect(corps, `${ecran.nom} affiche « Erreur interne »`).not.toContain("Erreur interne");
      expect(erreursConsole, `${ecran.nom} lève une erreur JavaScript`).toHaveLength(0);
    });
  }
});
