# Refactor du moteur de rapprochement bancaire

**Date** : 2026-05-01
**Branche** : `refactor/rapprochement-engine`
**Statut** : design validé, prêt pour planification d'implémentation

## Contexte et motivation

Le fichier `src/app/admin/comptabilite/page.tsx` est devenu le god-component du projet :

- **4611 lignes** dans un seul composant React (de loin le plus gros fichier du repo, ~2x le suivant)
- **51 `useState`** dans le même composant
- **7 onglets** (`journal`, `tva`, `remise`, `rapprochement`, `rapprochement_ignores`, `fec`, `export`) tous rendus depuis ce composant
- **4 panneaux debug** (`?debug=reset|diag|reset-cb|migrate-banklines`) embarqués
- **Le moteur de matching bancaire** (~600 lignes) est inline dans la fonction `handleCSVImport` autour des lignes 699-1500

Les 10+ commits de fix récents sur la zone rapprochement (parser CA robuste, déduplication doublons, isolation par période, groupement chèques par jour exact, paiement mixte chèque+espèces, etc.) montrent que cette logique est subtile et **n'a aucun filet de sécurité** : zéro test unitaire, et la couverture Playwright e2e n'isole pas les règles individuelles.

Tant que ce code reste inline dans un god-component, chaque modification se fait à l'aveugle.

## Objectif

Extraire le moteur de matching dans `src/lib/rapprochement/` sous forme de **fonctions pures testables**, sans changer le comportement observable côté utilisateur. Aucun nettoyage de la zone UI / Firestore / IA n'est dans le scope.

## Non-objectifs

- Découpage de `page.tsx` en sous-composants par onglet (pas dans ce refactor — pourrait être un chantier séparé plus tard).
- Refactor des 51 `useState` ou extraction en hooks.
- Refactor des fonctions Firestore (`syncVersementsEspeces`, `saveBankLinesByMonth`, `loadSavedRapprochement`) : elles restent dans `page.tsx` car elles ne sont pas pures et ne se prêtent pas au TDD-capture.
- Refactor des panneaux debug, du parser IA, de l'export FEC.
- Réécriture de la logique de matching : on déplace tel quel, on ne corrige aucun comportement.

## Périmètre

### Fonctions à extraire (et seulement celles-ci)

1. Parser CSV Crédit Agricole (~85 lignes, page.tsx 706-790)
2. Règle 1 — CB en ligne / payout CAWL (~58 lignes, 915-972)
3. Règle 2 — CB terminal / agrégat par jour (~68 lignes, 973-1040)
4. Règle 3 — Virement / SEPA / Prélèvement (~132 lignes, 1041-1172)
5. Règle 4 — Chèque (~136 lignes, 1173-1308)
6. Règle 5 — Espèces (~50 lignes, 1309-1358)
7. Règle 6 — Montant exact toutes modes (~25 lignes, 1359-1383)
8. Orchestrateur — la boucle qui appelle les 6 règles dans l'ordre

Total : ~700 lignes de logique métier, 8 fichiers source (parser + 6 matchers + engine) + 8 fichiers de tests + 1 fichier de types.

## Architecture cible

```
src/lib/rapprochement/
├── types.ts                     # BankLine, Payment, MatchResult, MatchType, RapprochementContext
├── parser-ca.ts                 # parseCreditAgricoleCsv(raw: string): BankLine[]
├── matchers/
│   ├── cb-online.ts             # matchCbOnline(line, encs, ctx): MatchResult | null
│   ├── cb-terminal.ts           # matchCbTerminal(line, encs, ctx): MatchResult | null
│   ├── virement.ts              # matchVirement(line, encs, ctx): MatchResult | null
│   ├── cheque.ts                # matchCheque(line, encs, remises, ctx): MatchResult | null
│   ├── especes.ts               # matchEspeces(line, encs, ctx): MatchResult | null
│   └── montant-exact.ts         # matchMontantExact(line, encs, ctx): MatchResult | null
├── engine.ts                    # runMatching(lines, encs, remises): { lines: BankLine[], unmatched: BankLine[] }
└── __tests__/
    ├── fixtures/                # cas de référence en JSON (anonymisés)
    │   ├── cb-online.json
    │   ├── cb-terminal.json
    │   ├── virement.json
    │   ├── cheque.json
    │   ├── especes.json
    │   ├── montant-exact.json
    │   └── full-csv.json
    ├── parser-ca.test.ts
    ├── cb-online.test.ts
    ├── cb-terminal.test.ts
    ├── virement.test.ts
    ├── cheque.test.ts
    ├── especes.test.ts
    ├── montant-exact.test.ts
    └── engine.test.ts
```

