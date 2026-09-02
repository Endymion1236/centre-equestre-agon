# Contrôle avant fusion de `test` dans `main`

49 commits, 109 fichiers. Les traitements qui décident de l'argent ont été
**déplacés sans être réécrits** — le typage et la construction ne prouvent
rien de leur comportement. Ce contrôle se fait sur le déploiement de `test`,
avec de vraies données.

## Avant de commencer

```bash
npm run test:avant-main      # tests unitaires + smoke automatisé
```

Tout doit être vert. Ce que la machine ne peut pas voir vient ensuite.

---

## 1 · L'argent — bloquant

Un échec ici arrête la fusion.

**1.1 Inscription ponctuelle, encaissement immédiat**
Inscrire un cavalier sur un cours, cocher l'encaissement, mode chèque.
→ Une commande, une écriture au journal, un cavalier au planning.
✗ Faux si : deux écritures pour un règlement, ou le cavalier absent du planning.

**1.2 Deux enfants d'une même famille, en une fois**
Le cas qui produisait deux factures de 57 € pour une seule transaction de 114 €.
→ **Une seule** commande fusionnée, **un seul** encaissement.
✗ Faux si : deux lignes distinctes au journal.

**1.3 Stage avec acompte**
Inscrire deux enfants sur un stage à 350 € l'un.
→ L'acompte affiché doit être **deux acomptes**, pas un.
→ Le même montant que celui vu depuis l'espace famille pour le même panier.
✗ Faux si : les deux écrans annoncent des montants différents.

**1.4 Stage moins cher que l'acompte**
Un stage à la journée sous le montant de l'acompte.
→ Aucun acompte proposé, tout se règle en une fois.
✗ Faux si : un solde négatif apparaît.

**1.5 Inscription annuelle**
Forfait annuel avec adhésion et licence, sur une famille ayant déjà un enfant inscrit.
→ Le prix doit être le **différentiel** d'heure, pas un forfait plein.
→ La remise famille suit le barème, et reste modifiable à la main.
✗ Faux si : le tarif diffère de celui annoncé dans l'espace famille.

**1.6 Encaissement depuis les impayés**
Chaque mode, un par un : chèque, espèces, CB, virement, **SEPA**, chèques différés, avoir.
→ Le montant dû est pré-rempli, la date du jour aussi.
→ Le SEPA crée bien une échéance ; les chèques différés créent bien N chèques.
✗ Faux si : le montant s'ouvre à zéro ou vide.

**1.7 Modification d'une commande**
Ouvrir une commande impayée depuis l'historique et depuis les impayés.
→ Les lignes s'affichent, la remise se saisit, le total suit.
→ Une commande **déjà facturée** refuse la modification.
✗ Faux si : la modale s'ouvre vide.

**1.8 Rapprochement bancaire**
Importer un vrai relevé.
→ Les lignes CAWL se rapprochent nettes de commission.
→ Une remise SEPA rejetée reste « à traiter » — c'est voulu, c'est le signal.
→ Un pointage manuel fait avant l'import est conservé.

**1.9 Bordereau de remise**
→ Ni virement, ni prélèvement SEPA, ni CB en ligne dans « à remettre ».

---

## 2 · Les écrans redécoupés

**2.1 Comptabilité** — les six onglets : journal, TVA, remise, rapprochement, FEC, export.
**2.2 Paramètres** — les cinq sections extraites : réductions, moniteurs, progression, stages, maintenance. Enregistrer dans chacune, recharger, vérifier que ça a tenu.
**2.3 Planning salariés** — les trois vues : tableau, horaire, fiche. Saisir dans une cellule : **le focus ne doit plus se perdre à chaque frappe.**
**2.4 Récurrences** — le nombre de factures annoncé doit correspondre à des factures qui existent.
**2.5 Réservation en ligne** — parcourir, mettre au panier, ouvrir le panier.
**2.6 Panneau d'inscription** — liste d'attente, création de famille, ajout de cavalier, notes de séance, plan de séance, email aux familles.

---

## 3 · Les documents

Facture PDF · Factur-X · avoir · fiche de progression · export FEC · exports CSV comptables.
→ Ils doivent **sortir réellement**, pas seulement se déclencher.

---

## 4 · Ce qui a changé exprès

À ne pas confondre avec une régression.

- **Relevé bancaire** : un fichier qui ne finit pas par un retour à la ligne donne désormais **une ligne de plus**. L'ancienne version la perdait.
- **Récurrences** : un mois dont la facture a été effacée redevient facturable. Avant, il restait bloqué et n'était jamais rattrapé.
- **Acompte de stage** : une seule règle pour l'admin et l'espace famille. Si un montant vous surprend, c'est probablement l'ancien qui était faux.
- **Remise famille** : saisissable à la main au-delà du barème, avec mention de l'écart.

---

## Si un point échoue

Ne pas fusionner. Le commit responsable se retrouve par `git log --oneline origin/main..origin/test`
et chaque message dit ce qu'il a déplacé.
