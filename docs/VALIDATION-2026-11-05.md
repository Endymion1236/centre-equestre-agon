# Validation des tests — audit comptable du 5 novembre 2026

Réponse au point 1 du plan de validation de l'audit « Audit comptable et FEC,
mise à jour du 5 novembre 2026 » : exécuter les tests unitaires FEC,
achats/banque, contrôle bancaire, avoirs fournisseurs, remises SEPA et rejets,
et consigner les résultats sur le commit audité.

## Version testée

| | |
|---|---|
| Commit audité | `27a6c6bbbd5778c0f5490af5c1704be34ca14b7a` (branche `main`) |
| Date d'exécution | 5 novembre 2026 |
| Environnement | Node.js 22.22.0, `npx tsx`, sans accès à la base Firebase |
| Intégration continue GitHub | workflow `ci.yml`, exécution n° 1551 sur ce commit : **succès** (Build check compris) — https://github.com/Endymion1236/centre-equestre-agon/actions/runs/42019950085 |

## Résultats

Contrôle de types : `npx tsc --noEmit -p tsconfig.json` → **0 erreur**.

Suite complète : `npm run test:unit` → **219 fichiers de tests sur 219 passés**.

Construction du site : `npx next build --no-lint` → **réussie** (même contenu de code, juste avant le commit).

Détail des fichiers ciblés par l'audit (chaque fichier sort en erreur au premier test en échec) :

| Fichier de test | Module(s) | Ce qui est vérifié | Résultat |
|---|---|---|---|
| `fec.test.ts` | `admin/comptabilite/fec-utils.ts` | En-tête et 18 colonnes, un numéro d'écriture par facture, équilibre, comptes à 8 chiffres, TVA par taux, date de Paris | 15 / 15 |
| `fec-complet.test.ts` | `lib/fec-complet.ts` | Ventes VE, règlements RG, journal OD (contre-passations, numérotation à la suite du RG, équilibre de chaque écriture), comptes de trésorerie, Céleris | 14 / 14 |
| `fec-scenarios.test.ts` | FEC complet | Crash-test : TVA sur les encaissements (acomptes, échéanciers, taux mixtes), modes de paiement, contre-passation, avoir, mois Céleris, 4457x du FEC = TVA de la CA3 | 12 / 12 |
| `fec-achats-banque.test.ts` | `lib/fec-achats-banque.ts` | Journaux HA et BQ, tiers fournisseurs, lettrage, dates de facture invraisemblables, rejets, remises carte, FEC complet VE+RG+OD+HA+BQ structurellement conforme | 18 / 18 |
| `controle-fec.test.ts` | `lib/controle-fec.ts` | Contrôle de structure : ligne coupée, date fausse, libellé vide, écriture déséquilibrée, point décimal refusé, en-tête | 4 / 4 |
| `envoi-comptable.test.ts` | `lib/envoi-comptable-utils.ts` | Périmètre du mois, résumé de l'envoi, FEC incomplet ou mal formé = bloquant | 16 / 16 |
| `controle-banque.test.ts` | `lib/controle-banque.ts` | Rapprochement relevé ↔ 512 (une pour une, regroupements, décalages, remises partielles, doublons du relevé, même nom d'abord, mois Céleris) | 8 / 8 |
| `remise-sepa-controle.test.ts` | `lib/remise-sepa-controle.ts` | Échéances d'une remise absentes, annulées, d'un autre mois ou jour, montant différent | 3 / 3 |
| `rejet-prelevement.test.ts` | `lib/rejet-prelevement.ts` | Rejet à la date du relevé, liaison 58000000 soldée en OD, la banque jamais touchée deux fois | 4 / 4 |
| `remboursement-famille.test.ts` | `lib/remboursement-famille.ts` | Remboursement à une famille : 411 et non 471, pas de double avec le journal | 5 / 5 |
| `avoir-fournisseur.test.ts` | `lib/avoir-fournisseur.ts`, `fec-achats-banque.ts` | Avoir joint : HA (charge et TVA annulées) + BQ lettrés, structure conforme, écart signalé, TVA à retirer de la déductible | 7 / 7 |
| `import-bancaire.test.ts` | `lib/import-bancaire.ts` | Import des débits du relevé, reconnaissance d'un relevé relu, catégories | 31 / 31 |
| `ligne-bancaire-unique.test.ts` | `lib/ligne-bancaire-unique.ts` | Un virement n'encaisse qu'une fois | 3 / 3 |
| `declaration-tva.test.ts` | `lib/declaration-tva.ts` | CA3 en base encaissements et factures, répartition par taux, remboursements, mois Céleris, taux 0 jamais remplacé, déductible 19/20/22 | 17 / 17 |

## Ce que ces résultats ne démontrent pas

Comme l'audit le relève, ces tests portent sur des données construites pour
chaque cas, pas sur la base de production. Restent à faire, hors code :

- **Points 2 et 3 du plan :** exporter septembre et octobre 2026 et rapprocher
  chaque ligne du 512 avec les relevés du Crédit Agricole. C'est en cours avec
  l'outil « Contrôle de banque » (Comptabilité → FEC). Les écarts trouvés sont
  traités mois par mois : GAGNARD et la remise SEPA d'août en septembre, la
  remise SEPA n° 6 et le virement SIMON en octobre, la banque de juillet-août
  tenue dans Céleris.
- **Point 4 :** les factures fournisseurs non réglées ne figurent pas encore
  dans le FEC tant que leur paiement n'est pas au relevé.
- **Points 5 et 6 :** la concordance avec la balance et la déclaration de TVA
  du cabinet, et la validation du FEC annuel, relèvent de l'expert-comptable.
  Question posée au cabinet : le FEC officiel de l'exercice est-il produit
  par son logiciel à partir des FEC mensuels de l'application ?

## Rejouer la vérification

```bash
git checkout 27a6c6bbbd5778c0f5490af5c1704be34ca14b7a
npm ci
npx tsc --noEmit -p tsconfig.json
npm run test:unit            # 219 fichiers ; sort en erreur au premier échec
npx tsx tests/unit/fec-achats-banque.test.ts   # un fichier à la fois
```
