# Justificatifs : V1 assistée (sans comptabilisation)

Route admin : `/admin/comptabilite/justificatifs`. Accessible depuis le menu.

- Dépôt privé PDF/JPEG/PNG, 4 Mo par fichier. Toute la sélection est envoyée séquentiellement avec progression ; erreurs par fichier, sans interrompre les suivants. SHA-256 pour doublons binaires.
- Retrait récupérable : bouton Retirer puis vue Documents retirés / Restaurer. Une pièce associée doit être dissociée d'abord. Historique conservé, aucune suppression de l'original.
- Stockage Firebase Storage `justificatifs-prives/`, aucun token public ; téléchargement via route admin.
- Lecture IA à la demande (Anthropic déjà configuré). Une facture par fichier. Données incertaines laissées vides. Correction humaine possible après dissociation.
- Propositions sur `depenses` de source `releve-bancaire` uniquement, montant exact en centimes ; fournisseur et dates pour classement. Tous les candidats restent à confirmer.
- Liens transactionnels 1:1, exclusifs et réversibles ; historique d'association séparé. Pas de création ou modification des dépenses, paiements ou écritures.
- Date facture et période restent indépendantes de la date bancaire. Aucun calcul de TVA déductible ou d'exercice automatique.

## Limites explicites

Ce n'est pas encore un journal bancaire complet. Pièces paginées par 100 avec bouton Charger les documents suivants ; rapprochement limité à 2000 dépenses (avertissement visible). Paiements fractionnés/groupés, avoirs et commissions non traités. Doublons de facture photographiée deux fois non détectés (seul le fichier identique l'est). Pas encore de rapprochement sans confirmation, de liste exhaustive des pièces manquantes ni de clôture comptable. La suppression/modification d'une dépense depuis le module historique peut rendre le lien obsolète : recontrôler avant usage comptable.

## Dates des anciens relevés

La branche test omettait la date lors de la transmission ET du stockage de l'import des dépenses. Les nouveaux imports conservent dateOperation. Pour réparer l'historique : relire le PDF dans Trésorerie, vérifier les lignes puis utiliser Compléter les dates existantes (et non Ajouter). Comparaison mois/fournisseur normalisé/montant exact ; seuls les couples uniques sans date sont enrichis, dans une transaction. Aucun montant modifié ni aucune dépense créée ; correspondances absentes ou ambiguës signalées. Les dates existantes ne sont jamais écrasées. Mois et nom du relevé sont affichés dans les propositions lorsque présents.

## Vérification sur environnement de test avant fusion

1. Sans authentification / rôle non admin : GET, upload, analyse, correction, liaison et téléchargement refusés.
2. PDF/photo valide : dépôt, téléchargement identique et analyse. Clé IA absente ou erreur : fichier toujours récupérable.
3. Même fichier déposé deux fois simultanément : une pièce.
4. Deux dépenses de même montant : deux propositions, pas d'association silencieuse.
5. Deux pièces associées simultanément à une dépense : une seule réussit.
6. Dissocier puis réassocier, vérifier historique ; aucun changement des montants de dépenses ni du journal de caisse.
7. Juin payé en juillet : conserver les deux dates. TVA illisible : vide ; incohérence HT/TVA/TTC signalée.
8. Formats interdits et fichiers >4 Mo : rejetés. Vérifier refus d'accès direct Firestore/Storage avec règles déployées.

Prérequis serveur : Firebase Admin avec accès Storage et Firestore ; ANTHROPIC_API_KEY pour l'analyse. Collections nouvelles couvertes par le refus par défaut des règles existantes ; ne pas ouvrir de lecture publique. Ne pas tester avec les données de production.
