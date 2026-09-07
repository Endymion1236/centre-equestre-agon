# Doublons après réimport de relevés

## Nettoyage par lot

L'écran propose désormais un aperçu avec paires conserver/écarter et montant
en centimes retiré des totaux. Seuls les groupes de deux lignes compatibles,
deux noms de copies du même PDF (suffixe de téléchargement `(2)` ignoré), dont
une seule est datée, sont proposés. Une association sur la ligne sans date ou
un compte connu qui serait perdu exclut la paire. Aucun choix sur les groupes
de trois occurrences ou plus ; les cas ambigus restent individuels.

Une seule validation pour jusqu'à 150 paires : lecture transactionnelle de toutes
les dépenses du mois et des liens/pièces, comparaison de l'empreinte de l'aperçu,
puis archivage/retrait atomique. Si l'état a changé, aucun retrait. Un journal de
lot sert aussi de reçu idempotent en cas de nouvelle tentative réseau. Les lignes
écartées restent restaurables individuellement depuis le même écran. Au-delà de
2 000 dépenses mensuelles ou de 2 000 pièces/liens, lot indisponible explicitement.
Les tests couvrent le cas réel daté/non daté, les noms de relevés et l'exclusion
des paiements répétés, associations et comptes qui seraient perdus.

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
