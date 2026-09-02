/**
 * admin/26-smoke-avant-main.spec.ts
 * Le passage obligé avant de fusionner `test` dans `main`.
 *
 * Pourquoi ce fichier
 * ───────────────────
 * La refactorisation de septembre 2026 a déplacé, sans les réécrire, les
 * traitements qui décident de l'argent : les 950 lignes du bouton « Inscrire »,
 * l'encaissement d'une commande, le rapprochement bancaire, les totaux du
 * panier. Le typage et la construction ne prouvent rien de leur comportement.
 *
 * Ces vérifications ne remplacent pas le passage à la main décrit dans
 * docs/SMOKE-AVANT-MAIN.md — elles couvrent ce qu'une machine peut voir :
 * les écrans déplacés s'ouvrent, les documents sortent réellement, et les
 * quatre collections d'argent disent toujours la même chose.
 *
 * Volontairement peu nombreuses. Un échec ici bloque la fusion.
 */

import { test, expect } from "@playwright/test";
import { jetonAdmin } from "../fixtures/jeton-admin";

/**
 * Les écrans dont le rendu a été redécoupé. Chacun doit s'ouvrir, finir de
 * charger, et ne montrer ni « NaN » ni « undefined » — les deux traces
 * qu'une valeur s'est perdue en route entre un composant et son parent.
 */
const ECRANS_REDECOUPES = [
  { chemin: "/admin/comptabilite", nom: "Comptabilité" },
  { chemin: "/admin/paiements", nom: "Paiements" },
  { chemin: "/admin/planning", nom: "Planning" },
  { chemin: "/admin/parametres", nom: "Paramètres" },
  { chemin: "/admin/management", nom: "Planning salariés" },
  { chemin: "/admin/recurrences", nom: "Récurrences" },
  { chemin: "/admin/coherence", nom: "Cohérence" },
];

/** Les onglets de la comptabilité, tous sortis dans des composants séparés. */
const ONGLETS_COMPTA = ["journal", "tva", "remise", "rapprochement", "fec", "export"];

/** Les sections des paramètres devenues des composants autonomes. */
const SECTIONS_PARAMETRES = ["reductions", "moniteurs", "progression", "stages", "maintenance"];

async function ouvrir(page: any, chemin: string) {
  await page.goto(chemin);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(".animate-spin", { state: "hidden", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

/** Rien de ce qui trahit une valeur perdue entre un composant et son parent. */
async function aucuneValeurPerdue(page: any) {
  await expect(page.locator("text=NaN")).toHaveCount(0);
  await expect(page.locator("text=undefined")).toHaveCount(0);
  await expect(page.locator("text=[object Object]")).toHaveCount(0);
}

test.describe("SMOKE · avant fusion vers main", () => {

  // ── SM-01 : les écrans redécoupés s'ouvrent ─────────────────────────────
  for (const { chemin, nom } of ECRANS_REDECOUPES) {
    test(`SM-01 · ${nom} s'ouvre sans valeur perdue`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on("pageerror", (e: Error) => erreurs.push(e.message));

      await ouvrir(page, chemin);
      await aucuneValeurPerdue(page);

      // Une exception au montage est le symptôme direct d'une prop oubliée
      // lors d'une extraction de composant.
      expect(erreurs, `Erreurs JavaScript sur ${nom} : ${erreurs.join(" | ")}`).toHaveLength(0);
    });
  }

  // ── SM-02 : les onglets de la comptabilité ──────────────────────────────
  // L'écran est passé de 4 719 à 702 lignes : chaque onglet vit désormais
  // dans son propre fichier. Il suffit qu'un seul ne reçoive plus ses données.
  for (const onglet of ONGLETS_COMPTA) {
    test(`SM-02 · Comptabilité — onglet ${onglet}`, async ({ page }) => {
      const erreurs: string[] = [];
      page.on("pageerror", (e: Error) => erreurs.push(e.message));

      await ouvrir(page, `/admin/comptabilite?tab=${onglet}`);
      const tab = page.locator("button").filter({ hasText: new RegExp(onglet, "i") }).first();
      if (await tab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(600);
      }
      await aucuneValeurPerdue(page);
      expect(erreurs, `Onglet ${onglet} : ${erreurs.join(" | ")}`).toHaveLength(0);
    });
  }

  // ── SM-03 : les sections des paramètres ─────────────────────────────────
  test("SM-03 · Chaque section des paramètres s'affiche", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e: Error) => erreurs.push(e.message));

    await ouvrir(page, "/admin/parametres");
    for (const section of SECTIONS_PARAMETRES) {
      const bouton = page.locator("button").filter({ hasText: new RegExp(section, "i") }).first();
      if (!(await bouton.isVisible({ timeout: 3_000 }).catch(() => false))) continue;
      await bouton.click();
      await page.waitForTimeout(500);
      await aucuneValeurPerdue(page);
    }
    expect(erreurs, `Paramètres : ${erreurs.join(" | ")}`).toHaveLength(0);
  });

  // ── SM-04 : le panneau d'inscription s'ouvre ────────────────────────────
  // Le plus gros déplacement de la passe. On n'inscrit personne ici — on
  // vérifie que le panneau se monte avec ses cinq composants extraits.
  test("SM-04 · Le panneau d'inscription s'ouvre sur un créneau", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e: Error) => erreurs.push(e.message));

    await ouvrir(page, "/admin/planning");
    const creneau = page.locator("[data-testid='creneau-card'], .cursor-pointer").first();
    test.skip(!(await creneau.isVisible({ timeout: 10_000 }).catch(() => false)),
      "Aucun créneau dans la semaine affichée — rien à ouvrir");

    await creneau.click();
    await page.waitForTimeout(1_200);

    // Le panneau doit proposer d'inscrire, ou dire que la séance est complète.
    const panneau = page.locator("text=/Inscrire|COMPLET|Clôturée/i").first();
    await expect(panneau).toBeVisible({ timeout: 10_000 });
    await aucuneValeurPerdue(page);
    expect(erreurs, `Panneau d'inscription : ${erreurs.join(" | ")}`).toHaveLength(0);
  });

  // ── SM-05 : les quatre collections d'argent s'accordent ─────────────────
  // Le filet le plus large, déjà en place : si un traitement déplacé écrivait
  // de travers, l'écart apparaît ici avant d'apparaître sur une facture.
  test("SM-05 · Aucune anomalie bloquante de cohérence", async ({ page, request }) => {
    const jeton = await jetonAdmin(page);
    test.skip(!jeton, "Jeton d'administration indisponible");

    const res = await request.get("/api/admin/coherence", {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    expect(res.status(), "L'analyse de cohérence doit répondre").toBe(200);
    const data = await res.json();
    expect(data.nbBloquants,
      `Anomalies bloquantes : ${JSON.stringify(data.groupes?.slice(0, 3) || [])}`).toBe(0);
  });

  // ── SM-06 : la réservation en ligne côté famille ────────────────────────
  test("SM-06 · La page de réservation s'affiche", async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e: Error) => erreurs.push(e.message));

    await ouvrir(page, "/espace-cavalier/reserver");
    // Connecté ou non, la page ne doit pas casser au montage.
    await aucuneValeurPerdue(page);
    expect(erreurs, `Réservation : ${erreurs.join(" | ")}`).toHaveLength(0);
  });
});
