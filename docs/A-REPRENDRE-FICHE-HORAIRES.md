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

## ⚠️ Décision à re-poser AVANT de coder — le point 4

Le point 4 est en TENSION avec la règle choisie la veille (battements ≥ 30 min
non comptés). Tel que formulé — « un salarié qui attend entre deux cours
travaille » — il peut vouloir dire :
  a) relever le seuil de 30 min (à combien ?) ;
  b) compter TOUS les trous entre tâches d'une même journée (retour de fait à
     l'amplitude, sauf pauses saisies) — auquel cas la coupure du midi doit
     être SAISIE en pause pour ne pas être payée ;
  c) distinguer « trou entre deux cours » (travail : on ressangle, on prépare)
     et « coupure déjeuner » (pas travail) autrement que par la durée.
Poser la question avec des exemples chiffrés (9h–12h / 14h–17h vs cours à
10h–11h / 11h45–12h45) avant toute modification. La réponse change la paie de
tout le monde : elle appartient à Nicolas, pas au code.

## Ordre d'attaque suggéré

1. Point 5 (erreur d'addition) : reproduire sur un cas réel, test unitaire
   d'abord — c'est le seul qui peut être un vrai bug de calcul.
2. Points 1+2+3 ensemble : refondre le rendu de la journée de la fiche pour
   afficher N segments et N pauses avec LEURS horaires (le modèle de
   `calculerJournee` expose déjà segments et coupures).
3. Point 4 : seulement après la décision ci-dessus, dans lib/temps-travail.ts,
   avec ses tests.
