# Dépenses et justificatifs

Écran principal `/admin/comptabilite/depenses` : date, libellé/compte bancaire,
montant, catégorie modifiable, import/choix du justificatif et état. Un seul fichier
par ligne ; lecture puis confirmation manuelle affichant les montants. Pièce
existante sélectionnable, correction de lecture dans le tableau, exclusion de
pièce réversible depuis l'onglet Pièces et bulletins. L'exclusion d'une opération
ne fait que poser rapprochementExclu : aucun montant ni solde n'est supprimé.

Les anciennes pages sont regroupées en onglets : Tableau, Pièces et bulletins,
Synthèse par catégorie. L'ancien lien `/justificatifs` redirige vers l'onglet pièces.
La trésorerie, la clôture du mois et Céleris restent accessibles, ainsi que le
contrôle des doublons dans les outils. Les données existantes sont conservées.

L'import de relevé conserve maintenant les autres débits lus (hors-depenses) dans
`mouvements-rapprochement`, séparément des charges de `depenses`. Ils servent au
rapprochement notamment des salaires ; changer leur catégorie ne les intègre pas
automatiquement aux charges. Les nouveaux mouvements utilisent l'identité stable
compte/fichier/page/rang ; relecture identique sans ajout et différence de lecture
refusée. Pas de déduplication universelle des PDF réencodés. Les anciens salaires
non enregistrés nécessitent une relecture de relevé. Les crédits ne sont pas
repris dans ce tableau de sorties d'argent.

Association atomique pièce/ligne avec verrou exclusif partagé par les autres
écrans ; refus si montants changés depuis l'aperçu. Facture EUR : TTC exact.
Devise : montants originaux distincts, confirmation humaine. Paie : net à payer
EUR exact, salarié/mois présents ; ne pas confondre net payé et coût salarial.
La TVA et les comptes d'imputation ne sont pas calculés par cette association.
Les catégories existantes sont reprises ; les paramètres exposent surtout des
comptes de recettes : aucun compte de charge n'a été inventé.

Les mouvements archivés comme doublons sont exclus de la vue. Affichage plafonné
et signalé à 2 000 éléments par source. APIs admin uniquement, collections privées
couvertes par le refus Firestore par défaut. Historique des associations et actions.

Validation : TypeScript, tests facture EUR, devise, net de paie, rejets des ventes
et saisies manuelles. Test authentifié à effectuer depuis test : importer un
justificatif sur une ligne, confirmer, dissocier ; changer une catégorie ; exclure
puis réactiver une ligne ; vérifier un bulletin sur un débit hors charges. Aucune
donnée réelle modifiée depuis l'environnement de développement.
