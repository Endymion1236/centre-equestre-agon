/**
 * Contenu du manuel admin
 *
 * Structure : chapitres > sections
 * Chaque section peut référencer :
 * - text (markdown-like léger en HTML)
 * - screenshot : chemin relatif dans /public/manuel/
 * - href : lien direct vers la page concernée de l'admin
 * - tourId : identifiant d'un tour guidé (pour déclencher un walkthrough)
 */

export interface ManualSection {
  id: string;
  title: string;
  text: string; // HTML autorisé
  screenshot?: string; // ex: "/manuel/planning-semaine.png"
  href?: string; // ex: "/admin/planning"
  tourId?: string; // ex: "planning-enroll"
  tips?: string[]; // conseils/astuces supplémentaires
}

export interface ManualChapter {
  id: string;
  title: string;
  icon: string; // nom lucide-react
  summary: string;
  sections: ManualSection[];
}

export const MANUAL: ManualChapter[] = [
  {
    id: "demarrage",
    title: "Prise en main",
    icon: "Sparkles",
    summary: "Premiers pas avec la plateforme du centre équestre.",
    sections: [
      {
        id: "vue-ensemble",
        title: "Vue d'ensemble",
        text: `
          <p>La plateforme centralise toute la gestion du centre équestre :</p>
          <ul>
            <li><strong>Cavaliers & familles</strong> — fiches, inscriptions, forfaits</li>
            <li><strong>Planning</strong> — créneaux, cours, stages, balades</li>
            <li><strong>Paiements</strong> — encaissements, factures, relances</li>
            <li><strong>Cavalerie</strong> — équidés, indisponibilités, registre</li>
            <li><strong>Montoir</strong> — assignation des poneys au quotidien</li>
            <li><strong>Comptabilité</strong> — journal, TVA, remises en banque</li>
          </ul>
          <p>Tu peux accéder à toutes ces sections depuis la sidebar à gauche.</p>
        `,
        tips: [
          "La plateforme fonctionne sur ordinateur, tablette et mobile.",
          "Toutes les données sont sauvegardées automatiquement sur Firebase.",
        ],
      },
      {
        id: "roles",
        title: "Rôles : admin vs moniteurs",
        text: `
          <p>Deux niveaux d'accès :</p>
          <ul>
            <li><strong>Admin</strong> — accès complet à toutes les sections</li>
            <li><strong>Moniteur</strong> — accès limité aux pages Terrain (Planning consultation, Montoir, Suivi pédagogique)</li>
          </ul>
          <p>Tu peux gérer qui est admin/moniteur dans <strong>Configuration → Accès moniteurs</strong>.</p>
        `,
        href: "/admin/equipe",
      },
    ],
  },

  {
    id: "cavaliers",
    title: "Cavaliers & familles",
    icon: "Users",
    summary: "Gérer les familles, leurs enfants, leurs forfaits.",
    sections: [
      {
        id: "creer-famille",
        title: "Créer une nouvelle famille",
        text: `
          <p>Depuis <strong>Cavaliers → Ajouter famille</strong> :</p>
          <ol>
            <li>Saisis nom, prénom, email, téléphone des parents</li>
            <li>Ajoute au moins un enfant (prénom + date de naissance + niveau galop)</li>
            <li>Valide — un email de bienvenue est envoyé automatiquement</li>
          </ol>
          <p>Tu peux aussi créer une famille directement depuis le panneau d'inscription d'un créneau.</p>
        `,
        href: "/admin/cavaliers",
        tourId: "cavaliers-create-family",
      },
      {
        id: "fiche-cavalier",
        title: "Consulter la fiche d'un cavalier",
        text: `
          <p>Clique sur une famille pour déplier la liste des enfants, puis sur un enfant pour voir :</p>
          <ul>
            <li>Sa <strong>progression galop</strong> (avec historique des validations)</li>
            <li>Ses <strong>inscriptions en cours</strong></li>
            <li>Son <strong>historique de présences</strong></li>
            <li>Ses <strong>informations sanitaires</strong> (allergies, contact d'urgence)</li>
          </ul>
        `,
      },
      {
        id: "recherche",
        title: "Recherche globale",
        text: `
          <p>La barre de recherche en haut de la sidebar (<strong>⌘K</strong>) permet de trouver :</p>
          <ul>
            <li>Une famille, un cavalier par nom ou prénom</li>
            <li>Un paiement par référence</li>
            <li>Un équidé par nom</li>
          </ul>
        `,
      },
    ],
  },

  {
    id: "planning",
    title: "Planning & inscriptions",
    icon: "Calendar",
    summary: "Gérer créneaux, cours réguliers, stages, balades.",
    sections: [
      {
        id: "vues",
        title: "Les 3 vues : semaine / jour / timeline",
        text: `
          <p>En haut de la page Planning tu peux basculer entre :</p>
          <ul>
            <li><strong>Semaine</strong> — vue d'ensemble 7 jours, lecture rapide</li>
            <li><strong>Jour</strong> — détail d'un jour, idéal pour gérer les inscriptions</li>
            <li><strong>Timeline</strong> — vue horaire par moniteur, pour détecter les chevauchements</li>
          </ul>
        `,
        href: "/admin/planning",
        tourId: "planning-views",
      },
      {
        id: "inscrire",
        title: "Inscrire un cavalier à un créneau",
        text: `
          <p>Depuis la vue Jour (ou Semaine) :</p>
          <ol>
            <li>Clique sur un créneau → le panneau de droite s'ouvre</li>
            <li>Cherche la famille dans la barre de recherche</li>
            <li>Sélectionne le ou les enfants</li>
            <li>Choisis le mode : <strong>Ponctuel</strong> (un seul cours) ou <strong>Forfait annuel</strong></li>
            <li>Valide → l'enfant est inscrit, un email de confirmation part à la famille</li>
          </ol>
          <p>Pour les stages, tu peux choisir entre <strong>semaine entière</strong> ou <strong>jour par jour</strong>.</p>
        `,
        tourId: "planning-enroll",
        tips: [
          "Les cavaliers déjà inscrits ou en conflit horaire apparaissent en gris avec le motif.",
          "Un forfait annuel crée automatiquement toutes les inscriptions du trimestre/année.",
        ],
      },
      {
        id: "desinscrire",
        title: "Désinscrire un cavalier",
        text: `
          <p>Dans le panneau de droite, à côté du nom de l'enfant inscrit, clique sur la croix rouge.</p>
          <p>Si le paiement a déjà été encaissé, un <strong>avoir</strong> est créé automatiquement pour le trop-perçu.</p>
        `,
      },
      {
        id: "waitlist",
        title: "Liste d'attente",
        text: `
          <p>Quand un créneau est complet, les familles peuvent s'inscrire en liste d'attente depuis l'espace cavalier.</p>
          <p>Quand une place se libère :</p>
          <ul>
            <li>Le premier en liste est <strong>notifié par email</strong> automatiquement</li>
            <li>Tu peux aussi l'inscrire manuellement depuis le panneau d'inscription</li>
          </ul>
        `,
      },
    ],
  },

  {
    id: "paiements",
    title: "Paiements & facturation",
    icon: "CreditCard",
    summary: "Encaisser, facturer, relancer les impayés.",
    sections: [
      {
        id: "encaisser",
        title: "Encaisser un paiement",
        text: `
          <p>Depuis <strong>Paiements → Encaisser</strong> :</p>
          <ol>
            <li>Sélectionne la famille</li>
            <li>Ajoute les items au panier (cours, stages, forfaits, ou saisie libre)</li>
            <li>Choisis le mode de paiement : <strong>CB terminal</strong>, <strong>Chèque</strong>, <strong>Espèces</strong>, <strong>Chèques différés</strong>, etc.</li>
            <li>Valide → la commande est créée, l'encaissement enregistré, l'email de confirmation part</li>
          </ol>
        `,
        href: "/admin/paiements",
        tourId: "paiements-encaisser",
        tips: [
          "Le montant peut être partiel (paiement en plusieurs fois).",
          "Pour un paiement mixte (ex: 100€ chèque + 50€ CB), fais deux encaissements successifs sur la même commande.",
        ],
      },
      {
        id: "cheques-differes",
        title: "Chèques différés",
        text: `
          <p>Nouveau mode pour gérer les <strong>paiements en plusieurs chèques</strong> encaissés à des dates différentes :</p>
          <ol>
            <li>À la saisie : sélectionne "Chèques différés" comme mode de paiement</li>
            <li>Remplis un formulaire par chèque (n°, banque, montant, date d'encaissement prévue)</li>
            <li>Valide → le paiement est en attente, les chèques apparaissent dans <strong>Paiements → Chèques différés</strong></li>
            <li>Le jour prévu, clique sur "Déposer" pour créer l'encaissement comptable</li>
          </ol>
          <p><strong>Fiscalité</strong> : le CA et la TVA ne sont comptés qu'au moment du dépôt effectif (comptabilité de trésorerie).</p>
        `,
        tourId: "cheques-differes",
      },
      {
        id: "impayes",
        title: "Relancer les impayés",
        text: `
          <p>L'onglet <strong>Impayés</strong> liste tous les paiements en attente avec le montant dû.</p>
          <p>Pour chaque ligne :</p>
          <ul>
            <li><strong>Relancer</strong> → envoie un email de rappel automatique</li>
            <li><strong>Lien de paiement</strong> → envoie un lien CB en ligne personnalisé avec un montant custom</li>
            <li><strong>Encaisser</strong> → accès rapide à l'encaissement</li>
          </ul>
          <p>Un badge rouge sur l'onglet indique le nombre d'impayés non à jour.</p>
        `,
      },
      {
        id: "factures",
        title: "Factures",
        text: `
          <p>Les factures PDF sont générées automatiquement pour chaque paiement encaissé.</p>
          <p>Depuis <strong>Paiements → Historique</strong> :</p>
          <ul>
            <li>Clique sur une commande pour voir le détail</li>
            <li>"Imprimer/télécharger" → génère la facture PDF avec toutes les mentions légales françaises</li>
            <li>Une commande facturée ne peut plus être modifiée (cadre légal)</li>
          </ul>
        `,
      },
    ],
  },

  {
    id: "cavalerie",
    title: "Cavalerie",
    icon: "Heart",
    summary: "Équidés, indisponibilités, soins, registre d'élevage.",
    sections: [
      {
        id: "fiches",
        title: "Fiches équidés",
        text: `
          <p>Chaque équidé a une fiche complète :</p>
          <ul>
            <li><strong>Identité</strong> : nom officiel, surnom usuel, n° SIRE, puce, type, sexe, robe, race</li>
            <li><strong>Dates</strong> : naissance, arrivée, sortie éventuelle</li>
            <li><strong>Utilisation</strong> : niveau cavalier, disciplines, tempérament, cavaliers favoris</li>
            <li><strong>Charge max</strong> : reprises/jour et heures/semaine</li>
          </ul>
          <p><strong>Astuce surnom</strong> : si tu renseignes le surnom usuel, il sera utilisé partout dans le montoir (plus court, plus pratique).</p>
        `,
        href: "/admin/cavalerie",
      },
      {
        id: "indispos",
        title: "Indisponibilités",
        text: `
          <p>Pour déclarer qu'un équidé n'est pas dispo :</p>
          <ol>
            <li>Onglet <strong>Indisponibilités → Déclarer</strong></li>
            <li>Choisis l'équidé, le motif (blessure, soin, repos, etc.), les dates</li>
            <li>Valide → l'équidé disparaît du montoir pendant la période</li>
          </ol>
          <p>À la fin de la période, l'équidé redevient automatiquement disponible.</p>
        `,
      },
      {
        id: "registre",
        title: "Registre d'élevage",
        text: `
          <p>Le registre trace toutes les entrées et sorties d'équidés (obligation légale).</p>
          <p>Chaque mouvement (achat, vente, naissance, décès, prêt) est enregistré avec date, motif, prix éventuel.</p>
        `,
      },
    ],
  },

  {
    id: "montoir",
    title: "Montoir",
    icon: "ClipboardList",
    summary: "Assigner les poneys aux cavaliers au jour le jour.",
    sections: [
      {
        id: "assigner",
        title: "Assigner un poney à un cavalier",
        text: `
          <p>Pour chaque créneau de la journée :</p>
          <ol>
            <li>Ouvre la liste des cavaliers inscrits</li>
            <li>Pour chaque cavalier, choisis un poney dans le menu déroulant</li>
            <li>Le système indique la charge du poney (nombre de séances/heures du jour)</li>
            <li>Les poneys déjà utilisés dans le même créneau apparaissent en rouge (barrés)</li>
          </ol>
        `,
        href: "/admin/montoir",
        tourId: "montoir-assign",
        tips: [
          "Un poney avec 3+ séances dans la journée apparaît en orange (attention surcharge).",
          "Coche 'Rotation poneys' pour autoriser un même poney sur plusieurs créneaux adjacents.",
          "Le bouton 'Clôturer' verrouille le créneau une fois le cours terminé.",
        ],
      },
      {
        id: "presences",
        title: "Marquer les présences",
        text: `
          <p>Pour chaque cavalier :</p>
          <ul>
            <li><strong>Vert ✓</strong> → présent</li>
            <li><strong>Rouge ✗</strong> → absent</li>
            <li>Vide → pas encore saisi</li>
          </ul>
          <p>Les présences sont utilisées pour le suivi pédagogique et le décompte des séances restantes pour les forfaits.</p>
        `,
      },
      {
        id: "affichage-tv",
        title: "Affichage TV",
        text: `
          <p>L'URL <code>/montoir/display</code> affiche une grille plein écran (idéale pour une TV dans le hall) :</p>
          <ul>
            <li>Ligne par équidé, colonne par créneau</li>
            <li>Séparation chevaux / poneys</li>
            <li>Les surnoms usuels sont affichés</li>
            <li>Rafraîchissement automatique toutes les 30 secondes</li>
          </ul>
        `,
      },
    ],
  },

  {
    id: "comptabilite",
    title: "Comptabilité",
    icon: "BookOpen",
    summary: "Journal des ventes, TVA, bordereaux de remise en banque.",
    sections: [
      {
        id: "journal",
        title: "Journal des ventes",
        text: `
          <p>Liste chronologique de tous les encaissements avec filtres par période et par mode.</p>
          <p>Utilisé pour le rapprochement avec ton expert-comptable.</p>
        `,
        href: "/admin/comptabilite",
      },
      {
        id: "tva",
        title: "TVA",
        text: `
          <p>Affiche le montant de TVA collecté sur la période (déclarations trimestrielles/annuelles).</p>
          <p>Répartition par taux (5.5% pour activités équestres, 20% pour prestations annexes).</p>
        `,
      },
      {
        id: "remises",
        title: "Bordereaux de remise",
        text: `
          <p>Pour préparer un dépôt en banque :</p>
          <ol>
            <li>Filtre par mode (CB / Chèques / Espèces)</li>
            <li>Coche les encaissements à inclure</li>
            <li>Clique "Créer le bordereau"</li>
            <li>Imprime le bordereau pour le joindre au dépôt</li>
          </ol>
          <p>Plus tard, tu pointeras la remise contre ton relevé bancaire pour vérifier qu'elle est bien passée.</p>
        `,
      },
      {
        id: "rapprochement",
        title: "Rapprochement bancaire",
        text: `
          <p>Importe le CSV de ton relevé Crédit Agricole, le système matche automatiquement :</p>
          <ul>
            <li>Les remises CB / chèques / espèces pointées</li>
            <li>Les virements et prélèvements SEPA</li>
          </ul>
          <p>Les lignes non matchées restent à pointer manuellement.</p>
        `,
      },
    ],
  },

  {
    id: "communication",
    title: "Communication",
    icon: "Mail",
    summary: "Emails groupés, rappels, templates.",
    sections: [
      {
        id: "journal-emails",
        title: "Journal des emails",
        text: `
          <p>Depuis <strong>Gestion → Journal emails</strong> : tu peux consulter tous les envois récents (500 derniers, conservés 90 jours).</p>
          <ul>
            <li>Filtres par statut (envoyé/échec), contexte, période, destinataire</li>
            <li>Badge rouge automatique sur les échecs</li>
            <li>Clic sur un email → détail complet avec cause d'erreur éventuelle</li>
          </ul>
          <p>C'est l'outil de référence pour vérifier qu'un email est bien parti.</p>
        `,
        href: "/admin/emails-log",
      },
      {
        id: "communication-ciblee",
        title: "Email ciblé",
        text: `
          <p>Depuis <strong>Communication</strong> : envoie un email à un sous-ensemble de familles :</p>
          <ul>
            <li>Filtres : par forfait actif, par galop, par activité pratiquée, etc.</li>
            <li>Variables dans le corps : <code>{prenom}</code>, <code>{parentName}</code>, etc.</li>
            <li>Aperçu avant envoi</li>
          </ul>
        `,
        href: "/admin/communication",
      },
      {
        id: "templates",
        title: "Templates d'emails",
        text: `
          <p><strong>Templates email</strong> : tu peux modifier les modèles d'emails automatiques (confirmation, rappel J-1, impayé...) sans toucher au code.</p>
          <p>Chaque template utilise des variables entre accolades qui sont remplacées à l'envoi.</p>
        `,
        href: "/admin/email-templates",
      },
      {
        id: "crons",
        title: "Envois automatiques (cron)",
        text: `
          <p>Chaque soir à 20h00, la plateforme envoie automatiquement :</p>
          <ul>
            <li>Le <strong>rappel J-1</strong> aux familles pour les cours/stages du lendemain</li>
            <li>Le <strong>récap planning</strong> aux moniteurs</li>
            <li>Les <strong>relances solde stage J-7</strong> pour les soldes non réglés</li>
          </ul>
          <p>Tu peux suivre les envois dans le <strong>Journal emails</strong>.</p>
        `,
      },
    ],
  },

  {
    id: "astuces",
    title: "Astuces & raccourcis",
    icon: "Lightbulb",
    summary: "Gagner du temps au quotidien.",
    sections: [
      {
        id: "raccourcis",
        title: "Raccourcis clavier",
        text: `
          <ul>
            <li><kbd>⌘</kbd> + <kbd>K</kbd> — recherche globale (famille, cavalier, paiement)</li>
            <li><kbd>Échap</kbd> — fermer un modal ou un panneau</li>
          </ul>
        `,
      },
      {
        id: "workflow-quotidien",
        title: "Workflow quotidien recommandé",
        text: `
          <p><strong>Le matin</strong> :</p>
          <ol>
            <li>Consulte le Montoir pour assigner les poneys de la journée</li>
            <li>Vérifie les paiements en attente / impayés</li>
          </ol>
          <p><strong>Pendant la journée</strong> :</p>
          <ol>
            <li>Encaisse au fur et à mesure</li>
            <li>Mets à jour les présences dans le Montoir</li>
          </ol>
          <p><strong>Fin de semaine</strong> :</p>
          <ol>
            <li>Prépare le bordereau de remise en banque</li>
            <li>Jette un œil au Journal emails pour vérifier qu'aucun email n'a échoué</li>
          </ol>
        `,
      },
      {
        id: "sauvegarde",
        title: "Sauvegarde des données",
        text: `
          <p>Toutes les données sont sauvegardées automatiquement sur <strong>Firebase</strong> (Google Cloud).</p>
          <p>Aucune action de ta part n'est nécessaire. Pour exporter une copie, utilise les exports CSV / FEC dans la Comptabilité.</p>
        `,
      },
    ],
  },
];
