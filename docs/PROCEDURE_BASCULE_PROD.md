# PROCÉDURE DE BASCULE EN PRODUCTION

> **Date de mise en place** : 21 avril 2026
> **Date cible de la bascule** : juin 2026 (ouverture inscriptions) / septembre 2026 (bascule complète)
> **Date butoir de l'outil de reset** : 1er juillet 2026

---

## Contexte

Jusqu'en août 2026, la comptabilité officielle du Centre Équestre d'Agon-Coutainville est tenue sur **Celeris**. La base Firebase de la nouvelle plateforme est utilisée en parallèle pour :
- Tester le système en conditions réelles
- Former le personnel
- Préparer la migration

En **septembre 2026**, la plateforme Vercel devient l'outil de comptabilité officielle. À partir de ce moment, **aucune réinitialisation ne doit plus être possible**. C'est une exigence de la loi anti-fraude TVA 2018 et de l'auto-attestation d'éditeur signée (voir `AUTO_ATTESTATION_EDITEUR.md`).

---

## Procédure en 5 étapes

### Étape 1 — Pré-bascule (mi-juin 2026)

**Objectif** : préparer la base pour partir propre.

**Actions côté Nicolas** :

1. Se connecter à l'interface admin
2. Aller sur `/admin/reset-base` (URL directe, page non-listée dans la sidebar)
3. Cliquer sur "**Télécharger la sauvegarde JSON complète**"
4. **Conserver ce fichier dans un endroit sûr** (idéalement : classeur comptable papier + disque dur externe + cloud personnel type Google Drive)
5. Cocher les collections à effacer :
   - ✅ **Financier & comptable** (tout)
   - ✅ **Inscriptions & réservations** (tout)
   - ✅ **Communications** (tout)
   - ❌ **Données métier** (à laisser décoché la première fois, on peut toujours le faire ensuite)
6. Cliquer sur "**Simuler**" pour voir les volumes attendus
7. Si OK : cocher la case d'irréversibilité, taper `SUPPRIMER-DONNEES-TEST` et valider

**Résultat attendu** : la base ne contient plus que la configuration, les familles, le catalogue, les équidés, les créneaux futurs.

---

### Étape 2 — Vérification (mi-juin 2026)

1. Aller sur le dashboard : vérifier que `CA ce mois = 0€`
2. Aller sur `/admin/paiements/journal` : doit être vide
3. Aller sur `/admin/comptabilite/livre-caisse` : doit être vide
4. Aller sur `/admin/emails-log` : doit être vide
5. Vérifier que les familles, équidés et activités sont intacts

---

### Étape 3 — Suppression de l'outil (fin juin 2026)

**⚠️ CRITIQUE — À faire après utilisation de l'outil, avant la vraie mise en prod.**

Cette étape garantit qu'**aucune réinitialisation ne pourra plus être déclenchée** à partir de la mise en production officielle. C'est ce qui transforme une "phase de test" en "production conforme".

**Actions côté dev (moi, Claude)** :

Dans la prochaine session, il suffira de dire : *"Supprime l'outil de reset-base"*

Je supprimerai alors :
- `src/app/admin/reset-base/page.tsx` (page UI)
- `src/app/api/admin/reset-base/route.ts` (API suppression)
- `src/app/api/admin/backup-json/route.ts` (API sauvegarde — ou à garder si on veut pouvoir continuer à exporter des backups lisibles, c'est pas la même chose qu'un reset)

Je ferai un commit clair avec un message type :
```
chore(compta): retirer l'outil de reset-base après usage unique pré-prod

L'outil /admin/reset-base a été utilisé une seule fois le [DATE] pour
vider les données de test avant la mise en production officielle.
Sauvegarde JSON conservée par Nicolas.

Cet outil n'ayant plus aucune utilité en production et étant contraire
aux principes d'inaltérabilité NF525, il est supprimé définitivement du
code. Sa trace reste visible dans l'historique Git pour démontrer, en
cas de contrôle fiscal, qu'il n'existait plus au moment de la bascule
prod.

Références :
- Commit de création : 37295e1
- Commit de suppression : [ce commit]
- Trace d'usage : resetLogs/[id] dans Firestore
```

