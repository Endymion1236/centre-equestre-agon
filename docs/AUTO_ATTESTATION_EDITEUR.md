# AUTO-ATTESTATION D'ÉDITEUR

## Conformité à l'article 286-I-3° bis du Code Général des Impôts (loi anti-fraude TVA 2018)

---

### Identification

**Raison sociale :** EARL Centre Équestre Poney Club d'Agon-Coutainville
**SIRET :** 507 569 184 00017
**N° TVA intracommunautaire :** FR12507569184
**Adresse :** 56 Charrière du Commerce — 50230 Agon-Coutainville
**Représentée par :** Nicolas Richard, gérant

### Logiciel concerné

**Nom :** Plateforme de gestion du Centre Équestre d'Agon-Coutainville
**Nature :** logiciel de gestion intégrée auto-développé incluant module de caisse/encaissement
**Usage :** usage exclusivement interne au Centre Équestre (ni commercialisé ni distribué à des tiers)
**Technologies :** Next.js 15 / React 19 / TypeScript / Firebase (Firestore + Authentication + Storage)
**Hébergement :** Vercel (frontend/API) + Google Cloud / Firebase (base de données et authentification)
**URL :** centre-equestre-agon.vercel.app (migration vers centreequestreagon.com prévue en septembre 2026)

---

## Déclaration de conformité

Je soussigné **Nicolas Richard**, gérant de l'EARL Centre Équestre Poney Club d'Agon-Coutainville et développeur/propriétaire du logiciel décrit ci-dessus, atteste sur l'honneur que ce logiciel respecte les quatre principes d'**inaltérabilité, sécurisation, conservation et archivage** (principes « ISCA ») des opérations d'encaissement, conformément à l'article 286-I-3° bis du Code Général des Impôts.

### 1. INALTÉRABILITÉ

Les écritures d'encaissement sont protégées contre toute modification ou suppression après leur enregistrement par les mécanismes suivants :

- **Règles de sécurité Firestore** : la collection `encaissements` dispose de règles qui interdisent toute opération `delete`, quel que soit le rôle de l'utilisateur (y compris l'admin). Les opérations `update` sont également interdites à l'exception d'une unique exception ciblée : le champ `remiseId` (métadonnée de rapprochement bancaire, sans valeur comptable) peut être modifié pour permettre le cochage/décochage d'encaissements dans les bordereaux de remise en banque. Aucun autre champ (montant, mode de paiement, date, famille, activité, raison, correctionDe, hash…) ne peut être modifié une fois l'écriture créée.

