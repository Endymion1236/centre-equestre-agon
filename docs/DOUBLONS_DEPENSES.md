# Doublons après réimport de relevés

L'ancien chemin ajouter-lot sans sourceOperation créait un identifiant aléatoire
à chaque import. Il est maintenant refusé : actualiser l'écran et utiliser
l'import avec compte/date/identité fichier-page-rang. Un autre PDF présentant
une opération de même mois/fournisseur/montant/date compatible bloque le lot
pour contrôle, même si l'import précédent a déjà une identité. Cette vérification
prudente n'est pas une déduplication universelle si les libellés diffèrent.

Depuis Justificatifs → Contrôler les doublons de dépenses, choisir un mois puis
comparer les lignes proposées (même fournisseur/montant/mois, comptes et dates
compatibles). Aucune suppression automatique : les vrais paiements récurrents
doivent être vérifiés sur le relevé. Choisir la ligne à conserver puis écarter
l'autre. Sa totalité est copiée dans depenses-doublons-archives dans la même
transaction que son retrait de depenses. Elle disparaît donc des totaux et du
matching, tout en restant restaurable avec son identifiant et ses champs d'origine.
Un journal distinct garde la trace de l'action et de son auteur. Le serveur refuse
d'écarter une ligne liée à un justificatif. Les imports vérifient aussi les
identifiants archivés pour éviter leur réintroduction. Restauration uniquement
si l'identifiant n'existe plus dans les dépenses actives.

Accès admin uniquement, collections protégées par les règles deny-all existantes.
Lecture limitée explicitement par mois ; pas de nettoyage massif silencieux.
Une ancienne dépense compatible sans date empêche aussi le matching automatique.

Tests unitaires des candidats et non-candidats, du matching avec ancien import
sans date et TypeScript. Contrôle en base nécessaire depuis une session admin :
écarter une ligne de test, vérifier les totaux, restaurer et vérifier le retour ;
essayer une ligne déjà liée (refus). Aucun nettoyage réel exécuté depuis l'espace
de développement, qui ne dispose pas d'identifiants Firebase.
