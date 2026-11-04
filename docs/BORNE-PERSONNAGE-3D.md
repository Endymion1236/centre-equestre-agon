# Personnage 3D de la borne d'accueil — cahier des charges du fichier

Destiné à la session Claude Code qui pilote Blender sur l'ordinateur de Nicolas.
Le code de la borne est prêt : il suffit de produire **un fichier** qui respecte
ce contrat et de le déposer dans le dépôt.

## Où va le fichier

```
public/borne/calin.glb
```

Tant que ce fichier n'existe pas, la borne garde son visage actuel (poses
illustrées). Dès qu'il est en ligne, elle l'affiche ; s'il est illisible, elle
revient d'elle-même à l'ancien visage. Rien d'autre à toucher dans le code.

## Le contrat

| Élément | Nom exact | Détail |
|---|---|---|
| Animation de repos | `repos` | Boucle 3 à 6 s : respiration, clignement des yeux, petit mouvement d'oreilles. **Obligatoire.** |
| Animation d'écoute | `ecoute` | Boucle : oreilles dressées, tête légèrement penchée vers le visiteur. |
| Animation de réflexion | `reflexion` | Boucle : regard en l'air, oreille qui pivote. |
| Animation de parole | `parle` | Boucle : hochements de tête, oreilles mobiles. **La bouche n'y est pas animée** (voir ligne suivante). |
| Forme de bouche | `bouche` | *Shape key* (forme clé) sur le maillage de la tête : 0 = bouche fermée, 1 = grande ouverte. La borne la pilote en direct au rythme de la voix. **Obligatoire.** |
| Expressions (facultatif) | `joie`, `clin`, `rire`, `desole`, `etonne` | Animations jouées **une fois** (1 à 2 s), puis retour automatique à l'état en cours. |
| Caméra (facultatif) | une caméra perspective | Si elle est exportée, la borne l'utilise ; sinon cadrage automatique, de face, personnage entier. |

Noms tolérés : la casse, le préfixe d'armature (`Armature|parle`) et les suffixes
Blender (`parle.001`) sont ignorés. Pour la bouche, `jawOpen` ou `mouthOpen`
conviennent aussi. Une animation absente est remplacée par `repos`.

## Contraintes pour la tablette

| Contrainte | Limite |
|---|---|
| Poids du fichier | **≤ 10 Mo** (viser 3 à 5 Mo) |
| Triangles | **≤ 60 000** au total (Decimate sur un modèle Tripo, souvent 200 000 et plus) |
| Textures | 1024 px ou 2048 px au plus, JPEG ou PNG, **un seul matériau** si possible |
| Compression | **Pas de Draco, pas de Meshopt, pas de KTX2** : la borne ne les décode pas |
| Orientation | Personnage tourné vers la **vue de face de Blender** (pavé numérique 1 : il regarde vers −Y ; l'export en fait l'axe +Z du glTF, face à la caméra de la borne), pieds à l'origine, échelle réelle (environ 1 à 1,5 m de haut) |
| Transformations | Appliquées (Ctrl+A → All Transforms) avant export |

## Export depuis Blender

Fichier → Exporter → glTF 2.0 :

- Format : **glTF Binary (.glb)**
- Inclure : objets sélectionnés ou scène visible ; cocher **Cameras** si une caméra est prévue
- Données → Maillage : **Apply Modifiers**, normales, UV
- Données → Shape Keys : **cochées** (sinon la bouche disparaît)
- Animation : **cochée**, mode *Actions* (une action Blender = une animation, du nom de l'action), *Always Sample Animations*
- Compression : **décochée**

## Vérifier avant de mettre en ligne

1. Lancer le site en local : `npx next dev`, puis ouvrir `http://localhost:3000/borne/apercu-3d`.
2. La page affiche le personnage et un encadré **« Contenu du fichier »** : poids,
   triangles, forme de bouche trouvée ou non, animations lues.
3. Cliquer **Repos / Écoute / Réflexion / Parle** : chaque état doit lancer son
   animation, avec un fondu. En « Parle », la case *voix simulée* fait bouger la bouche.
4. Les boutons d'expression jouent `joie`, `clin`… s'ils existent.
5. Rouge dans l'encadré = à corriger (trop lourd, trop de triangles, bouche absente).

## Mettre en ligne

```bash
git add public/borne/calin.glb
git commit -m "Borne : personnage 3D de Câlin"
git push origin main
```

Vercel déploie en deux ou trois minutes ; recharger la borne.

## Conseils pour un modèle Tripo

- Générer le poney **de face, bouche fermée**, pose neutre (pattes droites).
- Dans Blender : supprimer les éléments parasites, **Decimate** jusqu'à ≤ 60 000
  triangles, recalculer les normales, regrouper les textures en un seul matériau.
- Bouche : séparer la mâchoire inférieure dans un *vertex group*, créer la shape key
  `bouche` en abaissant la mâchoire (la base `Basis` reste bouche fermée).
- Squelette : Tripo gère mal un quadrupède ; un squelette simple (tête, cou, oreilles,
  paupières) suffit pour ces animations de buste.
- Droits : vérifier que la formule Tripo autorise un usage commercial (borne dans un
  lieu ouvert au public).

## Où est le code (pour mémoire)

`src/components/BorneVisage3D.tsx` (affichage, three.js chargé seulement si le
fichier existe), `src/lib/borne-3d.ts` (noms et règles, testés dans
`tests/unit/borne-3d.test.ts`), `src/components/BorneVisage.tsx` (ordre des
secours : 3D → Rive → poses → SVG), page d'essai `src/app/borne/apercu-3d/page.tsx`.
