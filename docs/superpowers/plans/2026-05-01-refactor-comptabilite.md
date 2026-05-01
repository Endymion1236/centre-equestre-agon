# Refactor de la page comptabilité (moteur + UI) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réduire `src/app/admin/comptabilite/page.tsx` de 4611 à ~1500-2000 lignes en extrayant : (Phase 1) le moteur de matching dans `src/lib/rapprochement/` avec couverture de tests unitaires, (Phase 2) les 4 panneaux debug en composants, (Phase 3) les 7 onglets en composants. Aucun changement de comportement utilisateur.

**Architecture:** Phase 1 utilise du TDD-capture (tests d'abord qui figent le comportement actuel, puis extraction). Phases 2-3 sont des extractions mécaniques de composants validées par Playwright e2e + tests manuels. Chaque cycle (1 ligne du plan = 1 commit) est mergé dans `main` immédiatement, branche `refactor/comptabilite` reste vivante entre les cycles.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Firebase/Firestore · Vitest (nouveau, à installer) · Playwright (existant).

**Spec source :** `docs/superpowers/specs/2026-05-01-refactor-rapprochement-engine-design.md`

---

## Conventions communes à toutes les tâches

- **Avant chaque tâche** : `git checkout refactor/comptabilite && git pull --rebase origin main`
- **Après chaque tâche** : commit + `git push` + merger dans `main` via `git checkout main && git merge --ff-only refactor/comptabilite && git push`
- **Validation manuelle** : pour Phase 1, importer un CSV bancaire réel et vérifier que les rapprochements donnent le même résultat qu'avant. Pour Phases 2-3, naviguer dans l'onglet/panneau extrait et vérifier que tout fonctionne comme avant.
- **Si un test rouge inattendu apparaît** : NE PAS modifier le code source pour faire passer le test. Le test décrit le comportement actuel ; si le test échoue c'est qu'on a mal lu le code (corriger le test) ou qu'on a découvert un bug existant (le documenter mais ne PAS le corriger dans le refactor — commit séparé après merge).

---

## Task 1: Setup branche, Vitest et types partagés

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `src/lib/rapprochement/types.ts`
- Create: `src/lib/rapprochement/__tests__/sanity.test.ts` (sera supprimé en fin de tâche)

- [ ] **Step 1: Créer la branche depuis main à jour**

```bash
git checkout main && git pull origin main
git checkout -b refactor/comptabilite
```

- [ ] **Step 2: Installer Vitest**

```bash
npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 3: Créer `vitest.config.ts` à la racine**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Ajouter les scripts dans `package.json`**

Modifier `package.json` pour ajouter dans la section `"scripts"` (juste après `"validate:rules"`) :

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

⚠️ Vérifier que `"test": "playwright test"` existant n'est pas modifié.

- [ ] **Step 5: Créer `src/lib/rapprochement/types.ts`**

```ts
// Types partagés du moteur de rapprochement bancaire
// Extraits depuis src/app/admin/comptabilite/page.tsx (lignes 13-23, 216, 873-913)

export interface BankLine {
  date: string;          // "DD/MM/YYYY"
  label: string;
  amount: number;        // toujours > 0 (crédits uniquement)
  matched: boolean;
  matchType: string;     // "" | "CB en ligne" | "CB terminal" | "Virement" | "Chèque" | "Espèces" | "Montant exact" | "Manuel" | "Ignoré"
  matchDetail: string;
  matchedEncs?: EncDetail[];
  manualPaymentId?: string;
  uncertain?: boolean;   // true uniquement pour le fallback "Montant exact"
}

export interface EncDetail {
  familyName: string;
  montant: number;
  date: string;          // "DD/MM/YYYY"
  activityTitle: string;
  mode: string;
}

export interface Encaissement {
  id: string;
  mode: string;          // "cb_terminal" | "cb_online" | "cb_cawl" | "cheque" | "especes" | "virement" | "sepa" | "prelevement_sepa" | ...
  modeLabel?: string;
  montant: number;
  date: { seconds: number; nanoseconds?: number } | null;
  familyName?: string;
  activityTitle?: string;
  ref?: string;
  reconciledByBank?: boolean;
  // ... d'autres champs Firestore non utilisés par le matching
  [k: string]: any;
}

export interface Remise {
  id: string;
  total?: number;
  encaissementIds?: string[];
  paymentMode?: string;
  mode?: string;
  pointee?: boolean;
  pointeeNote?: string;
  createdAt?: { seconds: number } | null;
  [k: string]: any;
}

export interface RemiseSepa {
  id: string;
  total?: number;
  paymentIds?: string[];
  pointee?: boolean;
  [k: string]: any;
}

export interface Payment {
  id: string;
  familyName: string;
  totalTTC: number;
  paymentMode: string;
  paymentRef?: string;
  status: string;
  date: { seconds: number } | null;
  reconciledByBank?: boolean;
  [k: string]: any;
}

/**
 * Contexte partagé entre tous les matchers.
 * Les Sets `usedXxxIds` sont MUTÉS par les matchers au fil de l'itération
 * sur les bankLines : une fois qu'un encaissement (ou une remise) a été
 * consommé par une ligne, il ne peut plus être consommé par une autre.
 */
export interface MatchContext {
  encs: Encaissement[];
  remises: Remise[];
  remisesSepa: RemiseSepa[];
  payments: Payment[];
  period: string;                  // "YYYY-MM"
  usedEncIds: Set<string>;
  usedRemiseIds: Set<string>;
  usedRemiseSepaIds: Set<string>;
  usedPaymentIds: Set<string>;
}

/**
 * Résultat retourné par un matcher.
 * `null` = la règle ne s'applique pas, l'orchestrateur passe à la suivante.
 */
export type MatchResult = {
  matchType: string;
  matchDetail: string;
  matchedEncs: EncDetail[];
  uncertain?: boolean;
  manualPaymentId?: string;
} | null;
```

- [ ] **Step 6: Créer un test sanity pour vérifier que Vitest démarre**

`src/lib/rapprochement/__tests__/sanity.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import type { BankLine } from "../types";

describe("setup sanity", () => {
  it("vitest fonctionne et résout l'alias @ via les types", () => {
    const bl: BankLine = {
      date: "01/05/2026",
      label: "TEST",
      amount: 100,
      matched: false,
      matchType: "",
      matchDetail: "",
    };
    expect(bl.amount).toBe(100);
  });
});
```

- [ ] **Step 7: Lancer Vitest**

```bash
npm run test:unit
```

Expected: 1 test passe, sortie type `Test Files  1 passed (1)`.

Si erreur de résolution de path : vérifier `vitest.config.ts` (alias `@`).

- [ ] **Step 8: Vérifier que les Playwright e2e ne sont pas cassés**

```bash
npx playwright test --list
```

Expected: liste les tests sans erreur de configuration. (Pas besoin de les lancer ici, juste vérifier la config.)

- [ ] **Step 9: Supprimer le test sanity**

```bash
rm src/lib/rapprochement/__tests__/sanity.test.ts
```

- [ ] **Step 10: Vérifier que `npm run test:unit` passe encore (sans tests)**

```bash
npm run test:unit
```

Expected: `No test files found` (acceptable, ou bien exit code 0 selon Vitest). Pour Vitest 1.x, c'est `Test Files  no tests` — vérifier que ça ne fait pas échouer la commande de manière bloquante. Si c'est le cas, ajouter `--passWithNoTests` au script :

```json
"test:unit": "vitest run --passWithNoTests"
```

- [ ] **Step 11: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/rapprochement/types.ts
git commit -m "chore(rapprochement): setup Vitest + types.ts pour refactor

- Vitest installé en devDependencies
- vitest.config.ts pointe sur src/**/__tests__/**/*.test.ts
- Scripts test:unit et test:unit:watch ajoutés (Playwright inchangé)
- Types partagés du moteur de rapprochement extraits de page.tsx"
```

- [ ] **Step 12: Push + merge dans main**

```bash
git push -u origin refactor/comptabilite
git checkout main && git merge --ff-only refactor/comptabilite && git push
git checkout refactor/comptabilite
```

---

## Task 2: Extraire le parser CSV Crédit Agricole

**Files:**
- Read: `src/app/admin/comptabilite/page.tsx:706-790` (logique parser)
- Create: `src/lib/rapprochement/parser-ca.ts`
- Create: `src/lib/rapprochement/__tests__/parser-ca.test.ts`
- Modify: `src/app/admin/comptabilite/page.tsx` (remplacement inline → appel)

- [ ] **Step 1: Audit (étape 0 TDD-capture)**

Lire en détail `page.tsx:706-790`. Lister à plat dans un commentaire le comportement du parser :

1. **Détection de la ligne d'en-tête** : la première ligne contenant à la fois `date` et (`libellé`/`libelle`/`label`). Fallback : ligne 0.
2. **Détection du format** : présence de `débit`/`debit`/`crédit`/`credit` dans l'en-tête → format CA (4 colonnes), sinon format simple (3 colonnes).
3. **Parsing CSV avec guillemets multi-lignes** : caractère par caractère, double `"` change l'état `inQuotes`, retours à la ligne ignorés dans les guillemets.
4. **Parsing des champs** : séparés par `;` hors guillemets, `\s+` collapsé, trim.
5. **Validation date** : regex DD/MM/YYYY OU YYYY-MM-DD OU DD-MM-YYYY.
6. **Format CA** : champs[2]=débit, champs[3]=crédit (parseFloat avec espaces supprimés et `,`→`.`).
7. **Format simple** : champs[2]=montant unique, séparé en débit/crédit selon signe.
8. **Sortie** : `BankLine[]` avec `amount = Math.round((credit - debit) * 100) / 100` et **filtrage `amount > 0`** (les débits sont exclus du rapprochement).
9. **Champs initiaux** : `matched: false`, `matchType: ""`, `matchDetail: ""`.

Coller cette liste dans un commentaire en tête de `parser-ca.ts` une fois créé.

- [ ] **Step 2: Créer le fichier de test (avec stubs)**

`src/lib/rapprochement/__tests__/parser-ca.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { parseCreditAgricoleCsv } from "../parser-ca";

describe("parseCreditAgricoleCsv", () => {
  it("parse le format CA avec colonnes Débit/Crédit", () => {
    const csv = `Compte numéro 12345
Du 01/05/2026 au 31/05/2026

Date;Libellé;Débit euros;Crédit euros;
05/05/2026;"VIR DE MME DUPONT
RIB 1234";;150,00;
06/05/2026;"REMISE CHEQUE 12";;320,50;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      date: "05/05/2026",
      label: "VIR DE MME DUPONT RIB 1234",
      amount: 150,
      matched: false,
      matchType: "",
      matchDetail: "",
    });
    expect(lines[1].amount).toBe(320.5);
  });

  it("ignore les débits (sortants) et garde uniquement les crédits", () => {
    const csv = `Date;Libellé;Débit euros;Crédit euros;
01/05/2026;"PRELEVEMENT URSSAF";450,00;;
02/05/2026;"VIR DE M MARTIN";;200,00;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toContain("MARTIN");
  });

  it("parse le format simple à 3 colonnes (Date;Libellé;Montant)", () => {
    const csv = `Date;Libellé;Montant
01/05/2026;Vir Dupont;100,00
02/05/2026;Prelevement;-50,00
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(100);
  });

  it("collapse les espaces multiples et retours à la ligne dans le libellé", () => {
    const csv = `Date;Libellé;Débit euros;Crédit euros;
05/05/2026;"VIR DE
   MME    DUPONT";;100,00;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines[0].label).toBe('"VIR DE MME DUPONT"');
    // NB: les guillemets du libellé sont conservés, c'est le comportement actuel
  });

  it("ignore les lignes sans date valide", () => {
    const csv = `Date;Libellé;Débit euros;Crédit euros;
TOTAL;Solde;;500,00;
05/05/2026;Virement;;100,00;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(1);
  });

  it("retourne un tableau vide pour un CSV sans en-tête détectable", () => {
    expect(parseCreditAgricoleCsv("")).toEqual([]);
    expect(parseCreditAgricoleCsv("garbage\nplus de garbage")).toEqual([]);
  });
});
```

⚠️ Pour le test "collapse les espaces" : le comportement actuel garde les guillemets dans le label si le label commence par `"` (cf. `cleanField` qui ne strip pas les guillemets). Si le test échoue lors de l'étape 4, vérifier ce qui sort réellement et adapter le test pour matcher le comportement actuel.

