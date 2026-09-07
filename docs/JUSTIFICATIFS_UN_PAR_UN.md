# Parcours courant : une pièce à la fois

Cette évolution remplace le parcours par lot de MATCHING_AUTOMATIQUE.md.
Un fichier sélectionné → stockage privé → lecture de ce fichier uniquement →
affichage d'une seule pièce. La liste des pièces précédentes reste consultable,
y compris les exclusions et les bulletins. Aucun effacement de l'historique.
Réimporter un fichier identique ouvre sa pièce existante sans relancer l'analyse.
Un bouton Relire remplace explicitement l'extraction, conserve l'ancienne dans
l'historique et refuse l'écrasement d'une correction/association concurrente.

Facture : corriger, puis confirmer le paiement proposé ou choisir le débit EUR
pour une facture étrangère. Exclure reste possible sans analyse, puis restaurer.
Document sans rapport : reconnu comme autre ; aucune proposition bancaire.
Bulletin de paie : salarié, employeur, mois, brut, net après PAS, cotisations et PAS
lus séparément. Pas d'extraction structurée de NIR, IBAN ou adresse personnelle.
HT/TVA/TTC forcés à null ; jamais rapproché comme facture. Vérifier puis classer
le bulletin. Aucune charge ni écriture de salaire générée, pas de confirmation
du virement : cela reste un classement documentaire pour la préparation comptable.

Les anciennes associations restent conservées. L'ancien endpoint matching renvoie
410 après vérification admin pour neutraliser les pages par lot encore ouvertes.
Les outils de contrôle des doublons restent sous Outils complémentaires.
Accès et stockage privés inchangés. Aucun nouveau besoin de règles Firebase.

Vérifications : TypeScript, tests des champs de paie, absence de confusion avec
HT/TVA/net imposable, exclusion des bulletins du matching, et tests devises/factures.
Aucun bulletin réel n'a été fourni pour tester la reconnaissance IA en conditions
réelles ; test depuis une session admin nécessaire. Aucune donnée de base effacée.
