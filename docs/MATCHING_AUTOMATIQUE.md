# Rapprochement des justificatifs fournisseurs

Ce parcours par lot est désormais désactivé à la demande de l'utilisateur.
Voir JUSTIFICATIFS_UN_PAR_UN.md pour le parcours courant. Cette page documente
le fonctionnement précédent ; l'endpoint matching renvoie maintenant 410.

Dans Justificatifs, le dépôt envoie d’abord tous les fichiers puis analyse toutes
les pièces actives en attente (pagination complète, une requête IA par pièce).
Le bouton « Analyser toutes les pièces en attente » reprend les échecs. Garder
l’écran ouvert : pas de tâche de fond ni de promesse de traitement après fermeture.
La case de validation automatique peut être décochée pour un contrôle manuel.
Après import de nouvelles dépenses bancaires, utiliser « Relancer le rapprochement
automatique ». L’API GET ne provoque aucune mutation.

Règle initiale volontairement restrictive : achat identifié (les anciennes
extractions sans type nécessitent vérification), numéro présent, fournisseur/date/
TTC présents, HT et TVA présents et cohérents, fournisseur normalisé identique,
TTC identique au centime, date bancaire de 0 à 7 jours après la facture.
Il faut une dépense candidate unique et aucune autre pièce concurrente ; une copie
de facture de même fournisseur et numéro interdit aussi l’association automatique.
Toute pièce active encore non analysée suspend le matching : terminer l’analyse
ou retirer les documents invalides avant de relancer. Aucun avoir ni facture client
n’est associé automatiquement. Les rapprochements fractionnés/groupés restent manuels.

Les documents, dépenses et verrous de liens sont lus dans la même transaction
que la création des associations et de leur historique. Lot de 100 associations ;
réexécution sans doublons, aucun écrasement de lien existant. Au-delà de 1 000
documents ou 2 000 dépenses/liens, suspension explicite de l’automatisation :
aucune décision sur un échantillon incomplet. Les associations manuelles et les
annulations posent autoBloque ; le matching ne les annule ni ne les recrée.

L’association est un lien justificatif/dépense, pas une validation comptable,
fiscale ou un nouveau paiement. La période d’exercice n’est pas modifiée. Les PDF
Céleris de ventes aux clients ne sont pas des justificatifs de dépenses et leur
rattachement aux prestations estivales reste distinct.

Validation : tests du moteur (montants, dates, ambiguïtés, copies, choix humains,
sources incomplètes) et TypeScript. Test authentifié en base restant nécessaire :
déposer des achats, vérifier le lot, annuler une association et relancer, contrôler
qu’elle n’est pas recréée. Aucun identifiant Firebase disponible dans l’environnement
de développement ; aucune facture utilisateur enregistrée en base depuis cet espace.
