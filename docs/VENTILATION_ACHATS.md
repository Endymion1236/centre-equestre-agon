# Ventilation des achats sur test

Le tableau Dépenses affiche un compte d'imputation proposé sous la catégorie.
Le filtre « Comptes à ventiler » rassemble les lignes dont le compte, le
fournisseur ou la banque reste inconnu, ainsi que les doublons probables.
Ces propositions ne modifient ni les opérations enregistrées, ni les catégories,
ni les montants. Elles doivent être vérifiées avant comptabilisation.

Le bouton « CSV ventilation comptable » et le colis mensuel utilisent le même
générateur. Le fichier `ventilation_achats_AAAA-MM.csv` comprend les débits actifs,
y compris les salaires, avances FFE et dépenses personnelles. Il distingue :

- le compte d'imputation proposé et l'origine de la proposition ;
- le compte fournisseur reconnu, quand il s'agit d'un achat ;
- le nom du compte bancaire source et son numéro comptable proposé ;
- les points restant à ventiler et les références de l'opération et de la pièce.

Les lignes exclues et les montants nuls, négatifs ou invalides n'y figurent pas.
Un compte bancaire ou fournisseur inconnu reste vide. Une échéance d'emprunt
reste à ventiler entre capital et intérêts. La qualification personnelle ou
avance FFE prime sur les mots-clés. Les comptes FFE club et compétition sont
distincts. L'envoi mensuel est refusé si le tableau n'a pas pu être chargé
entièrement, pour éviter un colis partiel silencieux.

## TVA des paiements fractionnés

La TVA totale de la facture reste visible dans les exports, avec la mention
« non cumulable ». Elle n'est plus additionnée à chaque échéance. Une facture
associée à plusieurs paiements, une échéance même seule dans le mois, un écart
de règlement ou un paiement EUR différent du TTC reste à vérifier, hors total
automatique. Les statuts « sans TVA » et « non récupérée » restent prioritaires.
Les dépenses personnelles, exclusions et avances FFE ne créent pas de TVA
automatique. Le total affiché concerne la TVA documentée des paiements uniques ;
il ne valide pas le droit ni la période de déduction.

Ce choix évite d'inventer une règle de prorata ou de déduction intégrale à partir
du seul débit bancaire : le régime d'exigibilité et la période de déduction ne
sont pas encore enregistrés. Référence :
[conditions de déduction de la TVA](https://www.impots.gouv.fr/professionnel/questions/comment-deduire-la-tva-sur-mes-achats).

Exemple de contrôle : quatre paiements de 90 EUR liés à une facture de 360 EUR
TTC avec 60 EUR de TVA ne produisent plus 240 EUR de TVA automatique. Les quatre
échéances restent à vérifier ; les 60 EUR figurant sur la facture sont conservés
dans les colonnes documentaires.

## Vérification avant passage sur main

Tests automatisés sans base ni envoi d'email : règles Arval, cheval de sport,
tickets restaurants, Orange mobile, commission vente à distance, banques FFE,
priorité des natures, inconnus, facture payée en une fois, échéances dans le même
mois et dans plusieurs mois, doublons de pièce, exclusions et escompte.
Un mois fictif vérifie le même CSV dans le téléchargement et le colis mensuel.

À vérifier en session admin sur test :

1. Ouvrir un mois dans Dépenses. Contrôler le compte proposé d'une location Arval
   et le filtre « Comptes à ventiler » ; modifier puis rétablir une catégorie et
   vérifier que la proposition suit sans changement du montant.
2. Télécharger les CSV ventilation, justificatifs et TVA. Vérifier les codes
   banque/fournisseur/imputation et l'absence des lignes exclues.
3. Sur des données de test, rattacher plusieurs échéances à une facture, puis
   consulter chacun des mois concernés. La TVA totale de la facture ne doit
   jamais réapparaître comme TVA automatique d'une échéance.
4. Contrôler les soldes et montants d'origine ainsi que la liste des points à
   vérifier. Aucun email réel n'est nécessaire à ces vérifications.

## Documents comptables futurs

Ce fichier de propositions prépare les données pour un futur moteur d'écritures
équilibrées. Ce moteur pourra alimenter le journal, le grand livre, la balance
générale et le centralisateur mensuel. Pour produire un bilan et un compte de
résultat complets, il faudra aussi les soldes d'ouverture et les opérations de
clôture : immobilisations/amortissements, stocks, emprunts et régularisations.
La production des documents restera distincte de leur validation et signature.
Cette étape n'ajoute pas de journal d'achats ni de bilan officiel.
