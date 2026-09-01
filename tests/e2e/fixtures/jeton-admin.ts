/**
 * tests/e2e/fixtures/jeton-admin.ts
 *
 * Jeton d'administration pour appeler les routes API depuis un test.
 *
 * L'application authentifie ses routes par un en-tête `Bearer`, pas par un
 * cookie : l'état de session enregistré par `auth.setup.ts` ouvre les écrans,
 * mais ne suffit pas à appeler une API. Le jeton est donc relu là où Firebase
 * le range — la base IndexedDB `firebaseLocalStorageDb` — après avoir chargé
 * une page authentifiée, ce qui garantit qu'il vient d'être rafraîchi.
 */

import type { Page } from "@playwright/test";

export async function jetonAdmin(page: Page): Promise<string> {
  // Charger une page de l'application : Firebase restaure la session et
  // rafraîchit le jeton s'il a expiré.
  if (!page.url().includes("/admin")) {
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
  }
  // Laisser à Firebase le temps de restaurer la session.
  await page.waitForTimeout(1_500);

  return page.evaluate(async () => {
    const base: IDBDatabase | null = await new Promise((resolve) => {
      const req = indexedDB.open("firebaseLocalStorageDb");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!base) return "";
    try {
      const entrees: any[] = await new Promise((resolve) => {
        const tx = base.transaction("firebaseLocalStorage", "readonly");
        const req = tx.objectStore("firebaseLocalStorage").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      const avecJeton = entrees.find((e) => e?.value?.stsTokenManager?.accessToken);
      return avecJeton?.value?.stsTokenManager?.accessToken || "";
    } catch {
      return "";
    }
  });
}
