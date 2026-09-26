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

## Flux de travail d'une session

- La session travaille sur sa branche, puis avance `main` en fast-forward (`git checkout main && git reset --hard origin/main && git merge --ff-only <branche> && git push origin main`). Si `main` a bougé entre-temps : `git rebase origin/main` sur la branche d'abord. Nicolas demande en général que tout finisse sur `main` ; le confirmer une fois en début de session, et demander si le sujet relève plutôt de `test`.
- `npm run test:unit` lance toute la suite (`scripts/run-unit-tests.mjs`) et sort 1 au premier échec : équivalent de la boucle ci-dessus.
- `firestore.rules` ne part pas avec le site : déploiement Firebase séparé. Le dire à chaque modification.
- Vercel déploie `main` automatiquement en deux ou trois minutes : prévenir Nicolas qu'un test « en vrai » attend ce délai.
- Un commit par sujet, message en français : le problème tel que Nicolas l'a vu, puis ce qui change. Aucun identifiant de modèle dans les commits.

## Conventions de code (issues de la refonte de septembre 2026)

- **Logique pure dans un module à part, testée seule.** Un écran ne calcule pas, il appelle `xxx-utils.ts` (`depenses-utils`, `resultat-utils`, `facturx-depot-utils`, `enroll-panel-utils`, `lib/cartes-seances`…). Toute nouvelle règle métier : un module pur + un test dans `tests/unit` (format maison `test(nom, fn)` + `assert`).
- **Actions avec effets = contexte explicite + rappels.** Une action qui parle à Firestore ou au serveur reçoit `(ctx, rappels, ...args)` : tout ce qu'elle lit arrive par `ctx`, tout ce qu'elle change à l'écran passe par `rappels`. Modèles : `planning/inscription-actions.ts`, `planning/inscrire-depuis-panneau.ts`, `planning/enroll-panel-actions.ts`, `espace-cavalier/reserver/panier-ajout.ts` et `panier-paiement.ts`.
- **Sortir un bloc d'un gros écran = déplacement à l'identique.** Comparer les lignes retirées aux lignes des nouveaux modules : seules les en-têtes doivent différer. Garder dans l'écran des enveloppes aux mêmes noms, pour ne pas toucher le JSX.
- Composants React déclarés au niveau module, jamais dans un autre composant (perte du focus à chaque rendu).
- Textes contractuels et consignes écrits une seule fois : `lib/cgv-clauses.ts` (clauses d'annulation, consigne d'arrivée des balades 30 min avant). Emails : habillage dans `lib/email-templates.ts`, gabarits modifiables par l'admin dans `lib/email-templates-defauts.ts`, chargés par `loadTemplate(clé, variables, supplément)`.
- Coordonnées du club : `lib/club-info.ts` (défauts + réglages Firestore `settings/centre`). Email de contact `ceagon50@gmail.com` partout ; l'ancienne adresse orange.fr est bannie, y compris des listes d'administrateurs.
- Lire des extraits ciblés des gros fichiers (`sed -n a,bp`, `grep -n`), jamais le fichier entier.

## Où sont les choses