**Note importante** : l'outil de sauvegarde (`backup-json`) peut être gardé si tu veux pouvoir télécharger des exports ponctuels pour ton expert-comptable. Il ne permet PAS de supprimer quoi que ce soit, juste de lire.

---

### Étape 4 — Déploiement des règles Firestore (si pas encore fait)

Actions côté Nicolas :

- Console Firebase → Firestore Database → onglet **Règles** → copier/coller le contenu de `firestore.rules` → **Publier**
- OU depuis son PC : `firebase deploy --only firestore:rules`

Vérifier via la console Firebase que la tentative de supprimer un encaissement (test manuel) est bien refusée.

---

### Étape 5 — Documenter la bascule

Créer une **note papier** dans le classeur comptable :

```
CENTRE ÉQUESTRE D'AGON-COUTAINVILLE
SIRET : 507 569 184 00017

BASCULE SYSTÈME DE CAISSE
─────────────────────────

Date de bascule : ___________________________

Système précédent : Celeris (jusqu'au ___________)

Nouveau système : Plateforme Vercel / Firebase
URL : centreequestreagon.com
Mise en production : ___________________________

Procédure suivie :
☐ Sauvegarde JSON téléchargée le ___________
☐ Reset des données de test effectué le ___________
  Référence log : resetLogs/___________
☐ Outil de reset supprimé du code le ___________
  Référence commit Git : ___________
☐ Règles Firestore déployées le ___________
☐ Auto-attestation d'éditeur datée et signée
  (voir docs/AUTO_ATTESTATION_EDITEUR.md)

Signature du gérant :


Nicolas Richard
```

Cette note + le fichier de sauvegarde JSON + la référence Git du commit de suppression constituent la **preuve de diligence** en cas de contrôle fiscal.

---

## Défense en cas de contrôle fiscal

Si un inspecteur pose la question : *"Pourquoi avez-vous eu un outil permettant d'effacer l'historique comptable ?"*

**Réponse à lui donner** :

> "Cet outil a existé **uniquement pendant la phase de tests** de la plateforme, en parallèle de notre logiciel de comptabilité officiel **Celeris** (utilisé jusqu'en août 2026). Il a été utilisé **une seule fois**, le [date], pour partir sur une base propre avant la mise en production officielle. Sa trace complète figure dans l'historique Git du projet, depuis le commit de création (21 avril 2026) jusqu'au commit de suppression ([date]). La preuve de suppression définitive est vérifiable dans le code source actuel : ni la page `/admin/reset-base`, ni la route API correspondante, ni la route de backup n'existent plus. De plus, la date butoir inscrite dans le code (1er juillet 2026) constituait une deuxième protection. Enfin, le log d'audit de l'opération reste consultable dans la collection Firestore `resetLogs`, qui est elle-même inaltérable (règles Firestore : aucun update ni delete possible)."

Pièces à fournir si demandé :
- Export des `resetLogs` (via `/admin/emails-log` ou export Firestore admin)
- Historique Git (via GitHub)
- Sauvegarde JSON de pré-reset (disque dur personnel du gérant)
- Auto-attestation d'éditeur datée et signée

---

## Ce qui ne doit PLUS exister après la bascule prod

Checklist de vérification post-bascule (à faire fin septembre 2026) :

- [ ] Page `/admin/reset-base` → doit renvoyer 404
- [ ] Route `/api/admin/reset-base` → doit renvoyer 404
- [ ] Route `/api/admin/backup-json` → peut rester si utile, ou supprimée
- [ ] Aucune fonction `deleteDoc` sur la collection `encaissements` nulle part dans le code
- [ ] Règles Firestore publiées et testées
- [ ] Auto-attestation d'éditeur signée et archivée
- [ ] Note de bascule complétée dans le classeur

---

## Maintenance après la bascule

À partir de septembre 2026, toutes les corrections comptables passent **uniquement** par :

1. **Contre-passation** via `/admin/paiements/journal` → bouton "Corriger"
2. **Annulation de commande** avec création d'avoir

Aucune modification ou suppression directe n'est possible, ni techniquement ni humainement. C'est l'état de conformité normal d'un logiciel de caisse.

En cas de doute ou de besoin particulier : **en parler d'abord à l'expert-comptable** avant toute action technique.
