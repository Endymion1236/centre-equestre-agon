# À reprendre — fiche horaires (Équipe → Horaires)

> Diagnostic dicté par Nicolas le 20 août 2026, à traiter EN DÉBUT de session,
> au calme. Cinq problèmes distincts, tous sur le temps de travail — donc la paie.

## Les cinq points, dans ses mots

1. **Les pauses intermédiaires ne sont pas affichées, mais elles sont déduites
   du total.** Écart inexplicable entre les horaires lus et le nombre d'heures.
2. **Les colonnes sont trop larges, et il en manque** pour ces pauses
   intermédiaires.
3. **Quand une pause est affichée, ce sont parfois les horaires de la tâche
   voisine qui apparaissent** au lieu de ceux de la pause.
4. **Les trous entre deux tâches ne sont pas comptés comme du travail — alors
   qu'ils en sont.** Un salarié qui attend entre deux cours travaille.
5. **Le total journalier est parfois faux alors que les horaires affichés sont
   bons.** Le plus inquiétant : une erreur d'addition, indépendante du reste.

## Contexte code (état au 20/08/2026)

- La règle de calcul vit dans `src/lib/temps-travail.ts` (23 assertions dans
  `tests/unit/temps-travail.test.ts`), consommée par `calcTempsTravailJour`
  (management/types.ts) et par `journeeDe` dans `TabHoraires.tsx`.
- Règle actuelle, décidée le 19/08 : somme des périodes travaillées ; battement
  **< 30 min** compté en travail ; pause saisie déduite même courte ;
  chevauchements fusionnés.
- La fiche imprimée (TabHoraires) ne rend que DEUX blocs (matin / après-midi)
  coupés sur la PLUS LONGUE interruption ; `pauseMin` affiché = coupure la plus
  longue + pauses saisies. C'est cohérent avec les points 1, 2, 3 et
  probablement 5 : une journée à plus d'une interruption est mal représentée,
  et la colonne pause peut agréger des choses hétérogènes.

## ✅ Décision prise (Nicolas, 20/08/2026) — le point 4

« Tant qu'une tâche pause n'existe pas, les trous entre deux tâches sont du
temps de travail. »

Règle à implémenter dans `src/lib/temps-travail.ts` :

- temps du jour = AMPLITUDE (début de la première tâche → fin de la dernière)
  − les pauses SAISIES (part tombant dans l'amplitude) ;
- le seuil de 30 minutes (`SEUIL_BATTEMENT_MIN`) disparaît : un trou n'est
  jamais déduit de lui-même, quelle que soit sa durée ;
- une pause saisie reste déduite intégralement, même courte ;
- les chevauchements restent fusionnés (deux tâches superposées ≠ double) ;
- la coupure matin / après-midi de la fiche imprimée se cale désormais sur la
  plus longue PAUSE SAISIE (plus sur le plus long trou, qui est du travail).

Conséquence assumée, à rappeler à l'écran : une coupure déjeuner NON saisie en
pause est payée. La discipline de saisie remplace le seuil. Prévoir un signal
doux côté fiche (ex. « journée de plus de X h sans pause saisie ») pour
attraper les oublis avant la paie, sans rien déduire tout seul.

Réécrire les tests de `tests/unit/temps-travail.test.ts` avec cette règle
(le cas « 9h–12h / 14h–17h sans pause = 6 h » devient « = 8 h », c'est voulu).

## Ordre d'attaque suggéré

1. Point 5 (erreur d'addition) : reproduire sur un cas réel, test unitaire
   d'abord — c'est le seul qui peut être un vrai bug de calcul.
2. Points 1+2+3 ensemble : refondre le rendu de la journée de la fiche pour
   afficher N segments et N pauses avec LEURS horaires (le modèle de
   `calculerJournee` expose déjà segments et coupures).
3. Point 4 : décision prise (voir ci-dessus) — appliquer la règle d'amplitude
   dans lib/temps-travail.ts, réécrire ses tests, ajouter le signal « journée
   sans pause saisie ».