- **Mécanisme de correction par contre-passation** : les corrections éventuelles d'une écriture erronée se font exclusivement par création d'une **nouvelle** écriture de sens contraire (montant négatif, champ `correctionDe` pointant vers l'écriture originale), puis éventuellement une nouvelle écriture correcte. Les deux/trois écritures coexistent de manière permanente dans le journal, garantissant une piste d'audit complète. L'écriture originale n'est jamais altérée.

- **Hash SHA-256 individuel** : chaque encaissement est signé au moment de sa création par un hash cryptographique SHA-256 qui inclut tous les champs comptables critiques (montant, mode, date, famille, activité, etc.).

- **Chaînage des signatures** (type blockchain léger) : chaque hash d'encaissement inclut également le hash de l'encaissement précédent. Toute tentative de modification rétroactive d'un encaissement en base romprait la chaîne des signatures à partir de ce point et rendrait la fraude détectable par simple vérification automatisée.

- **Clôture journalière scellée** (ticket Z de caisse) : à la fin de chaque journée (ou de manière différée), l'utilisateur peut effectuer une « clôture Z » qui scelle définitivement l'ensemble des encaissements du jour. Cette clôture porte un numéro séquentiel (Z0001, Z0002…), stocke les hashs de tous les encaissements inclus, contient un hash global SHA-256 de la clôture elle-même, et est chaînée à la clôture précédente. Les clôtures sont elles-mêmes inaltérables (règles Firestore : aucun `update` ni `delete` autorisé).

### 2. SÉCURISATION

- **Authentification** : Firebase Authentication avec authentification forte. Accès à la gestion (admin) réservé aux comptes disposant du custom claim `admin`. Accès terrain (moniteurs) réservé aux comptes disposant du custom claim `moniteur`. Les moniteurs n'ont pas accès à la création/lecture des encaissements.

- **Isolation des rôles** : règles Firestore déclaratives vérifiant systématiquement l'identité et le rôle via `request.auth.token`. Toute requête non autorisée est rejetée au niveau de la base de données, indépendamment de l'application.

- **HTTPS obligatoire** : l'application n'est accessible qu'en HTTPS (chiffrement TLS 1.2+). Les communications entre le navigateur et les serveurs ne peuvent pas être interceptées ou modifiées en transit.

- **Logs serveur** : chaque écriture d'encaissement est horodatée précisément par Firebase via `serverTimestamp()`, non modifiable côté client. Le champ `dateIso` stocke également la date en ISO 8601 pour vérification ultérieure du hash.

- **Traçabilité** : chaque clôture enregistre l'UID et l'email du compte admin qui l'a effectuée. Les corrections (contre-passations) enregistrent une raison textuelle obligatoire et un lien (`correctionDe`) vers l'écriture d'origine.

### 3. CONSERVATION

- **Durée** : toutes les données comptables sont conservées pour une durée minimale de **six (6) ans** à compter de leur enregistrement, conformément à l'article L102B du Livre des Procédures Fiscales et à l'article 286-I-3° bis du CGI. La durée effective de conservation est supérieure à cette obligation légale : les données restent en base tant que le centre équestre est en activité.

- **Support** : stockage sur Firestore, base de données NoSQL managée par Google Cloud Platform, avec réplication multi-zone automatique au sein de l'Union Européenne (région `europe-west`), garantissant l'intégrité et la disponibilité des données.

- **Sauvegardes** : Firebase effectue des sauvegardes point-in-time automatiques permettant une restauration jusqu'à 7 jours en arrière en cas de sinistre (sauvegardes gérées par Google Cloud, rétention standard).

- **Export comptable** : le logiciel dispose d'un export au format FEC (Fichier des Écritures Comptables, format officiel NF Z42-013) disponible depuis la page Comptabilité, pour transmission à l'expert-comptable ou à l'administration fiscale en cas de contrôle.

### 4. ARCHIVAGE

- **Livre de caisse espèces** : journal chronologique dédié aux mouvements d'espèces, consultable par mois, avec solde cumulé, totaux mensuels, solde d'ouverture reporté automatiquement du mois précédent. Il est imprimable et exportable au format PDF à tout moment, avec mentions légales complètes (raison sociale, SIRET, TVA intra, période, signature du gérant).

- **Clôture journalière (ticket Z)** : chaque journée peut faire l'objet d'une clôture séquentielle imprimable, scellée cryptographiquement (hash SHA-256), constituant l'archive officielle de la journée comptable.

- **Fond de caisse physique** : l'historique des comptages physiques de caisse (billets + pièces comparés au solde théorique) est également archivé de manière inaltérable, avec motif obligatoire en cas d'écart.

- **Export FEC** : format standardisé NF Z42-013 pour archivage long terme et transmission à l'administration.

---

## Limites et réserves explicites

En qualité d'auto-éditeur, je déclare avec transparence les points suivants :

1. **Absence de certification externe** : ce logiciel n'est **pas certifié NF525** par un organisme tiers (LNE, Infocert). Il s'agit d'une auto-attestation basée sur les principes ISCA. En cas de contrôle fiscal, un inspecteur pourrait considérer la certification externe comme un élément de preuve supplémentaire.

2. **Auto-développement** : le logiciel est développé par le gérant lui-même avec l'assistance d'outils d'intelligence artificielle (principalement Claude d'Anthropic). Les choix techniques sont documentés dans le code source versionné (Git) et les commits incluent des explications détaillées des décisions de conformité.

3. **Bypass par l'admin SDK** : les règles Firestore sont contournables par le Firebase Admin SDK utilisé dans les routes API server-side (webhooks CAWL, traitement des paiements en ligne). Ces routes sont néanmoins restreintes à des cas d'usage précis et passent obligatoirement par le helper `createEncaissementServer` qui applique les mêmes règles de hashing/chaînage que la version client.

