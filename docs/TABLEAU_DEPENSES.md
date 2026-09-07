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

## Justificatif, TVA et exclusion

Le tableau distingue le justificatif manquant (absence de pièce associée), le statut TVA choisi manuellement et l'exclusion du rapprochement. Une pièce manquante reste signalée même sans TVA ou après exclusion. L'association fait disparaître ce signalement, la dissociation le rétablit.

La colonne TVA propose « à vérifier » par défaut pour les anciennes lignes, « sans TVA » et « TVA non récupérée ». Ces indications sont enregistrées sur la ligne et historisées, sans modifier les montants extraits, les catégories, les totaux ou produire d'écriture/déclaration fiscale. Une TVA positive extraite sur une pièce marquée sans TVA affiche un avertissement. L'exclusion ne change aucun de ces choix.

Vérification en session : choisir chaque statut, actualiser, exclure puis réactiver ; contrôler la conservation de la catégorie et du montant. Associer puis dissocier une pièce et vérifier le signalement du justificatif. Tester également une opération conservée hors synthèse.

## Échéances et PER

Dans le choix de pièce, le type « Échéance d’une facture » rattache plusieurs débits positifs à une facture d’achat EUR. Le cumul documenté ne peut dépasser son TTC. Les paiements non importés ne sont pas présumés réglés. Le lien ne génère pas de charge ni de correction d’exercice. Les anciennes associations uniques doivent être dissociées avant conversion.

Le type « Attestation PER — contrôle fiscal » permet de joindre une attestation à plusieurs versements classés Retraite / PER — à vérifier. Ce rattachement documentaire ne valide ni le contrat, ni les plafonds, ni une déduction fiscale. La pièce peut être jointe sans extraction automatique.

Les liens utilisent un verrou par paiement et une liste sur la pièce, modifiés en transaction. Chaque dissociation ne retire que le paiement sélectionné. Les anciens endpoints refusent de modifier ces liens multiples. La synthèse reste un suivi des montants bancaires, pas une détermination des charges déductibles.

Tests en session requis : rattacher quatre paiements de 90 à une facture de 360, refuser le cinquième, dissocier un seul paiement, vérifier les trois autres, réassocier ; joindre une même attestation PER à deux versements. Aucun rattachement réel n’a été effectué depuis le développement.

## Tableau principal, commissions et remise à zéro

La gestion documentaire est accessible depuis Autres outils → Documents en attente et archives. Les onglets principaux restent le tableau et la synthèse.

Une commission explicitement libellée COM CARTE peut utiliser le relevé comme justificatif, sur confirmation de sa conservation par l'administrateur. La référence du relevé est enregistrée avec le choix et la catégorie frais bancaires. Cela ne stocke pas le PDF du relevé, ne valide pas la TVA et ne s'applique pas aux libellés de prêt ambigus. L'indication est annulable.

La remise à zéro affiche toutes les pièces actives (limite stricte 2 000), tous mois confondus, puis demande confirmation. Chaque pièce est archivée en transaction avec suppression de ses seuls verrous et historisation des associations. Une version modifiée depuis l'aperçu interrompt l'opération. En cas d'arrêt, les pièces déjà archivées le restent et un nouvel aperçu permet de reprendre. Fichiers et extraction restent restaurables, les associations doivent être refaites. Les mouvements, catégories, montants et indications de relevé ne sont pas supprimés.

Validation connectée requise : aperçu et annulation ; archivage d'une pièce avec plusieurs échéances ; restauration ; reprise après interruption ; confirmation puis annulation du justificatif par relevé. Aucun archivage réel effectué depuis le développement.

Le choix manuel Personnel — hors charges conserve le débit dans le tableau bancaire mais le retire des totaux Dépenses et Résultat. La pièce éventuellement associée est conservée. Aucune TVA professionnelle n'est proposée pour ces lignes. Changer de catégorie rétablit leur périmètre précédent ; il ne s'agit pas d'une écriture en compte d'exploitant/associé. Aucun fournisseur n'est automatiquement marqué personnel.

## Association au niveau de la ligne

Le panneau de choix et de correction apparaît immédiatement sous l’opération sélectionnée ; le défilement automatique vers le bas de page est supprimé. Les contrôles de devise et montant sont affichés avant envoi, en réutilisant la validation serveur. Les corrections sont relues depuis le serveur avant la confirmation, pour utiliser les valeurs effectivement enregistrées. Les conflits d’archive, de lecture manquante et d’association existante ont des messages distincts. Les erreurs techniques de stockage renvoient 500 plutôt qu’un faux conflit 409.

À vérifier en session : sélectionner une ligne au milieu d’un relevé long, importer/corriger/associer sans déplacement en bas ; tester une devise absente, un paiement fractionné et une pièce déjà liée. La cause du 409 signalé n’a pas pu être confirmée sans sa réponse détaillée ou la session connectée.

La correction utilise désormais la réponse canonique de l’API de sauvegarde, sans dépendre d'une seconde lecture pour fermer le formulaire. Le contrôle avant association suit le brouillon en cours ; une indication rappelle de l’enregistrer. Les erreurs de validation HTML sont affichées et le pas décimal est limité aux montants (pas aux dates/mois). Les boutons désactivés sont visuellement atténués. Vérifier en session une ancienne facture sans devise : sélectionner EUR, enregistrer, confirmer ; vérifier aussi un champ invalide et une erreur serveur. La cause exacte du blocage navigateur signalé n’a pas été reproduite en session authentifiée.

Une pièce ouverte après un import identique peut déjà être liée à un autre paiement et ne pas figurer dans la liste des pièces libres. Le panneau affiche maintenant explicitement cette pièce sélectionnée, son association et une action de dissociation avec confirmation. Les paiements multiples peuvent être dissociés individuellement. Le formulaire de correction est masqué tant que la pièce est liée ; les brouillons sont conservés pendant la dissociation. Après un refus de correction, l’état de la pièce est relu pour rendre visible une association concurrente. La dissociation d’un lien unique vérifie l’identifiant attendu pour ne pas retirer un lien modifié entre-temps.

Cas de validation connecté : réimporter une facture déjà liée, observer son paiement, dissocier pour corriger EUR, enregistrer, puis associer à la bonne ligne. Vérifier également les associations multiples et les refus sur association concurrente.
