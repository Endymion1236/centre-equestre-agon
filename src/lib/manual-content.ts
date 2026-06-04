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
      {
        id: "cloture-journaliere",
        title: "Clôture journalière (NF525)",
        text: `
          <p>La <strong>clôture journalière</strong> fige les encaissements de la journée dans le journal certifié
          <strong>NF525</strong> (chaînage sécurisé, inaltérable). C'est l'équivalent du « Z de caisse » : une fois la journée
          clôturée, on ne peut plus la modifier.</p>
          <p>À faire en fin de journée d'encaissement, après avoir saisi tous les paiements du jour.</p>
        `,
        href: "/admin/comptabilite/cloture-journaliere",
        tips: [
          "Vérifie que tous les encaissements du jour sont saisis AVANT de clôturer — une clôture est définitive.",
        ],
      },
      {
        id: "livre-caisse",
        title: "Livre de caisse espèces",
        text: `
          <p>Le <strong>livre de caisse espèces</strong> retrace, mois par mois, tous les mouvements en espèces
          (encaissements, sorties) avec le solde courant. C'est le registre légal des espèces.</p>
        `,
        href: "/admin/comptabilite/livre-caisse",
      },
      {
        id: "fond-caisse",
        title: "Fond de caisse",
        text: `
          <p>La page <strong>Fond de caisse</strong> permet de compter le fond physique (billets et pièces) et de le
          rapprocher du solde théorique attendu. Utile pour vérifier qu'il n'y a pas d'écart de caisse.</p>
          <p>En cas d'écart, la page <strong>Diagnostic espèces</strong> aide à retrouver d'où vient la différence.</p>
        `,
        href: "/admin/comptabilite/fond-caisse",
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
    id: "management",
    title: "Management des salariés",
    icon: "Users",
    summary: "Planifier les tâches de l'équipe, suivre les heures et gérer les salariés.",
    sections: [
      {
        id: "management-planning",
        title: "Planning des tâches (semaine)",
        text: `
          <p>L'onglet <strong>Planning</strong> organise les tâches de l'équipe semaine par semaine : chaque salarié reçoit
          ses tâches (écuries du matin, check-list poney, cours, entretien…) avec un horaire. Les salariés sont repérés par
          une couleur.</p>
          <p>Tu navigues de semaine en semaine et tu ajoutes/déplaces les tâches depuis la <strong>bibliothèque de tâches</strong>.</p>
        `,
        href: "/admin/management",
        tips: [
          "Les moniteurs présents dans le planning des cours sont repris automatiquement comme salariés.",
        ],
      },
      {
        id: "management-resume",
        title: "Résumé : charge hebdomadaire",
        text: `
          <p>L'onglet <strong>Résumé</strong> affiche la <strong>charge de travail</strong> de chaque salarié sur la semaine
          (total d'heures / de tâches). Utile pour équilibrer la répartition et repérer les surcharges.</p>
        `,
        href: "/admin/management",
      },
      {
        id: "management-horaires",
        title: "Horaires & feuilles de temps",
        text: `
          <p>L'onglet <strong>Horaires</strong> récapitule, mois par mois, les heures de chaque salarié sous forme de
          <strong>feuille de temps</strong>. Chaque salarié peut <strong>signer</strong> sa feuille (signature électronique) pour
          valider ses heures.</p>
        `,
        href: "/admin/management",
        tips: [
          "La feuille de temps mensuelle sert de base pour la paie / le suivi des heures.",
        ],
      },
      {
        id: "management-bibliotheque",
        title: "Bibliothèque de tâches",
        text: `
          <p>L'onglet <strong>Bibliothèque</strong> regroupe les <strong>types de tâches réutilisables</strong> (ex : « Écuries matin »,
          « Check-list poney »). Pour chaque type, tu définis les jours par défaut et les horaires de début standards, ce qui
          accélère la création du planning.</p>
        `,
        href: "/admin/management",
      },
      {
        id: "management-equipe",
        title: "Équipe (salariés)",
        text: `
          <p>L'onglet <strong>Équipe</strong> liste les salariés, leur couleur et leur statut (actif / inactif). C'est ici que
          tu gères qui apparaît dans le planning des tâches.</p>
        `,
        href: "/admin/management",
      },
      {
        id: "management-modeles",
        title: "Modèles de planning",
        text: `
          <p>L'onglet <strong>Modèles</strong> permet d'enregistrer des plannings types (ex : « Semaine scolaire »,
          « Planning standard hors vacances ») pour les réappliquer en un clic plutôt que de tout ressaisir.</p>
        `,
        href: "/admin/management",
      },
      {
        id: "management-agent-ia",
        title: "Agent IA (questions sur le planning)",
        text: `
          <p>L'onglet <strong>Agent IA</strong> répond en langage naturel à des questions sur l'organisation de l'équipe,
          par exemple : « Qui est disponible mercredi après-midi ? » ou « Quelle est la charge d'Emmeline cette semaine ? ».
          Il peut aussi proposer une répartition des tâches.</p>
        `,
        href: "/admin/management",
        tips: [
          "L'agent s'appuie sur le planning et les salariés saisis : plus les données sont à jour, plus ses réponses sont justes.",
        ],
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

  {
    id: "import-celeris",
    title: "Import Celeris & mise en service",
    icon: "ClipboardList",
    summary: "Reprendre les familles et stages depuis Celeris, semaine par semaine, et lever les garde-fous le jour J.",
    sections: [
      {
        id: "import-familles",
        title: "Importer les familles, semaine par semaine",
        text: `
          <p>La reprise des données Celeris se fait <strong>une semaine de stage à la fois</strong>, depuis la page
          <strong>Import Celeris</strong>. Chaque famille est rattachée à la (aux) semaine(s) où ses enfants sont inscrits.</p>
          <ol>
            <li>Choisis la <strong>semaine</strong> dans le menu déroulant (6 juillet, 13 juillet, …).</li>
            <li>Clique <strong>« Aperçu de la semaine »</strong> — aucune écriture, ça liste juste les familles à créer.</li>
            <li>Si l'aperçu est correct, clique <strong>« Importer cette semaine pour de vrai »</strong>.</li>
          </ol>
          <p>L'import crée les <strong>fiches familles + enfants</strong> uniquement (pas d'inscription, pas de paiement).
          Les familles dont un enfant existe <strong>déjà en base</strong> sont automatiquement <strong>ignorées</strong> : pas de doublon,
          même si tu réimportes une semaine.</p>
        `,
        href: "/admin/import-celeris",
        tips: [
          "L'import refuse de s'exécuter sans semaine choisie — impossible d'importer tout le fichier d'un coup.",
          "On importe d'abord les fiches (étape 1), PUIS on inscrit aux stages (étape 2). Jamais l'inverse.",
        ],
      },
      {
        id: "inscrire-stages",
        title: "Inscrire aux stages (sans paiement)",
        text: `
          <p>Une fois les fiches importées, l'<strong>étape 2</strong> (section teal de la page) inscrit chaque enfant dans
          <strong>tous les jours</strong> de son stage, <strong>sans créer de paiement</strong> — l'argent reste encaissé dans Celeris,
          le journal comptable n'est pas touché.</p>
          <ol>
            <li><strong>« Aperçu inscription aux stages »</strong> — vérifie qui sera inscrit, qui l'est déjà, et les éventuels problèmes.</li>
            <li><strong>« Inscrire aux stages pour de vrai »</strong> — réalise l'inscription.</li>
          </ol>
          <p>Ces inscriptions apparaissent au planning avec un <strong>point teal « réglé (Celeris) »</strong> et sont
          <strong>exclues des impayés</strong> (puisqu'elles ont été payées dans Celeris).</p>
          <p>Le bouton <strong>« Lister les créneaux-stages de la semaine »</strong> sert au diagnostic : il affiche les stages réels
          en base avec leurs identifiants, utile si un libellé ne correspond pas.</p>
        `,
        href: "/admin/import-celeris",
        tips: [
          "Si un enfant apparaît en « problème » (introuvable), le rapport explique pourquoi : fiche non importée, ou enfant absent de sa fiche.",
          "L'inscription en masse ne déclenche PAS l'alerte toast « stage complet » (qui ne sort qu'à l'inscription manuelle au planning). Le badge X/Y du planning passe quand même au rouge quand c'est plein.",
        ],
      },
      {
        id: "passer-en-prod",
        title: "Passer un import en production",
        text: `
          <p>La page d'import fonctionne sur la base affichée dans l'aperçu (<code>gestion-2026-test</code> en test,
          <code>gestion-2026</code> en prod). Par sécurité, <strong>l'aperçu est libre partout</strong>, mais
          <strong>toute écriture réelle en production demande un mot-clé de confirmation</strong> :</p>
          <ul>
            <li>Import des fiches en prod → tape <code>IMPORT-PROD</code> dans la fenêtre de confirmation.</li>
            <li>Inscription aux stages en prod → tape <code>INSCRIRE-PROD</code>.</li>
          </ul>
          <p>En base test, aucun mot-clé n'est demandé. Ce garde-fou empêche d'écrire en prod par accident.</p>
        `,
        tips: [
          "Toujours faire l'aperçu d'abord : il affiche la base concernée (test ou prod) avant toute écriture.",
        ],
      },
      {
        id: "mode-restreint-emails",
        title: "Mode restreint des emails (et comment le lever)",
        text: `
          <p>Pendant la phase de préparation, les familles ont été importées avec leurs vrais emails, mais on ne veut
          <strong>surtout pas leur envoyer d'emails</strong>. Un <strong>mode restreint</strong> est donc <strong>actif par défaut</strong> :
          seuls reçoivent des emails…</p>
          <ul>
            <li>les <strong>emails admin</strong> ;</li>
            <li>le compte de test <code>laserbayagon@gmail.com</code> ;</li>
            <li>tout email ajouté dans la variable <code>EMAIL_ALLOWLIST</code> (séparés par des virgules — <strong>y mettre les emails des moniteurs</strong>).</li>
          </ul>
          <p>Tous les autres destinataires (les familles) sont <strong>bloqués et tracés</strong> dans le Journal emails, sans aucun envoi.
          Cela couvre tous les canaux : emails manuels, liens de paiement, confirmations CAWL, rappels J-1, prélèvements de solde, activations.</p>
          <p><strong>Le jour de la mise en service</strong>, pour rouvrir l'envoi à tout le monde : sur Vercel, ajoute la variable
          <code>EMAIL_RESTRICTED_MODE = off</code> (sur la prod), puis redéploie. Sans cette variable, le mode restreint reste actif.</p>
        `,
        tips: [
          "Les variables EMAIL_ALLOWLIST et EMAIL_RESTRICTED_MODE se règlent dans Vercel → Settings → Environment Variables (par base : prod et/ou test).",
          "Les notifications push (mobiles) ne sont pas concernées par ce mode restreint — uniquement les emails.",
          "Après modification d'une variable Vercel, il faut redéployer pour qu'elle soit prise en compte.",
        ],
      },
      {
        id: "envoyer-activation",
        title: "Envoyer les liens d'activation aux familles",
        text: `
          <p>Pour qu'une famille accède à son espace en ligne (réservations, factures, profil), elle doit
          <strong>activer son compte</strong> via un <strong>lien magique</strong> envoyé par email. Ça se passe sur la page
          <strong>Bascule prod</strong>.</p>
          <p><strong>Procédure recommandée (phase pilote) :</strong></p>
          <ol>
            <li>Choisis <strong>1 à 3 familles pilotes</strong> de confiance (toi-même, Emmeline, un parent habitué).</li>
            <li>Coche-les dans la liste (recherche par nom, email ou prénom d'enfant).</li>
            <li>Clique <strong>« Simuler »</strong> (dry-run) : ça vérifie les emails sans rien envoyer.</li>
            <li>Si tout est bon, clique <strong>« Envoyer pour de vrai »</strong>. La famille reçoit un email avec un lien
            pour activer son espace (sans mot de passe à créer).</li>
            <li>Quand les pilotes ont validé que tout fonctionne, tu pourras envoyer aux ~93 familles en masse.</li>
          </ol>
          <p>Maximum <strong>10 familles par envoi</strong> en phase pilote. Chaque envoi est tracé.</p>
        `,
        href: "/admin/bascule-prod",
        tips: [
          "⚠️ Important : tant que le MODE RESTREINT des emails est actif (voir section précédente), un lien d'activation vers une famille NON autorisée est bloqué. Pour activer une vraie famille, ajoute son email à EMAIL_ALLOWLIST, ou attends la mise en service (EMAIL_RESTRICTED_MODE=off).",
          "Le lien magique ne demande pas de mot de passe : la famille clique et son espace est activé.",
        ],
      },
    ],
  },
];