4. **Horodatage** : l'horodatage exact (`serverTimestamp`) est assuré par Firebase Cloud et non par l'horloge locale de l'utilisateur. Il n'est donc pas manipulable côté client, mais il repose sur la synchronisation NTP de Google Cloud (précision milliseconde).

---

## Contrôle et vérification

En cas de contrôle fiscal, les éléments suivants peuvent être fournis à l'administration :

- Le **code source complet** du logiciel (via GitHub ou export ZIP)
- Les **règles de sécurité Firestore** actives au moment du contrôle (console Firebase)
- Un **export FEC** de la période contrôlée
- Le **livre de caisse espèces** imprimé pour la période
- L'**historique des clôtures journalières** avec leurs hashs, permettant une vérification cryptographique de l'absence de modification rétroactive
- Les **logs d'audit Firebase** (modifications, créations, identité des utilisateurs)

Un utilitaire de vérification d'intégrité (`verifyEncaissementHash`) est disponible pour recalculer les hashs à partir des données en base et confirmer l'absence d'altération.

---

## Validité et engagement

La présente attestation engage la responsabilité du déclarant pour la période comptable couverte par le logiciel décrit.

Elle est valable **du 21 avril 2026** (date de mise en place des mécanismes de conformité : verrouillage Firestore, livre de caisse, clôture journalière, fond de caisse, hash chaîné) **jusqu'à modification substantielle du logiciel**.

Toute modification substantielle des mécanismes de conformité (notamment des règles Firestore ou du système de hashing) fera l'objet d'une mise à jour de cette attestation.

---

Fait à Agon-Coutainville, le _____________________

Nicolas Richard
Gérant de l'EARL Centre Équestre Poney Club d'Agon-Coutainville

*Signature :*




---

## Annexe technique : mécanisme de hashing

### Algorithme

**SHA-256** (Secure Hash Algorithm 256 bits), hash cryptographique standard, produisant un digest hexadécimal de 64 caractères.

### Champs inclus dans le hash d'un encaissement

Dans l'ordre déterministe suivant, joints par le séparateur `|` :

1. `paymentId` (référence de la commande)
2. `familyId` (identifiant famille)
3. `familyName` (nom de famille)
4. `montant` (formaté à 2 décimales, ex: `45.00`)
5. `mode` (cb_terminal, especes, cheque, virement…)
6. `modeLabel` (libellé humain du mode)
7. `ref` (référence chèque, virement, etc.)
8. `activityTitle` (libellé de la prestation)
9. `raison` (motif éventuel, ex: correction)
10. `correctionDe` (ID de l'écriture corrigée, si applicable)
11. `dateIso` (date en ISO 8601)
12. `previousHash` (hash de l'encaissement précédent — chaînage)

### Exemple

Pour un encaissement de 45€ en espèces :

```
Payload : "PAY123|FAM456|Durand|45.00|especes|Espèces||Stage Pâques|||2026-04-21T10:15:30.000Z|abc123…"
Hash    : "a1b2c3d4e5f6…" (64 caractères hexadécimaux)
```

### Vérification

Pour vérifier l'intégrité d'un encaissement donné, il suffit de :

1. Lire les champs de l'encaissement en base
2. Recalculer le SHA-256 du payload selon la formule ci-dessus
3. Comparer avec le champ `hash` stocké
4. Si les deux diffèrent → modification détectée → la piste d'audit est compromise

Pour vérifier l'intégrité de la chaîne complète, on remonte récursivement le `previousHash` de chaque encaissement jusqu'au premier, en vérifiant à chaque étape la cohérence.

---

## Annexe : collections Firestore verrouillées

| Collection | `read` | `create` | `update` | `delete` |
|-----------|--------|----------|----------|----------|
| `encaissements` | admin | staff | admin sur `remiseId` uniquement | **INTERDIT** |
| `cloturesJournalieres` | admin | admin | **INTERDIT** | **INTERDIT** |
| `fondsDeCaisse` | admin | admin | **INTERDIT** | **INTERDIT** |

*Dernière révision : 21 avril 2026*