### Contrat des matchers

Chaque matcher a la signature :

```ts
function matchXxx(
  line: BankLine,
  encs: Encaissement[],
  // optionnel selon la règle :
  remises?: Remise[],
  ctx?: RapprochementContext
): MatchResult | null;
```

- **Pur** : pas d'appel Firestore, pas d'effet de bord, sortie déterministe pour des entrées données.
- Retourne `null` si la règle ne s'applique pas → l'orchestrateur passe à la règle suivante.
- Retourne un `MatchResult` ({ matchType, matchedEncs, matchedAmount, … }) si match → l'orchestrateur l'applique sur la `BankLine` et passe à la ligne suivante.

### Intégration dans `page.tsx`

Avant (~800 lignes inline) :

```ts
const handleCSVImport = (e) => {
  // ... parsing inline ...
  // ... 6 règles inline ...
  // ... mise à jour state ...
};
```

Après :

```ts
import { parseCreditAgricoleCsv } from "@/lib/rapprochement/parser-ca";
import { runMatching } from "@/lib/rapprochement/engine";

const handleCSVImport = (e) => {
  const raw = await readFile(e);
  const lines = parseCreditAgricoleCsv(raw);
  const result = runMatching(lines, encaissements, remises);
  setBankLines(result.lines);
  // ... le reste de la logique d'UI / sync Firestore reste tel quel
};
```

## Méthodologie : TDD-capture

À chaque règle, on suit 5 étapes strictes :

### Étape 0 — Comprendre le comportement actuel

Lire la règle dans `page.tsx`, lister à plat **toutes** ses branches : conditions de match, ce qu'elle écrit dans `bl.matchType` / `bl.matchedEncs` / autres flags, cas spéciaux, fix récents qu'elle intègre. Cette liste est partagée avec l'utilisateur avant écriture des tests.

### Étape 1 — Capture (tests "golden")

Créer `__tests__/<règle>.test.ts` avec :
- 2-3 cas synthétiques minimaux qui couvrent les branches du code actuel.
- Si possible, 1-2 cas réels anonymisés fournis par l'utilisateur depuis la prod.

À ce stade, la fonction n'existe pas encore : on crée un stub `function matchXxx(): never { throw new Error("not implemented"); }`. Les tests doivent compiler et échouer.

### Étape 2 — Extraction

Copier-coller la logique inline de `page.tsx` dans `matchers/<règle>.ts`. Identifier les dépendances capturées (encaissements, remises, dates, contexte) et les passer en paramètres explicites. **Aucun changement de logique** : pure relocalisation.

### Étape 3 — Vérifier que les tests passent

