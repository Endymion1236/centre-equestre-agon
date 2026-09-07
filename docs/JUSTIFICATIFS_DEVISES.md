# Factures en devise, débit en euros

Dans Vérifier / corriger, choisir la devise et conserver les montants d'origine.
Devises proposées : EUR, USD, GBP, CHF, CAD, AUD ; absente/ambiguë = à vérifier.
L'IA lit la devise sans conversion. Les anciennes extractions restent sans devise
jusqu'à vérification ; elles ne doivent plus afficher arbitrairement le symbole €.
Le matching numérique et automatique nécessite EUR explicitement identifié.

Pour une facture étrangère positive, Choisir le débit en euros ouvre les dépenses
bancaires d'un mois, recherchables par fournisseur/date/montant/compte. L'utilisateur
confirme la paire complète (montant et devise de facture, débit EUR). Le serveur
relit et vérifie les montants de l'aperçu, l'existence de la dépense et l'exclusivité
du lien. Les deux montants sont conservés dans associationDevise et l'historique.
Aucun montant de dépense ni montant de facture n'est remplacé. Pas de conversion
comptable, de TVA déduite, de taux imposé ni de frais inventés. Les paiements
fractionnés/groupés et les avoirs restent hors de ce parcours unitaire.

L'annulation enlève l'association courante, conserve l'historique et interdit une
réassociation automatique. Tests : conservation des deux montants, refus d'égalité
numérique interdevises, exigences de confirmation et de débit positif ; TypeScript.
Vérification en session administrateur nécessaire ; aucune donnée réelle modifiée
depuis l'environnement local dépourvu d'identifiants Firebase.
