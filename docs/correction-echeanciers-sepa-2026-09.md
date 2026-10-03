# Audit et correction des échéanciers SEPA (septembre 2026)

Le calcul `Date.setMonth` depuis un jour 29, 30 ou 31 peut sauter février : le 30 septembre 2026, le rang 6 a été enregistré le **2 mars 2027** au lieu du **28 février 2027**. Les autres mois conservent le jour 30. La correction du code concerne les créations futures ; elle ne change aucun document déjà enregistré.

## Identifier les lignes en production

1. Télécharger un export intégral via l'outil admin `/api/admin/backup-json` et le conserver dans un endroit protégé. Ne pas le committer : il contient des données bancaires et personnelles.
2. Exécuter `node --import tsx scripts/audit-echeanciers-sepa.ts /chemin/backup.json > /chemin/audit-sepa.json` (ou `npx tsx ...` dans un environnement qui l'autorise).
3. Examiner `correctionProposee` (identifiant Firestore, famille, mandat, rang, ancien/nouveau jour), `conserverSansModification` et `revueManuelle`. L'outil ne sélectionne que les séries complètes avec rangs, `paymentId` ou `orderId`, et une date correspondant exactement au débordement historique. Les échéanciers saisis directement depuis l'écran des mandats peuvent ne porter ni rang ni identifiant de série : les rapprocher manuellement avec la création et le mandat, sans présumer leur date voulue. Contrôler aussi les paiements échelonnés hors SEPA issus du panneau d'inscription.
4. Recouper les lignes candidates avec les pré-notifications envoyées le 26 septembre, les éventuels décalages demandés par les familles et les remises existantes. Le rapport indique si la commande liée porte une date de pré-notification, mais les emails liés à un mandat peuvent être journalisés séparément.

## Procédure de correction réversible proposée

- Sauvegarder la version courante de chaque document avant toute écriture (id, ancienne `dateEcheance`, `status`, `remiseId`, `paymentId`, `orderId`, date de lecture). Faire valider les nouvelles dates et prévenir à nouveau les familles dont la pré-notification contient l'ancienne date, avant toute remise sur la date corrigée.
- Ne modifier que `dateEcheance` pour les documents encore `pending`, sans `remiseId` et après vérification qu'aucune opération bancaire n'a été créée. Pour chaque document, utiliser une transaction Firestore qui relit sa version et compare tous ces champs, ainsi que l'ancienne date, au rapport approuvé ; abandonner si une valeur a changé depuis l'audit. Ne jamais écrire sur une échéance `remis`, `preleve`, `rejete` ou liée à une remise, même si le statut paraît incohérent.
- Conserver un manifeste privé des changements effectués. Pour annuler, faire une seconde transaction avec les mêmes gardes, exigeant la nouvelle date et le statut `pending` sans remise ; restaurer alors l'ancienne date. Si une remise ou un prélèvement est intervenu entre-temps, arrêter et traiter le cas manuellement, sans réécrire son historique.
- Ne pas relancer la création de l'échéancier : cela produirait de nouveaux documents et pourrait doubler les prélèvements. Après correction, revoir les pré-notifications et vérifier les échéances par famille et mandat dans l'écran SEPA.

Le rapport est un **inventaire de candidats**, pas une autorisation d'écriture automatique : une date reportée volontairement peut ressembler au débordement. Aucun accès aux données de production n'est fourni dans cette PR ; les identifiants précis seront ceux de l'export au moment de l'audit.
