# Procédure de lancement — pas à pas

> Version PDF : `docs/Procedure-lancement.pdf` (régénérable depuis ce document).
> Rédigé le 18 août 2026, à dix jours de l'ouverture.
> Complète `PROCEDURE_BASCULE_PROD.md`, qui reste la référence juridique de la bascule.

## Le principe

Trois choses seulement doivent être vraies le jour de l'ouverture :

1. la base ne contient plus une seule donnée de test ;
2. les emails partent réellement aux familles, et au bon endroit ;
3. les paiements en ligne arrivent sur le vrai compte.

Tout le reste peut être corrigé après. Ces trois-là, non : une facture de test
numérotée au milieu des vraies, un mail parti dans le vide ou un paiement perdu
ne se rattrapent pas proprement.

---

## J-10 à J-5 — préparer

### 1. Vider la base de test (la bascule)

À faire **d'une traite**, dans cet ordre, sans interruption :

> **Fait le 29 août 2026.** L'outil de reset a été supprimé le 30 août 2026
> (voir § 3). Cette section est conservée pour mémoire ; elle n'est plus
> exécutable. La sauvegarde JSON complète reste téléchargeable depuis
> `/admin/import-celeris`.

| # | Action | Où |
|---|---|---|
| 1 | Télécharger la **sauvegarde JSON complète** et la ranger en trois endroits (classeur, disque externe, cloud) | `/admin/import-celeris` |
| 2 | Cocher Financier & comptable + Inscriptions & réservations + Communications. **Laisser Données métier décoché** | ~~`/admin/reset-base`~~ (supprimé) |
| 3 | Cliquer **Simuler**, vérifier les volumes | idem |
| 4 | Cocher l'irréversibilité, taper `SUPPRIMER-DONNEES-TEST`, valider | idem |
| 5 | Noter la référence du log (`resetLogs/…`) sur la note papier | classeur |

### 2. Vérifier que c'est propre

- Tableau de bord → **CA ce mois = 0 €**
- `/admin/paiements` onglet Journal → vide
- `/admin/comptabilite/livre-caisse` → vide
- `/admin/emails-log` → vide
- Familles, équidés, activités, créneaux → **intacts**

### 3. Faire supprimer l'outil de reset — ✅ FAIT le 30 août 2026

Une fois la base vide, l'outil n'a plus aucune raison d'exister — et son
existence est contraire au principe d'inaltérabilité.

`/admin/reset-base` et `/api/admin/reset-base` ont été retirés du code. Les
deux URL renvoient désormais 404. L'export de sauvegarde a été conservé — il
lit, il n'efface rien — et reste accessible depuis `/admin/import-celeris`.

Le log d'audit de l'opération demeure dans la collection Firestore
`resetLogs`, elle-même inaltérable (aucun update ni delete autorisé par les
règles). La trace complète de l'outil, de sa création à sa suppression, reste
vérifiable dans l'historique Git.

### 4. Publier les règles Firestore

Console Firebase → Firestore Database → onglet **Règles** → coller le contenu de
`firestore.rules` → **Publier**. Puis vérifier depuis la console qu'une
suppression manuelle d'un encaissement est bien refusée.

### 5. Mettre l'argent en caisse

`/admin/comptabilite/livre-caisse` → bouton **Apport en caisse**. Saisir ce qui
est réellement dans le tiroir (billets + pièces), origine « Fonds de caisse
initial ». Sans cette écriture, le solde théorique reste à 0 € et chaque
comptage affichera un écart permanent.

---

## J-4 à J-1 — ouvrir les vannes

L'ordre compte : on vérifie avant d'ouvrir, jamais l'inverse.

### 1. Les fiches sans adresse

`/admin/comptes-orphelins` → section **Fiches sans adresse** : elle doit être
**vide** avant l'envoi du mail de pré-inscription. Une famille sans email ne
recevra rien et n'aura aucun moyen de s'en apercevoir.

### 2. Les paiements en ligne

Sur Vercel, vérifier les variables :

- `CAWL_ENV = production`
- `CAWL_WEBHOOK_SECRET` = le **secret du webhook**, pas la clé d'API.
  (Une clé d'API à cette place fait rejeter silencieusement tous les retours de
  paiement : le client paie, la commande reste impayée.)

Puis faire **un vrai paiement d'essai de 1 €** et vérifier qu'il apparaît au
journal. C'est le seul test qui prouve la chaîne complète.

