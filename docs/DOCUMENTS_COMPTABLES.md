# Documents comptables préparatoires

Écran : `/admin/comptabilite/documents`, accessible par le menu Comptabilité.

## Utilisation

1. Choisir le début et la fin de période. Pour un bilan de clôture, partir de l’ouverture de l’exercice, pas seulement du dernier mois.
2. Choisir une source : l’historique Céleris déjà importé, ou un fichier complet d’écritures de la comptable. Ces deux sources ne sont jamais additionnées implicitement.
3. Vérifier les écritures et consulter le périmètre et les contrôles.
4. Télécharger le journal classique, le grand livre, la balance générale, le centralisateur par mois et le bilan préparatoire, individuellement ou dans un ZIP.

Les fichiers de vérification locaux sont fictifs. Aucun fichier comptable réel n’a été créé ou validé lors du développement.

## Périmètre de cette version

Le moteur lit des écritures en partie double existantes. Les ventes du site, ses encaissements, les dépenses bancaires, les justificatifs et les suggestions de comptes ne sont **pas encore transformés automatiquement en écritures**. Cela évite de doubler les ventes Céleris, de traiter un remboursement d’emprunt comme une charge ou de reprendre plusieurs fois la TVA d’une facture à échéances.

Les cinq états sont calculés à partir du même jeu d’écritures. Le bilan est une situation nette détaillée des comptes 1 à 5, avec le résultat des comptes 6 et 7. Il ne reproduit pas les formulaires du cabinet : pas de comparatif N-1, de ventilation brut/amortissements normalisée, d’annexe, de liasse fiscale ou de signature. Les amortissements créditeurs de classe 2 diminuent l’actif ; un solde créditeur de trésorerie figure au passif.

Une sélection de ventes seule demeure partielle, même si les écritures sont équilibrées. Chaque PDF porte la mention préparatoire, une empreinte commune et une page de périmètre. Les mois sans écriture et l’absence de journal AN/ANO/RAN sont signalés ; leur présence ne prouve pas l’exhaustivité des à-nouveaux ni de la clôture.

## Format du fichier alternatif

TXT/CSV UTF-8 ou Windows-1252, séparateur `;`, guillemets CSV acceptés. Même en-tête que l’export Céleris :

```text
Journal;N compte;N piece;Date ope;Debit;Credit;Libele ecriture;Libele compte
```

- Plusieurs mois possibles. Dates `AAAA-MM-JJ` ou `JJ-MM-AAAA`.
- Montants en euros, virgule ou point décimal, deux décimales maximum. Calculs internes en centimes entiers.
- Comptes des classes 1 à 7, de 2 à 15 caractères alphanumériques, y compris les fournisseurs auxiliaires tels que `401ARVAL`. Pas de remplacement silencieux du plan de comptes du cabinet.
- Équilibre obligatoire pour chaque combinaison journal/pièce/date. Une ligne ne porte qu’un débit ou un crédit. Les montants négatifs sont contrepassés sur le côté opposé.
- Maximum 4 Mo et 5 000 lignes ; période limitée à 550 jours. Limite dépassée : refus explicite, jamais un document tronqué.
- Le fichier fourni sert à la génération, sans être enregistré dans Firestore.

## Garanties et vérification

Route administrateur, lecture seule, réponses privées sans cache. Le téléchargement vérifie l’empreinte de l’aperçu pour refuser un jeu modifié entre vérification et export. Une même pièce présente dans plusieurs sources est bloquée. Les vraies lignes répétées d’une même pièce ne sont pas supprimées automatiquement.

Tests : concordance des totaux, facturation/règlement sans doublage, à-nouveaux absents, bilan avec amortissement et découvert, avoirs, dates invalides, centimes, pièces tronquées, sources doublonnées, dépassement de limites, parsing CSV. Les cinq PDF sont générés avec des données fictives et inspectés visuellement, dont la pagination du grand livre et du journal.

L’écran Dépenses utilise désormais des fiches adaptatives : catégorie/compte et justificatif sur deux colonnes quand l’espace le permet, puis une seule colonne. TVA et rapprochement sont dépliables dans chaque fiche. Les champs et noms de fichiers restent bornés à la largeur disponible. Le rendu dans la session administrateur réelle reste à vérifier : le navigateur de contrôle ne peut pas joindre le serveur local de cette session.

## Étape suivante

Construire et valider un journal applicatif commun : émission des factures/avoirs, règlement client sans nouvelle vente, facture fournisseur comptabilisée une fois, règlements et échéances distincts, TVA selon son exigibilité, paie, virements internes, prêts ventilés capital/intérêts, immobilisations et opérations de clôture. Prévoir une revue comptable des propositions avant leur validation et une provenance durable de chaque écriture. Ce journal pourra alimenter directement le moteur des cinq états déjà en place.
