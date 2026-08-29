"use client";
import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/lib/auth-context";
import { CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui";

type Status = "ok" | "ko" | "remarque" | "non_teste";

interface Step {
  action: string;
  attendu: string;
}

interface TestCase {
  id: string;
  titre: string;
  description: string;
  steps: Step[];
  priorite: "critique" | "haute" | "normale";
}

interface Scenario {
  id: string;
  titre: string;
  emoji: string;
  description: string;
  tests: TestCase[];
}

// ─── Scénarios de test espace famille ────────────────────────────────────────
const SCENARIOS: Scenario[] = [
  {
    id: "connexion",
    titre: "Connexion & profil",
    emoji: "🔐",
    description: "Vérifier l'accès et la configuration du compte famille",
    tests: [
      {
        id: "CNX-01", titre: "Connexion Google", priorite: "critique",
        description: "Se connecter avec un compte Google",
        steps: [
          { action: "Aller sur /espace-cavalier et cliquer 'Se connecter avec Google'", attendu: "Redirection vers le tableau de bord" },
          { action: "Vérifier que le nom de la famille s'affiche en haut", attendu: "Nom correct affiché" },
        ],
      },
      {
        id: "CNX-02", titre: "Profil famille complet", priorite: "haute",
        description: "Renseigner les informations de la famille",
        steps: [
          { action: "Aller dans Profil famille → modifier nom, téléphone, adresse", attendu: "Modifications enregistrées" },
          { action: "Ajouter ou vérifier un cavalier avec prénom, date de naissance et niveau de galop", attendu: "Cavalier visible avec son galop" },
        ],
      },
      {
        id: "CNX-03", titre: "Droit à l'effacement", priorite: "normale",
        description: "Le bouton RGPD est présent",
        steps: [
          { action: "Aller dans Profil famille → descendre en bas de page", attendu: "Bouton 'Demander la suppression de mes données' visible" },
        ],
      },
    ],
  },
  {
    id: "planning",
    titre: "Vue Planning (Timeline)",
    emoji: "📅",
    description: "Tester la nouvelle vue planning intelligente",
    tests: [
      {
        id: "PL-01", titre: "Affichage vue Planning", priorite: "critique",
        description: "La vue Planning s'affiche par défaut",
        steps: [
          { action: "Aller dans Réserver → vérifier que l'onglet 'Planning' est sélectionné par défaut", attendu: "Vue Planning active avec navigation par jours" },
          { action: "Observer les 7 prochains jours avec leurs points indicateurs", attendu: "Points colorés sur les jours qui ont des créneaux" },
        ],
      },
      {
        id: "PL-02", titre: "Filtre 'Pour moi'", priorite: "critique",
        description: "Les créneaux sont filtrés selon le niveau de galop",
        steps: [
          { action: "S'assurer que le cavalier a un niveau de galop renseigné dans son profil", attendu: "Niveau de galop visible sur le profil" },
          { action: "Revenir sur Planning → filtre '✨ Pour moi' actif → vérifier les créneaux affichés", attendu: "Seuls les créneaux compatibles avec le niveau ±1 sont visibles" },
          { action: "Chercher un créneau avec le badge '✨ Parfait pour toi'", attendu: "Badge visible sur le créneau du niveau exact" },
        ],
      },
      {
        id: "PL-03", titre: "Navigation jour par jour", priorite: "haute",
        description: "Naviguer entre les jours",
        steps: [
          { action: "Cliquer sur un autre jour dans la barre de navigation", attendu: "Les créneaux du jour sélectionné s'affichent" },
          { action: "Utiliser les flèches ← → pour naviguer", attendu: "Navigation fluide, jour change correctement" },
        ],
      },
      {
        id: "PL-04", titre: "Filtres type", priorite: "normale",
        description: "Filtrer par type d'activité",
        steps: [
          { action: "Cliquer sur 'Stages' dans les filtres", attendu: "Seuls les stages s'affichent" },
          { action: "Cliquer sur 'Balades'", attendu: "Seules les balades s'affichent" },
          { action: "Cliquer sur 'Tout voir'", attendu: "Tous les créneaux réapparaissent" },
        ],
      },
      {
        id: "PL-05", titre: "Filtre par cavalier", priorite: "haute",
        description: "Si plusieurs cavaliers, filtrer par enfant",
        steps: [
          { action: "Si la famille a plusieurs cavaliers, cliquer sur le prénom d'un enfant", attendu: "Filtre 'Pour moi' n'affiche que les créneaux compatibles avec ce cavalier" },
        ],
      },
    ],
  },
  {
    id: "reservation",
    titre: "Réservation & panier",
    emoji: "🛒",
    description: "Tester le flux complet d'inscription à un créneau",
    tests: [
      {
        id: "RES-01", titre: "Réserver depuis la Timeline", priorite: "critique",
        description: "Cliquer sur Réserver → ouvre le modal enfant",
        steps: [
          { action: "Sur un créneau disponible, cliquer 'Réserver →'", attendu: "Modal 'Pour quel cavalier ?' s'ouvre" },
          { action: "Sélectionner un cavalier", attendu: "Le panier s'ouvre automatiquement avec l'article ajouté" },
        ],
      },
      {
        id: "RES-02", titre: "Paiement CB — 1 cours (CAWL)", priorite: "critique",
        description: "Payer 1 cours par CB et vérifier Firestore + admin",
        steps: [
          { action: "Réserver 1 cours → panier → Carte bancaire → Payer", attendu: "Redirection vers page CAWL (payment.preprod.ca.cawl-solutions.fr)" },
          { action: "Saisir carte test → Continue Transaction sur simulateur 3DS", attendu: "Retour sur /reservations avec bandeau vert 'Paiement confirmé'" },
          { action: "Mes factures → vérifier le statut", attendu: "Facture affiche 'Payé' + mode 'CB en ligne'" },
          { action: "Admin → Paiements → Encaissements", attendu: "Ligne CAWL visible avec montant correct" },
          { action: "Vérifier email reçu sur ceagon50@gmail.com", attendu: "Email de confirmation avec nom famille + montant + activité" },
        ],
      },
      {
        id: "RES-02B", titre: "Paiement CB — 2 stages panier unique", priorite: "critique",
        description: "Réserver 2 stages différents en un seul paiement CAWL",
        steps: [
          { action: "Réserver Stage A → panier → 'Continuer mes réservations'", attendu: "Panier garde 1 article, modal se ferme" },
          { action: "Réserver Stage B → vérifier le panier", attendu: "2 lignes dans le panier, total = Stage A + Stage B" },
          { action: "Carte bancaire → Payer", attendu: "1 seule page CAWL avec le total global" },
          { action: "Mes factures après paiement", attendu: "1 seule facture 'Payée' avec les 2 stages" },
        ],
      },
      {
        id: "RES-02C", titre: "Blocage doublon panier", priorite: "haute",
        description: "Impossible d'inscrire le même enfant 2x au même créneau",
        steps: [
          { action: "Réserver Baby pour Eliot → Continuer → re-sélectionner Baby pour Eliot", attendu: "Alerte 'Cet enfant est déjà dans le panier pour ce stage'" },
          { action: "Vérifier le panier", attendu: "Toujours 1 seul article, pas de doublon" },
        ],
      },
      {
        id: "RES-03", titre: "Paiement par chèque/espèces", priorite: "critique",
        description: "Déclaration d'un paiement hors ligne",
        steps: [
          { action: "Dans le panier → sélectionner '📝 Chèque' ou '💵 Espèces' → cliquer 'Déclarer mon paiement'", attendu: "Message de confirmation '✅ Déclaration envoyée !'" },
          { action: "Vérifier que l'admin reçoit un email de notification", attendu: "Email reçu sur ceagon50@gmail.com avec le nom de la famille et le montant" },
          { action: "Dans l'admin → Paiements → Déclarations → Confirmer réception", attendu: "Paiement passe à 'paid', email de confirmation envoyé à la famille" },
        ],
      },
      {
        id: "RES-04", titre: "Vue Liste (ancienne vue)", priorite: "normale",
        description: "L'ancienne vue par mois fonctionne toujours",
        steps: [
          { action: "Réserver → onglet 'Liste' → sélectionner un mois", attendu: "Stages et cours listés par date" },
          { action: "Cliquer sur un créneau → sélectionner un enfant → Ajouter au panier", attendu: "Article dans le panier" },
        ],
      },
    ],
  },
  // ─── Protocole « toutes les voies de paiement en ligne » ───────────────────
  // Écrit le 19 août 2026, à l'ouverture des inscriptions. Le principe : des
  // créneaux à 3 € pour que chaque essai coûte trois euros et pas cinquante-sept.
  // Trois réserves à garder en tête tout du long :
  //   1. en CAWL_ENV=production ces paiements sont RÉELS, et aucun
  //      remboursement automatique n'existe — il se fait à la main dans le
  //      back-office Worldline ;
  //   2. l'acompte de stage est plafonné au total du panier (min(30 €, total)),
  //      donc un stage à 3 € ne laisse AUCUN solde : le prélèvement automatique
  //      ne se teste qu'avec un stage à plus de 30 € ;
  //   3. tout ce qui est encaissé ici disparaîtra au reset de la base — à
  //      condition de le faire avant le 1er septembre, date à laquelle l'outil
  //      de reset se verrouille définitivement.
  {
    id: "paiements_en_ligne",
    titre: "Paiements en ligne — protocole à 3 €",
    emoji: "💳",
    description: "Chaque voie de paiement offerte à une famille, de bout en bout, pour trois euros l'essai",
    tests: [
      {
        id: "PAY-00", titre: "Préparation du terrain", priorite: "critique",
        description: "Trois créneaux jetables et trois variables Vercel — sans ça, la moitié des tests ne veut rien dire",
        steps: [
          { action: "Admin → Activités : créer « ZZ Test — cours » à 3 € (type cours) et « ZZ Test — stage » à 3 € (type stage), datés dans plus de 10 jours", attendu: "Les deux apparaissent au catalogue. Le préfixe ZZ sert à les retrouver et les supprimer en fin de protocole" },
          { action: "Créer aussi « ZZ Test — acompte » à 35 €", attendu: "C'est le seul qui laissera un solde (35 − 30 = 5 €) : sans lui, le circuit acompte + prélèvement automatique ne peut pas être testé du tout" },
          { action: "Vercel → variables : CAWL_ENV = production, CAWL_MIT_ENABLED = true", attendu: "Les deux présentes. Sans MIT_ENABLED, le solde n'est jamais prélevé : une relance par email part à la place" },
          { action: "Vercel : regarder si CAWL_PRICING_ENFORCE vaut « true »", attendu: "Si non, l'audit de prix côté serveur tourne en mode silencieux : il journalise une anomalie de montant mais ne bloque pas le paiement. Bon à savoir avant d'interpréter un test" },
          { action: "Admin → Paramètres : réservations ouvertes ; mode email restreint levé, ou l'adresse de test en liste blanche", attendu: "Sinon les emails de confirmation ne partiront pas et tu conclueras à tort qu'ils sont cassés" },
          { action: "Ouvrir dans un second onglet : Admin → Paiements → Journal", attendu: "Chaque test se vérifie là, ligne par ligne" },
        ],
      },
      {
        id: "PAY-01", titre: "Carte bancaire — montant plein (cours 3 €)", priorite: "critique",
        description: "La voie la plus empruntée : un cours réglé en une fois",
        steps: [
          { action: "Espace cavalier → Réserver → « ZZ Test — cours » → panier → 💳 Carte bancaire", attendu: "Bouton VERT « Payer 3.00 € » — vert = montant plein, orange = acompte" },
          { action: "Payer avec une vraie carte", attendu: "Redirection vers la page CAWL de production. 3 € réellement débités" },
          { action: "Au retour", attendu: "Mes réservations, bandeau vert, place devenue définitive (elle n'est plus « tenue »)" },
          { action: "Mes paiements", attendu: "Facture « Payé », mode « CB en ligne »" },
          { action: "Admin → Paiements → Journal", attendu: "Une ligne de 3 €, mode CB en ligne, bonne famille" },
          { action: "Boîte mail de la famille", attendu: "Email de confirmation avec le montant et l'activité" },
        ],
      },
      {
        id: "PAY-02", titre: "Carte bancaire — stage à 3 € : l'acompte plafonné", priorite: "critique",
        description: "Le cas piège : l'acompte de 30 € est plus élevé que le stage lui-même",
        steps: [
          { action: "Mettre « ZZ Test — stage » (3 €) au panier → 💳 Carte bancaire", attendu: "L'encadré bleu affiche « Montant réglé aujourd'hui : 3,00 € — rien d'autre à prévoir », et l'encart ambre sur l'empreinte de carte n'apparaît PAS" },
          { action: "Cocher les conditions d'annulation, puis payer", attendu: "Bouton orange « Payer 3.00 € » : l'acompte est ramené au total, il n'est pas de 30 €" },
          { action: "Mes paiements", attendu: "Facture soldée, aucun reste dû, aucun solde programmé — et aucune empreinte de carte prise, puisqu'il n'y a rien à prélever plus tard" },
        ],
      },
      {
        id: "PAY-03", titre: "Carte bancaire — stage à 35 € : acompte + empreinte", priorite: "critique",
        description: "Le vrai circuit stage : 30 € maintenant, 5 € prélevés tout seuls avant le stage",
        steps: [
          { action: "Mettre « ZZ Test — acompte » (35 €) au panier → 💳 Carte bancaire", attendu: "Encadré bleu : « 1 enfant × 30 € = 30,00 € maintenant · solde 5,00 € prélevé automatiquement ~1 semaine avant le stage »" },
          { action: "Lire l'encart ambre", attendu: "Il demande de cocher « Enregistrer mes données de paiement » sur la page de paiement, en annonçant le solde de 5,00 €" },
          { action: "Sur la page CAWL : COCHER la case d'enregistrement, puis payer les 30 €", attendu: "Sans cette case, le solde devra être réglé à la main. C'est le point de rupture le plus fréquent de tout le circuit" },
          { action: "Mes paiements", attendu: "Acompte de 30 € encaissé, 5 € restant dus, et le bandeau « le solde sera prélevé automatiquement sur votre carte enregistrée vers le … »" },
        ],
      },
      {
        id: "PAY-04", titre: "L'empreinte de carte est-elle exploitable ? (sans attendre J-7)", priorite: "critique",
        description: "Sept jours d'attente pour découvrir que le jeton manquait, c'est sept jours perdus",
        steps: [
          { action: "Admin → /admin/test-mit → identifiant du paiement de PAY-03 → « Simuler » (dry-run, ne débite rien)", attendu: "Le diagnostic complet s'affiche sans toucher à l'argent" },
          { action: "Lire les six voyants", attendu: "soldeRestant 5 €, aUnToken ✓, aIdentifiantAcompte ✓, schemeReferenceTrouvee ✓, mitActive ✓, cawlEnv « production »" },
          { action: "Si un seul est ✗", attendu: "Le solde ne sera PAS prélevé le jour venu. aUnToken ✗ = la case n'a pas été cochée ; mitActive ✗ = CAWL_MIT_ENABLED absent ; schemeReference ✗ = à voir avec CAWL (Card On File sur le PSPID de production)" },
        ],
      },
      {
        id: "PAY-05", titre: "Prélèvement du solde déclenché à la main", priorite: "critique",
        description: "Le cron accepte une date forcée : le circuit J-7 se teste aujourd'hui",
        steps: [
          { action: "Appeler /api/cron/charge-stage-balances?date=AAAA-MM-JJ&secret=<CRON_SECRET> avec la date de début du stage de PAY-03", attendu: "Réponse JSON avec autoCharged: 1" },
          { action: "Admin → Journal", attendu: "Un second encaissement de 5 €, rattaché à la même facture" },
          { action: "Mes paiements + boîte mail", attendu: "Facture entièrement payée, détaillant acompte et solde avec leurs dates ; email « Solde stage prélevé »" },
          { action: "Si autoCharged reste à 0 et qu'un email de relance part à la place", attendu: "Ce n'est pas une panne : c'est le garde-fou. CAWL_MIT_ENABLED n'est pas à « true », et le système refuse de débiter sans autorisation confirmée" },
        ],
      },
      {
        id: "PAY-06", titre: "Solde réglé par la famille elle-même", priorite: "critique",
        description: "L'autre issue du stage : la famille n'a pas enregistré sa carte et paie le solde à la main",
        steps: [
          { action: "Sur un stage dont l'acompte est payé sans empreinte de carte : Espace cavalier → Mes paiements → « Payer par CB »", attendu: "Page CAWL au montant du reste dû exactement, sans nouvelle prise d'empreinte" },
          { action: "Payer", attendu: "Facture soldée, second encaissement au journal, numéro de facture attribué" },
        ],
      },
      {
        id: "PAY-07", titre: "Panier mixte : un stage et un cours ensemble", priorite: "haute",
        description: "Le plafond de l'acompte se calcule sur le panier entier, pas sur les seules lignes de stage",
        steps: [
          { action: "Mettre au panier « ZZ Test — stage » (3 €) ET « ZZ Test — cours » (3 €) → 💳 Carte bancaire", attendu: "Total 6 €, acompte annoncé 6 € (min(30, 6)) — rien à prélever plus tard" },
          { action: "Recommencer avec le stage à 3 € et un cours à 40 € si tu en as un", attendu: "À surveiller : l'acompte de 30 € est calculé sur le total du panier, il porte donc en partie sur le cours, qui n'aurait pas dû être payé en acompte. Note-le en remarque si le montant te semble faux" },
        ],
      },
      {
        id: "PAY-08", titre: "Chèque", priorite: "critique",
        description: "Réservation ferme sans un centime encaissé — et la place tenue une semaine",
        steps: [
          { action: "Panier → 📝 Chèque → « Déclarer mon paiement par chèque »", attendu: "Message « Déclaration envoyée », place tenue (pas encore acquise)" },
          { action: "Admin → Planning, sur le créneau", attendu: "Place tenue 7 JOURS — et non 30 minutes, qui est le délai des paiements CB" },
          { action: "Boîte mail de l'admin", attendu: "Notification « Paiement chèque à confirmer » avec le nom de la famille et le montant" },
          { action: "Admin → Paiements → Déclarations → Confirmer réception", attendu: "Facture « Payé », place définitive, email à la famille, encaissement au journal en mode Chèque" },
        ],
      },
      {
        id: "PAY-09", titre: "Espèces", priorite: "haute",
        description: "Même circuit que le chèque, autre mode au journal — et une conséquence en caisse",
        steps: [
          { action: "Panier → 💵 Espèces → Déclarer", attendu: "Déclaration envoyée, place tenue 7 jours" },
          { action: "Admin → Déclarations → Confirmer", attendu: "Encaissement en mode Espèces au journal" },
          { action: "Admin → Comptabilité → Livre de caisse", attendu: "La ligne y figure aussi et fait monter le solde théorique de la caisse" },
        ],
      },
      {
        id: "PAY-10", titre: "Virement", priorite: "haute",
        description: "Troisième déclaration — à ne confirmer qu'une fois l'argent vu sur le compte",
        steps: [
          { action: "Panier → 🏦 Virement → Déclarer", attendu: "Déclaration envoyée, place tenue 7 jours. Rien n'est encaissé en ligne : c'est une déclaration, pas un virement automatique" },
          { action: "Admin → Déclarations → Confirmer", attendu: "Encaissement en mode Virement" },
          { action: "Admin → Comptabilité → Rapprochement bancaire", attendu: "La ligne est pointable contre le relevé une fois le virement réellement arrivé" },
        ],
      },
      {
        id: "PAY-11", titre: "Avoir couvrant la totalité", priorite: "critique",
        description: "Un avoir paie une réservation sans passer par la banque",
        steps: [
          { action: "Créer un avoir de 10 € pour la famille de test (annulation d'une facture, ou Admin → Avoirs)", attendu: "Le bouton « 💜 Utiliser mon avoir (10,00 € disponible) » apparaît dans le panier" },
          { action: "Panier avec le stage à 3 € → Utiliser mon avoir", attendu: "Bouton « Payer avec mon avoir (3,00 €) » puis « Avoir utilisé ! Votre avoir a couvert la totalité »" },
          { action: "Admin → Journal et Avoirs", attendu: "Écriture en mode Avoir — un crédit, pas une recette — et solde de l'avoir descendu à 7 €" },
        ],
      },
      {
        id: "PAY-12", titre: "Avoir partiel", priorite: "haute",
        description: "L'avoir ne couvre pas tout : ce qui reste doit être annoncé, et rien ne s'enchaîne tout seul",
        steps: [
          { action: "Avec un avoir de 1 € et le stage à 3 € au panier → Utiliser mon avoir", attendu: "Bandeau orange : « Votre avoir (1,00 €) ne couvre pas la totalité (3,00 €). Le reste (2,00 €) sera à régler séparément »" },
          { action: "Valider", attendu: "Bouton « Utiliser 1,00 € d'avoir », puis « Le centre équestre vous contactera pour le complément » — aucun enchaînement automatique vers la carte" },
          { action: "Admin → Impayés", attendu: "La facture apparaît avec 2 € restant dus" },
        ],
      },
      {
        id: "PAY-13", titre: "Points de fidélité convertis en avoir", priorite: "normale",
        description: "Les points ne paient jamais une commande directement : ils deviennent un avoir, qui lui paie",
        steps: [
          { action: "Admin → Paramètres → vérifier que la fidélité est activée", attendu: "Désactivée par défaut tant que le réglage n'existe pas — sans ça, aucun point n'est jamais attribué" },
          { action: "Espace cavalier → Mes paiements → « Convertir mes points en avoir »", attendu: "Refus tant que le seuil de points n'est pas atteint (500 par défaut) ; sinon création d'un avoir au taux configuré (50 pts = 1 € par défaut)" },
          { action: "Utiliser cet avoir sur une réservation", attendu: "Il se comporte comme n'importe quel avoir (cf. PAY-11)" },
        ],
      },
      {
        id: "PAY-14", titre: "Bon cadeau", priorite: "haute",
        description: "Le bon ne s'utilise pas au panier mais sur une facture déjà émise",
        steps: [
          { action: "Site public → Offrir un bon → acheter un bon de 10 € par CB (10 € est le minimum imposé : un bon à 3 € est refusé)", attendu: "Page de remerciement, code BON-XXXX reçu par email, et encaissement au journal en « CB en ligne (bon cadeau) »" },
          { action: "Espace cavalier → Mes paiements → sur une facture due, bouton « Bon cadeau » → saisir le code", attendu: "Montant déduit en mode Avoir / libellé « Bon cadeau », solde du bon décrémenté" },
          { action: "Ressaisir le même code une fois le bon épuisé", attendu: "Refus explicite — un bon ne se consomme pas deux fois" },
        ],
      },
      {
        id: "PAY-15", titre: "Lien de paiement envoyé depuis l'admin", priorite: "haute",
        description: "La voie de rattrapage : c'est le centre qui envoie le lien, pas la famille qui vient",
        steps: [
          { action: "Admin → Paiements → Impayés → sur la facture de PAY-12 → « 💳 Envoyer lien de paiement »", attendu: "Montant pré-rempli au reste dû ; email parti avec le lien, un QR CAWL et un QR de virement SEPA" },
          { action: "Ouvrir le lien depuis la boîte de la famille et payer", attendu: "Page CAWL au montant restant dû exactement" },
          { action: "Admin → Journal", attendu: "Encaissement du complément, facture soldée, disparition de la liste des impayés" },
        ],
      },
      {
        id: "PAY-16", titre: "Inscription annuelle : paiement comptant ou échelonné", priorite: "critique",
        description: "La voie qui va servir le plus à la rentrée. Le choix 3×/10× promettait un prélèvement échelonné et débitait l'année entière : il n'est plus proposé en carte",
        steps: [
          { action: "Espace cavalier → Inscription annuelle → un forfait de plus de 100 € → règlement par 💳 Carte bancaire", attendu: "AUCUN choix d'échéancier. Une phrase explique que la carte règle en une seule fois et renvoie vers le chèque ou vers le centre pour un échelonnement" },
          { action: "Regarder le bouton avant de cliquer, puis payer", attendu: "Le bouton annonce le montant exact qui sera débité, sans mention « en 3x ». Un seul encaissement, du bon montant" },
          { action: "Refaire en choisissant 📝 Chèque", attendu: "Le choix « 3 chèques » / « 10 chèques » réapparaît — là il correspond à quelque chose de réel" },
          { action: "Valider en chèque, puis regarder la commande côté admin", attendu: "Le nombre de chèques choisi est bien porté sur la commande. Les chèques différés eux-mêmes se créent à la caisse, à la remise des chèques (Paiements → Encaisser → Chèque différé) — rien n'est créé automatiquement à l'inscription" },
          { action: "Basculer de Chèque (10×) vers Carte sans quitter la page", attendu: "L'échéancier disparaît et repart de « en 1 fois » : impossible de partir en carte avec un échelonnement choisi juste avant" },
        ],
      },
      {
        id: "PAY-17", titre: "Paiement abandonné en cours de route", priorite: "haute",
        description: "Le cas le plus fréquent en vrai : la famille ferme la page de paiement",
        steps: [
          { action: "Lancer un paiement CB puis fermer l'onglet CAWL sans payer", attendu: "Aucun encaissement au journal, facture en attente" },
          { action: "Admin → Planning, sur le créneau", attendu: "Place TENUE 30 minutes (mode CB), pas acquise" },
          { action: "Attendre la purge (cron toutes les 15 minutes)", attendu: "La place est rendue automatiquement — sinon un créneau se remplit de réservations fantômes" },
        ],
      },
      {
        id: "PAY-18", titre: "Deux inscriptions, un seul paiement", priorite: "haute",
        description: "Le panier doit fusionner, pas multiplier les factures",
        steps: [
          { action: "Réserver « ZZ Test — stage » pour deux enfants, en passant par « Continuer mes réservations » entre les deux", attendu: "Deux lignes au panier, total 6 €" },
          { action: "Payer par CB", attendu: "UNE seule page CAWL au total global" },
          { action: "Mes paiements et Admin → Journal", attendu: "UNE facture et UN encaissement de 6 € — pas deux de 3 €" },
        ],
      },
      {
        id: "PAY-19", titre: "Les garde-fous", priorite: "haute",
        description: "Ce qui doit refuser de se laisser faire",
        steps: [
          { action: "Stage au panier, conditions d'annulation NON cochées", attendu: "Bouton de paiement grisé : une clause d'annulation n'est opposable que si elle a été acceptée avant de payer" },
          { action: "Admin → Paramètres → fermer les réservations, puis retenter un paiement côté famille", attendu: "Message de fermeture, aucune inscription créée, aucun débit" },
          { action: "Réserver un créneau déjà complet", attendu: "Refus côté serveur (« créneau complet »), même si l'écran affichait encore une place" },
        ],
      },
      {
        id: "PAY-20", titre: "Nettoyage — à prévoir avant le premier essai, pas après", priorite: "critique",
        description: "Ces paiements sont réels : leur sort se décide au départ",
        steps: [
          { action: "Supprimer les trois créneaux « ZZ Test — … »", attendu: "Ils disparaissent du planning et du catalogue" },
          { action: "Faire le reset de la base APRÈS ce protocole et AVANT le 1er septembre", attendu: "Tous ces encaissements de test disparaissent avec lui. L'outil de reset se verrouille tout seul au 1er septembre 2026 : passé cette date, plus de rattrapage possible" },
          { action: "Si le reset a déjà eu lieu : rembourser chaque paiement CB à la main dans le back-office Worldline", attendu: "Puis une contre-passation au journal (Paiements → Journal → Corriger). Rien ne s'efface : c'est une écriture en sens inverse, et c'est la façon normale de corriger" },
          { action: "Le bon cadeau de PAY-14", attendu: "Il vit dans une collection que le reset n'efface pas : le supprimer depuis la console Firebase, ou le laisser dormir épuisé" },
        ],
      },
    ],
  },
  {
    id: "suivi",
    titre: "Suivi des inscriptions",
    emoji: "📋",
    description: "Vérifier l'affichage des réservations et paiements",
    tests: [
      {
        id: "SUI-01", titre: "Mes réservations", priorite: "critique",
        description: "Les inscriptions s'affichent correctement",
        steps: [
          { action: "Aller dans 'Mes réservations'", attendu: "Liste des cours à venir avec date, heure, activité" },
          { action: "Vérifier qu'une réservation annulée n'apparaît PAS", attendu: "Seules les réservations confirmées visibles" },
        ],
      },
      {
        id: "SUI-02", titre: "Mes factures", priorite: "haute",
        description: "Les paiements sont visibles et téléchargeables",
        steps: [
          { action: "Aller dans 'Mes factures'", attendu: "Liste des paiements avec montant et statut" },
          { action: "Cliquer sur l'icône télécharger sur un paiement", attendu: "Facture HTML s'ouvre dans un nouvel onglet (correctement rendue, pas de texte brut)" },
        ],
      },
      {
        id: "SUI-03", titre: "Déclarer un paiement depuis les factures", priorite: "haute",
        description: "La déclaration est aussi accessible depuis l'onglet Factures",
        steps: [
          { action: "Mes factures → trouver un paiement 'À régler' → bouton '✉️ Déclarer'", attendu: "Modal de déclaration chèque/espèces s'ouvre" },
        ],
      },
    ],
  },
  {
    id: "inscription_annuelle",
    titre: "Inscription annuelle (admin)",
    emoji: "🎓",
    description: "Tester le flux complet d'inscription annuelle depuis l'admin",
    tests: [
      {
        id: "ANN-01", titre: "Inscription forfait annuel CB 3×", priorite: "critique",
        description: "Créer une inscription annuelle depuis le planning admin",
        steps: [
          { action: "Planning admin → cliquer sur un créneau de cours → EnrollPanel → mode Annuel → choisir enfant → 3× → CB → Inscrire", attendu: "3 échéances créées dans Paiements → Échéances, mode CB" },
          { action: "Vérifier dans la fiche famille (Cavaliers) que les réservations apparaissent", attendu: "22+ réservations futures listées" },
        ],
      },
      {
        id: "ANN-02", titre: "Inscription forfait annuel SEPA 10×", priorite: "critique",
        description: "Tester le flux SEPA complet",
        steps: [
          { action: "Créer un mandat SEPA pour la famille dans Prélèvements SEPA", attendu: "Mandat actif visible" },
          { action: "Planning → EnrollPanel → Annuel → 10× → SEPA → Inscrire", attendu: "10 échéances dans Prélèvements SEPA → Échéancier, paiement sepa_scheduled dans payments" },
          { action: "SEPA → cocher une échéance → Créer remise XML → télécharger", attendu: "Fichier XML téléchargé" },
          { action: "SEPA → Remises → Marquer comme déposée", attendu: "Échéances passent à 'prélevé', paiement passe à paid" },
        ],
      },
      {
        id: "ANN-03", titre: "Désinscription forfait annuel", priorite: "critique",
        description: "Vérifier que tout est nettoyé",
        steps: [
          { action: "Forfaits admin → trouver le forfait → Désinscrire → Confirmer", attendu: "Message de désinscription avec le nombre de séances, réservations et échéances annulées" },
          { action: "Vérifier dans Cavaliers → fiche famille : section Réservations", attendu: "0 réservation à venir" },
          { action: "Vérifier Paiements → Impayés", attendu: "0€ dû pour cette famille" },
          { action: "Si SEPA : vérifier Prélèvements SEPA → Échéancier", attendu: "0 échéance en attente" },
        ],
      },
    ],
  },
  {
    id: "mobile",
    titre: "Expérience mobile",
    emoji: "📱",
    description: "Vérifier que tout fonctionne sur smartphone",
    tests: [
      {
        id: "MOB-01", titre: "Homepage mobile", priorite: "critique",
        description: "La page d'accueil s'affiche correctement",
        steps: [
          { action: "Ouvrir centreequestreagon.com sur mobile", attendu: "Deux demi-écrans CE / LaserBay empilés, aucun débordement" },
        ],
      },
      {
        id: "MOB-02", titre: "Modifier un créneau sur mobile (admin)", priorite: "critique",
        description: "Le modal de modification fonctionne",
        steps: [
          { action: "Admin → Planning → clic sur l'engrenage d'un créneau", attendu: "Modal s'ouvre en bottom-sheet depuis le bas" },
          { action: "Modifier l'heure de début via le sélecteur", attendu: "Sélecteur dropdown (pas un picker natif Android)" },
          { action: "Cliquer 'Enregistrer'", attendu: "Modification sauvegardée, modal se ferme" },
        ],
      },
      {
        id: "MOB-03", titre: "Réservation mobile", priorite: "haute",
        description: "Le flux de réservation fonctionne sur mobile",
        steps: [
          { action: "Espace cavalier → Réserver → Planning → Réserver → sélectionner enfant", attendu: "Modal enfant en bottom-sheet, panier s'ouvre" },
          { action: "Choisir un mode de paiement → valider", attendu: "Confirmation ou redirection CAWL" },
        ],
      },
      {
        id: "MOB-04", titre: "Boutons visibles sur mobile (vue semaine)", priorite: "haute",
        description: "Corbeille et engrenage visibles sans hover",
        steps: [
          { action: "Admin → Planning → vue Semaine sur mobile", attendu: "Icônes corbeille 🗑️ et engrenage ⚙️ visibles directement sur les cartes créneaux" },
        ],
      },
    ],
  },
  {
    id: "compta",
    titre: "Comptabilité & rapprochement",
    emoji: "💰",
    description: "Tester les outils financiers admin",
    tests: [
      {
        id: "CPT-01", titre: "Import CSV Crédit Agricole", priorite: "haute",
        description: "Importer un relevé bancaire",
        steps: [
          { action: "Admin → Comptabilité → Rapprochement → Importer CSV CA", attendu: "Lignes parsées, pas d'erreur d'encodage Latin1" },
          { action: "Vérifier le matching CB groupé par jour et les chèques du mois", attendu: "Transactions identifiées et matchées" },
        ],
      },
      {
        id: "CPT-02", titre: "Facture depuis la fiche", priorite: "haute",
        description: "Télécharger une facture admin",
        steps: [
          { action: "Cavaliers → fiche famille → section Paiements → icône 📄", attendu: "Facture s'ouvre dans un nouvel onglet (rendue correctement)" },
        ],
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  ok:        { icon: "✅", label: "OK",       bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  btn: "bg-green-500 text-white" },
  ko:        { icon: "❌", label: "KO",       bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    btn: "bg-red-500 text-white" },
  remarque:  { icon: "⚠️", label: "?",        bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", btn: "bg-orange-400 text-white" },
  non_teste: { icon: "⏳", label: "—",        bg: "bg-gray-50",   border: "border-gray-100",   text: "text-gray-500",   btn: "bg-gray-200 text-gray-600" },
};

const PRIO_CFG = {
  critique: "🔴",
  haute:    "🟠",
  normale:  "🔵",
};

export default function TestProtocolPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<string, { status: Status; note: string; updatedAt?: string }>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedScenario, setExpandedScenario] = useState<Set<string>>(new Set(["paiements_en_ligne"]));
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "tous">("tous");

  // Lecture par la route serveur : les règles Firestore réservent settings/
  // aux administrateurs, et la recette se fait depuis un compte famille.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await authFetch("/api/test-protocol");
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || "Erreur de chargement");
        setResults(d.results || {});
      } catch (e: any) {
        setErreur(e?.message || String(e));
      }
    })();
  }, [user]);

  const save = async (newResults: typeof results) => {
    if (!user) return;
    setSaving(true);
    setErreur("");
    try {
      const res = await authFetch("/api/test-protocol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: newResults }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as any));
        throw new Error(d?.error || `Erreur ${res.status}`);
      }
    } catch (e: any) {
      // Un échec muet est pire que pas de sauvegarde du tout : on coche
      // pendant une heure et on perd tout au rechargement.
      setErreur(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = (testId: string, status: Status) => {
    const cur = results[testId]?.status;
    const newStatus = cur === status ? "non_teste" : status;
    const next = { ...results, [testId]: { ...results[testId], status: newStatus, updatedAt: new Date().toISOString() } };
    setResults(next);
    save(next);
  };

  const saveNote = (testId: string) => {
    const next = { ...results, [testId]: { ...results[testId], note: noteInput, updatedAt: new Date().toISOString() } };
    setResults(next);
    save(next);
    setNoteEditing(null);
  };

  const reset = (testId: string) => {
    const next = { ...results };
    delete next[testId];
    setResults(next);
    save(next);
  };

  const allTests = SCENARIOS.flatMap(s => s.tests);
  const stats = {
    total: allTests.length,
    ok: allTests.filter(t => results[t.id]?.status === "ok").length,
    ko: allTests.filter(t => results[t.id]?.status === "ko").length,
    remarque: allTests.filter(t => results[t.id]?.status === "remarque").length,
    non_teste: allTests.filter(t => !results[t.id] || results[t.id]?.status === "non_teste").length,
  };
  const pct = stats.total > 0 ? Math.round((stats.ok / stats.total) * 100) : 0;

  const toggleScenario = (id: string) => {
    const next = new Set(expandedScenario);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedScenario(next);
  };

  const toggleTest = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-blue-800 mb-1">Protocole de tests</h1>
        <p className="font-body text-xs text-slate-500">
          Guide de validation de l&apos;espace famille — {allTests.length} tests ·{" "}
          {saving ? "Sauvegarde..." : erreur ? "non sauvegardé" : "Auto-sauvegardé"}
        </p>
      </div>

      {erreur && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-body text-sm text-red-700">
          <strong>Vos réponses ne sont pas enregistrées</strong> — {erreur}
          <div className="text-xs mt-1">
            Ne continuez pas à cocher : tout serait perdu au rechargement.
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: "✅ OK",  val: stats.ok,       color: "text-green-600" },
          { label: "❌ KO",  val: stats.ko,       color: "text-red-600" },
          { label: "⚠️",     val: stats.remarque, color: "text-orange-600" },
          { label: "⏳",     val: stats.non_teste,color: "text-gray-400" },
        ].map(s => (
          <Card key={s.label} padding="sm" className="text-center">
            <div className={`font-body text-xl font-bold ${s.color}`}>{s.val}</div>
            <div className="font-body text-xs text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Barre de progression */}
      <Card padding="sm" className="mb-4">
        <div className="flex justify-between mb-1">
          <span className="font-body text-xs text-slate-600">Progression</span>
          <span className="font-body text-xs font-bold text-green-600">{pct}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 h-full transition-all" style={{ width: `${(stats.ok / stats.total) * 100}%` }} />
          <div className="bg-red-400 h-full transition-all" style={{ width: `${(stats.ko / stats.total) * 100}%` }} />
          <div className="bg-orange-400 h-full transition-all" style={{ width: `${(stats.remarque / stats.total) * 100}%` }} />
        </div>
      </Card>

      {/* Filtre */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {(["tous", "non_teste", "ok", "ko", "remarque"] as const).map(f => (
          <button type="button" key={f} onClick={() => setFilterStatus(f)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full font-body text-xs font-semibold border cursor-pointer transition-all ${filterStatus === f ? "bg-blue-500 text-white border-blue-500" : "bg-white text-slate-600 border-gray-200"}`}>
            {f === "tous" ? "Tous" : f === "non_teste" ? "⏳ À tester" : f === "ok" ? "✅ OK" : f === "ko" ? "❌ KO" : "⚠️ Remarque"}
          </button>
        ))}
      </div>

      {/* Scénarios */}
      <div className="flex flex-col gap-4">
        {SCENARIOS.map(scenario => {
          const scenTests = scenario.tests.filter(t =>
            filterStatus === "tous" ? true :
            filterStatus === "non_teste" ? (!results[t.id] || results[t.id]?.status === "non_teste") :
            results[t.id]?.status === filterStatus
          );
          if (scenTests.length === 0) return null;

          const scenOk = scenario.tests.filter(t => results[t.id]?.status === "ok").length;
          const scenKo = scenario.tests.filter(t => results[t.id]?.status === "ko").length;
          const isOpen = expandedScenario.has(scenario.id);

          return (
            <div key={scenario.id}>
              {/* Header scénario */}
              <button type="button"
                onClick={() => toggleScenario(scenario.id)}
                className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-blue-500/8 shadow-sm cursor-pointer text-left">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{scenario.emoji}</span>
                  <div>
                    <div className="font-display text-base font-bold text-blue-800">{scenario.titre}</div>
                    <div className="font-body text-xs text-slate-500">{scenario.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex gap-1">
                    {scenOk > 0 && <span className="font-body text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">{scenOk}✅</span>}
                    {scenKo > 0 && <span className="font-body text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{scenKo}❌</span>}
                  </div>
                  {isOpen ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                </div>
              </button>

              {/* Tests du scénario */}
              {isOpen && (
                <div className="mt-2 flex flex-col gap-2 pl-2">
                  {scenTests.map(t => {
                    const status = results[t.id]?.status || "non_teste";
                    const cfg = STATUS_CFG[status];
                    const isExpanded = expanded.has(t.id);
                    const isEditingNote = noteEditing === t.id;

                    return (
                      <div key={t.id} className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
                        {/* En-tête test */}
                        <div className="flex items-start gap-3 p-3">
                          <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                            <span className="font-body text-xs font-bold text-slate-400">{t.id}</span>
                            <span className="text-sm">{PRIO_CFG[t.priorite]}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <button type="button" onClick={() => toggleTest(t.id)}
                              className="w-full text-left bg-transparent border-none cursor-pointer p-0">
                              <div className="font-body text-sm font-semibold text-blue-800">{t.titre}</div>
                              <div className="font-body text-xs text-slate-500 mt-0.5">{t.description}</div>
                            </button>

                            {/* Étapes */}
                            {isExpanded && (
                              <div className="mt-3 space-y-2">
                                {t.steps.map((step, i) => (
                                  <div key={i} className="flex gap-2">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-body text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                                    <div>
                                      <div className="font-body text-xs text-slate-700">{step.action}</div>
                                      <div className="font-body text-[11px] text-green-600 mt-0.5">→ {step.attendu}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Note */}
                            {results[t.id]?.note && !isEditingNote && (
                              <div className="mt-1.5 font-body text-[11px] text-slate-600 bg-white/70 rounded-lg px-2 py-1">
                                💬 {results[t.id].note}
                              </div>
                            )}
                            {isEditingNote && (
                              <div className="mt-1.5 flex gap-1.5">
                                <input autoFocus value={noteInput} onChange={e => setNoteInput(e.target.value)}
                                  onKeyDown={e => { if (e.key === "Enter") saveNote(t.id); if (e.key === "Escape") setNoteEditing(null); }}
                                  placeholder="Note..."
                                  className="flex-1 font-body text-xs border border-blue-400 rounded-lg px-2 py-1 focus:outline-none bg-white"/>
                                <button type="button" onClick={() => saveNote(t.id)} className="font-body text-[11px] text-white bg-blue-500 px-2 py-1 rounded-lg border-none cursor-pointer">OK</button>
                                <button type="button" onClick={() => setNoteEditing(null)} className="font-body text-[11px] text-slate-500 bg-white px-2 py-1 rounded-lg border border-gray-200 cursor-pointer">✕</button>
                              </div>
                            )}
                          </div>

                          {/* Boutons statut */}
                          <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
                            <div className="flex gap-1">
                              {(["ok", "ko", "remarque"] as Status[]).map(s => (
                                <button type="button" key={s} onClick={() => setStatus(t.id, s)}
                                  className={`font-body text-[11px] w-8 h-8 rounded-lg border-none cursor-pointer transition-all ${status === s ? STATUS_CFG[s].btn : "bg-white text-slate-400 hover:bg-gray-100"}`}>
                                  {STATUS_CFG[s].icon}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => toggleTest(t.id)}
                                className="font-body text-[9px] text-slate-500 bg-white px-2 py-1 rounded border border-gray-200 cursor-pointer">
                                {isExpanded ? "▲" : "▼"} Étapes
                              </button>
                              <button type="button" onClick={() => { setNoteEditing(t.id); setNoteInput(results[t.id]?.note || ""); }}
                                className="font-body text-[9px] text-slate-500 bg-white px-1.5 py-1 rounded border border-gray-200 cursor-pointer">
                                💬
                              </button>
                              {status !== "non_teste" && (
                                <button type="button" onClick={() => reset(t.id)}
                                  className="font-body text-[9px] text-red-400 bg-white px-1.5 py-1 rounded border border-gray-200 cursor-pointer">
                                  <RotateCcw size={9}/>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filterStatus !== "tous" && SCENARIOS.every(s =>
        s.tests.filter(t =>
          filterStatus === "non_teste" ? (!results[t.id] || results[t.id]?.status === "non_teste") :
          results[t.id]?.status === filterStatus
        ).length === 0
      ) && (
        <Card padding="lg" className="text-center mt-4">
          <div className="text-3xl mb-2">🎉</div>
          <p className="font-body text-sm text-slate-600">
            {filterStatus === "ok" ? "Aucun test validé pour l'instant." :
             filterStatus === "ko" ? "Aucun bug trouvé ! 🎉" :
             filterStatus === "non_teste" ? "Tous les tests ont été effectués !" :
             "Aucune remarque."}
          </p>
        </Card>
      )}
    </div>
  );
}
