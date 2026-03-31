"use client";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { CheckCircle2, XCircle, AlertCircle, Clock, RotateCcw, Download, Filter } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Status = "ok" | "ko" | "remarque" | "non_teste";

interface TestResult {
  status: Status;
  note: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface TestCase {
  id: string;
  module: string;
  sous_module?: string;
  description: string;
  etapes: string;
  resultat_attendu: string;
  priorite: "critique" | "haute" | "normale";
}

// ─── Données des tests ────────────────────────────────────────────────────────
const TESTS: TestCase[] = [
  // ══════════════════════════════════════════
  // PLANNING
  // ══════════════════════════════════════════
  {
    id: "PL-01", module: "Planning", sous_module: "Créneaux",
    description: "Créer un créneau cours",
    etapes: "Planning → + Nouveau créneau → Remplir activité/heure/moniteur/places → Enregistrer",
    resultat_attendu: "Créneau visible dans la grille",
    priorite: "critique",
  },
  {
    id: "PL-02", module: "Planning", sous_module: "Créneaux",
    description: "Modifier un créneau existant",
    etapes: "Cliquer sur un créneau → Modifier les infos → Enregistrer",
    resultat_attendu: "Modifications sauvegardées et affichées",
    priorite: "haute",
  },
  {
    id: "PL-03", module: "Planning", sous_module: "Créneaux",
    description: "Supprimer un créneau",
    etapes: "Cliquer sur un créneau → Supprimer → Confirmer",
    resultat_attendu: "Créneau disparu de la grille",
    priorite: "haute",
  },
  {
    id: "PL-04", module: "Planning", sous_module: "Vue",
    description: "Navigation semaine précédente/suivante",
    etapes: "Cliquer les flèches de navigation",
    resultat_attendu: "Semaine change, créneaux corrects",
    priorite: "normale",
  },
  {
    id: "PL-05", module: "Planning", sous_module: "Vue",
    description: "Vue timeline (style Celeris)",
    etapes: "Basculer sur la vue Timeline",
    resultat_attendu: "Grille verticale proportionnelle visible",
    priorite: "normale",
  },

  // ══════════════════════════════════════════
  // INSCRIPTIONS ANNUELLES
  // ══════════════════════════════════════════
  {
    id: "IA-01", module: "Inscriptions annuelles", sous_module: "Création",
    description: "Inscrire un cavalier en forfait annuel 1×",
    etapes: "Planning → Clic créneau → EnrollPanel → Mode Annuel → Sélectionner enfant → 1× → Choisir mode paiement CB → Inscrire",
    resultat_attendu: "Inscription créée, paiement pending CB, cavalier dans tous les créneaux futurs",
    priorite: "critique",
  },
  {
    id: "IA-02", module: "Inscriptions annuelles", sous_module: "Création",
    description: "Inscrire en forfait annuel 3×",
    etapes: "Même flux → Choisir 3× → Mode CB → Inscrire",
    resultat_attendu: "3 paiements créés avec dates mensuelles, mode CB",
    priorite: "critique",
  },
  {
    id: "IA-03", module: "Inscriptions annuelles", sous_module: "Création",
    description: "Inscrire en forfait annuel 10× SEPA",
    etapes: "Même flux → 10× → Mode SEPA → Inscrire",
    resultat_attendu: "10 écritures créées dans echeances-sepa, 1 paiement référence en payments",
    priorite: "critique",
  },
  {
    id: "IA-04", module: "Inscriptions annuelles", sous_module: "Création",
    description: "SEPA sans mandat actif → erreur bloquante",
    etapes: "Famille sans mandat SEPA → Choisir SEPA → Inscrire",
    resultat_attendu: "Message erreur 'Aucun mandat SEPA actif', pas d'inscription créée",
    priorite: "critique",
  },
  {
    id: "IA-05", module: "Inscriptions annuelles", sous_module: "Fratrie",
    description: "Regroupement fratrie sur paiement 1×",
    etapes: "Inscrire enfant 1 (1×) → Inscrire enfant 2 même famille (1×)",
    resultat_attendu: "Un seul paiement pending regroupant les 2 enfants",
    priorite: "haute",
  },
  {
    id: "IA-06", module: "Inscriptions annuelles", sous_module: "Désinscription",
    description: "Désinscrire un cavalier annuel",
    etapes: "Forfaits → Trouver le forfait → Désinscrire",
    resultat_attendu: "Cavalier retiré de tous les créneaux futurs, réservations annulées",
    priorite: "critique",
  },
  {
    id: "IA-07", module: "Inscriptions annuelles", sous_module: "Désinscription",
    description: "Réservations masquées après désinscription",
    etapes: "Désinscrire → Aller dans fiche famille cavaliers",
    resultat_attendu: "Section Réservations vide (ou seulement les non-annulées)",
    priorite: "critique",
  },

  // ══════════════════════════════════════════
  // PAIEMENTS — ENCAISSEMENT
  // ══════════════════════════════════════════
  {
    id: "PA-01", module: "Paiements", sous_module: "Encaissement",
    description: "Encaisser un paiement en CB",
    etapes: "Paiements → Encaisser → Sélectionner famille → Saisir montant → CB → Valider",
    resultat_attendu: "Paiement status=paid, montant dans le journal",
    priorite: "critique",
  },
  {
    id: "PA-02", module: "Paiements", sous_module: "Encaissement",
    description: "Encaisser en chèque avec référence",
    etapes: "Même flux → Chèque → Saisir N° de chèque → Valider",
    resultat_attendu: "Paiement paid, référence chèque enregistrée",
    priorite: "critique",
  },
  {
    id: "PA-03", module: "Paiements", sous_module: "Encaissement",
    description: "Encaisser avec avoir existant",
    etapes: "Famille avec avoir → Encaisser → Utiliser avoir",
    resultat_attendu: "Avoir déduit du montant dû",
    priorite: "haute",
  },
  {
    id: "PA-04", module: "Paiements", sous_module: "Échéances",
    description: "Vue Échéances — affichage des groupes",
    etapes: "Paiements → onglet Échéances",
    resultat_attendu: "Groupes par famille/forfait avec barre de progression",
    priorite: "haute",
  },
  {
    id: "PA-05", module: "Paiements", sous_module: "Échéances",
    description: "Encaisser une échéance depuis la vue Échéances",
    etapes: "Onglet Échéances → Clic CB/Chq/Esp/Vir sur une échéance",
    resultat_attendu: "Échéance marquée payée, barre de progression avance",
    priorite: "critique",
  },
  {
    id: "PA-06", module: "Paiements", sous_module: "Échéances",
    description: "Annuler un échéancier",
    etapes: "Onglet Échéances → Bouton Annuler sur un groupe",
    resultat_attendu: "Échéances non payées supprimées, payées conservées",
    priorite: "haute",
  },
  {
    id: "PA-07", module: "Paiements", sous_module: "Impayés",
    description: "Impayés simples visibles",
    etapes: "Paiements → onglet Impayés",
    resultat_attendu: "Liste des paiements pending/partial non annulés",
    priorite: "critique",
  },
  {
    id: "PA-08", module: "Paiements", sous_module: "Impayés",
    description: "Échéances en retard dans les impayés",
    etapes: "Créer un échéancier avec date passée → Onglet Impayés",
    resultat_attendu: "Échéance en retard visible avec badge 'Échéance X/Y'",
    priorite: "critique",
  },
  {
    id: "PA-09", module: "Paiements", sous_module: "Impayés",
    description: "Badge rouge onglet Impayés inclut les échéances",
    etapes: "Avoir une échéance en retard → Vérifier le badge",
    resultat_attendu: "Compteur inclut les échéances dépassées",
    priorite: "haute",
  },
  {
    id: "PA-10", module: "Paiements", sous_module: "Rapprochement",
    description: "Import CSV Crédit Agricole",
    etapes: "Comptabilité → Rapprochement → Importer CSV CA",
    resultat_attendu: "Transactions parsées, matching CB/chèques proposé",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // SEPA
  // ══════════════════════════════════════════
  {
    id: "SE-01", module: "SEPA", sous_module: "Mandats",
    description: "Créer un mandat SEPA",
    etapes: "Prélèvements SEPA → Nouveau mandat → Remplir IBAN/BIC/titulaire → Enregistrer",
    resultat_attendu: "Mandat status=active visible dans la liste",
    priorite: "critique",
  },
  {
    id: "SE-02", module: "SEPA", sous_module: "Mandats",
    description: "Mandat actif utilisable depuis EnrollPanel",
    etapes: "Famille avec mandat → Planning → Inscription annuelle SEPA",
    resultat_attendu: "Échéances créées dans echeances-sepa",
    priorite: "critique",
  },
  {
    id: "SE-03", module: "SEPA", sous_module: "Remises",
    description: "Générer une remise SEPA",
    etapes: "SEPA → Sélectionner échéances → Générer remise XML",
    resultat_attendu: "Fichier XML SEPA téléchargeable",
    priorite: "haute",
  },
  {
    id: "SE-04", module: "SEPA", sous_module: "Remises",
    description: "Marquer une remise comme déposée",
    etapes: "SEPA → Remise générée → Marquer déposée",
    resultat_attendu: "Statut remise=deposited, échéances=prélevé",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // CAVALIERS / FAMILLES
  // ══════════════════════════════════════════
  {
    id: "CA-01", module: "Cavaliers", sous_module: "Famille",
    description: "Créer une famille",
    etapes: "Cavaliers → Nouvelle famille → Remplir nom/email/tel/adresse → Enregistrer",
    resultat_attendu: "Famille visible dans la liste",
    priorite: "critique",
  },
  {
    id: "CA-02", module: "Cavaliers", sous_module: "Famille",
    description: "Créer une famille inline depuis EnrollPanel",
    etapes: "Planning → EnrollPanel → + Nouvelle famille → Remplir → Créer",
    resultat_attendu: "Famille créée et sélectionnée automatiquement",
    priorite: "haute",
  },
  {
    id: "CA-03", module: "Cavaliers", sous_module: "Cavalier",
    description: "Ajouter un cavalier à une famille",
    etapes: "Fiche famille → + Ajouter cavalier → Remplir prénom/naissance/galop",
    resultat_attendu: "Cavalier visible dans la famille",
    priorite: "critique",
  },
  {
    id: "CA-04", module: "Cavaliers", sous_module: "Statut",
    description: "Badge statut inscription (vert/orange/gris)",
    etapes: "Fiche famille → Section cavaliers → Observer les badges",
    resultat_attendu: "🟢 si inscrit+payé, 🟠 si inscrit+en attente, ⚪ si non inscrit",
    priorite: "haute",
  },
  {
    id: "CA-05", module: "Cavaliers", sous_module: "Fiche",
    description: "Réservations masquées si annulées",
    etapes: "Désinscrire annuellement → Fiche famille → Section Réservations",
    resultat_attendu: "Réservations annulées absentes de la liste",
    priorite: "critique",
  },

  // ══════════════════════════════════════════
  // FORFAITS
  // ══════════════════════════════════════════
  {
    id: "FO-01", module: "Forfaits", sous_module: "Affichage",
    description: "Liste des forfaits actifs",
    etapes: "Forfaits → Voir la liste",
    resultat_attendu: "Forfaits avec statut, progression de paiement",
    priorite: "haute",
  },
  {
    id: "FO-02", module: "Forfaits", sous_module: "Désinscription",
    description: "Désinscrire depuis la vue Forfaits",
    etapes: "Forfaits → Trouver forfait → Désinscrire",
    resultat_attendu: "Cavalier désincrit, forfait annulé",
    priorite: "critique",
  },

  // ══════════════════════════════════════════
  // AVOIRS
  // ══════════════════════════════════════════
  {
    id: "AV-01", module: "Avoirs", sous_module: "Création",
    description: "Créer un avoir manuel",
    etapes: "Avoirs → Nouvel avoir → Famille → Montant → Raison → Créer",
    resultat_attendu: "Avoir visible, solde famille mis à jour",
    priorite: "haute",
  },
  {
    id: "AV-02", module: "Avoirs", sous_module: "Remboursement",
    description: "Rembourser un avoir",
    etapes: "Avoirs → Sélectionner avoir → Rembourser → Choisir mode",
    resultat_attendu: "Avoir marqué remboursé, trace comptable créée",
    priorite: "haute",
  },
  {
    id: "AV-03", module: "Avoirs", sous_module: "Utilisation",
    description: "Utiliser un avoir lors d'un encaissement",
    etapes: "Paiements → Encaisser → Famille avec avoir → Appliquer avoir",
    resultat_attendu: "Montant déduit de l'avoir, paiement soldé",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // CARTES / PASSAGES
  // ══════════════════════════════════════════
  {
    id: "CP-01", module: "Cartes", sous_module: "Création",
    description: "Créer une carte de séances",
    etapes: "Cartes → Nouvelle carte → Famille/enfant → Nb séances → Créer",
    resultat_attendu: "Carte active avec séances restantes",
    priorite: "haute",
  },
  {
    id: "CP-02", module: "Cartes", sous_module: "Utilisation",
    description: "Consommer une séance sur une carte",
    etapes: "Passage → Scanner/Sélectionner cavalier avec carte → Valider",
    resultat_attendu: "Séances restantes décrémentées de 1",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // MODULE FIDÉLITÉ
  // ══════════════════════════════════════════
  {
    id: "FI-01", module: "Fidélité", sous_module: "Points",
    description: "Attribution des points à l'encaissement",
    etapes: "Encaisser un paiement → Vérifier les points attribués dans la fiche famille",
    resultat_attendu: "Points calculés et ajoutés",
    priorite: "normale",
  },

  // ══════════════════════════════════════════
  // EMAILS
  // ══════════════════════════════════════════
  {
    id: "EM-01", module: "Emails", sous_module: "Templates",
    description: "Modifier un template email",
    etapes: "Templates email → Sélectionner un template → Modifier → Sauvegarder",
    resultat_attendu: "Template sauvegardé dans Firestore",
    priorite: "normale",
  },
  {
    id: "EM-02", module: "Emails", sous_module: "Templates",
    description: "Envoyer un email de test",
    etapes: "Templates email → Template → Envoyer test",
    resultat_attendu: "Email reçu sur ceagon50@gmail.com",
    priorite: "haute",
  },
  {
    id: "EM-03", module: "Emails", sous_module: "Automatique",
    description: "Email de confirmation d'inscription",
    etapes: "Inscrire un cavalier avec email famille renseigné",
    resultat_attendu: "Email de confirmation envoyé à la famille",
    priorite: "haute",
  },
  {
    id: "EM-04", module: "Emails", sous_module: "Automatique",
    description: "Email de rappel impayé (relance)",
    etapes: "Paiements → Impayés → Relancer sur un paiement",
    resultat_attendu: "Email envoyé, toast confirmation",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // RAPPROCHEMENT BANCAIRE
  // ══════════════════════════════════════════
  {
    id: "RB-01", module: "Rapprochement bancaire", sous_module: "Import",
    description: "Import CSV Crédit Agricole Latin1",
    etapes: "Comptabilité → Rapprochement → Importer le fichier CSV de la CA",
    resultat_attendu: "Lignes parsées sans erreur d'encodage",
    priorite: "haute",
  },
  {
    id: "RB-02", module: "Rapprochement bancaire", sous_module: "Matching",
    description: "Matching CB groupé par jour",
    etapes: "Après import → Vérifier les CB groupées",
    resultat_attendu: "CB du même jour regroupées et matchées",
    priorite: "haute",
  },
  {
    id: "RB-03", module: "Rapprochement bancaire", sous_module: "Matching",
    description: "Matching chèques sur le mois",
    etapes: "Après import → Vérifier les chèques",
    resultat_attendu: "Chèques matchés avec paiements du mois",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // SITE VITRINE
  // ══════════════════════════════════════════
  {
    id: "VI-01", module: "Site vitrine", sous_module: "Homepage",
    description: "Split-screen desktop",
    etapes: "Aller sur centreequestreagon.com (ou /)",
    resultat_attendu: "Deux panneaux CE / LaserBay, hover fonctionnel",
    priorite: "haute",
  },
  {
    id: "VI-02", module: "Site vitrine", sous_module: "Homepage",
    description: "Homepage mobile sans débordement",
    etapes: "Ouvrir sur téléphone ou DevTools mobile",
    resultat_attendu: "Deux demi-écrans empilés, aucun débordement",
    priorite: "critique",
  },
  {
    id: "VI-03", module: "Site vitrine", sous_module: "Édition",
    description: "Modifier une photo vitrine (EditableImage)",
    etapes: "Se connecter admin → Page accueil → Clic sur une image → Uploader",
    resultat_attendu: "Nouvelle image visible, sauvegardée dans Firebase Storage",
    priorite: "normale",
  },

  // ══════════════════════════════════════════
  // ESPACE CAVALIER
  // ══════════════════════════════════════════
  {
    id: "EC-01", module: "Espace cavalier", sous_module: "Accès",
    description: "Connexion cavalier",
    etapes: "Page connexion cavalier → Email/mot de passe → Se connecter",
    resultat_attendu: "Accès au dashboard cavalier",
    priorite: "critique",
  },
  {
    id: "EC-02", module: "Espace cavalier", sous_module: "Dashboard",
    description: "Voir ses réservations à venir",
    etapes: "Dashboard cavalier → Section Réservations",
    resultat_attendu: "Prochaines séances listées",
    priorite: "haute",
  },
  {
    id: "EC-03", module: "Espace cavalier", sous_module: "Factures",
    description: "Télécharger une facture",
    etapes: "Espace cavalier → Factures → Télécharger PDF",
    resultat_attendu: "PDF généré et téléchargé",
    priorite: "haute",
  },
  {
    id: "EC-04", module: "Espace cavalier", sous_module: "Inscription",
    description: "S'inscrire à un créneau ponctuel",
    etapes: "Espace cavalier → Réserver → Choisir créneau → Confirmer",
    resultat_attendu: "Réservation confirmée, paiement créé",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // NOTIFICATIONS PUSH
  // ══════════════════════════════════════════
  {
    id: "NO-01", module: "Notifications", sous_module: "PWA",
    description: "Autoriser les notifications push",
    etapes: "Espace cavalier → Accepter les notifications",
    resultat_attendu: "Token FCM enregistré, notifications autorisées",
    priorite: "normale",
  },

  // ══════════════════════════════════════════
  // STATISTIQUES
  // ══════════════════════════════════════════
  {
    id: "ST-01", module: "Statistiques", sous_module: "Affichage",
    description: "Chargement du tableau de bord stats",
    etapes: "Statistiques → Vérifier les graphiques",
    resultat_attendu: "Graphiques affichés sans erreur",
    priorite: "normale",
  },

  // ══════════════════════════════════════════
  // FLUX SEPA COMPLET (bout en bout)
  // ══════════════════════════════════════════
  {
    id: "SE-05", module: "SEPA", sous_module: "Flux complet",
    description: "Inscription annuelle SEPA 10× → 10 échéances créées",
    etapes: "Planning → EnrollPanel → Forfait annuel → 10× → SEPA → Inscrire → Aller dans Prélèvements SEPA → Onglet Échéancier",
    resultat_attendu: "10 échéances de montants égaux dans echeances-sepa, 1 paiement sepa_scheduled dans payments, 0 dans onglet Échéances manuel",
    priorite: "critique",
  },
  {
    id: "SE-06", module: "SEPA", sous_module: "Flux complet",
    description: "Filtre par mois dans l'échéancier SEPA",
    etapes: "Prélèvements SEPA → Onglet Échéancier → Sélectionner un mois dans le filtre date",
    resultat_attendu: "Seules les échéances du mois sélectionné sont affichées",
    priorite: "haute",
  },
  {
    id: "SE-07", module: "SEPA", sous_module: "Flux complet",
    description: "Générer une remise XML et vérifier le fichier",
    etapes: "SEPA → Cocher une ou plusieurs échéances → Créer la remise XML → Télécharger",
    resultat_attendu: "Fichier XML SEPA téléchargé, échéances passent en statut 'remis'",
    priorite: "critique",
  },
  {
    id: "SE-08", module: "SEPA", sous_module: "Flux complet",
    description: "Marquer remise déposée → paiement référence passe à paid",
    etapes: "SEPA → Remises → Marquer comme déposée",
    resultat_attendu: "Statut remise=deposited, échéances=prélevé, paiement payments passe à paid (ou paidAmount mis à jour)",
    priorite: "critique",
  },
  {
    id: "SE-09", module: "SEPA", sous_module: "Flux complet",
    description: "Forfait SEPA visible dans la progression paiement (Forfaits)",
    etapes: "Après inscription SEPA → Aller dans Forfaits → Ouvrir le forfait → Barre de progression Paiement",
    resultat_attendu: "Barre de progression affiche 0% (aucun prélèvement encore effectué)",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // DÉSINSCRIPTION FORFAIT ANNUEL
  // ══════════════════════════════════════════
  {
    id: "FO-03", module: "Forfaits", sous_module: "Désinscription complète",
    description: "Désinscrire un forfait SEPA → tout est nettoyé",
    etapes: "Inscrire en SEPA 10× → Aller dans Forfaits → Désinscrire → Vérifier fiche famille",
    resultat_attendu: "0€ dû, 0 réservation à venir, 0 échéance SEPA en attente, créneaux vidés, forfait cancelled",
    priorite: "critique",
  },
  {
    id: "FO-04", module: "Forfaits", sous_module: "Désinscription complète",
    description: "Désinscrire un forfait CB/chèque → paiements annulés",
    etapes: "Inscrire en CB 3× → Désinscrire depuis Forfaits",
    resultat_attendu: "Échéances non payées annulées (status=cancelled), payées conservées, fiche famille à jour",
    priorite: "critique",
  },

  // ══════════════════════════════════════════
  // ENCAISSEMENT MANUEL ÉCHÉANCES
  // ══════════════════════════════════════════
  {
    id: "PA-11", module: "Paiements", sous_module: "Encaissement échéances",
    description: "Encaisser une échéance depuis l'onglet Échéances",
    etapes: "Paiements → Échéances → Cliquer CB/Chq/Esp/Vir sur une échéance due",
    resultat_attendu: "Échéance passe à paid, barre de progression avance, badge onglet mis à jour",
    priorite: "critique",
  },
  {
    id: "PA-12", module: "Paiements", sous_module: "Encaissement échéances",
    description: "Échéances en retard apparaissent dans les impayés",
    etapes: "Avoir un échéancier avec date d'échéance passée → Onglet Impayés",
    resultat_attendu: "Badge rouge sur l'onglet, échéance listée avec badge 'Échéance X/Y' et 'Xj de retard'",
    priorite: "haute",
  },
  {
    id: "PA-13", module: "Paiements", sous_module: "Encaissement échéances",
    description: "Annuler un échéancier depuis l'onglet Échéances",
    etapes: "Paiements → Échéances → Bouton Annuler sur un groupe → Confirmer",
    resultat_attendu: "Échéances non payées supprimées, payées conservées, groupe disparaît si tout annulé",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // EMAIL DEPUIS FICHE FAMILLE
  // ══════════════════════════════════════════
  {
    id: "CA-06", module: "Cavaliers", sous_module: "Email",
    description: "Envoyer un email libre depuis la fiche famille",
    etapes: "Cavaliers → Ouvrir une famille → Bouton '✉️ Envoyer un email' → Saisir objet + message libre → Envoyer",
    resultat_attendu: "Email reçu sur l'adresse de la famille, toast de confirmation",
    priorite: "haute",
  },
  {
    id: "CA-07", module: "Cavaliers", sous_module: "Email",
    description: "Envoyer un template rappel impayé depuis la fiche",
    etapes: "Famille avec impayé → '✉️ Envoyer un email' → Template 'Rappel impayé' → Vérifier montant pré-rempli → Envoyer",
    resultat_attendu: "Email de relance avec le bon montant dû reçu",
    priorite: "haute",
  },

  // ══════════════════════════════════════════
  // FACTURES
  // ══════════════════════════════════════════
  {
    id: "FA-01", module: "Factures", sous_module: "Affichage",
    description: "Télécharger une facture depuis l'espace cavalier",
    etapes: "Espace cavalier → Factures → Bouton télécharger sur un paiement",
    resultat_attendu: "Nouvel onglet avec la facture HTML rendue correctement (pas de texte brut)",
    priorite: "critique",
  },
  {
    id: "FA-02", module: "Factures", sous_module: "Affichage",
    description: "Imprimer une facture depuis l'admin (Paiements)",
    etapes: "Paiements → Journal → Icône facture sur un paiement",
    resultat_attendu: "Nouvel onglet avec la facture correctement rendue",
    priorite: "haute",
  },
  {
    id: "FA-03", module: "Factures", sous_module: "Affichage",
    description: "Facture depuis la fiche cavalier",
    etapes: "Cavaliers → Fiche famille → Section Paiements → Icône 📄 sur un paiement",
    resultat_attendu: "Facture correctement rendue dans un nouvel onglet",
    priorite: "haute",
  },
];

// ─── Config couleurs ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  ok:        { label: "OK",       color: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50",  border: "border-green-200", icon: CheckCircle2 },
  ko:        { label: "KO",       color: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",   icon: XCircle },
  remarque:  { label: "Remarque", color: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200",icon: AlertCircle },
  non_teste: { label: "—",        color: "bg-gray-300",   text: "text-gray-500",   bg: "bg-gray-50",   border: "border-gray-200",  icon: Clock },
};

const PRIORITE_CONFIG = {
  critique: { label: "Critique", color: "bg-red-100 text-red-700" },
  haute:    { label: "Haute",    color: "bg-orange-100 text-orange-700" },
  normale:  { label: "Normale",  color: "bg-blue-100 text-blue-600" },
};

// ─── Composant ────────────────────────────────────────────────────────────────
export default function TestsPage() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [editNote, setEditNote] = useState<string | null>(null); // testId en cours d'édition
  const [noteInput, setNoteInput] = useState("");
  const [filterModule, setFilterModule] = useState("Tous");
  const [filterStatus, setFilterStatus] = useState<Status | "tous">("tous");
  const [filterPriorite, setFilterPriorite] = useState<"tous" | "critique" | "haute" | "normale">("tous");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // ── Modules uniques ──
  const modules = ["Tous", ...Array.from(new Set(TESTS.map(t => t.module)))];

  // ── Charger depuis Firestore ──
  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "settings", "testMatrix"));
      if (snap.exists()) {
        const data = snap.data();
        setResults(data.results || {});
        setLastSaved(data.updatedAt?.toDate?.()?.toLocaleString("fr-FR") || null);
      }
    })();
  }, []);

  // ── Sauvegarder dans Firestore ──
  const save = useCallback(async (newResults: Record<string, TestResult>) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "testMatrix"), {
        results: newResults,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setLastSaved(new Date().toLocaleString("fr-FR"));
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Changer le statut ──
  const setStatus = (testId: string, status: Status) => {
    const current = results[testId];
    // Toggle : clic sur le statut actuel → remet à non_testé
    const newStatus = current?.status === status ? "non_teste" : status;
    const newResults = {
      ...results,
      [testId]: { ...current, status: newStatus, updatedAt: new Date().toISOString() },
    };
    setResults(newResults);
    save(newResults);
  };

  // ── Sauvegarder une note ──
  const saveNote = (testId: string) => {
    const newResults = {
      ...results,
      [testId]: { ...results[testId], note: noteInput, updatedAt: new Date().toISOString() },
    };
    setResults(newResults);
    save(newResults);
    setEditNote(null);
    setNoteInput("");
  };

  // ── Réinitialiser un test ──
  const resetTest = (testId: string) => {
    const newResults = { ...results };
    delete newResults[testId];
    setResults(newResults);
    save(newResults);
  };

  // ── Stats globales ──
  const stats = {
    total: TESTS.length,
    ok: TESTS.filter(t => results[t.id]?.status === "ok").length,
    ko: TESTS.filter(t => results[t.id]?.status === "ko").length,
    remarque: TESTS.filter(t => results[t.id]?.status === "remarque").length,
    non_teste: TESTS.filter(t => !results[t.id] || results[t.id]?.status === "non_teste").length,
  };
  const pct = Math.round((stats.ok / stats.total) * 100);

  // ── Filtrer ──
  const filtered = TESTS.filter(t => {
    if (filterModule !== "Tous" && t.module !== filterModule) return false;
    const s = results[t.id]?.status || "non_teste";
    if (filterStatus !== "tous" && s !== filterStatus) return false;
    if (filterPriorite !== "tous" && t.priorite !== filterPriorite) return false;
    return true;
  });

  // ── Grouper par module ──
  const grouped: Record<string, TestCase[]> = {};
  filtered.forEach(t => {
    if (!grouped[t.module]) grouped[t.module] = [];
    grouped[t.module].push(t);
  });

  // ── Export CSV ──
  const exportCSV = () => {
    const rows = [["ID", "Module", "Sous-module", "Description", "Statut", "Note", "Date"]];
    TESTS.forEach(t => {
      const r = results[t.id];
      rows.push([t.id, t.module, t.sous_module || "", t.description, r?.status || "non_teste", r?.note || "", r?.updatedAt ? new Date(r.updatedAt).toLocaleDateString("fr-FR") : ""]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tests-ce-agon-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-body text-xl font-bold text-blue-800">Plan de tests</h1>
          <div className="flex items-center gap-2">
            {saving && <span className="font-body text-[10px] text-slate-400 animate-pulse">Sauvegarde…</span>}
            {lastSaved && !saving && <span className="font-body text-[10px] text-slate-400">Sauvegardé {lastSaved}</span>}
            <button onClick={exportCSV} className="flex items-center gap-1 font-body text-xs text-slate-600 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50">
              <Download size={13}/> Export CSV
            </button>
          </div>
        </div>
        <p className="font-body text-xs text-slate-500">Centre Équestre Agon-Coutainville · {TESTS.length} tests répertoriés</p>
      </div>

      {/* ── Stats globales ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        {[
          { label: "Total", val: stats.total, color: "text-blue-600" },
          { label: "✅ OK", val: stats.ok, color: "text-green-600" },
          { label: "❌ KO", val: stats.ko, color: "text-red-600" },
          { label: "⚠️ Remarque", val: stats.remarque, color: "text-orange-600" },
          { label: "⏳ Non testé", val: stats.non_teste, color: "text-gray-500" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-blue-500/8 p-3 text-center">
            <div className={`font-body text-2xl font-bold ${s.color}`}>{s.val}</div>
            <div className="font-body text-[10px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Barre de progression ── */}
      <div className="mb-5 bg-white rounded-xl border border-blue-500/8 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-body text-xs font-semibold text-slate-700">Progression globale</span>
          <span className="font-body text-xs font-bold text-green-600">{pct}% OK</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 h-full transition-all" style={{ width: `${(stats.ok / stats.total) * 100}%` }} />
          <div className="bg-red-400 h-full transition-all" style={{ width: `${(stats.ko / stats.total) * 100}%` }} />
          <div className="bg-orange-400 h-full transition-all" style={{ width: `${(stats.remarque / stats.total) * 100}%` }} />
        </div>
        <div className="flex gap-3 mt-1.5">
          {[["bg-green-500","OK"],["bg-red-400","KO"],["bg-orange-400","Remarque"],["bg-gray-300","Non testé"]].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1 font-body text-[10px] text-slate-500">
              <span className={`w-2 h-2 rounded-full ${c}`}/>  {l}
            </span>
          ))}
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="bg-white rounded-xl border border-blue-500/8 p-3 mb-5 flex flex-wrap gap-3 items-center">
        <Filter size={13} className="text-slate-400"/>
        {/* Module */}
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)}
          className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:border-blue-400">
          {modules.map(m => <option key={m}>{m}</option>)}
        </select>
        {/* Statut */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:border-blue-400">
          <option value="tous">Tous statuts</option>
          <option value="ok">✅ OK</option>
          <option value="ko">❌ KO</option>
          <option value="remarque">⚠️ Remarque</option>
          <option value="non_teste">⏳ Non testé</option>
        </select>
        {/* Priorité */}
        <select value={filterPriorite} onChange={e => setFilterPriorite(e.target.value as any)}
          className="font-body text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:border-blue-400">
          <option value="tous">Toutes priorités</option>
          <option value="critique">🔴 Critique</option>
          <option value="haute">🟠 Haute</option>
          <option value="normale">🔵 Normale</option>
        </select>
        <span className="font-body text-[10px] text-slate-400 ml-auto">{filtered.length} test{filtered.length > 1 ? "s" : ""}</span>
      </div>

      {/* ── Tests par module ── */}
      {Object.entries(grouped).map(([module, tests]) => {
        const modOk = tests.filter(t => results[t.id]?.status === "ok").length;
        const modKo = tests.filter(t => results[t.id]?.status === "ko").length;
        return (
          <div key={module} className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="font-body text-sm font-bold text-blue-800 uppercase tracking-wide">{module}</h2>
              <span className="font-body text-[10px] text-green-600 font-semibold">{modOk} OK</span>
              {modKo > 0 && <span className="font-body text-[10px] text-red-600 font-semibold">{modKo} KO</span>}
              <span className="font-body text-[10px] text-slate-400">{tests.length} tests</span>
            </div>

            <div className="flex flex-col gap-2">
              {tests.map(t => {
                const r = results[t.id];
                const status = r?.status || "non_teste";
                const cfg = STATUS_CONFIG[status];
                const isEditingNote = editNote === t.id;

                return (
                  <div key={t.id} className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
                    <div className="flex items-start gap-3 p-3">
                      {/* ID + priorité */}
                      <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                        <span className="font-body text-[10px] font-bold text-slate-500 w-12 text-center">{t.id}</span>
                        <span className={`font-body text-[9px] font-semibold px-1.5 py-0.5 rounded ${PRIORITE_CONFIG[t.priorite].color}`}>
                          {PRIORITE_CONFIG[t.priorite].label}
                        </span>
                      </div>

                      {/* Contenu */}
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-sm font-semibold text-blue-800 mb-0.5">{t.description}</div>
                        {t.sous_module && <div className="font-body text-[10px] text-slate-500 mb-1">{t.sous_module}</div>}
                        <details className="group">
                          <summary className="font-body text-[11px] text-slate-500 cursor-pointer hover:text-blue-600 select-none">
                            Étapes & résultat attendu
                          </summary>
                          <div className="mt-1.5 space-y-1">
                            <div className="font-body text-[11px] text-slate-600">
                              <span className="font-semibold">Étapes : </span>{t.etapes}
                            </div>
                            <div className="font-body text-[11px] text-slate-600">
                              <span className="font-semibold">Attendu : </span>{t.resultat_attendu}
                            </div>
                          </div>
                        </details>

                        {/* Note */}
                        {r?.note && !isEditingNote && (
                          <div className="mt-1.5 font-body text-[11px] text-slate-600 bg-white/70 rounded-lg px-2 py-1 border border-white/50">
                            💬 {r.note}
                          </div>
                        )}
                        {isEditingNote && (
                          <div className="mt-1.5 flex gap-1.5">
                            <input autoFocus value={noteInput} onChange={e => setNoteInput(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") saveNote(t.id); if (e.key === "Escape") setEditNote(null); }}
                              placeholder="Ajouter une remarque..."
                              className="flex-1 font-body text-xs border border-blue-400 rounded-lg px-2 py-1 focus:outline-none bg-white"/>
                            <button onClick={() => saveNote(t.id)} className="font-body text-[11px] text-white bg-blue-500 px-2.5 py-1 rounded-lg border-none cursor-pointer">Sauver</button>
                            <button onClick={() => setEditNote(null)} className="font-body text-[11px] text-slate-500 bg-white px-2 py-1 rounded-lg border border-gray-200 cursor-pointer">✕</button>
                          </div>
                        )}
                      </div>

                      {/* Actions statut */}
                      <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
                        <div className="flex gap-1">
                          {(["ok", "ko", "remarque"] as Status[]).map(s => {
                            const c = STATUS_CONFIG[s];
                            const active = status === s;
                            return (
                              <button key={s} onClick={() => setStatus(t.id, s)}
                                className={`font-body text-[10px] font-bold px-2.5 py-1 rounded-lg border-none cursor-pointer transition-all ${
                                  active ? `${c.color} text-white shadow-sm` : "bg-white text-slate-500 hover:bg-gray-100"
                                }`}>
                                {s === "ok" ? "✅" : s === "ko" ? "❌" : "⚠️"}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditNote(t.id); setNoteInput(r?.note || ""); }}
                            className="font-body text-[9px] text-slate-500 bg-white hover:bg-gray-100 px-2 py-1 rounded border border-gray-200 cursor-pointer">
                            💬 Note
                          </button>
                          {status !== "non_teste" && (
                            <button onClick={() => resetTest(t.id)}
                              className="font-body text-[9px] text-red-400 bg-white hover:bg-red-50 px-1.5 py-1 rounded border border-gray-200 cursor-pointer">
                              <RotateCcw size={9}/>
                            </button>
                          )}
                        </div>
                        {r?.updatedAt && (
                          <span className="font-body text-[9px] text-slate-400">
                            {new Date(r.updatedAt).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
