/**
 * Manuel : chapitre « Questions comptables ».
 *
 * Les situations rencontrées en septembre-novembre 2026 en préparant les FEC
 * mois par mois avec le cabinet, écrites comme des questions : le manuel les
 * retrouve par sa recherche (titre et texte). Une réponse dit quoi faire, où
 * cliquer, et ce que ça change pour la comptable.
 *
 * Tenir à jour avec CLAUDE.md quand une règle comptable change.
 */
import type { ManualChapter } from "./manual-content";

export const CHAPITRE_QUESTIONS_COMPTABLES: ManualChapter = {
  id: "questions-comptables",
  title: "Questions comptables",
  icon: "ClipboardList",
  summary: "Les cas qu'on rencontre en préparant le FEC du mois : quoi faire, où cliquer.",
  sections: [
    // ── Le mois et son FEC ─────────────────────────────────────────────
    {
      id: "fec-contenu",
      title: "Que contient le FEC envoyé à la comptable ?",
      text: `
        <p>Le FEC du mois est le fichier comptable que l'application prépare pour le cabinet. Il contient cinq journaux :</p>
        <ul>
          <li><strong>VE — Ventes</strong> : une écriture par facture.</li>
          <li><strong>RG — Règlements</strong> : l'argent reçu (carte, chèque, espèces, virement, prélèvement), les versements d'espèces en banque.</li>
          <li><strong>OD — Opérations diverses</strong> : ce qui corrige sans être de l'argent reçu — contre-passations, rejets de prélèvement, « Rétablir », avoirs utilisés, et la TVA que chaque règlement rend due.</li>
          <li><strong>HA — Achats</strong> : les factures des fournisseurs, depuis août 2026 (avant, le cabinet les saisissait).</li>
          <li><strong>BQ — Banque</strong> : les mouvements du relevé qui ne sont pas déjà dans les règlements.</li>
        </ul>
        <p>La paie, les emprunts, les amortissements et la clôture de l'exercice restent faits par le cabinet.</p>
      `,
      href: "/admin/comptabilite",
    },
    {
      id: "fec-points",
      title: "Le FEC affiche « N points à regarder » : est-ce grave ?",
      text: `
        <p>Non, la plupart du temps. Le fichier est équilibré ; la liste dit à la comptable ce qu'elle doit savoir, et à toi ce que tu peux corriger. Trois familles de points :</p>
        <ul>
          <li><strong>Pour information</strong> : « facture déjà saisie par le cabinet, seul le règlement est repris », « crédits déjà passés en banque par le journal des règlements », forfaits en plusieurs fois dont les lignes sont ramenées au montant de l'échéance.</li>
          <li><strong>À corriger dans l'application</strong> : une date de facture mal lue (« 1986 »), un débit « à classer », une facture jointe qui n'est pas la bonne.</li>
          <li><strong>À expliquer à la comptable</strong> : achat d'un cheval ou de matériel (immobilisation), assurance ou frais de prêt, cotisation retraite, apport en caisse.</li>
        </ul>
        <p>Seul ce qui est en <strong>rouge, « bloquant »</strong> empêche l'envoi : structure du fichier incorrecte, ou dépenses et banque du mois illisibles.</p>
      `,
      href: "/admin/comptabilite",
    },
    {
      id: "a-classer-471",
      title: "Qu'est-ce que « passé au 47100000 » ou « à classer » ?",
      text: `
        <p>Le 47100000 est un compte d'attente : l'application y met ce qu'elle ne sait pas ranger, plutôt que de deviner. Il doit être vide à la clôture du mois.</p>
        <p>Pour le vider : dans <strong>Dépenses</strong>, donne une catégorie au débit concerné ; pour une recette, classe-la dans le <strong>Rapprochement</strong>. Si c'est à la comptable de décider (prêt, retraite, cheval), dis-le-lui : c'est elle qui choisit le compte.</p>
      `,
      href: "/admin/comptabilite/depenses",
    },
    {
      id: "mois-deja-envoye",
      title: "J'ai trouvé une erreur sur un mois déjà envoyé à la comptable",
      text: `
        <p>On ne retouche pas un mois déjà transmis : la correction se fait <strong>aujourd'hui</strong> (contre-passation datée du jour au Journal), et elle apparaît dans le FEC du mois en cours.</p>
        <p>Préviens la comptable en une phrase : « BARBEY 80 € saisi par erreur en octobre, annulé en novembre ». Si elle te le demande, tu peux aussi lui renvoyer le FEC du mois concerné, régénéré, en précisant qu'il remplace l'ancien.</p>
      `,
    },
    {
      id: "mois-celeris",
      title: "Juillet et août : pourquoi ces mois sont-ils différents ?",
      text: `
        <p>Juillet et août 2026 ont été tenus dans <strong>Céleris</strong>, l'ancien logiciel. Pour ces mois, le FEC reprend les écritures de Céleris, et l'application n'ajoute que les achats et la banque que Céleris n'avait pas.</p>
        <ul>
          <li><strong>N'encaisse rien</strong> depuis le Rapprochement pour ces mois : l'argent est déjà dans Céleris, il serait compté deux fois.</li>
          <li>Importer le CSV de la banque de ces mois sert seulement au <strong>Contrôle de banque</strong> ; ses lignes restent « non rapprochées », c'est normal.</li>
          <li>Céleris n'avait passé en banque que les virements : les remises de cartes, chèques et espèces sont restées dans ses comptes « à encaisser ». Le contrôle de banque d'août montre donc un écart, à régler avec la comptable.</li>
        </ul>
      `,
    },
    // ── La banque ──────────────────────────────────────────────────────
    {
      id: "deux-imports-banque",
      title: "Pourquoi deux imports du relevé (Trésorerie et Rapprochement) ?",
      text: `
        <p>Ils ne lisent pas la même chose :</p>
        <ul>
          <li><strong>Trésorerie → relevé PDF</strong> : le solde de fin de mois et les <strong>débits</strong> (l'argent qui sort), qui deviennent les dépenses.</li>
          <li><strong>Comptabilité → Rapprochement → « Importer CSV »</strong> : les <strong>crédits</strong> (l'argent qui entre), rapprochés des encaissements. Fichier CSV à télécharger sur le site du Crédit Agricole.</li>
        </ul>
        <p>Le FEC et le contrôle de banque ont besoin des deux. Le message « Aucun crédit du relevé » veut dire que le CSV du mois n'a pas été importé dans le Rapprochement.</p>
      `,
      href: "/admin/comptabilite?tab=rapprochement",
    },
    {
      id: "controle-banque",
      title: "Le contrôle de banque montre un écart : comment le lire ?",
      text: `
        <p>Comptabilité → FEC → <strong>« Contrôle de banque »</strong> met chaque mouvement du relevé en face du compte banque (512) du FEC. L'écart = FEC − relevé.</p>
        <ul>
          <li><strong>Écart positif</strong> : le FEC compte plus d'argent en banque que le relevé — un encaissement en double, ou un virement jamais reçu.</li>
          <li><strong>Écart négatif</strong> : une recette du relevé manque au FEC, ou une sortie est comptée deux fois.</li>
          <li><strong>« Dans le FEC, absent du relevé »</strong> : regarde la famille dans Diagnostic famille (virement encaissé deux fois ?).</li>
          <li><strong>« Remise que le FEC n'a qu'en partie »</strong> : pour une remise SEPA, le détail échéance par échéance s'affiche dessous.</li>
          <li><strong>« Lignes qui s'annulent »</strong> : une correction et sa ressaisie, sans effet sur la banque.</li>
        </ul>
        <p>Le bouton <strong>« Copier pour la comptable »</strong> donne le texte prêt à coller dans un mail.</p>
      `,
      href: "/admin/comptabilite",
      tips: [
        "Une correction faite le mois suivant (contre-passation) laisse l'écart dans le mois d'origine : c'est normal, explique-le à la comptable.",
      ],
    },
    {
      id: "virement-double",
      title: "Un virement a été encaissé plusieurs fois",
      text: `
        <p>Cas GAGNARD : un seul virement de 69,90 € pointé sur trois échéances. Ouvre <strong>Diagnostic famille</strong>, cherche le nom : la section « Virements : relevés bancaires et journal » dit quelles écritures sont en trop.</p>
        <p>Pour chacune en trop : <strong>Paiements → Journal → « Corriger »</strong>, montant <strong>0</strong>. L'échéance redevient due ; la famille la réglera normalement. La veille du matin signale aussi un virement encaissé plusieurs fois.</p>
      `,
      href: "/admin/diag-famille",
    },
    {
      id: "retablir",
      title: "J'ai annulé une écriture par erreur",
      text: `
        <p>Dans <strong>Paiements → Journal</strong>, sur la contre-passation faite par erreur, clique <strong>« Rétablir »</strong>. Une nouvelle écriture identique est créée, <strong>datée du jour</strong> (pour ne pas retoucher un mois déjà envoyé). La date d'origine est rappelée dans le motif.</p>
        <p>« Rétablir » est refusé si l'annulation était justifiée : si la commande serait payée plus que son montant, ou si le virement d'origine est déjà encaissé par une autre écriture.</p>
      `,
      href: "/admin/paiements",
    },
    {
      id: "cb-mauvais-mode",
      title: "« Remise carte rapprochée à des écritures en espèces, virement ou prélèvement »",
      text: `
        <p>La banque a crédité une remise de cartes, mais une des écritures pointées dessus a été saisie avec un autre mode (espèces, virement…). Corrige le mode de paiement de cette écriture au Journal (« Corriger », mode carte), ou revois le pointage dans le Rapprochement. En attendant, le FEC met la somme au 47100000.</p>
        <p>Le solde d'un stage débité automatiquement sur la carte enregistrée de la famille (« Prélèvement automatique du solde (CAWL) ») est bien un paiement par carte : il n'est plus signalé.</p>
      `,
    },
    {
      id: "doublons-releve",
      title: "Un débit est marqué « doublon probable »",
      text: `
        <p>Le même débit semble importé deux fois (relevé relu, libellé un peu différent). Il reste hors du FEC tant que tu n'as pas tranché dans <strong>Dépenses → doublons</strong> : garde-le, ou dis que ce sont deux opérations distinctes.</p>
        <p>Deux débits du même jour, même libellé, même montant, mais avec deux factures aux numéros différents (commissions de vente à distance) ne sont plus pris pour des doublons.</p>
      `,
      href: "/admin/comptabilite/depenses",
    },
    {
      id: "releve-relu",
      title: "Le relevé déjà importé revient « à vérifier »",
      text: `
        <p>Le relevé PDF est relu à chaque import, et la lecture varie un peu (« Com Carte » au lieu de « Commission carte », une ligne de plus). Une ligne déjà traitée est reconnue par sa date, son montant et son nom : elle s'affiche « déjà importé ».</p>
        <p>S'il en reste « à vérifier », choisis l'action dans le menu de la ligne (« Lier à… », « Nouveau »…) : ton choix est pris en compte.</p>
      `,
      href: "/admin/comptabilite/tresorerie",
    },
    // ── Prélèvements SEPA ──────────────────────────────────────────────
    {
      id: "prelevement-rejete",
      title: "Un prélèvement est revenu impayé (rejeté)",
      text: `
        <p>Le relevé montre une ligne « Impayé Prel… » au débit. Elle n'apparaît pas dans le Rapprochement, qui ne lit que les crédits.</p>
        <ol>
          <li><strong>Prélèvements SEPA</strong> → sur l'échéance prélevée, bouton <strong>« Rejeté »</strong> : l'encaissement est annulé, la commande redevient due ; tu peux prévoir une nouvelle présentation.</li>
          <li>Puis <strong>« Prévenir la famille »</strong> : un email (modifiable dans Emails) lui demande quand l'échéance peut être représentée.</li>
        </ol>
        <p>Dans le FEC, la sortie d'argent est datée du relevé, même si tu enregistres le rejet le mois suivant. Tant que le rejet n'est pas enregistré, le FEC le met en attente avec une consigne.</p>
      `,
      href: "/admin/sepa",
    },
    {
      id: "remise-sepa-incomplete",
      title: "Une remise SEPA a été prélevée mais des échéances n'ont pas d'encaissement",
      text: `
        <p>Cas d'octobre 2026 : la banque a prélevé les 48 échéances de la remise n° 6, mais 4 n'avaient pas été enregistrées au journal (le dépôt s'était interrompu). Le contrôle de banque les nomme.</p>
        <p>Vérifie d'abord que ces familles n'ont pas payé autrement entre-temps, puis : <strong>Prélèvements SEPA → Remises</strong>, sur la remise, bouton <strong>« Compléter »</strong>. Les encaissements manquants sont créés, datés du jour, avec la mention « oublié au dépôt ». Relancer ne crée jamais de double.</p>
      `,
      href: "/admin/sepa?tab=remises",
    },
    // ── Remboursements et avoirs ───────────────────────────────────────
    {
      id: "rembourser-famille",
      title: "Comment rembourser une famille ?",
      text: `
        <p>Le mieux : <strong>Paiements</strong> → annuler la commande et choisir ce qui est rendu (avoir, remboursement par carte, virement, chèque ou espèces). Le remboursement est enregistré au journal et sort par le même moyen que l'argent était entré.</p>
        <p>Sur le relevé, le virement que tu as fait à la famille apparaît en débit : dans <strong>Dépenses</strong>, donne-lui la catégorie <strong>« Remboursement à une famille »</strong>. Ce n'est jamais une dépense : il va au compte de la famille, et n'est pas compté deux fois s'il est aussi enregistré dans Paiements.</p>
      `,
      href: "/admin/paiements",
    },
    {
      id: "avoir-client",
      title: "Utiliser l'avoir d'une famille sur une nouvelle commande",
      text: `
        <p><strong>Avoirs</strong> → « Utiliser » sur l'avoir, puis choisis la commande à créditer (la liste comprend aussi les fiches rattachées à la famille). Le montant se déduit de la facture ; si elle est soldée, elle reçoit son numéro.</p>
        <p>Dans le FEC, l'avoir utilisé passe au journal des opérations diverses.</p>
      `,
      href: "/admin/avoirs",
    },
    {
      id: "avoir-fournisseur",
      title: "Un fournisseur m'a remboursé (avoir fournisseur)",
      text: `
        <ol>
          <li><strong>Comptabilité → Rapprochement</strong> : classe le crédit en « Remboursement fournisseur ».</li>
          <li>Sous la ligne, <strong>« 📎 Joindre l'avoir »</strong> : dépose le PDF ou la photo du ticket. Le montant, la TVA, le numéro et la date sont lus ; vérifie.</li>
          <li>Choisis la catégorie de l'achat annulé (celle du dernier achat chez ce fournisseur est proposée), puis « Enregistrer l'avoir ».</li>
        </ol>
        <p>Dans le FEC, l'avoir annule la part de la dépense et de sa TVA ; la TVA récupérée du mois baisse d'autant dans la préparation de la déclaration. Sans avoir joint, l'argent va au compte du fournisseur et la comptable te demandera la pièce.</p>
      `,
      href: "/admin/comptabilite?tab=rapprochement",
    },
    {
      id: "bon-cadeau",
      title: "« Bon cadeau sans facture rattachée : TVA non rendue exigible »",
      text: `
        <p>C'est normal : un bon cadeau n'est pas encore une vente. La TVA sera due quand le bon sera utilisé pour une prestation. Rien à faire.</p>
      `,
    },
    // ── Les dépenses ───────────────────────────────────────────────────
    {
      id: "date-facture-mal-lue",
      title: "« La date lue sur la facture précède le paiement de plus d'un an »",
      text: `
        <p>La lecture automatique a mal lu l'année (« 1986 », « 2006 »), souvent sur une facture manuscrite. Le FEC passe l'achat à la date du paiement, donc il reste juste ; mais corrige la date sur le justificatif dans <strong>Dépenses</strong> pour que la comptable ait la bonne pièce.</p>
      `,
      href: "/admin/comptabilite/depenses",
    },
    {
      id: "facture-cabinet",
      title: "« Facture déjà saisie par le cabinet ; seul le règlement est repris »",
      text: `
        <p>La facture date d'avant août 2026 : le cabinet l'a déjà enregistrée. L'application ne reprend que son paiement, pour qu'il se rapproche de l'écriture du cabinet. Rien à faire.</p>
        <p>Si la date de facture est récente mais qu'on te dit le contraire, c'est que la date a été mal lue (voir la question précédente), ou que la facture jointe n'est pas la bonne (une ancienne facture d'abonnement, par exemple).</p>
      `,
    },
    {
      id: "immobilisation",
      title: "J'ai acheté un cheval, un véhicule ou du matériel",
      text: `
        <p>Un bien qui sert plusieurs années (cheval, imprimante 3D, tracteur, van, clôtures…) n'est pas une dépense du mois : la comptable l'<strong>amortit</strong> sur plusieurs années. Dans <strong>Dépenses</strong>, choisis la catégorie <strong>« Immobilisation — à amortir »</strong> et joins la facture ou l'attestation de vente.</p>
        <p>Le FEC le signale pour qu'elle choisisse le compte et la durée. Repère : au-delà d'environ 500 € HT, pose-toi la question.</p>
      `,
      href: "/admin/comptabilite/depenses",
    },
    {
      id: "restaurant",
      title: "Un repas au restaurant : quelle catégorie ?",
      text: `
        <p>Règle de la comptable :</p>
        <ul>
          <li><strong>Un seul repas</strong> (le tien) : catégorie « Repas, restauration &amp; réceptions ». Compte 625600, <strong>TVA jamais récupérée</strong>.</li>
          <li><strong>Deux repas ou plus</strong> (tu invites quelqu'un) : catégorie « Repas à plusieurs (invités, 2 repas et plus) ». Compte 625700, TVA récupérée — <strong>note le nom des invités sur la facture</strong>.</li>
        </ul>
      `,
      href: "/admin/comptabilite/depenses",
    },
    {
      id: "paiement-superieur-facture",
      title: "J'ai payé plus que la facture (vétérinaire, ancienne dette)",
      text: `
        <p>Règle de la comptable : on ne passe en achat <strong>que le montant de la facture</strong>. Si le paiement couvre aussi une facture plus ancienne, le FEC le signale : <strong>réclame cette facture</strong> au fournisseur et dépose-la dans Dépenses, pour qu'elle soit comptabilisée.</p>
        <p>En attendant, l'écart reste au compte du fournisseur ; la TVA de la facture jointe est bien récupérée.</p>
      `,
      href: "/admin/comptabilite/depenses",
    },
    {
      id: "comptes-cabinet",
      title: "Quel compte pour Orange, HelloAsso, Avem, Equiclic… ?",
      text: `
        <p>La comptable a donné ses comptes, fournisseur par fournisseur (05/11/2026). L'application les applique d'elle-même, quelle que soit la catégorie choisie :</p>
        <ul>
          <li>HelloAsso : 628000 · Avast, Google One, Anthropic : 615620 · Standard Facile, Orange : 626200</li>
          <li>Avem (location du TPE) : 613230 · Leasecom (machine à café) : 613210</li>
          <li>Equiclic, PADD (sellerie) : 606601 · Rex Rotary (relevé de compteur de l'imprimante) : 606620</li>
        </ul>
        <p>Un nouveau fournisseur sans règle prend le compte de sa catégorie ; si la comptable en demande un autre, dis-le pour qu'on l'ajoute.</p>
      `,
    },
    {
      id: "pret-retraite",
      title: "Prêt, assurance du prêt, cotisation retraite (SwissLife)",
      text: `
        <p>Ces débits ne se rangent pas seuls : l'échéance d'un prêt mêle capital et intérêts (la comptable répartit avec le tableau de remboursement), et une cotisation retraite de l'exploitant a un traitement fiscal à part. Donne-leur leur catégorie (« Emprunts », « Retraite / PER — à vérifier ») : le FEC les signale, la comptable décide.</p>
      `,
    },
    {
      id: "apport-caisse",
      title: "« Apport en caisse : origine des fonds à confirmer »",
      text: `
        <p>De l'argent a été ajouté dans la caisse sans venir d'une vente (fonds de caisse, argent personnel…). Dis à la comptable d'où il vient : c'est elle qui choisit le compte (apport de l'exploitant, retrait de la banque…).</p>
      `,
    },
    // ── Factures et TVA ────────────────────────────────────────────────
    {
      id: "detail-total-facture",
      title: "« Le détail saisi ne retombait pas sur le total de la facture »",
      text: `
        <p><strong>Forfait payé en plusieurs fois</strong> (3× ou 10×) : la première échéance porte toutes les lignes du forfait pour le montant d'une seule échéance. C'est normal : l'application ramène les lignes au montant de l'échéance.</p>
        <p><strong>Sinon</strong> (le total dépasse les lignes, par exemple de 36,60 €) : une ligne semble manquer, ou un prix a été modifié sans la ligne. Ouvre la facture et vérifie ; le FEC reste équilibré, seule la répartition entre activités est approchée.</p>
      `,
      href: "/admin/paiements",
    },
    {
      id: "tva-encaissements",
      title: "Quand la TVA est-elle due ?",
      text: `
        <p>Le club déclare la TVA <strong>sur les encaissements</strong> (prestations de services) : elle est due quand l'argent arrive, pas à la date de la facture. Un forfait payé en 10 fois rend due la TVA de chaque échéance au fur et à mesure.</p>
        <p>La TVA récupérable vient des factures fournisseurs jointes aux dépenses, moins celle des avoirs fournisseurs. <strong>Comptabilité → TVA</strong> prépare la déclaration case par case (CA3), avec la comparaison « sur factures » pour contrôle.</p>
      `,
      href: "/admin/comptabilite",
      tips: [
        "Une dépense sans facture jointe n'apporte pas de TVA récupérable : réunis les factures avant de déclarer.",
      ],
    },
  ],
};
