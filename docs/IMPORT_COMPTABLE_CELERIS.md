# Historique comptable Céleris

Accès administrateur : `/admin/comptabilite/celeris`, menu Historique Céleris.
Déposer un export TXT mensuel, examiner l’aperçu, puis importer. Répéter pour août.
Les fichiers clients ne sont pas inclus dans le dépôt Git.

Conservation des huit colonnes de l’export ; montants en centimes, dates d’écriture
préservées. UTF-8 et Windows-1252 acceptés. Validation des dates, montants et de
l’équilibre par journal / pièce / date avant toute écriture. Une transaction crée
un document par mois dans `historiqueComptableCeleris`. Une reprise identique est
sans effet ; un autre contenu pour le même mois est bloqué, sans remplacement.
Une erreur réseau peut donc être suivie d’une nouvelle tentative.

Accès uniquement par API authentifiée admin ; les règles Firestore par défaut
interdisent l’accès navigateur à cette collection. Aucun assouplissement nécessaire.
Limites : un mois par fichier, 10 000 lignes, fichier 4 Mo, données normalisées
700 ko maximum pour conserver l’atomicité sous la limite d’un document Firestore.

La vue permet de rechercher les écritures par libellé, pièce, compte, date et
journal. Totaux des ventes VTE uniquement : comptes 7, 445, 411. Les mouvements
de banque/caisse ne sont pas ajoutés à la facturation. Aucun paiement, facture,
réservation, dépense ni export officiel n’est modifié.

Cette première reprise est consultable séparément : aucune consolidation dans
le résultat ou Boucler le mois, aucun rapprochement automatique intersources.
Les factures antérieures à juillet pour prestations estivales devront être
examinées avec leurs règlements ; les dates dans les libellés ne constituent pas
un rattachement automatique à une période de prestation.

Vérification : tests unitaires du parseur, TypeScript et analyse des deux exports
réels juillet/août. Test en base à effectuer depuis une session administrateur :
importer, réimporter (aucun ajout), essayer un contenu différent pour le même mois
(refus), consulter les écritures. Aucune donnée réelle n’a été injectée depuis
l’environnement de développement, dépourvu d’identifiants Firebase.