### 3. Le mode email restreint

Tant qu'il est actif, seuls les destinataires de la liste blanche reçoivent
quelque chose. Ordre à respecter :

1. envoyer un mail-témoin à une adresse de la liste, vérifier la réception ;
2. **puis seulement** lever le mode restreint (`settings/email` → `restricted:
   false`, ou variable Vercel `EMAIL_RESTRICTED_MODE = off`) ;
3. envoyer le mail de pré-inscription.

### 4. Rejouer les correctifs

`/admin/tests` → cocher **Correctifs à rejouer**. La liste ne montre alors que
les cas ajoutés après un bug rencontré en conditions réelles (acompte de stage
sur place, encaissement groupé, impayés d'une famille homonyme, forfait à la
quinzaine, saisie de date au clavier, apport en caisse…). Un correctif jamais
rejoué sur la vraie base n'est qu'une intention : la liste doit être vide, ou
au moins ses cas **critiques**.

### 5. Le verrou des réservations

`/admin/parametres` → interrupteur **Réservations en ligne**. Le laisser fermé
jusqu'à ce que tout le reste soit vert, puis l'ouvrir. Fermé, il bloque les
inscriptions, les paiements CB, les avoirs et les bons cadeaux côté famille —
les admins ne sont jamais bloqués.

---

## Jour J — ouvrir

1. Ouvrir les réservations.
2. Envoyer le mail de pré-inscription.
3. Rester devant `/admin/messages-contact` et `/admin/emails-log` la première
   heure : c'est là que se voit un problème d'envoi, pas dans la boîte mail.

---

## Les quinze jours qui suivent

| Quand | Quoi regarder | Où |
|---|---|---|
| Chaque soir | Clôture de la journée | `/admin/comptabilite/cloture-journaliere` |
| Chaque soir | Comptage du tiroir si espèces reçues | `/admin/comptabilite/fond-caisse` |
| Chaque matin | Comptes orphelins créés la veille | `/admin/comptes-orphelins` |
| Chaque matin | Messages du site non traités | `/admin/messages-contact` |
| Une fois par semaine | Sauvegarde reçue par mail (le lundi) | boîte mail |
| Au fil de l'eau | Rapprochement bancaire | `/admin/comptabilite` |

La sauvegarde automatique tourne **tous les soirs à 22 h** vers Firebase
Storage. Seule la **copie par mail** est hebdomadaire, le lundi : recevoir un
seul mail par semaine est normal, ce n'est pas une sauvegarde manquée.

---

## Après le lancement : ce qui change, ce qui ne change pas

**Ce qui devient impossible** — modifier ou supprimer un encaissement, une
facture, une clôture. Toute correction passe par une **contre-passation**
(journal → bouton Corriger) ou par un **avoir**. C'est l'état normal d'un
logiciel de caisse conforme.

**Ce qui reste possible** — corriger les bugs, y compris tous les jours. La loi
exige l'inaltérabilité des **données enregistrées**, pas le gel du **code**. Un
correctif qui change l'affichage, un libellé, un calcul de tarif ou un envoi
d'email ne touche pas aux écritures déjà scellées : il est non seulement permis,
il est attendu. La seule règle : ne jamais réintroduire un outil capable
d'effacer ou de réécrire une écriture passée.

---

## Note de bascule (à remplir à la main, classeur comptable)

```
CENTRE ÉQUESTRE D'AGON-COUTAINVILLE
SIRET : 507 569 184 00017

BASCULE SYSTÈME DE CAISSE
─────────────────────────
Système précédent : Celeris, jusqu'au ______________
Nouveau système  : plateforme Vercel / Firebase — centreequestreagon.com
Mise en production : ______________

☐ Sauvegarde JSON téléchargée le ______________
☐ Reset des données de test le ______________  (resetLogs/______________)
☐ Outil de reset supprimé du code le ______________  (commit ______________)
☐ Règles Firestore publiées le ______________
☐ Fonds de caisse initial saisi le ______________  (______________ €)
☐ Auto-attestation d'éditeur datée et signée

Signature du gérant :

Nicolas Richard
```

Cette note, la sauvegarde JSON et la référence Git du commit de suppression
constituent la preuve de diligence en cas de contrôle.

---

## Le 1er octobre

Brancher le domaine **centreequestreagon.com** sur Vercel. Rien d'autre ne
dépend de cette date.
