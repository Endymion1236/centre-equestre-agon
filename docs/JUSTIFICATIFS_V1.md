# Justificatifs : V1 assistée (sans comptabilisation)

Évolution : le dépôt lance désormais l’analyse par lot et un rapprochement
automatique prudent. Les règles et limites actuelles sont décrites dans
[MATCHING_AUTOMATIQUE.md](MATCHING_AUTOMATIQUE.md). Les mentions ci-dessous
« à la demande », « tous à confirmer » et « pas de rapprochement sans confirmation »
décrivent la V1 initiale ; elles sont remplacées par ce nouveau fonctionnement.

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

## Lecture des mouvements par pages

La lecture complète copie chaque page du PDF dans le navigateur (pdf-lib, contenu conservé) et appelle l'IA séparément par page, avec un délai de 40 s sans retries. Le résumé première/dernière page sert uniquement à proposer le solde ; son échec n'empêche pas la lecture des mouvements, le mois et le solde restant alors à saisir. Un PDF doit concerner un seul compte. Les dates manquantes, pages tronquées ou erreurs empêchent l'import des dépenses jusqu'à une relance réussie. Une page qui échoue reste signalée ; seules ces pages sont relancées, tant que l'écran reste ouvert.

Les crédits clients sont additionnés uniquement si toutes les pages sont complètes et chaque montant est connu. Reports, intérêts et virements internes sont exclus par la consigne ; ce classement IA reste à vérifier sur le relevé. Les virements internes sont proposés hors dépenses, sans création d'une charge. Il ne s'agit pas encore d'un rapprochement automatique des deux côtés d'un virement interne.

Le compte destinataire doit être choisi avant l'import. Une identité fichier SHA-256/page/rang + compte protège les nouveaux imports identiques, en transaction (200 lignes par lot). Les modifications de lecture d'une ligne déjà importée sont refusées pour vérification. Un ancien import sans identité qui correspond au montant/fournisseur/mois bloque l'ajout du lot et oriente vers Compléter les dates. Un PDF réencodé possède une autre empreinte : ce garde-fou n'est pas une déduplication universelle de relevés recouvrants. Pour les anciens imports, la complétion de dates conserve sa limite de 200 lignes sélectionnées et ne réattribue pas de compte inconnu.

Limites : PDF d'origine 20 Mo / 150 pages ; extrait envoyé 4 millions de caractères base64. Une page individuelle peut encore dépasser le délai ou être illisible ; aucune garantie de lecture d'un PDF non testé. Le résumé peut ne pas contenir le solde de clôture s'il figure ailleurs : toujours contrôler sur l'original. Les pages doivent rester dans le navigateur jusqu'à validation (pas de file de travail persistante).

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
