# Centre Équestre d'Agon-Coutainville — mémoire du projet

Application de gestion du club : planning, inscriptions, espace cavalier, encaissements,
comptabilité. Next.js 15 · React 19 · TypeScript · Firebase (Firestore, Auth, Storage) ·
Vercel · Resend · CAWL-Worldline.

Nicolas est gérant du club, pas développeur. Les explications vont dans ce sens : en
français, sans jargon inutile, en disant ce qui change concrètement pour lui et ce qu'il
doit vérifier de son côté.

## Commandes

```bash
npx tsc --noEmit -p tsconfig.json          # typecheck (pas d'ESLint sur ce projet)
npx tsx tests/unit/<nom>.test.ts           # un test — imprime « ✅ N tests passés », sort 1 si échec
for f in tests/unit/*.test.ts; do npx tsx "$f" >/dev/null || echo "❌ $f"; done   # toute la suite
npx next build --no-lint                   # build complet (~3 min)
```

Le code de sortie compte : `npx tsx … | tail` masque l'échec, toujours vérifier `$?` **avant**
le pipe.

## Branches

- `main` — production, base Firebase `gestion-2026`.
- `test` — préversion, base `gestion-2026-test` (garde-fou `assertBaseDeTest` : refuse toute
  base dont le nom ne contient pas « test »).

**Règle de fusion `test` → `main`, fichier `src/app/admin/comptabilite/fec-utils.ts`** : la
branche `test` porte `compteTvaCollectee()` mais **conserve le bug du numéro d'écriture**
corrigé sur `main` le 17/09/2026. En cas de conflit, **garder la version de `main`** — elle
contient les deux améliorations. Vérifier ensuite que `tests/unit/fec.test.ts` passe.

Modules présents uniquement sur `test` : `justificatifs.ts`, `documents-comptables.ts`,
`plan-comptable-achats.ts`, `bilan-justificatifs.ts`, `import-justificatifs.ts`,
`suppression-justificatifs.ts`, `documents-comptables-pdf.ts`, import Céleris.

## Invariants comptables

Ces règles découlent d'obligations légales, pas de préférences de style. Les casser expose à
un redressement et rend
[`docs/AUTO_ATTESTATION_EDITEUR.md`](docs/AUTO_ATTESTATION_EDITEUR.md) — qui engage la
responsabilité personnelle de Nicolas — inexacte.

1. **Ne jamais effacer une pièce à valeur fiscale en production.** Toute route destructrice
   passe par `filtrerCollectionsEffacables()` de `src/lib/collections-comptables.ts`. Ajouter
   une collection comptable ? L'ajouter aussi à `COLLECTIONS_FISCALES`. Pour une demande RGPD,
   on **anonymise** (`anonymisationComptable()`), on ne supprime pas : l'obligation de
   conservation prime (art. L102 B du LPF, art. 17-3-b du RGPD).

2. **Tout encaissement passe par `createEncaissement()` / `createEncaissementServer()`.**
   Jamais d'`addDoc(collection(db, "encaissements"), …)` en direct : ces helpers posent
   l'empreinte SHA-256 et le chaînage, et une écriture hors chaîne prive le dispositif d'effet.
   Dans une transaction Firestore, utiliser `preparerEncaissementServer()` **avant** d'ouvrir
   la transaction (les lectures doivent y précéder les écritures).

3. **Factures et avoirs prennent leur numéro d'une séquence continue.** `attribuerNumeroFacture()`
   et `attribuerNumeroAvoir()`, jamais une référence fabriquée depuis l'horloge. Réserver le
   numéro **avant** l'opération qu'il documente, et ne jamais en consommer un pour rien.
   Un numéro réservé puis abandonné se trace avec `journaliserNumeroPerdu()` : un trou daté se
   présente à un vérificateur, un trou muet non.

4. **Le FEC : un numéro d'écriture par facture, jamais par ligne.** Chaque écriture doit être
   équilibrée (débit = crédit), sinon le fichier entier est rejeté (art. A.47 A-1 du LPF).

5. **Jamais `|| 5.5` sur un taux de TVA.** 0 est « falsy » en JavaScript : ce repli transforme
   une activité exonérée en activité à 5,5 %. Utiliser `??`, ou `tauxTva()` de
   `src/lib/tva-taux.ts` quand la valeur peut arriver en NaN ou en chaîne.

6. **Dates et années comptables sur `Europe/Paris`.** Le serveur tourne en UTC : sans fuseau
   explicite, une vente du 1er du mois à 00h30 est datée de la veille — donc rattachée à un mois
   déjà clôturé — et une facture du 1er janvier porte l'année précédente.
   Voir `anneeComptable()` (`src/lib/invoice-number.ts`) et `heureParis()` (`src/lib/borne-tableau.ts`).

7. **Un document dit ce qu'il est.** Facture, avoir et proforma ne portent pas le même titre, et
   un proforma annonce qu'il n'est pas une pièce comptable.

## Audits

- [`AUDIT-2026-09-17.md`](AUDIT-2026-09-17.md) — comptabilité et exigences 2026. **Reste ouvert :**
  unicité des clôtures journalières (C5, à faire dès la clôture de septembre terminée), chaînage
  transactionnel (C3), archive annuelle scellée puis attestation au modèle `BOI-LETTRE-000242`
  (C4), mentions obligatoires de facture (C8, attend les taux de Nicolas), TVA à l'encaissement
  (C9, attend Keobiz), Factur-X conforme EN 16931 (C10, échéance 01/09/2027), test de
  restauration (C12).
- [`AUDIT-2026-08-29.md`](AUDIT-2026-08-29.md) — sécurité et chaîne de l'argent.
- [`AUDIT-2026-04-10.md`](AUDIT-2026-04-10.md) — premier passage.

## Échéances réglementaires

| Date | Obligation |
|---|---|
| 21/02/2026 | Attestation d'éditeur rétablie (LF 2026 art. 125, modèle `BOI-LETTRE-000242`) |
| 01/09/2026 | Réception des factures fournisseurs par voie électronique — canal API Expertise ouvert |
| 01/09/2027 | Émission électronique + e-reporting, et 4 nouvelles mentions obligatoires |