| Sujet | Fichiers |
|---|---|
| Planning admin et inscription | `src/app/admin/planning/` — `EnrollPanel.tsx` (panneau, 2 300 lignes, surtout du JSX), `inscrire-depuis-panneau.ts` (l'inscription elle-même), `enroll-panel-actions.ts`, `enroll-panel-utils.ts` |
| Réservation en ligne (familles) | `src/app/espace-cavalier/reserver/` — `page.tsx` (affichage), `panier-ajout.ts`, `panier-paiement.ts`, `ModalePanier.tsx`, `types.ts` |
| Serveur d'inscription | `src/app/api/enroll/route.ts` — vérifie enfant↔famille, capacité, forfait, carte de séances ; une famille ne pose qu'une place tenue, sauf carte valide |
| Paiements et caisse | `src/app/admin/paiements/` — un fichier par onglet (`TabImpayes`, `TabHistorique`, `TabFacturX`…), utils à côté ; `PaiementsClient.tsx` porte encore les modales |
| Facturation électronique 2026-2027 | `lib/facturx.ts` (XML EN 16931, `estCompteProfessionnel`, `sirenDepuisFiche`), `lib/facturx-pdf.ts`, routes `api/admin/facturx*`, onglet Factur-X = dépôts sur la Plateforme Agréée (Cecurity, via le cabinet). Facture pro émise avant paiement : `attribuer-numero-facture` avec `dueDate` |
| Cartes de séances | `lib/cartes-seances.ts` (quelle carte couvre quel créneau), vente dans `admin/cartes`, décompte au montoir |
| Promenades : niveau et sécurité | `lib/promenades-securite.ts` (règles), `lib/promenade-niveau.ts` (niveau d'un créneau, niveaux admissibles ou atteignables d'un cavalier) |
| Assistant de la boîte mail | `api/admin/inbox-assistant/route.ts` : passe légère Haiku (dates + cavaliers décrits dans le mail), disponibilités `lib/dispo.ts`, promenades inaccessibles retirées côté serveur, réponse Sonnet 5 en JSON strict (réflexion coupée : elle mangeait le budget de sortie), revalidation serveur des suggestions. Périodes de vacances nommées : `lib/periode-vacances.ts` |
| Comptabilité de pilotage | `admin/comptabilite/` — `depenses` (doublons de relevé : garde-fou dans `api/admin/depenses`), `resultat` (CA caisse + CA repris de Celeris), `tresorerie` |
| TVA | `lib/tva-a-payer.ts` (encart du trimestre, base factures), `lib/declaration-tva.ts` (CA3 case par case, bases encaissements **et** factures tant que le cabinet n'a pas tranché — audit C9), route `api/admin/tva/declaration`, écran `admin/comptabilite/PreparationDeclarationTva.tsx` |
| Emails : remise | `lib/resend-webhook.ts` (signature Svix, lecture des événements), `lib/statut-email.ts`, route `api/webhooks/resend` (secret `RESEND_WEBHOOK_SECRET`) : statut de remise sur `emailsSent` et `payment-links`, `alerteEmail` sur la commande quand un email est rejeté |
| Temps de travail salariés | `lib/temps-travail.ts` : de la première tâche à la dernière, **seules les tâches « pause » sont déduites** (un battement non saisi est travaillé, règle de Nicolas du 26/09/2026) ; battement de plus d'1 h sans pause signalé (fiche horaire, cartes du planning). Fiche : `plagesFicheHoraire`, le midi imprimé est la pause saisie |
| SEPA | `admin/sepa/page.tsx`, échéances `echeances-sepa`, pré-notification `api/admin/sepa-prenotification` (mode `apercu`, à vérifier avant envoi : `components/admin/BandeauPrenotificationSepa.tsx`) |
| Accès admin | `lib/admin-emails.ts` (repli par email ; l'autorité est le claim `admin`), `firestore.rules` garde sa propre copie de la liste |

## Fichiers encore gros, à découper au fil de l'eau

`admin/planning/EnrollPanel.tsx` (formulaire annuel ≈ 700 lignes de JSX), `admin/management/TabPlanning.tsx`, `admin/paiements/PaiementsClient.tsx` (modales), `espace-cavalier/inscription-annuelle/page.tsx`, `admin/montoir/page.tsx`, `admin/forfaits/page.tsx`, `admin/sepa/page.tsx`. Règle : quand une évolution touche un bloc, on le sort à ce moment-là, à l'identique, avec ses tests — pas de grand découpage à froid.

## Pièges connus

- `Confirm` (`components/ui/Confirm.tsx`) prend `{ titre, details, libelleConfirmer, danger }` ; `useToast()` renvoie `{ toast }` avec `(message, type, durée)`.
- Les modèles Anthropic à réflexion (Sonnet 5, Opus 5) comptent la réflexion dans `max_tokens` : pour une sortie JSON, couper la réflexion (`thinking: { type: "disabled" }`) ou élargir largement le budget.
- Côté serveur, dates de créneaux et de commandes en heure de Paris (`toParisDateString()`, `lib/date-local.ts`), jamais l'heure du serveur.