`npm run test:unit -- <règle>`. Si rouge : la capture étape 1 était fausse (la règle ne fait pas ce qu'on pensait). Corriger les tests pour refléter le vrai comportement actuel — **les tests doivent matcher le code existant, pas l'inverse**. Le bug, s'il y en a un, sera corrigé dans un commit séparé après le refactor.

### Étape 4 — Remplacer l'inline

Dans `page.tsx`, remplacer les 60-150 lignes de la règle par `const result = matchXxx(line, encs, remises, ctx);`. Lancer :
- Tests unitaires Vitest : verts.
- Tests Playwright e2e existants : verts (en particulier `17-stats-compta.spec.ts`).
- Validation manuelle : import d'un vrai CSV, vérification visuelle.

### Étape 5 — Commit et merge

1 commit ciblé du type `refactor(rapprochement): extract <règle> to lib/rapprochement/matchers`. Push, merge fast-forward dans `main`. La branche reste vivante pour la règle suivante.

## Setup test framework

Le projet n'a pas de framework de tests unitaires aujourd'hui. Choix : **Vitest**.

**Pourquoi Vitest** : compatible nativement avec Next 15 + React 19 + TS + ESM, zéro config Babel, pas de conflit avec Playwright existant (qui scanne `tests/`).

**Ce qui est ajouté** :
- `vitest` en `devDependencies`
- `vitest.config.ts` à la racine (pointe sur `src/**/__tests__/**/*.test.ts`)
- Scripts `package.json` :
  - `"test:unit": "vitest run"`
  - `"test:unit:watch": "vitest"`
- Pas touche aux scripts Playwright (`test`, `test:e2e`, etc.) ni aux scripts existants.

**Convention** :
- Tests unitaires : `*.test.ts` dans `src/**/__tests__/`
- Tests Playwright : `*.spec.ts` dans `tests/` (inchangé)

Pas de coverage, pas d'intégration CI tant que ce n'est pas explicitement demandé.

## Plan global et ordre des règles

Ordre du plus simple au plus risqué, pour roder la méthode avant d'attaquer les règles à fort historique de fix :

| # | Cible | Lignes page.tsx | Complexité | Risque | Estimation |
|---|---|---|---|---|---|
| 1 | Parser CSV CA | 706-790 (~85) | Faible | Faible | ~45 min |
| 2 | Règle 6 — Montant exact | 1359-1383 (~25) | Très faible | Faible | ~30 min |
| 3 | Règle 1 — CB en ligne | 915-972 (~58) | Modérée | Faible | ~1 h |
| 4 | Règle 5 — Espèces | 1309-1358 (~50) | Modérée | Faible | ~1 h |
| 5 | Règle 2 — CB terminal | 973-1040 (~68) | Modérée | Modéré (fix récent c55c7b5) | ~1.5 h |
| 6 | Règle 3 — Virement / SEPA | 1041-1172 (~132) | Élevée | Modéré | ~2 h |
| 7 | Règle 4 — Chèque | 1173-1308 (~136) | Élevée | Élevé (le plus de fix récents) | ~2.5 h |
| 8 | `engine.ts` (orchestrateur) | la boucle restante | Faible | Faible | ~1 h (incl. 1-2 tests d'intégration) |

**Total estimé** : ~10-12 h de travail effectif, réparti librement sur N sessions. Chaque cycle finit par un merge dans main → on peut s'arrêter après n'importe quelle règle, l'état n'est jamais à moitié cassé.

## Critères d'acceptation

À la fin du dernier cycle :

- `src/lib/rapprochement/` contient les 8 fichiers source + 1 `types.ts` + 8 fichiers de tests.
- `npm run test:unit` exécute tous les tests Vitest et tous passent.
- Les tests Playwright e2e existants passent toujours sans modification.
- `handleCSVImport` dans `page.tsx` ne contient plus aucune des 6 règles ni le parser inline : c'est un appel à `parseCreditAgricoleCsv` puis `runMatching`.
- `page.tsx` est passé d'environ 4611 lignes à environ 3900 lignes (diminution ~700 lignes).
- L'utilisateur a validé en test manuel que le comportement de l'écran de rapprochement est inchangé.

## Risques et mitigation

| Risque | Mitigation |
|---|---|
| Comportement subtil non couvert par les tests de capture | TDD-capture étape 0 force un audit branche par branche avant écriture du test. Les fix récents servent de checklist : chaque fix doit avoir au moins un test correspondant. |
| Divergence avec `main` pendant un cycle long | Cycles courts (1 règle = 30 min à 2.5 h max), merge immédiat dans main après chaque règle. La branche est rebasée sur main au début de chaque nouveau cycle si main a bougé. |
| Régression sur un cas réel non testé | Validation manuelle obligatoire en étape 4 (import CSV réel et vérification visuelle). Les Playwright e2e couvrent les flows d'intégration. |
| Découverte d'un bug existant pendant la capture | On documente le bug mais on ne le corrige pas dans le refactor : commit séparé, après merge du refactor de la règle. La règle préserve son comportement actuel. |
| Vitest ne s'intègre pas bien | Faible (stack standard). Si problème, fallback Jest avec config explicite. |

## Hors scope (à traiter dans des chantiers séparés si besoin)

- Découpage de `page.tsx` en `<JournalTab>`, `<TvaTab>`, etc. (god-component à 4611 lignes restera à ~3900 lignes après ce refactor)
- Extraction des panneaux debug dans des composants séparés
- Hooks dédiés (`useRapprochement`, `useJournal`)
- Refactor des fonctions Firestore (`syncVersementsEspeces`, etc.) en services
- Tests unitaires des autres parties du fichier (TVA, FEC, export, etc.)