- [ ] **Step 3: Créer le stub `parser-ca.ts`**

`src/lib/rapprochement/parser-ca.ts` :

```ts
import type { BankLine } from "./types";

/**
 * Parser CSV bancaire — extrait depuis page.tsx:706-790.
 *
 * Comportement (à figer par les tests, ne PAS modifier dans ce refactor) :
 * 1. Détecte la ligne d'en-tête (contient "date" + "libellé"/"label"). Fallback ligne 0.
 * 2. Détecte le format : Débit/Crédit (CA) ou Montant unique (simple).
 * 3. Parse caractère par caractère pour gérer les guillemets multi-lignes.
 * 4. Sépare les champs par ";" (hors guillemets), collapse les whitespace.
 * 5. Valide la date par regex (DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY).
 * 6. Convertit débit/crédit en `amount = credit - debit`, ne garde que `amount > 0`.
 *
 * Encodage : le fichier doit être lu en ISO-8859-1 (Latin1) côté FileReader,
 * cf. page.tsx:1713. Cette fonction reçoit déjà la string décodée.
 */
export function parseCreditAgricoleCsv(_raw: string): BankLine[] {
  throw new Error("parseCreditAgricoleCsv not implemented");
}
```

- [ ] **Step 4: Vérifier que les tests échouent (red)**

```bash
npm run test:unit -- parser-ca
```

Expected: 6 tests, tous échouent avec "not implemented". Si la commande passe, c'est qu'aucun test n'a été collecté → vérifier le path du fichier de test.

- [ ] **Step 5: Extraire le code depuis page.tsx**

