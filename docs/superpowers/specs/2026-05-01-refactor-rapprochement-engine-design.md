# Refactor de la page comptabilité (moteur + UI)

**Date** : 2026-05-01
**Branche** : `refactor/comptabilite`
**Statut** : design validé, prêt pour planification d'implémentation
**Scope** : Niveau 2 — moteur de matching + panneaux debug + onglets UI

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

Réduire le `page.tsx` de **4611 lignes à ~1500-2000 lignes** en trois phases successives :

1. **Phase 1 — Moteur** : extraire les 6 règles de matching et le parser CSV dans `src/lib/rapprochement/` sous forme de fonctions pures testables (TDD-capture).
2. **Phase 2 — Panneaux debug** : extraire les 4 panneaux `?debug=...` dans des composants dédiés.
3. **Phase 3 — Onglets** : extraire les 7 onglets (`journal`, `tva`, `remise`, `rapprochement`, `rapprochement_ignores`, `fec`, `export`) dans des sous-composants.

À l'issue, `page.tsx` reste l'orchestrateur (chargement Firestore, états globaux, sélecteur d'onglet, routage des panneaux debug) mais ne contient plus de logique métier ni de JSX volumineux.

**Aucun changement de comportement observable côté utilisateur**, à aucune phase.

## Non-objectifs

- Refactor des 51 `useState` en hooks dédiés (`useRapprochement`, `useJournal`…). Reste pour un chantier ultérieur ; le state continue de vivre dans `page.tsx` et est passé en props aux sous-composants.
- Refactor des fonctions Firestore (`syncVersementsEspeces`, `saveBankLinesByMonth`, `loadSavedRapprochement`) en services. Elles restent dans `page.tsx`.
- Refactor du parser IA, de l'export FEC autrement que par déplacement dans leurs composants d'onglet respectifs.
- Réécriture de la logique métier : on déplace le code tel quel, on ne corrige aucun comportement.
- Tests unitaires des sous-composants UI extraits (Phase 2 et 3). Seul le moteur (Phase 1) est testé unitairement ; les onglets et panneaux sont validés par les Playwright e2e existants + tests manuels.

## Périmètre détaillé

### Phase 1 — Moteur de matching (TDD-capture)

Fonctions à extraire dans `src/lib/rapprochement/` :

1. Parser CSV Crédit Agricole (~85 lignes, page.tsx 706-790)
2. Règle 1 — CB en ligne / payout CAWL (~58 lignes, 915-972)
3. Règle 2 — CB terminal / agrégat par jour (~68 lignes, 973-1040)
4. Règle 3 — Virement / SEPA / Prélèvement (~132 lignes, 1041-1172)
5. Règle 4 — Chèque (~136 lignes, 1173-1308)
6. Règle 5 — Espèces (~50 lignes, 1309-1358)
7. Règle 6 — Montant exact toutes modes (~25 lignes, 1359-1383)
8. Orchestrateur (la boucle qui appelle les 6 règles + helpers `findSubsetSum`, `parseBankDate`, `encToDetail`)

**Total Phase 1** : ~700 lignes extraites de `handleCSVImport`. `page.tsx` passe de 4611 à ~3900 lignes.

### Phase 2 — Panneaux debug (extraction de composants)

Composants à extraire dans `src/app/admin/comptabilite/debug-panels/` :

1. `<ResetPanel>` — `?debug=reset` (réinitialisation compta)
2. `<DiagPanel>` — `?debug=diag` (diagnostic remises + recherche par nom)
3. `<DepointerCbPanel>` — `?debug=reset-cb` (dépointage CB en masse)
4. `<MigrateBlsPanel>` — `?debug=migrate-banklines` (migration bankLines par mois)

Chaque panneau encapsule son état local (les `useState` qui n'ont d'utilité que dans le panneau) et reçoit en props uniquement ce qui dépend du `page.tsx` (typiquement : `period`, `onRefresh`).

**Total Phase 2** : ~400 lignes extraites. `page.tsx` passe de ~3900 à ~3500 lignes.

### Phase 3 — Onglets (extraction de composants)

Composants à extraire dans `src/app/admin/comptabilite/tabs/` :

1. `<JournalTab>` — `tab === "journal"` (lignes ~1984-2072)
2. `<TvaTab>` — `tab === "tva"` (lignes ~2073-2112)
3. `<RemiseTab>` — `tab === "remise"` (lignes ~2113-2928)
4. `<RapprochementTab>` — `tab === "rapprochement"` (lignes ~2929-3785)
5. `<RapprochementIgnoresTab>` — `tab === "rapprochement_ignores"` (lignes ~3786-3866)
6. `<FecTab>` — `tab === "fec"` (lignes ~3867-3909)
7. `<ExportTab>` — `tab === "export"` (lignes ~3910-fin)

Chaque onglet reçoit en props l'état + les callbacks dont il a besoin. La méthode est mécanique :
1. Identifier les `useState`, fonctions et données utilisés par l'onglet.
2. Créer le composant avec ces éléments en props.
3. Remplacer le bloc `{tab === "..." && <JSX>}` par `{tab === "..." && <XxxTab {...props} />}`.

**Total Phase 3** : ~1900-2000 lignes extraites. `page.tsx` final : ~1500-2000 lignes (chargement Firestore, état global, sélecteur d'onglet, dispatch sur les panneaux debug).

## Architecture cible

```
src/app/admin/comptabilite/
├── page.tsx                              # ~1500-2000 lignes : orchestrateur
├── debug-panels/
│   ├── ResetPanel.tsx
│   ├── DiagPanel.tsx
│   ├── DepointerCbPanel.tsx
│   └── MigrateBlsPanel.tsx
└── tabs/
    ├── JournalTab.tsx
    ├── TvaTab.tsx
    ├── RemiseTab.tsx
    ├── RapprochementTab.tsx
    ├── RapprochementIgnoresTab.tsx
    ├── FecTab.tsx
    └── ExportTab.tsx

src/lib/rapprochement/
├── types.ts                              # BankLine, Encaissement, Remise, MatchResult, MatchContext
├── parser-ca.ts                          # parseCreditAgricoleCsv(raw): BankLine[]
├── matchers/
│   ├── cb-online.ts
│   ├── cb-terminal.ts
│   ├── virement.ts
│   ├── cheque.ts
│   ├── especes.ts
│   └── montant-exact.ts
├── engine.ts                             # runMatching(lines, ctx): { lines: BankLine[] }
└── __tests__/
    ├── fixtures/                         # JSON anonymisés
    ├── parser-ca.test.ts
    ├── cb-online.test.ts
    ├── cb-terminal.test.ts
    ├── virement.test.ts
    ├── cheque.test.ts
    ├── especes.test.ts
    ├── montant-exact.test.ts
    └── engine.test.ts
```

## Contrat des matchers (Phase 1)

Les rules mutent un contexte partagé (`usedEncIds`, `usedRemiseIds`, etc.) — elles ne sont donc pas strictement pures, mais elles sont **déterministes pour un contexte donné** et **ne touchent ni Firestore ni le DOM**, donc testables.

```ts
type MatchContext = {
  encs: Encaissement[];
  remises: Remise[];
  remisesSepa: RemiseSepa[];
  payments: Payment[];
  period: string;             // "2026-05"
  // Sets mutés au fil de l'itération sur les lignes
  usedEncIds: Set<string>;
  usedRemiseIds: Set<string>;
  usedRemiseSepaIds: Set<string>;
  usedPaymentIds: Set<string>;
};

function matchXxx(line: BankLine, ctx: MatchContext): MatchResult | null;
```

- Retourne `null` → l'orchestrateur passe à la règle suivante.
- Retourne un `MatchResult` → l'orchestrateur applique le résultat sur la `BankLine` (matched=true, matchType, matchDetail, matchedEncs, etc.) et passe à la ligne suivante.
- Le matcher peut muter `ctx.usedEncIds` etc. (effet attendu et testable).

## Méthodologie

### Phase 1 — TDD-capture (5 étapes par règle)

À chaque règle, on suit ces 5 étapes strictes :

**Étape 0 — Comprendre le comportement actuel.** Lire la règle dans `page.tsx`, lister à plat **toutes** ses branches (conditions de match, écritures dans `bl.matchType` / `bl.matchedEncs`, mutations de `usedXxxIds`, fix récents intégrés). Liste partagée avec l'utilisateur avant écriture des tests.

**Étape 1 — Capture (tests "golden").** Créer `__tests__/<règle>.test.ts` avec 2-3 cas synthétiques minimaux qui couvrent les branches du code actuel + 1-2 cas réels anonymisés si l'utilisateur peut en fournir. Stub la fonction (`function matchXxx(): never { throw new Error("not implemented"); }`). Tests doivent compiler et échouer.

**Étape 2 — Extraction.** Copier-coller la logique inline depuis `page.tsx` dans `matchers/<règle>.ts`. Les dépendances capturées dans le scope React (`encaissementsCompta`, `remises`, `period`, `usedEncIds`, etc.) deviennent les champs du `ctx: MatchContext`. **Aucun changement de logique** : pure relocalisation.

**Étape 3 — Vérifier que les tests passent.** `npm run test:unit -- <règle>`. Si rouge : la capture étape 1 était fausse. Corriger les tests pour refléter le vrai comportement actuel — **les tests doivent matcher le code existant, pas l'inverse**. Si on découvre un bug, on le documente, on ne le corrige pas dans ce refactor.

**Étape 4 — Remplacer l'inline.** Dans `page.tsx`, remplacer les 60-150 lignes de la règle par `const result = matchXxx(line, ctx);`. Lancer Vitest, Playwright e2e (`17-stats-compta.spec.ts` notamment), test manuel d'import CSV.

**Étape 5 — Commit + merge.** 1 commit ciblé (`refactor(rapprochement): extract <règle> to lib/rapprochement/matchers`). Push, merge fast-forward dans `main`. La branche reste vivante.

### Phase 2 et 3 — Extraction de composants (4 étapes par composant)

Pas de TDD : la logique métier est déjà couverte par les tests Phase 1 + les Playwright e2e. La validation se fait par run + test manuel.

**Étape 1 — Identifier la surface.** Lister tous les `useState`, fonctions, et variables que le bloc utilise. Identifier les "props" (ce qui vient du `page.tsx` parent) vs le "state local" (ce qui peut migrer dans le composant).

**Étape 2 — Créer le composant.** Nouveau fichier `<XxxTab>.tsx` ou `<XxxPanel>.tsx`, copie du JSX, conversion des dépendances en props et useState locaux. **Aucun changement de logique**.

**Étape 3 — Remplacer dans `page.tsx`.** Remplacer le bloc inline par `<XxxTab {...props} />` ou `{showXxxPanel && <XxxPanel {...props} />}`. Supprimer les états et fonctions devenus inutilisés dans le parent.

**Étape 4 — Validation.** Build (`npm run build`), Playwright e2e, test manuel de la zone (cliquer dans l'onglet, vérifier que tout fonctionne comme avant).

**Commit + merge dans main** comme en Phase 1.

## Setup test framework

Le projet n'a pas de framework de tests unitaires aujourd'hui. Choix : **Vitest**.

**Pourquoi Vitest** : compatible nativement avec Next 15 + React 19 + TS + ESM, zéro config Babel, pas de conflit avec Playwright (qui scanne `tests/`).

**Ce qui est ajouté** :
- `vitest` en `devDependencies`
- `vitest.config.ts` à la racine (pointe sur `src/**/__tests__/**/*.test.ts`)
- Scripts `package.json` : `"test:unit": "vitest run"`, `"test:unit:watch": "vitest"`
- Pas touche aux scripts Playwright ni aux scripts existants.

**Convention** :
- Tests unitaires : `*.test.ts` dans `src/**/__tests__/`
- Tests Playwright : `*.spec.ts` dans `tests/` (inchangé)

Pas de coverage, pas d'intégration CI tant que ce n'est pas explicitement demandé.

## Plan global et ordre

L'ordre Phase 1 → 2 → 3 est important : Phase 1 sécurise la logique métier (la zone à risque) AVANT de toucher l'organisation UI. Une fois le moteur en `/lib`, déplacer un onglet ou un panneau ne peut plus casser une règle de matching.

### Phase 1 — Moteur (9 cycles : setup + 8 extractions)

| # | Cible | Lignes page.tsx | Complexité | Risque | Estimation |
|---|---|---|---|---|---|
| 1 | Setup (branche, Vitest, types.ts) | — | Faible | Faible | ~30 min |
| 2 | Parser CSV CA | 706-790 (~85) | Faible | Faible | ~45 min |
| 3 | Règle 6 — Montant exact | 1359-1383 (~25) | Très faible | Faible | ~30 min |
| 4 | Règle 1 — CB en ligne | 915-972 (~58) | Modérée | Faible | ~1 h |
| 5 | Règle 5 — Espèces | 1309-1358 (~50) | Modérée | Faible | ~1 h |
| 6 | Règle 2 — CB terminal | 973-1040 (~68) | Modérée | Modéré (fix c55c7b5) | ~1.5 h |
| 7 | Règle 3 — Virement / SEPA | 1041-1172 (~132) | Élevée | Modéré | ~2 h |
| 8 | Règle 4 — Chèque | 1173-1308 (~136) | Élevée | Élevé (le plus de fix) | ~2.5 h |
| 9 | `engine.ts` (orchestrateur + helpers) | la boucle restante | Faible | Faible | ~1 h |

**Sous-total Phase 1** : ~10-11 h.

### Phase 2 — Panneaux debug (4 cycles)

| # | Cible | Lignes page.tsx | Estimation |
|---|---|---|---|
| 10 | `<ResetPanel>` | ~ 60-138 | ~30 min |
| 11 | `<DiagPanel>` | ~ 65-138 | ~45 min |
| 12 | `<DepointerCbPanel>` | ~ 91-138 | ~30 min |
| 13 | `<MigrateBlsPanel>` | ~ 139-203 | ~30 min |

**Sous-total Phase 2** : ~2-2.5 h.

### Phase 3 — Onglets (7 cycles)

| # | Cible | Lignes page.tsx | Estimation |
|---|---|---|---|
| 14 | `<JournalTab>` | 1984-2072 (~90) | ~45 min |
| 15 | `<TvaTab>` | 2073-2112 (~40) | ~30 min |
| 16 | `<FecTab>` | 3867-3909 (~45) | ~30 min |
| 17 | `<ExportTab>` | 3910-fin (~50) | ~30 min |
| 18 | `<RapprochementIgnoresTab>` | 3786-3866 (~80) | ~45 min |
| 19 | `<RemiseTab>` | 2113-2928 (~810) | ~2.5 h |
| 20 | `<RapprochementTab>` | 2929-3785 (~860) | ~3 h |

Ordre : commencer par les petits onglets pour roder la méthode, finir par les deux gros (`RemiseTab`, `RapprochementTab`).

**Sous-total Phase 3** : ~7-8 h.

### Total

**Estimation globale** : 19-22 h de travail effectif réparties sur autant de sessions que tu veux. Chaque cycle (cycle = 1 ligne du tableau) finit par un merge dans main → on peut s'arrêter après n'importe quel cycle, l'état n'est jamais à moitié cassé.

## Critères d'acceptation

À l'issue de la Phase 3 :

- `src/lib/rapprochement/` contient parser + 6 matchers + engine + types + 8 fichiers de tests, tous verts.
- `src/app/admin/comptabilite/debug-panels/` contient 4 composants.
- `src/app/admin/comptabilite/tabs/` contient 7 composants.
- `npm run test:unit` passe.
- Les Playwright e2e existants passent toujours sans modification (en particulier `17-stats-compta.spec.ts`).
- `page.tsx` est passé de 4611 lignes à ~1500-2000 lignes : il ne contient plus que chargement Firestore, états globaux, sélecteur d'onglet, dispatch des panneaux debug, et fonctions Firestore (`syncVersementsEspeces`, `saveBankLinesByMonth`, `loadSavedRapprochement`).
- Aucun changement de comportement observable utilisateur n'a été introduit (validé par tests manuels à chaque cycle).

## Risques et mitigation

| Risque | Mitigation |
|---|---|
| Comportement subtil non couvert par les tests de capture (Phase 1) | Étape 0 force un audit branche par branche. Les fix récents servent de checklist : chaque fix doit avoir un test correspondant. |
| Régression UI invisible aux tests (Phase 2-3) | Test manuel obligatoire après chaque extraction d'onglet/panneau. Les Playwright e2e couvrent les flows principaux. |
| Divergence avec `main` pendant un cycle long | Cycles courts (30 min à 3 h max), merge immédiat dans main, rebase au début de chaque nouveau cycle. |
| Régression sur cas réel non testé (Phase 1) | Validation manuelle obligatoire en étape 4 (import CSV réel). |
| Découverte d'un bug existant pendant la capture | On le documente, on ne le corrige pas dans le refactor : commit séparé après merge. |
| Phase 3 plus longue que prévue à cause d'imbrications de state | Plan ordonné : petits onglets en premier (rôdage), gros onglets en dernier (méthode acquise). |
| Vitest ne s'intègre pas bien | Faible (stack standard). Fallback Jest si problème. |

## Hors scope (à traiter dans des chantiers séparés si besoin)

- Hooks dédiés (`useRapprochement`, `useJournal`) — l'état reste passé en props depuis `page.tsx`.
- Refactor des fonctions Firestore (`syncVersementsEspeces`, etc.) en services `src/lib/rapprochement/services/`.
- Tests unitaires des composants UI extraits (Phase 2 et 3).
- Refactor du parser IA (au-delà de son déplacement dans son onglet).
- Refactor des autres "gros" fichiers du projet (`EnrollPanel.tsx`, `paiements/page.tsx`, etc.).
