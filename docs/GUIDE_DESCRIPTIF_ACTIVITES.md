# Modifier le descriptif des activités — et où ça s'affiche

> Version PDF : `docs/Guide-descriptif-activites.pdf` (régénérable depuis ce document).
> À jour du 17 août 2026 — inclut le report des modifications sur les créneaux futurs.

## L'essentiel

Il existe **deux écrans** qui modifient des « descriptions d'activités », et ils
ne touchent pas les mêmes endroits :

- **Admin → Contenu** écrit les textes du **site public** (vitrine).
- **Admin → Activités** écrit le **catalogue** : ce que voient les familles
  connectées, la caisse, les devis et le planning.

## Quel écran ouvrir ?

| Je veux changer… | J'ouvre… | C'est visible sur… |
|---|---|---|
| Le texte ou la photo d'une activité sur le **site public** (description courte, introduction, visuel) | **Admin → Contenu**, onglet Activités | Pages « Activités » du site vitrine (liste et fiches détail) |
| Le descriptif montré aux familles au moment de **réserver** | **Admin → Activités**, bouton crayon, champ Description | Espace cavalier → Réserver (fiche de l'activité) |
| Le **titre**, le **prix**, la **couleur** ou le **nombre de places** | **Admin → Activités**, bouton crayon | Caisse et devis (immédiat) + créneaux du planning (report proposé, voir plus bas) |
| Les **tarifs affichés** sur le site public, la mini-ferme, les actus | **Admin → Contenu**, onglets Tarifs / Mini-ferme / Actus | Pages publiques correspondantes |

## 1. Le site vitrine — Admin → Contenu

L'onglet **Activités** liste chaque activité publique. En dépliant une carte, on
modifie son **visuel**, sa **description courte** et son **introduction**. Le
changement est visible sur le site public dès l'enregistrement.

- **Un champ laissé vide reprend le texte d'origine** : pour annuler une
  modification, il suffit de vider le champ.
- Ces textes ne concernent QUE le site public : ils n'apparaissent ni dans
  l'espace famille, ni sur les factures.

## 2. Le catalogue — Admin → Activités

Le bouton crayon ouvre la fiche de l'activité. Le champ **Description** alimente
la fiche que la famille consulte dans **Espace cavalier → Réserver** — il est lu
en direct, donc à jour dès l'enregistrement. Un **assistant de rédaction** (IA)
peut proposer un texte à partir du titre et du type de l'activité.

### Titre, prix, couleur, places : le cas particulier des créneaux

Chaque créneau du planning est une **copie** de l'activité, figée à sa
génération. Depuis la mise à jour du 17 août, l'enregistrement d'une activité
modifiée propose de **reporter les changements sur les créneaux à venir** (avec
le nombre de créneaux concernés) :

- les créneaux **passés** ne bougent jamais — l'historique reste ce qui a été vendu ;
- un prix ou un nombre de places **réglé à la main** sur un jour précis est conservé ;
- les places ne descendent jamais sous le nombre d'inscrits ;
- un **renommage** met aussi à jour les forfaits actifs des cavaliers à l'année,
  pour qu'ils continuent de couvrir leurs cours.

## À retenir

- La **description** (vitrine comme catalogue) est lue en direct : pas de report
  à confirmer, l'enregistrement suffit.
- Seuls **titre, prix, couleur et places** passent par la confirmation de
  report, parce qu'eux seuls sont copiés sur les créneaux.
- En cas de doute au moment de changer un texte : demandez-vous **qui doit le
  voir**. Un visiteur du site → Contenu. Une famille connectée ou la caisse →
  Activités.