Copier le bloc `page.tsx:706-788` (depuis la ligne `// 1. Trouver la ligne d'en-tête` jusqu'à `.filter(r => r.amount > 0);`) dans le corps de `parseCreditAgricoleCsv`. Adapter :
- `raw` est maintenant le paramètre.
- Le `return parsed;` devient l'instruction finale.
- Pas d'autre changement de logique.

Le résultat ressemble à :

```ts
export function parseCreditAgricoleCsv(raw: string): BankLine[] {
  const allLines = raw.split("\n");
  let headerIdx = allLines.findIndex(l => {
    const lower = l.toLowerCase();
    return (lower.includes("date") && (lower.includes("libellé") || lower.includes("libelle") || lower.includes("label")));
  });
  if (headerIdx < 0) headerIdx = 0;

  const headerLine = allLines[headerIdx].toLowerCase();
  const hasDebitCredit = headerLine.includes("débit") || headerLine.includes("debit") || headerLine.includes("crédit") || headerLine.includes("credit");

  const dataText = allLines.slice(headerIdx + 1).join("\n");

  const records: { date: string; label: string; debit: number; credit: number }[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < dataText.length; i++) {
    // ... [copie ligne par ligne de page.tsx:732-776]
  }

  const parsed: BankLine[] = records.map(r => ({
    date: r.date,
    label: r.label,
    amount: Math.round((r.credit - r.debit) * 100) / 100,
    matched: false,
    matchType: "",
    matchDetail: "",
  })).filter(r => r.amount > 0);

  return parsed;
}
```

⚠️ Le typage strict de `BankLine` n'inclut pas `matchedEncs` etc. par défaut → c'est OK, ces champs sont optionnels et ajoutés par les matchers ensuite.

- [ ] **Step 6: Vérifier que les tests passent (green)**

```bash
npm run test:unit -- parser-ca
```

Expected: les 6 tests passent. Si un test échoue, NE PAS modifier `parser-ca.ts` : c'est qu'on a mal capturé le comportement. Adapter le test pour matcher le code (cf. avertissement Step 2 sur les guillemets).

Si plus de 1 test échoue de manière inexpliquée, lancer en mode verbose : `npm run test:unit -- parser-ca --reporter=verbose`.

- [ ] **Step 7: Remplacer l'inline dans page.tsx**

Dans `src/app/admin/comptabilite/page.tsx`, en haut du fichier après les imports existants, ajouter :

```ts
import { parseCreditAgricoleCsv } from "@/lib/rapprochement/parser-ca";
```

Puis remplacer le bloc `page.tsx:706-788` (de `// ── Parser intelligent...` à `.filter(r => r.amount > 0);`) par :

```ts
const parsed = parseCreditAgricoleCsv(raw);
```

⚠️ Vérifier que la variable `parsed` est bien le nom utilisé après ce bloc dans la suite de `handleCSVImport`. Si oui, l'intégration est transparente.

- [ ] **Step 8: Vérifier que tout compile**

```bash
npm run build
```

Expected: build OK. Si erreur de type sur `BankLine` (ex : champs manquants utilisés plus loin dans page.tsx), élargir le type dans `types.ts` pour matcher les usages réels (ne PAS retirer la stricte typage de la sortie du parser, mais ajouter les champs optionnels nécessaires).

- [ ] **Step 9: Lancer les tests unitaires + e2e principaux**

```bash
npm run test:unit
npx playwright test tests/e2e/admin/17-stats-compta.spec.ts
```

Expected: tout vert.

- [ ] **Step 10: Test manuel**

Démarrer le serveur de dev (`npm run dev`), aller dans `/admin/comptabilite`, sélectionner l'onglet `rapprochement`, importer un CSV CA réel. Vérifier que :
- Le nombre de lignes parsées est identique à avant le refactor.
- Les libellés et montants sont identiques.

Si écart visible : revenir à git, comprendre l'écart, ajouter un test capturant le cas, refaire les étapes 5-6.

- [ ] **Step 11: Commit + merge**

```bash
git add src/lib/rapprochement/parser-ca.ts src/lib/rapprochement/__tests__/parser-ca.test.ts src/app/admin/comptabilite/page.tsx
git commit -m "refactor(rapprochement): extract parseCreditAgricoleCsv to lib

- 85 lignes deplacees de page.tsx vers src/lib/rapprochement/parser-ca.ts
- 6 tests unitaires Vitest (formats CA et simple, debits exclus, dates invalides)
- Aucun changement de comportement"
git push
git checkout main && git merge --ff-only refactor/comptabilite && git push
git checkout refactor/comptabilite
```

---

## Task 3: Extraire la règle "Montant exact" (règle 6, la plus simple)

**Files:**
- Read: `src/app/admin/comptabilite/page.tsx:1359-1383`
- Create: `src/lib/rapprochement/matchers/montant-exact.ts`
- Create: `src/lib/rapprochement/__tests__/montant-exact.test.ts`
- Modify: `src/app/admin/comptabilite/page.tsx` (remplacement)

C'est la règle modèle. Elle pose le pattern utilisé dans les 5 suivantes.

- [ ] **Step 1: Audit (étape 0)**

Lire `page.tsx:1359-1383`. Comportement à figer :

1. **Garde "label virement"** : si le label contient `VIR`, `SEPA` ou `PRLV` → la règle ne s'applique pas (return null). Évite les faux positifs sur virements.
2. **Recherche** : parmi les `periodEnc` (encs du mois courant non encore consommés) filtrés par `inWindow` (fenêtre ±3 jours autour de `bankDate`), trouve un encaissement avec `Math.abs(montant - bl.amount) < 0.02`.
3. **Si match** :
   - Mute `usedEncIds` (`add(exactMatch.id)`).
   - Retourne `{ matchType: "Montant exact", matchDetail: "<famille> — <activité>", matchedEncs: [encToDetail(exactMatch)], uncertain: true }`.
4. **Si pas de match** : return null.

Dépendances capturées du scope React :
- `bl` (la bankLine en cours d'itération) → paramètre `line`
- `periodEnc` (filtre encaissements de la période, hors `usedEncIds`) → calculé dans le matcher à partir de `ctx`
- `inWindow` (fenêtre ±3 jours) → helper interne au matcher (sera déplacé dans `engine.ts` plus tard)
- `bankDate` (parseBankDate(bl.date)) → calculé dans le matcher
- `encToDetail` → helper interne (sera dans `engine.ts` plus tard, pour l'instant local au matcher)

- [ ] **Step 2: Créer le fichier de test**

`src/lib/rapprochement/__tests__/montant-exact.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { matchMontantExact } from "../matchers/montant-exact";
import type { BankLine, MatchContext, Encaissement } from "../types";

function mkCtx(encs: Encaissement[], period = "2026-05"): MatchContext {
  return {
    encs,
    remises: [],
    remisesSepa: [],
    payments: [],
    period,
    usedEncIds: new Set<string>(),
    usedRemiseIds: new Set<string>(),
    usedRemiseSepaIds: new Set<string>(),
    usedPaymentIds: new Set<string>(),
  };
}

function mkLine(overrides: Partial<BankLine> = {}): BankLine {
  return {
    date: "15/05/2026",
    label: "PAIEMENT INCONNU",
    amount: 100,
    matched: false,
    matchType: "",
    matchDetail: "",
    ...overrides,
  };
}

function mkEnc(overrides: Partial<Encaissement>): Encaissement {
  const date = new Date("2026-05-15T12:00:00");
  return {
    id: "e1",
    mode: "cb_terminal",
    montant: 100,
    date: { seconds: Math.floor(date.getTime() / 1000) },
    familyName: "Dupont",
    activityTitle: "Carte 10h",
    ...overrides,
  };
}

describe("matchMontantExact", () => {
  it("matche un encaissement de même montant dans la fenêtre ±3 jours", () => {
    const enc = mkEnc({ id: "e1", montant: 100 });
    const ctx = mkCtx([enc]);
    const result = matchMontantExact(mkLine({ amount: 100 }), ctx);
    expect(result).not.toBeNull();
    expect(result!.matchType).toBe("Montant exact");
    expect(result!.uncertain).toBe(true);
    expect(result!.matchedEncs[0].familyName).toBe("Dupont");
    expect(ctx.usedEncIds.has("e1")).toBe(true);
  });

  it("ne matche pas si l'écart de montant > 0.02€", () => {
    const enc = mkEnc({ id: "e1", montant: 100.05 });
    const ctx = mkCtx([enc]);
    expect(matchMontantExact(mkLine({ amount: 100 }), ctx)).toBeNull();
    expect(ctx.usedEncIds.size).toBe(0);
  });

  it("ne matche pas hors fenêtre ±3 jours", () => {
    const enc = mkEnc({
      id: "e1",
      montant: 100,
      date: { seconds: Math.floor(new Date("2026-05-01T12:00:00").getTime() / 1000) },
    });
    const ctx = mkCtx([enc]);
    expect(matchMontantExact(mkLine({ date: "15/05/2026", amount: 100 }), ctx)).toBeNull();
  });

  it("est désactivé pour les libellés VIR / SEPA / PRLV (faux positifs)", () => {
    const enc = mkEnc({ id: "e1", montant: 100 });
    const ctx = mkCtx([enc]);
    expect(matchMontantExact(mkLine({ label: "VIR DE MME DUPONT", amount: 100 }), ctx)).toBeNull();
    expect(matchMontantExact(mkLine({ label: "SEPA DUPONT", amount: 100 }), ctx)).toBeNull();
    expect(matchMontantExact(mkLine({ label: "PRLV CONSO", amount: 100 }), ctx)).toBeNull();
  });

  it("ne matche pas un encaissement déjà consommé", () => {
    const enc = mkEnc({ id: "e1", montant: 100 });
    const ctx = mkCtx([enc]);
    ctx.usedEncIds.add("e1");
    expect(matchMontantExact(mkLine({ amount: 100 }), ctx)).toBeNull();
  });

  it("ne matche pas un encaissement hors période", () => {
    const enc = mkEnc({
      id: "e1",
      montant: 100,
      date: { seconds: Math.floor(new Date("2026-04-15T12:00:00").getTime() / 1000) },
    });
    const ctx = mkCtx([enc], "2026-05");
    expect(matchMontantExact(mkLine({ date: "15/05/2026", amount: 100 }), ctx)).toBeNull();
  });
});
```

- [ ] **Step 3: Créer le stub**

`src/lib/rapprochement/matchers/montant-exact.ts` :

```ts
import type { BankLine, MatchContext, MatchResult } from "../types";

/**
 * Règle 6 — Montant exact (extrait depuis page.tsx:1359-1383).
 * Dernier recours : si rien d'autre n'a matché, on cherche un encaissement
 * de même montant (±0.02€) dans la fenêtre ±3 jours autour de la date bancaire.
 *
 * IMPORTANT : désactivé pour les virements (label VIR/SEPA/PRLV) car risque
 * élevé de faux positif. Quand activé, marque le résultat `uncertain: true`.
 */
export function matchMontantExact(_line: BankLine, _ctx: MatchContext): MatchResult {
  throw new Error("matchMontantExact not implemented");
}
```

- [ ] **Step 4: Vérifier que les tests sont rouges**

```bash
npm run test:unit -- montant-exact
```

Expected: 6 tests échouent avec "not implemented".

- [ ] **Step 5: Implémenter le matcher**

Compléter `montant-exact.ts` :

```ts
import type { BankLine, MatchContext, MatchResult, Encaissement, EncDetail } from "../types";

const parseBankDate = (s: string): Date | null => {
  if (!s) return null;
  const p1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (p1) {
    const dd = p1[1].padStart(2, "0"), mm = p1[2].padStart(2, "0");
    return new Date(`${p1[3]}-${mm}-${dd}`);
  }
  const p2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (p2) return new Date(s);
  const p3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (p3) {
    const dd = p3[1].padStart(2, "0"), mm = p3[2].padStart(2, "0");
    return new Date(`${p3[3]}-${mm}-${dd}`);
  }
  return null;
};

const encToDetail = (e: Encaissement): EncDetail => ({
  familyName: e.familyName || "",
  montant: e.montant || 0,
  date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
  activityTitle: e.activityTitle || "",
  mode: e.modeLabel || e.mode || "",
});

export function matchMontantExact(line: BankLine, ctx: MatchContext): MatchResult {
  const label = line.label.toUpperCase();
  const isVirementLabel = label.includes("VIR") || label.includes("SEPA") || label.includes("PRLV");
  if (isVirementLabel) return null;

  const bankDate = parseBankDate(line.date);

  const inWindow = (enc: Encaissement) => {
    if (!bankDate) return true;
    const d = enc.date?.seconds ? new Date(enc.date.seconds * 1000) : null;
    if (!d) return false;
    const diff = Math.abs(bankDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 3;
  };

  const periodEnc = ctx.encs.filter(e => {
    if (ctx.usedEncIds.has(e.id)) return false;
    const d = e.date?.seconds ? new Date(e.date.seconds * 1000) : null;
    if (!d) return false;
    const pm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return pm === ctx.period;
  });

  const exactMatch = periodEnc.filter(inWindow).find(e =>
    Math.abs((e.montant || 0) - line.amount) < 0.02
  );

  if (!exactMatch) return null;

  ctx.usedEncIds.add(exactMatch.id);
  return {
    matchType: "Montant exact",
    matchDetail: `${exactMatch.familyName || ""} — ${exactMatch.activityTitle || ""}`,
    matchedEncs: [encToDetail(exactMatch)],
    uncertain: true,
  };
}
```

⚠️ `parseBankDate` et `encToDetail` sont dupliqués ici par rapport à `page.tsx:846-871` ; ils seront déplacés dans `engine.ts` plus tard (Task 9). Pour l'instant ils restent locaux à chaque matcher pour que les matchers soient testables individuellement. La duplication est temporaire et **assumée**.

- [ ] **Step 6: Vérifier que les tests passent**

```bash
npm run test:unit -- montant-exact
```

Expected: 6 tests passent.

- [ ] **Step 7: Remplacer l'inline dans page.tsx**

Ajouter l'import en haut de `page.tsx` :

```ts
import { matchMontantExact } from "@/lib/rapprochement/matchers/montant-exact";
```

Remplacer le bloc `page.tsx:1359-1383` par :

```ts
// ── 6. Montant exact toutes modes ─────────────────────────────────
const montantExactResult = matchMontantExact(bl, {
  encs: encaissementsCompta,
  remises,
  remisesSepa,
  payments,
  period,
  usedEncIds,
  usedRemiseIds,
  usedRemiseSepaIds,
  usedPaymentIds,
});
if (montantExactResult) {
  return { ...bl, matched: true, ...montantExactResult };
}
```

⚠️ Vérifier que les variables `encaissementsCompta`, `remises`, `remisesSepa`, `payments`, `period` et tous les `usedXxxIds` existent bien dans le scope au point d'insertion.

- [ ] **Step 8: Build + tests**

```bash
npm run build && npm run test:unit && npx playwright test tests/e2e/admin/17-stats-compta.spec.ts
```

Expected: tout vert.

- [ ] **Step 9: Test manuel**

Importer un CSV qui a une ligne matchée par "Montant exact" en prod, vérifier que le badge ⚠️ "incertain" apparaît bien (cf. `uncertain: true` rendu dans l'UI).

- [ ] **Step 10: Commit + merge**

```bash
git add src/lib/rapprochement/matchers/montant-exact.ts src/lib/rapprochement/__tests__/montant-exact.test.ts src/app/admin/comptabilite/page.tsx
git commit -m "refactor(rapprochement): extract matchMontantExact (regle 6) to lib

- 25 lignes deplacees de page.tsx vers src/lib/rapprochement/matchers/montant-exact.ts
- 6 tests unitaires Vitest (matching, fenetre, exclusion virements, conso)
- helpers parseBankDate + encToDetail dupliques temporairement (relocalises en Task 9)"
git push
git checkout main && git merge --ff-only refactor/comptabilite && git push
git checkout refactor/comptabilite
```

---

## Tasks 4-8 — Extraction des règles 1, 5, 2, 3, 4 (mêmes étapes que Task 3)

Pour chaque règle, suivre **rigoureusement le même schéma de 10 étapes que Task 3** :

1. Audit du comportement actuel (lister branches, dépendances, fix récents)
2. Créer le fichier de test avec 4-8 cas (selon complexité de la règle)
3. Créer le stub
4. Vérifier rouge
5. Implémenter (copie depuis page.tsx, adaptation des dépendances en `ctx`)
6. Vérifier vert
7. Remplacer l'inline dans page.tsx
8. Build + tests unitaires + e2e
9. Test manuel
10. Commit + merge

### Task 4: Extraire la règle "CB en ligne" (règle 1)

**Source page.tsx :** lignes 915-972 (~58 lignes).
**Cible :** `src/lib/rapprochement/matchers/cb-online.ts` + `__tests__/cb-online.test.ts`.

**Comportement à capturer (étape 0) :**
- **Détection** : label contient `CAWL` ou `WORLDLINE` ou `STRIPE` ou `STP`.
- **Pool** : encaissements `mode === "cb_online"` ou `"cb_cawl"` non encore consommés, dans la période ou la précédente (`periodEncExtended`).
- **Fenêtre** : large, jusqu'à 7 jours après l'encaissement (CAWL paye en différé), pas de fenêtre avant.
- **Logique de match** : agrège les encs par jour (la banque verse en lots). Cherche un sous-ensemble dont la somme = montant bancaire ±2 centimes (`findSubsetSum`). Si trouvé, match net de commissions ~2.9% + 0.25€.
- **Sortie** : `matchType: "CB en ligne"`, `matchedEncs` = liste des encs du sous-ensemble, mute `usedEncIds`.

**Tests à prévoir :**
- Match exact d'un payout d'un jour (3 encs cb_online totalisant le montant).
- Match avec écart ±2 centimes.
- Pas de match si label sans mot-clé CAWL/WORLDLINE/STRIPE/STP.
- Pas de match si pool vide.
- Encs déjà consommés exclus.
- Pool extended (mois précédent autorisé pour CAWL en différé de fin de mois).

⚠️ **Dépendance partagée `findSubsetSum`** : cette fonction (page.tsx:815-844) est utilisée par CB online et CB terminal. Pour Task 4, dupliquer dans `cb-online.ts` (déplacement en Task 9). Pour Task 6 (CB terminal), idem. **Marquer la duplication par un commentaire explicite** pour que Task 9 sache quoi consolider.

### Task 5: Extraire la règle "Espèces" (règle 5)

**Source page.tsx :** lignes 1309-1358 (~50 lignes).
**Cible :** `src/lib/rapprochement/matchers/especes.ts` + `__tests__/especes.test.ts`.

**Comportement à capturer (étape 0) :**
- **Détection** : label contient `ESP` ou `VERSEMENT`.
- **Pool** : encaissements `mode === "especes"` non encore consommés dans la période.
- **a0. Match par bordereau de remise** : si le label contient un numéro qui matche un bordereau de remise espèces existant, on consomme le bordereau entier (priorité haute).
- **a1. Match par jour exact** : groupement des encs especes par jour, cherche un jour dont le total = montant bancaire ±0.02€.
- **Sortie** : `matchType: "Espèces"`, `matchedEncs` = encs du jour ou du bordereau, mute `usedEncIds` + `usedRemiseIds`.

**Tests à prévoir :**
- Match par jour exact (3 encs cash d'un jour totalisant le montant).
- Match par bordereau (1 remise consommée, mute usedRemiseIds).
- Pas de match si label sans ESP/VERSEMENT.
- Pas de match si aucun jour avec total exact.

### Task 6: Extraire la règle "CB terminal" (règle 2)

**Source page.tsx :** lignes 973-1040 (~68 lignes).
**Cible :** `src/lib/rapprochement/matchers/cb-terminal.ts` + `__tests__/cb-terminal.test.ts`.

**Attention fix récent (commit `c55c7b5`)** : le matching par sous-ensemble a été désactivé pour CB terminal — on force "Détail CA" (saisie manuelle de la composition de la remise par l'utilisateur). Capturer ce comportement précisément :
- Si le label contient `REMISE` ET (`CARTE` ou `CB` ou `TPE`), on cherche d'abord un match d'agrégat exact sur un jour entier.
- Si pas trouvé → return `null` (ne PAS tenter de sous-ensemble), ce qui laissera la ligne non-matchée (l'utilisateur la traitera via le panel "Détail CA").
- L'utilisateur peut ensuite fournir la composition de la remise via le panneau "Détail CA" → bloc séparé du matcher initial.

**Pool** : encaissements `mode === "cb_terminal"` non encore consommés, période + extended.

**Tests à prévoir :**
- Match par jour exact (n encs cb_terminal d'un jour totalisant le montant).
- Pas de match si pas un jour exact (laisser pour Détail CA, ne PAS tenter sous-ensemble).
- Pas de match si label sans mot-clé.
- Pool extended (encaissements du mois précédent acceptés).

### Task 7: Extraire la règle "Virement / SEPA / Prélèvement" (règle 3)

**Source page.tsx :** lignes 1041-1172 (~132 lignes).
**Cible :** `src/lib/rapprochement/matchers/virement.ts` + `__tests__/virement.test.ts`.

**Plus complexe** : 3 sous-blocs (a, b, c) selon priorités :
- **a. Match SEPA par bordereau** : si le label correspond à un dépôt SEPA → consomme la `remise-sepa` entière, mute `usedRemiseSepaIds`.
- **b. Match par nom dans le libellé** : pour virement classique, on extrait des mots-clés du label (nom famille) et on cherche un encaissement `mode === "virement"` correspondant. Plusieurs heuristiques (priorité au match exact par nom > prénom > similarité).
- **c. Match par montant strict** : si le label ne donne pas d'indice nom mais qu'un encaissement virement de même montant (±0.02€) existe, prudence — le code actuel privilégie quand même nom > montant pour éviter les faux positifs (cf. fix `ef64450`).

**Mute** : `usedEncIds`, `usedPaymentIds` (pour les paiements en attente liés), `usedRemiseSepaIds` selon le sous-bloc qui a matché.

**Tests à prévoir :** au moins 2 tests par sous-bloc (a, b, c), plus 2 tests d'exclusion. Soit ~8 tests.

⚠️ **Examiner attentivement les commits récents** (cf. spec, section "Risques") avant d'écrire les tests : `ef64450`, `cd4a9ab`, `884fac2`, `7b933c3` ont tous ajouté des cas particuliers qui doivent être figés.

### Task 8: Extraire la règle "Chèque" (règle 4)

**Source page.tsx :** lignes 1173-1308 (~136 lignes).
**Cible :** `src/lib/rapprochement/matchers/cheque.ts` + `__tests__/cheque.test.ts`.

**La plus délicate** — fix récents nombreux. Sous-blocs :
- **a0. Match par bordereau de remise** (priorité haute) : si le label suggère une remise de chèques et qu'un bordereau correspond, consomme la remise entière.
- **a1. Match par jour exact** (commit `2de9544` : groupement par jour exact, comme CB terminal).
- **b. Match par nom + montant** : si un encaissement `mode === "cheque"` correspond par nom famille extrait du libellé.
- **c. Cas particulier paiement mixte chèque+espèces** (commit `17a2f24`) : si le bordereau est mixte, traitement spécial.
- **d. Détection indirecte des remises consommées** (commit `cd4a9ab`) — cf. boucle après la map dans page.tsx:1554-1564.

**Tests à prévoir :** 8-10 tests minimum, couvrant chaque sous-bloc et chaque fix récent (un fix = un test).

**Recommandation forte** : avant écrire les tests, faire `git log --oneline --grep cheque src/app/admin/comptabilite/page.tsx` et lire chaque commit récent. Chaque fix doit avoir son test.

---

## Task 9: Extraire l'orchestrateur dans `engine.ts` + dédupliquer les helpers

**Files:**
- Read: `src/app/admin/comptabilite/page.tsx:790-1500` (orchestrateur + helpers)
- Create: `src/lib/rapprochement/engine.ts`
- Modify: les 6 matchers (supprimer `parseBankDate`, `encToDetail`, `findSubsetSum` locaux, importer depuis `engine.ts`)
- Create: `src/lib/rapprochement/__tests__/engine.test.ts` (tests d'intégration)
- Modify: `src/app/admin/comptabilite/page.tsx` (remplacer la map par appel à `runMatching`)

- [ ] **Step 1: Audit de l'orchestrateur**

Comportement à figer :

1. Setup des Sets `usedEncIds`, `usedRemiseSepaIds`, `usedPaymentIds`, `usedRemiseIds`.
2. Setup de la `MatchContext` partagée.
3. Pour chaque `BankLine` parsée : appeler les 6 matchers DANS L'ORDRE (CB online → CB terminal → Virement → Chèque → Espèces → Montant exact). Le PREMIER qui retourne non-null gagne. Si tous retournent null, la ligne reste non-matchée et le bloc DEBUG (page.tsx:1384-1497) est exécuté pour logger pourquoi.
4. **Boucle "détection indirecte des remises consommées"** (page.tsx:1554-1564) : APRÈS la map, parcourt `remises` et marque dans `usedRemiseIds` celles dont tous les encaissements sont déjà dans `usedEncIds`.

⚠️ **Important** : le bloc "Bug #2 fusion avec matchs manuels" (page.tsx:1500-1545) et tous les blocs Firestore (lignes 1547-1701) **restent dans page.tsx**. `runMatching` retourne uniquement les bankLines avec leurs matches ; le reste (fusion manuelle, sauvegarde, sync versements, sync remises pointées, mise à jour status paiements) est out-of-scope.

- [ ] **Step 2: Créer le fichier `engine.ts` avec les helpers consolidés**

`src/lib/rapprochement/engine.ts` :

```ts
import type { BankLine, MatchContext, Encaissement, EncDetail, Remise } from "./types";
import { matchCbOnline } from "./matchers/cb-online";
import { matchCbTerminal } from "./matchers/cb-terminal";
import { matchVirement } from "./matchers/virement";
import { matchCheque } from "./matchers/cheque";
import { matchEspeces } from "./matchers/especes";
import { matchMontantExact } from "./matchers/montant-exact";

/** Parse une date bancaire (formats DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY). */
export const parseBankDate = (s: string): Date | null => {
  if (!s) return null;
  const p1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (p1) {
    const dd = p1[1].padStart(2, "0"), mm = p1[2].padStart(2, "0");
    return new Date(`${p1[3]}-${mm}-${dd}`);
  }
  const p2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (p2) return new Date(s);
  const p3 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (p3) {
    const dd = p3[1].padStart(2, "0"), mm = p3[2].padStart(2, "0");
    return new Date(`${p3[3]}-${mm}-${dd}`);
  }
  return null;
};

/** Convertit un encaissement en EncDetail pour affichage UI. */
export const encToDetail = (e: Encaissement): EncDetail => ({
  familyName: e.familyName || "",
  montant: e.montant || 0,
  date: e.date?.seconds ? new Date(e.date.seconds * 1000).toLocaleDateString("fr-FR") : "",
  activityTitle: e.activityTitle || "",
  mode: e.modeLabel || e.mode || "",
});

/**
 * Cherche un sous-ensemble de `encs` dont la somme (en centimes) = targetCents (±2c).
 * Programmation dynamique, limites : 25 encs max, 100k entrées dp max.
 * Extrait depuis page.tsx:815-844.
 */
export const findSubsetSum = (encs: Encaissement[], targetCents: number): Encaissement[] | null => {
  if (encs.length === 0 || encs.length > 25) return null;
  const centsValues = encs.map(e => Math.round((e.montant || 0) * 100));
  const totalCents = centsValues.reduce((s, c) => s + c, 0);
  if (targetCents > totalCents + 2) return null;
  if (targetCents <= 0) return null;
  if (Math.abs(totalCents - targetCents) <= 2) return [...encs];

  let dp = new Map<number, number[]>();
  dp.set(0, []);
  for (let i = 0; i < centsValues.length; i++) {
    const current = centsValues[i];
    const nextDp = new Map(dp);
    for (const [sum, indices] of dp.entries()) {
      const newSum = sum + current;
      if (newSum > targetCents + 2) continue;
      if (!nextDp.has(newSum)) {
        const newIndices = [...indices, i];
        nextDp.set(newSum, newIndices);
        if (Math.abs(newSum - targetCents) <= 2) {
          return newIndices.map(idx => encs[idx]);
        }
      }
    }
    dp = nextDp;
    if (dp.size > 100000) return null;
  }
  return null;
};

/**
 * Crée un MatchContext frais à partir des données chargées de Firestore.
 */
export function createMatchContext(args: {
  encs: Encaissement[];
  remises: Remise[];
  remisesSepa: MatchContext["remisesSepa"];
  payments: MatchContext["payments"];
  period: string;
}): MatchContext {
  return {
    ...args,
    usedEncIds: new Set<string>(),
    usedRemiseIds: new Set<string>(),
    usedRemiseSepaIds: new Set<string>(),
    usedPaymentIds: new Set<string>(),
  };
}

/**
 * Orchestrateur : applique les 6 règles dans l'ordre sur chaque BankLine.
 * Le premier matcher non-null gagne. Mute `ctx` (Sets used*Ids) au fil de l'itération.
 *
 * Returns : { lines } — tableau enrichi (matched, matchType, matchDetail, matchedEncs).
 *
 * NB : ne fait PAS la fusion avec matchs manuels (Bug #2), ni les écritures Firestore.
 * Ces étapes restent dans handleCSVImport côté page.tsx.
 */
export function runMatching(
  lines: BankLine[],
  ctx: MatchContext
): { lines: BankLine[] } {
  const matchers = [
    matchCbOnline,
    matchCbTerminal,
    matchVirement,
    matchCheque,
    matchEspeces,
    matchMontantExact,
  ];

  const matched = lines.map((bl) => {
    for (const matcher of matchers) {
      const result = matcher(bl, ctx);
      if (result) {
        return { ...bl, matched: true, ...result };
      }
    }
    return bl; // non-matché
  });

  // Détection indirecte des remises consommées (page.tsx:1554-1564)
  for (const r of ctx.remises) {
    if (ctx.usedRemiseIds.has(r.id)) continue;
    const encIds = r.encaissementIds || [];
    if (encIds.length === 0) continue;
    if (encIds.every((id) => ctx.usedEncIds.has(id))) {
      ctx.usedRemiseIds.add(r.id);
    }
  }

  return { lines: matched };
}
```

⚠️ La signature des matchers (Tasks 4-8) doit accepter `(line, ctx)` pour être appelable par cette boucle. Pour les règles qui ont besoin de `remises` / `remisesSepa`, ils les lisent depuis `ctx.remises` / `ctx.remisesSepa` plutôt que de les recevoir en argument séparé. **Adapter la signature des 6 matchers maintenant si elle ne l'est pas déjà.**

- [ ] **Step 3: Dédupliquer dans les 6 matchers**

Pour chaque matcher (`montant-exact.ts`, `cb-online.ts`, `cb-terminal.ts`, `virement.ts`, `cheque.ts`, `especes.ts`) :
1. Supprimer la définition locale de `parseBankDate`, `encToDetail`, `findSubsetSum` (selon ce qui était dupliqué).
2. Ajouter `import { parseBankDate, encToDetail, findSubsetSum } from "../engine";`
3. Vérifier que les tests unitaires passent encore : `npm run test:unit`.

- [ ] **Step 4: Créer les tests d'intégration de `engine.ts`**

`src/lib/rapprochement/__tests__/engine.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { runMatching, createMatchContext } from "../engine";
import type { BankLine, Encaissement } from "../types";
import fullCsvFixture from "./fixtures/full-csv.json";

describe("runMatching (intégration)", () => {
  it("applique les matchers dans l'ordre et le premier gagne", () => {
    // Encaissement qui pourrait matcher en CB terminal ET en montant exact
    // → CB terminal doit gagner (priorité plus haute dans matchers[])
    const enc: Encaissement = {
      id: "e1",
      mode: "cb_terminal",
      montant: 100,
      date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) },
      familyName: "Dupont",
    };
    const lines: BankLine[] = [{
      date: "15/05/2026",
      label: "REMISE CARTES TPE",
      amount: 100,
      matched: false, matchType: "", matchDetail: "",
    }];
    const ctx = createMatchContext({
      encs: [enc], remises: [], remisesSepa: [], payments: [],
      period: "2026-05",
    });
    const { lines: result } = runMatching(lines, ctx);
    expect(result[0].matched).toBe(true);
    expect(result[0].matchType).toBe("CB terminal");
  });

  it("laisse non-matché si aucune règle ne matche", () => {
    const lines: BankLine[] = [{
      date: "15/05/2026",
      label: "INCONNU",
      amount: 999,
      matched: false, matchType: "", matchDetail: "",
    }];
    const ctx = createMatchContext({
      encs: [], remises: [], remisesSepa: [], payments: [],
      period: "2026-05",
    });
    const { lines: result } = runMatching(lines, ctx);
    expect(result[0].matched).toBe(false);
    expect(result[0].matchType).toBe("");
  });

  it("marque une remise consommée indirectement (tous ses encs dans usedEncIds)", () => {
    // Setup : 2 encs qui forment une remise. Une bankLine matche par jour exact
    // → consomme les 2 encs. La remise doit être marquée comme consommée.
    const e1: Encaissement = { id: "e1", mode: "cheque", montant: 50, date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) } };
    const e2: Encaissement = { id: "e2", mode: "cheque", montant: 50, date: { seconds: Math.floor(new Date("2026-05-15T12:00:00").getTime() / 1000) } };
    const lines: BankLine[] = [{
      date: "15/05/2026",
      label: "REMISE CHEQUE 12",
      amount: 100,
      matched: false, matchType: "", matchDetail: "",
    }];
    const ctx = createMatchContext({
      encs: [e1, e2],
      remises: [{ id: "r1", encaissementIds: ["e1", "e2"], total: 100 }],
      remisesSepa: [], payments: [],
      period: "2026-05",
    });
    const { lines: result } = runMatching(lines, ctx);
    expect(result[0].matched).toBe(true);
    expect(ctx.usedRemiseIds.has("r1")).toBe(true);
  });

  it("rejoue un fixture complet et vérifie les match types attendus", () => {
    // Voir fixtures/full-csv.json (à fournir par l'utilisateur depuis sa prod)
    const { input, ctx: ctxData, expected } = fullCsvFixture as any;
    const ctx = createMatchContext(ctxData);
    const { lines: result } = runMatching(input, ctx);
    for (let i = 0; i < expected.length; i++) {
      expect(result[i].matched).toBe(expected[i].matched);
      expect(result[i].matchType).toBe(expected[i].matchType);
    }
  });
});
```

- [ ] **Step 5: Créer le fixture `full-csv.json`**

`src/lib/rapprochement/__tests__/fixtures/full-csv.json` : à remplir avec un cas réel anonymisé (input = `BankLine[]` parsé d'un CSV récent, ctx = encs/remises/payments anonymisés depuis Firestore, expected = `[{matched, matchType}, ...]` correspondant à ce qui est observé en prod).

**Si l'utilisateur ne peut pas fournir** : créer un fixture synthétique qui couvre les 6 règles avec 1-2 lignes chacune. Le test "rejoue un fixture complet" ne sera alors pas un test golden de prod mais un test d'intégration synthétique — c'est suffisant.

- [ ] **Step 6: Vérifier que les tests passent**

```bash
npm run test:unit
```

Expected: tous les tests unitaires (incluant tous les matchers + engine) passent.

- [ ] **Step 7: Remplacer dans page.tsx**

Dans `page.tsx`, importer :

```ts
import { runMatching, createMatchContext } from "@/lib/rapprochement/engine";
```

Remplacer le bloc `page.tsx:790-1498` (depuis `// ────... Smart matching` jusqu'à `});` qui ferme le `parsed.map((bl) => {...})`) par :

```ts
const ctx = createMatchContext({
  encs: encaissementsCompta,
  remises,
  remisesSepa,
  payments,
  period,
});
const { lines: matched } = runMatching(parsed, ctx);

// Pour rétrocompatibilité avec le bloc DEBUG en cas de non-match,
// on garde un log à plat des bankLines non-matchées (extrait minimal de l'ancien
// bloc DEBUG page.tsx:1384-1497 — restera dans page.tsx car il dépend du
// contexte UI / console).
for (const bl of matched) {
  if (!bl.matched) {
    console.log(`🔍 NON RAPPROCHÉE : "${bl.label}" ${bl.amount.toFixed(2)}€ ${bl.date}`);
    // NB : le diag détaillé (groupes par jour, candidats ±5€, etc.) reste
    // disponible via le panel ?debug=diag — pas besoin de le dupliquer ici.
  }
}
```

⚠️ Le bloc DEBUG est volontairement simplifié à un log d'une ligne. Si tu veux conserver le log à plat verbeux d'origine, recopier le bloc page.tsx:1384-1497 ici (mais c'est ~115 lignes — décision à prendre avec l'utilisateur).

⚠️ Les 4 Sets locaux `usedEncIds`, `usedRemiseSepaIds`, etc. déclarés page.tsx:798-801 sont remplacés par `ctx.usedEncIds`, etc. — vérifier que les usages downstream (lignes 1547-1664) référencent bien `ctx.usedEncIds` et non plus la variable locale.

- [ ] **Step 8: Build + tests**

```bash
npm run build && npm run test:unit && npx playwright test tests/e2e/admin/17-stats-compta.spec.ts
```

Expected: tout vert. Si une référence à `usedEncIds` etc. casse dans page.tsx, remplacer par `ctx.usedEncIds`.

- [ ] **Step 9: Test manuel intensif**

C'est la fin de la Phase 1. **Tester avec un CSV réel** et comparer :
- Nombre de lignes matchées.
- Type de match par ligne (CB terminal, Chèque, etc.).
- Lignes non-matchées identiques.
- Versements bancaires créés en compta identiques.
- Encaissements `reconciledByBank=true` après import identiques.

Si écart : revenir, identifier la règle responsable, ajouter un test, refaire.

- [ ] **Step 10: Commit + merge**

```bash
git add src/lib/rapprochement/engine.ts src/lib/rapprochement/__tests__/engine.test.ts src/lib/rapprochement/__tests__/fixtures/full-csv.json src/lib/rapprochement/matchers/*.ts src/app/admin/comptabilite/page.tsx
git commit -m "refactor(rapprochement): extract engine orchestrator + dedup helpers

- runMatching applique les 6 regles dans l'ordre, mute MatchContext partage
- helpers parseBankDate/encToDetail/findSubsetSum centralises dans engine.ts
- 4 tests d'integration (priorite des matchers, non-match, remise indirecte, fixture)
- page.tsx perd ~700 lignes (handleCSVImport reduit a parser + runMatching)
- Phase 1 du refactor compta complete"
git push
git checkout main && git merge --ff-only refactor/comptabilite && git push
git checkout refactor/comptabilite
```

🎯 **Fin de Phase 1.** À ce stade :
- `page.tsx` ≈ 3900 lignes (gain ~700)
- 8 matchers/parser/engine + 8 fichiers de tests dans `src/lib/rapprochement/`
- Tous les tests Vitest verts
- Tous les Playwright e2e verts
- Comportement utilisateur inchangé

---

## Phase 2 — Extraction des panneaux debug (4 cycles)

Méthode : extraction simple de composants. Pas de TDD (panneaux peu critiques, validés par test manuel).

### Pattern commun à tous les panneaux

Pour chaque panneau, suivre cette procédure :

- [ ] **Step 1: Identifier la surface**

Lister tous les `useState`, fonctions et variables que le panneau utilise. Distinguer :
- Ce qui est **local** au panneau (tous les `useState` dont l'utilisation est confinée au panneau) → migre dans le composant.
- Ce qui vient du **parent** (`period`, callbacks de refresh, etc.) → passe en props.

- [ ] **Step 2: Créer le composant**

Nouveau fichier `src/app/admin/comptabilite/debug-panels/<NomPanel>.tsx` (ex : `ResetPanel.tsx`).
- Copier le JSX du panneau depuis `page.tsx`.
- Déplacer les `useState` locaux dans le composant.
- Déplacer les fonctions handlers locales dans le composant.
- Déclarer les props nécessaires.

Squelette :

```tsx
"use client";
import { useState } from "react";
// ... imports nécessaires (Card, Loader2, authFetch, etc.)

interface XxxPanelProps {
  // ... selon ce qui vient du parent
}

export function XxxPanel({ ...props }: XxxPanelProps) {
  // useState locaux
  // handlers locaux
  return (
    <div className="...">
      {/* JSX copié depuis page.tsx */}
    </div>
  );
}
```

- [ ] **Step 3: Remplacer dans `page.tsx`**

- Importer le nouveau composant.
- Remplacer le bloc `{showXxxPanel && (...)}` par `{showXxxPanel && <XxxPanel {...props} />}`.
- Supprimer les `useState` et fonctions devenus inutilisés dans `page.tsx`.

- [ ] **Step 4: Build + e2e + manuel**

```bash
npm run build && npx playwright test tests/e2e/admin/
```

Manuellement : ouvrir `/admin/comptabilite?debug=<flag>`, vérifier que le panneau fonctionne identiquement.

- [ ] **Step 5: Commit + merge**

```bash
git add ...
git commit -m "refactor(comptabilite): extract <NomPanel> component"
git push && git checkout main && git merge --ff-only refactor/comptabilite && git push && git checkout refactor/comptabilite
```

### Task 10: Extraire `<MigrateBlsPanel>` (`?debug=migrate-banklines`)

**Source page.tsx :** lignes 4491-4609 (~118 lignes JSX) + state lignes 139-203 (~65 lignes state/handlers).
**Cible :** `src/app/admin/comptabilite/debug-panels/MigrateBlsPanel.tsx`.

**À déplacer dans le composant** :
- `useState` : `migrateBlsDryRun`, `migrateBlsApplied`, `migrateBlsLoading` (cf. page.tsx:139-145).
- Handlers : `fetchMigrateBlsDryRun`, `applyMigrateBls` (cf. page.tsx:147-203).

**Props nécessaires** : aucune (le panneau est autonome, sauf si tu remarques un usage de `period` ou autre — auditer).

⚠️ Pourquoi commencer par celui-ci : c'est le plus récent, le plus autonome, et le moins susceptible d'introduire un effet de bord. Bon panneau pour roder la méthode d'extraction.

### Task 11: Extraire `<DepointerCbPanel>` (`?debug=reset-cb`)

**Source page.tsx :** lignes 4395-4490 (~95 lignes) + state lignes 91-138.
**Cible :** `src/app/admin/comptabilite/debug-panels/DepointerCbPanel.tsx`.

État/handlers à déplacer : `depointerCbDryRun`, `depointerCbApplied`, `depointerCbLoading`, `fetchDepointerCbDryRun`, `applyDepointerCb`.

### Task 12: Extraire `<ResetPanel>` (`?debug=reset`)

**Source page.tsx :** lignes 4062-4235 (~173 lignes) + state lignes 60-89.
**Cible :** `src/app/admin/comptabilite/debug-panels/ResetPanel.tsx`.

État/handlers à déplacer : `resetSecret`, `resetDryRun`, `resetLoading`, `resetApplied`, et leurs handlers.

### Task 13: Extraire `<DiagPanel>` (`?debug=diag`)

**Source page.tsx :** lignes 4236-4394 (~158 lignes) + state lignes 65-90 + helper `buildDiagReport` page.tsx:237-309.
**Cible :** `src/app/admin/comptabilite/debug-panels/DiagPanel.tsx`.

État/handlers à déplacer : `diagReport`, `diagLoading`, `diagSearch`, `diagSearching`, `diagSearchResult`, `runDiagSearch`, `buildDiagReport`.

**Props nécessaires** : `remises`, `encaissementsCompta`, `payments` (utilisés par `buildDiagReport`).

🎯 **Fin de Phase 2.** À ce stade :
- `page.tsx` ≈ 3500 lignes
- 4 composants de panneaux dans `debug-panels/`
- `?debug=...` toujours fonctionnel à l'identique

---

## Phase 3 — Extraction des onglets (7 cycles)

Méthode identique à Phase 2 (extraction de composants, pas de TDD). Ordre : du plus petit au plus gros.

### Pattern commun

Idem Phase 2 : identifier surface → créer composant `<XxxTab>` dans `tabs/` → remplacer le bloc `{tab === "xxx" && (...)}` par `{tab === "xxx" && <XxxTab ...props />}` → build + e2e + manuel → commit + merge.

**Astuce TypeScript** : pour limiter la verbosité des props, créer un type partagé `TabSharedProps` dans `tabs/types.ts` qui regroupe les props communes (period, payments, encaissementsCompta, etc.) et chaque onglet l'étend avec ses besoins spécifiques.

### Task 14: Extraire `<TvaTab>` (40 lignes — le plus simple)

**Source page.tsx :** lignes 2073-2112 (~40 lignes).
**Cible :** `src/app/admin/comptabilite/tabs/TvaTab.tsx`.

**Props :** `tvaByRate`, `totalHT`, `totalTVA`, `totalTTC` (calculés en `useMemo` dans page.tsx:655-667).

⚠️ **Décision à prendre** : laisser les `useMemo` dans page.tsx et passer le résultat en props (recommandé, simple), OU déplacer le `useMemo` dans le composant (mais alors il faut passer `filteredPayments` en props). **Recommandation : passer le résultat calculé en props pour Phase 3 (le refactor des `useMemo` en hooks dédiés est hors scope).**

### Task 15: Extraire `<FecTab>` (45 lignes)

**Source page.tsx :** lignes 3867-3909.
**Cible :** `src/app/admin/comptabilite/tabs/FecTab.tsx`.

Audit des props : ce qui est utilisé dans le bloc, à déterminer en lecture.

### Task 16: Extraire `<ExportTab>` (~150 lignes)

**Source page.tsx :** lignes 3910-4061.
**Cible :** `src/app/admin/comptabilite/tabs/ExportTab.tsx`.

### Task 17: Extraire `<JournalTab>` (~90 lignes)

**Source page.tsx :** lignes 1984-2072.
**Cible :** `src/app/admin/comptabilite/tabs/JournalTab.tsx`.

**Props :** `filteredPayments`, `period`, `dailyTotals`.

### Task 18: Extraire `<RapprochementIgnoresTab>` (~80 lignes)

**Source page.tsx :** lignes 3786-3866.
**Cible :** `src/app/admin/comptabilite/tabs/RapprochementIgnoresTab.tsx`.

**Props :** `bankLines`, `setBankLines` (pour pouvoir dépointer une ligne ignorée).

### Task 19: Extraire `<RemiseTab>` (~810 lignes — le plus gros)

**Source page.tsx :** lignes 2113-2928.
**Cible :** `src/app/admin/comptabilite/tabs/RemiseTab.tsx`.

⚠️ **Avant de démarrer** : auditer attentivement les `useState` qui ne servent qu'à cet onglet (ex : `selectedForRemise`, `remiseModeView`, `pointageDate`, `pointageMontantReel`, `openRemiseId`, `showCADetailModal`, `caDetailText`, `caDetailPreview`). Tous doivent migrer dans le composant.

**Props attendues :** `period`, `encaissementsCompta`, `remises`, `payments`, `bankLines`, et probablement plusieurs callbacks pour rafraîchir / créer des remises. Lire le bloc complet en première étape pour les recenser exhaustivement.

**Astuce** : étant donné la taille, faire l'extraction en deux temps :
1. D'abord extraire le composant tel quel (copie 1:1, props larges) → build + tests.
2. Si possible dans une session ultérieure, identifier les sous-composants évidents (ex : `<RemiseRow>`, `<RemiseDetailModal>`) et les sous-extraire. **Hors scope de Task 19** : le simple fait de passer de 810 lignes inline à 810 lignes dans un composant séparé est déjà un gain.

### Task 20: Extraire `<RapprochementTab>` (~860 lignes — le plus complexe)

**Source page.tsx :** lignes 2929-3785.
**Cible :** `src/app/admin/comptabilite/tabs/RapprochementTab.tsx`.

⚠️ **C'est la pièce maîtresse de l'UI compta**. Audit minutieux des `useState` et fonctions liés (`bankLines`, `expandedBankLine`, `showManualMatch`, `manualSearch`, etc.). Probablement la plus chargée en interactions.

**Props :** `bankLines`, `setBankLines`, `period`, `encaissementsCompta`, `payments`, `remises`, `handleCSVImport` (le handler du bouton import — qui appelle maintenant `parseCreditAgricoleCsv` + `runMatching`), et tous les callbacks Firestore (sync, save, etc.).

**Astuce** : même approche que Task 19 — copie 1:1 d'abord, sous-composants plus tard si besoin.

🎯 **Fin de Phase 3.** À ce stade :
- `page.tsx` ≈ 1500-2000 lignes (objectif final atteint)
- 7 composants dans `tabs/`
- 4 composants dans `debug-panels/`
- 8 modules dans `src/lib/rapprochement/` avec leurs tests
- Tous tests + e2e verts, comportement utilisateur inchangé

---

## Critères de fin (rappel)

À la fin de Task 20 :

- [ ] `npm run test:unit` passe (tous les tests Vitest verts).
- [ ] `npx playwright test tests/e2e/admin/` passe (tous les e2e existants).
- [ ] `npm run build` passe sans erreur ni warning critique.
- [ ] `wc -l src/app/admin/comptabilite/page.tsx` retourne ~1500-2000 lignes.
- [ ] `src/lib/rapprochement/` contient parser, 6 matchers, engine, types, et 8 fichiers de tests.
- [ ] `src/app/admin/comptabilite/debug-panels/` contient 4 composants.
- [ ] `src/app/admin/comptabilite/tabs/` contient 7 composants.
- [ ] Test manuel : import d'un CSV CA, navigation entre onglets, ouverture des panneaux debug — tout fonctionne identiquement à avant le refactor.
- [ ] La branche `refactor/comptabilite` est à jour avec main et peut être supprimée.
