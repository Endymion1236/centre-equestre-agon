# Tests E2E — Centre Équestre Agon-Coutainville

Suite de tests Playwright couvrant les flows critiques du back-office et de l'espace cavalier.

---

## Installation (une seule fois sur ta machine)

```bash
npm install
npx playwright install chromium
```

---

## Configuration

Crée (ou complète) ton `.env.local` avec les variables de test :

```env
# URL de base pour les tests (dev local ou staging)
PLAYWRIGHT_BASE_URL=http://localhost:3000

# Comptes de test Firebase (optionnel — requis pour les tests admin authentifiés)
TEST_ADMIN_EMAIL=ceagon50@gmail.com
TEST_ADMIN_TOKEN=<Firebase ID token — voir ci-dessous>
TEST_FAMILLE_EMAIL=famille-test@gmail.com
TEST_FAMILLE_TOKEN=<Firebase ID token — voir ci-dessous>

# Active la route /api/test-auth en dehors de production
PLAYWRIGHT_TEST_MODE=true
```

### Obtenir un Firebase ID Token pour les tests

Dans la console de ton navigateur, connecté avec le bon compte :

```js
const token = await firebase.auth().currentUser.getIdToken(true);
console.log(token);
```

> ⚠️ Les tokens Firebase expirent après 1h. Pour les CI/CD, utiliser un compte de service.

---

## Lancer les tests

```bash
# Tous les tests (public + admin smoke)
npm test

# Interface graphique Playwright (recommandé pour déboguer)
npm run test:ui

# Tests publics uniquement (pas besoin d'auth)
npm run test:public

# Tests admin uniquement
npm run test:admin

# Smoke test rapide (toutes les pages admin)
npm run test:smoke

# Mode debug (pause sur chaque action)
npm run test:debug

# Rapport HTML après une exécution
npm run test:report
```

---

## Structure des tests

```
tests/e2e/
├── auth.setup.ts              # Génère les sessions auth (storageState)
├── fixtures/
│   └── index.ts               # Helpers partagés (waitForLoad, expectToast…)
├── public/
│   ├── 01-login.spec.ts       # Guards auth (admin + espace cavalier)
│   └── 10-espace-cavalier.spec.ts  # Pages publiques
└── admin/
    ├── 02-ponctuel.spec.ts    # Module Passage (séance ponctuelle)
    ├── 03-forfaits.spec.ts    # Module Forfaits annuels
    ├── 04-cartes.spec.ts      # Module Cartes de séances
    ├── 05-stages.spec.ts      # Planning + inscription stage
    ├── 06-montoir.spec.ts     # Feuille de présence du jour
    ├── 07-avoirs.spec.ts      # Module Avoirs
    ├── 08-paiements.spec.ts   # Module Paiements
    └── 09-navigation-smoke.spec.ts  # Smoke test toutes pages admin
```

---

## Couverture par module

| Code   | Module              | Tests | Priorité |
|--------|---------------------|-------|----------|
| AUTH   | Authentification    | 5     | 🔴 Critique |
| PA     | Passage / Ponctuel  | 4     | 🔴 Critique |
| FO     | Forfaits            | 5     | 🔴 Critique |
| CA     | Cartes séances      | 5     | 🟠 Haute |
| ST     | Stages              | 5     | 🔴 Critique |
| MO     | Montoir             | 5     | 🟠 Haute |
| AV     | Avoirs              | 4     | 🟡 Normale |
| PA     | Paiements           | 5     | 🔴 Critique |
| SMOKE  | Toutes pages admin  | 13    | 🟠 Haute |
| EC     | Espace cavalier     | 6     | 🟠 Haute |

**Total : ~57 assertions** réparties sur 10 fichiers de spec.

---

## Stratégie d'authentification

L'auth Firebase utilise Google/Facebook OAuth (popup), qui ne peut pas être automatisé directement par Playwright. La stratégie utilisée :

1. **`auth.setup.ts`** : envoie un Firebase ID token à `/api/test-auth`
2. **`/api/test-auth`** : vérifie le token via Firebase Admin SDK et pose un cookie de session
3. **Playwright** persiste le cookie dans `.auth/admin.json` / `.auth/famille.json`
4. Les specs admin/famille utilisent ce `storageState` pour démarrer déjà connectés

> Les fichiers `.auth/*.json` sont dans `.gitignore` — ils ne sont jamais committés.

---

## data-testid ajoutés dans le code

| Sélecteur | Élément |
|-----------|---------|
| `[data-testid="admin-nav"]` | Sidebar admin |
| `[data-testid="toast-success"]` | Toast succès |
| `[data-testid="toast-error"]` | Toast erreur |
| `[data-testid="toast-warning"]` | Toast avertissement |
| `[data-testid="family-search-input"]` | Champ recherche famille (passage, paiements) |
| `[data-testid="forfait-search"]` | Champ recherche forfaits |
| `[data-testid="impaye-search-input"]` | Champ recherche impayés |

---

## Ajouter un nouveau test

1. Crée un fichier dans `tests/e2e/admin/` ou `tests/e2e/public/`
2. Nomme-le `NN-nom-du-module.spec.ts`
3. Importe depuis `@playwright/test`
4. Lance `npm run test:ui` pour déboguer visuellement

```ts
import { test, expect } from "@playwright/test";

test.describe("MON-MODULE · Description", () => {
  test("MON-01 · Ce que ça vérifie", async ({ page }) => {
    await page.goto("/admin/mon-module");
    await expect(page.locator("text=Mon titre")).toBeVisible();
  });
});
```
