# Studio vidéo — produire un Reel à partir de tes rushs

> Outil : [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (open source),
> à faire tourner sur **ton PC** — rien à voir avec la plateforme Vercel du centre.
> Configuration prête : `config.centre.toml` dans ce dossier.
> Vérifié dans le code source le 20 août 2026.

## Ce que ça fait, honnêtement

Tu déposes quelques clips de poneys dans un dossier, tu écris un sujet
(« un Reel drôle de 30 secondes sur le stage Pokémon »), et l'outil :
écrit le texte (Claude, ta clé existante), génère une **voix off française**,
assemble tes clips au **format Reel 9:16**, pose les **sous-titres synchronisés**
et une musique de fond, et sort un MP4 prêt à publier.

**Ce qu'il ne fait pas** : choisir intelligemment dans tes rushs. Il prend les
clips dans l'ordre et les découpe en segments réguliers. Le tri — garder les
5-6 meilleurs plans — reste ton travail. Cinq minutes de tri contre quarante-cinq
de montage : c'est là qu'est le gain.

## Installation (une seule fois, ~20 minutes)

1. **Docker Desktop** : https://www.docker.com/products/docker-desktop/ —
   installer, redémarrer le PC si demandé, vérifier que la baleine tourne.
2. **Le projet** : dézipper ton archive MoneyPrinterTurbo (ou
   `git clone https://github.com/harry0703/MoneyPrinterTurbo`) dans un dossier
   simple, par exemple `C:\studio-video`.
3. **La configuration** : copier `config.centre.toml` (ce dossier) à la racine
   de `C:\studio-video` sous le nom **`config.toml`**, l'ouvrir, et remplacer
   `COLLE_TA_CLE_ANTHROPIC_ICI` par la clé `ANTHROPIC_API_KEY` (la même que
   dans Vercel). **Ce fichier ne se partage pas** une fois la clé dedans.
4. **Lancer** : dans le dossier, ouvrir un terminal et
   ```
   docker compose up webui
   ```
   Le premier lancement construit l'image : plusieurs minutes. Les suivants
   démarrent en quelques secondes.
5. Ouvrir **http://127.0.0.1:8501** dans le navigateur.

## Produire un Reel (à chaque fois, ~10 minutes)

1. **Déposer les rushs** : copier 5 à 8 clips (téléphone, formats verticaux de
   préférence) dans `C:\studio-video\storage\local_videos\`.
   L'interface permet aussi de les téléverser directement.
2. Dans l'interface :
   - **Video Source** : `local`, et sélectionner tes clips ;
   - **Sujet de la vidéo** : décrire ce que tu veux, en français, par exemple :
     > Un Reel drôle de 30 secondes sur le stage Pokémon du centre équestre
     > d'Agon-Coutainville : des enfants déguisés en dresseurs, des poneys qui
     > font les stars, ton léger et complice, fin sur une invitation à
     > s'inscrire au prochain stage.
   - **Langue du script** : français ; **Voix** : une voix `fr-FR`
     (Denise, Henri, ou Rémy multilingue — écouter l'aperçu) ;
   - **Format** : portrait 9:16 ; **Durée des clips** : 3 à 5 secondes ;
   - Sous-titres activés (position basse, c'est le standard des Reels).
3. **Générer**, puis récupérer le MP4 dans
   `C:\studio-video\storage\tasks\<numéro-de-tâche>\`.
4. Regarder AVANT de publier : la voix dit ce que Claude a écrit — relire comme
   tu relirais un mail aux familles.

## Coûts et limites

| Poste | Coût |
|---|---|
| Script (Claude Haiku) | ~1 centime par vidéo |
| Voix, sous-titres, montage | gratuits (outils locaux) |
| Banques d'images | non utilisées en mode local |

- L'outil tourne tant que la fenêtre Docker est ouverte ; `Ctrl+C` pour arrêter.
- Les vidéos générées s'accumulent dans `storage/tasks/` : penser à faire du
  ménage de temps en temps.
- Droit à l'image : les visages d'enfants dans un Reel public demandent
  l'autorisation écrite des parents. La plateforme ne porte pas encore de case
  « droit à l'image » sur la fiche famille — à demander si le besoin devient
  régulier ; en attendant, l'autorisation papier du dossier d'inscription fait
  foi.
