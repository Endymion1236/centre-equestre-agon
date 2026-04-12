"use client";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { CheckCircle2, XCircle, AlertCircle, Clock, RotateCcw, Download, Filter, Trash2 } from "lucide-react";

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
  {
    id: "PL-01", module: "Planning", sous_module: "Créneaux",
    description: "Créer un créneau cours",
    etapes: "Planning → + Créneau → Remplir activité/heure/moniteur/places → Enregistrer",
    resultat_attendu: "Créneau visible dans la grille",
    priorite: "critique",
  },
  {
    id: "PL-02", module: "Planning", sous_module: "Créneaux",
    description: "Modifier un créneau existant",
    etapes: "Clic sur créneau → Modifier titre/horaire/moniteur → Enregistrer",
    resultat_attendu: "Modifications visibles immédiatement",
    priorite: "critique",
  },
  {
    id: "PL-03", module: "Planning", sous_module: "Créneaux",
    description: "Appliquer à tous les créneaux similaires",
    etapes: "Modifier un créneau → Cocher 'Appliquer à tous' → Enregistrer",
    resultat_attendu: "Tous les créneaux même titre/jour/heure mis à jour",
    priorite: "haute",
  },
  {
    id: "PL-04", module: "Planning", sous_module: "Créneaux",
    description: "Supprimer un créneau",
    etapes: "Clic poubelle → Confirmer → Supprimer",
    resultat_attendu: "Créneau disparu de la grille",
    priorite: "haute",
  },
  {
    id: "PL-05", module: "Planning", sous_module: "Créneaux",
    description: "Dupliquer une semaine",
    etapes: "Dupliquer → Choisir nb semaines → Valider",
    resultat_attendu: "Créneaux dupliqués sur les semaines suivantes",
    priorite: "haute",
  },
  {
    id: "PL-06", module: "Planning", sous_module: "Vues",
    description: "Vue semaine/jour/timeline/mois",
    etapes: "Basculer entre les 4 vues",
    resultat_attendu: "Affichage correct dans chaque vue",
    priorite: "normale",
  },
  {
    id: "PL-07", module: "Planning", sous_module: "Inscription",
    description: "Inscrire un enfant (cours ponctuel)",
    etapes: "Clic créneau → Chercher famille → Sélectionner enfant → Inscrire",
    resultat_attendu: "Enfant visible dans inscrits, paiement créé",
    priorite: "critique",
  },
  {
    id: "PL-08", module: "Planning", sous_module: "Inscription",
    description: "Inscrire un enfant (forfait annuel)",
    etapes: "Clic créneau → Mode annuel → Sélectionner enfant → Choisir fréquence → Inscrire",
    resultat_attendu: "Enfant inscrit sur toutes les séances de la saison",
    priorite: "critique",
  },
  {
    id: "PL-09", module: "Planning", sous_module: "Inscription",
    description: "Réduction famille forfait annuel",
    etapes: "Inscrire le 2ème enfant d'une famille en forfait annuel",
    resultat_attendu: "Réduction famille appliquée sur le forfait (ex: -7%)",
    priorite: "critique",
  },
  {
    id: "PL-10", module: "Planning", sous_module: "Inscription",
    description: "Choix acompte/total pour stage semaine",
    etapes: "Inscrire enfant en stage mode semaine → Voir toggle Paiement total / Acompte",
    resultat_attendu: "Toggle visible, choix appliqué au paiement créé",
    priorite: "haute",
  },
  {
    id: "PL-11", module: "Planning", sous_module: "Stage",
    description: "Inscription stage semaine complète",
    etapes: "Clic stage → Mode semaine → Inscrire → Vérifier tous les jours",
    resultat_attendu: "Enfant inscrit sur les 5 jours du stage",
    priorite: "critique",
  },
  {
    id: "PL-12", module: "Planning", sous_module: "Stage",
    description: "Inscription stage jour unique + proposition autres jours",
    etapes: "Clic stage → Mode jour → Inscrire 1 jour",
    resultat_attendu: "Modale 'Ajouter d'autres jours' apparaît avec les 4 jours restants",
    priorite: "haute",
  },
  {
    id: "PL-13", module: "Planning", sous_module: "Stage",
    description: "Réduction fratrie stage",
    etapes: "Inscrire 2 enfants de la même famille au même stage",
    resultat_attendu: "Réduction appliquée au 2ème enfant",
    priorite: "haute",
  },
  {
    id: "PL-14", module: "Planning", sous_module: "Stage",
    description: "Inscription stage à la journée (mode jour)",
    etapes: "Clic stage → Mode jour → Inscrire",
    resultat_attendu: "Prix au prorata, inscription uniquement sur le jour cliqué",
    priorite: "haute",
  },
  {
    id: "PL-15", module: "Planning", sous_module: "SEPA",
    description: "Inscription forfait annuel en SEPA",
    etapes: "Clic créneau → Mode annuel → SEPA → Inscrire",
    resultat_attendu: "Échéances SEPA créées + paiement sepa_scheduled",
    priorite: "haute",
  },
  {
    id: "PL-16", module: "Planning", sous_module: "Montoir",
    description: "Affichage montoir",
    etapes: "Planning → Montoir → Vérifier l'affichage des chevaux/poneys",
    resultat_attendu: "Chevaux et poneys affichés correctement par créneau",
    priorite: "normale",
  },
  {
    id: "PL-17", module: "Planning", sous_module: "Montoir",
    description: "Page TV projection montoir",
    etapes: "Accéder à /montoir/display",
    resultat_attendu: "Affichage deux colonnes CHEVAUX/PONEYS, auto-refresh 30s",
    priorite: "normale",
  },
  {
    id: "PA-01", module: "Paiements", sous_module: "Encaisser",
    description: "Encaisser un paiement (CB terminal)",
    etapes: "Paiements → Encaisser → Sélectionner famille → Encaisser en CB",
    resultat_attendu: "Paiement passé en réglé, encaissement dans le journal",
    priorite: "critique",
  },
  {
    id: "PA-02", module: "Paiements", sous_module: "Encaisser",
    description: "Encaisser un paiement (espèces)",
    etapes: "Paiements → Encaisser → Espèces → Valider",
    resultat_attendu: "Paiement réglé, mode espèces dans le journal",
    priorite: "critique",
  },
  {
    id: "PA-03", module: "Paiements", sous_module: "Encaisser",
    description: "Encaisser un paiement (chèque)",
    etapes: "Paiements → Encaisser → Chèque → Ref → Valider",
    resultat_attendu: "Paiement réglé avec référence chèque",
    priorite: "haute",
  },
  {
    id: "PA-04", module: "Paiements", sous_module: "Encaisser",
    description: "Paiement mixte",
    etapes: "Encaisser avec 2 modes (ex: Pass'Sport + CB)",
    resultat_attendu: "Paiement réglé, deux modes visibles",
    priorite: "haute",
  },
  {
    id: "PA-05", module: "Paiements", sous_module: "Encaisser",
    description: "Code promo",
    etapes: "Appliquer un code promo sur un paiement",
    resultat_attendu: "Réduction appliquée sur le total",
    priorite: "normale",
  },
  {
    id: "PA-06", module: "Paiements", sous_module: "Journal",
    description: "Journal d'encaissement",
    etapes: "Paiements → Journal → Vérifier les mouvements",
    resultat_attendu: "Chaque encaissement visible avec date/client/montant/mode",
    priorite: "critique",
  },
  {
    id: "PA-07", module: "Paiements", sous_module: "Journal",
    description: "Filtres journal par mode/date/montant",
    etapes: "Utiliser les filtres date, mode de paiement, montant min/max",
    resultat_attendu: "Résultats filtrés correctement",
    priorite: "normale",
  },
  {
    id: "PA-08", module: "Paiements", sous_module: "Journal",
    description: "Correction d'encaissement",
    etapes: "Journal → Corriger → Saisir raison + nouveau montant",
    resultat_attendu: "Contre-passation créée + nouvel encaissement",
    priorite: "haute",
  },
  {
    id: "PA-09", module: "Paiements", sous_module: "Historique",
    description: "Historique des paiements",
    etapes: "Paiements → Historique → Voir les factures",
    resultat_attendu: "Toutes les factures visibles avec statut et PDF",
    priorite: "critique",
  },
  {
    id: "PA-10", module: "Paiements", sous_module: "Historique",
    description: "Filtre SEPA en cours",
    etapes: "Historique → Filtre 'SEPA en cours'",
    resultat_attendu: "Paiements sepa_scheduled affichés avec badge SEPA",
    priorite: "normale",
  },
  {
    id: "PA-11", module: "Paiements", sous_module: "Historique",
    description: "Annuler une facture réglée (avoir)",
    etapes: "Historique → Icône poubelle → Confirmer",
    resultat_attendu: "Facture annulée + avoir créé + enfant désinscrit",
    priorite: "critique",
  },
  {
    id: "PA-12", module: "Paiements", sous_module: "Historique",
    description: "Annuler une facture non encaissée",
    etapes: "Historique → Icône poubelle → Confirmer",
    resultat_attendu: "Facture supprimée + enfant désinscrit (pas d'avoir)",
    priorite: "haute",
  },
  {
    id: "PA-13", module: "Paiements", sous_module: "Historique",
    description: "Télécharger facture PDF",
    etapes: "Historique → Icône PDF",
    resultat_attendu: "PDF généré avec toutes les mentions légales françaises",
    priorite: "critique",
  },
  {
    id: "PA-14", module: "Paiements", sous_module: "Impayés",
    description: "Liste des impayés",
    etapes: "Paiements → Impayés → Vérifier la liste",
    resultat_attendu: "Factures pending visibles avec montant dû",
    priorite: "haute",
  },
  {
    id: "PA-15", module: "Paiements", sous_module: "Impayés",
    description: "Relance impayé",
    etapes: "Impayés → Relancer → Vérifier email",
    resultat_attendu: "Email de relance envoyé à la famille",
    priorite: "haute",
  },
  {
    id: "PA-16", module: "Paiements", sous_module: "Impayés",
    description: "Envoyer lien de paiement",
    etapes: "Impayés → Envoyer lien → Vérifier",
    resultat_attendu: "Lien CAWL envoyé par email",
    priorite: "haute",
  },
  {
    id: "PA-17", module: "Paiements", sous_module: "Échéances",
    description: "Échéancier de paiement",
    etapes: "Créer un paiement en 3× ou 10×",
    resultat_attendu: "Échéances créées avec dates mensuelles",
    priorite: "haute",
  },
  {
    id: "PA-18", module: "Paiements", sous_module: "Déclarations",
    description: "Déclaration mensuelle",
    etapes: "Paiements → Déclarations → Sélectionner mois",
    resultat_attendu: "Totaux par mode de paiement corrects",
    priorite: "normale",
  },
  {
    id: "CW-01", module: "CAWL", sous_module: "Checkout",
    description: "Paiement CB en ligne (total)",
    etapes: "Client réserve un stage → Payer tout → CB",
    resultat_attendu: "Redirection CAWL → paiement → retour avec statut paid",
    priorite: "critique",
  },
  {
    id: "CW-02", module: "CAWL", sous_module: "Checkout",
    description: "Paiement CB en ligne (acompte stage)",
    etapes: "Client réserve stage → Acompte 30€ → CB",
    resultat_attendu: "CAWL avec montant acompte → paiement partial",
    priorite: "critique",
  },
  {
    id: "CW-03", module: "CAWL", sous_module: "Webhook",
    description: "Webhook CAWL retour paiement",
    etapes: "Après paiement CAWL, vérifier le retour",
    resultat_attendu: "Payment mis à jour, encaissement créé, email envoyé",
    priorite: "critique",
  },
  {
    id: "CW-04", module: "CAWL", sous_module: "Lien admin",
    description: "Envoyer lien de paiement CAWL depuis admin",
    etapes: "Admin → Impayés → Envoyer lien de paiement",
    resultat_attendu: "Lien CAWL généré et envoyé par email",
    priorite: "haute",
  },
  {
    id: "SE-01", module: "SEPA", sous_module: "Mandats",
    description: "Créer un mandat SEPA",
    etapes: "SEPA → Nouveau mandat → IBAN + titulaire → Enregistrer",
    resultat_attendu: "Mandat créé avec BIC auto-détecté",
    priorite: "critique",
  },
  {
    id: "SE-02", module: "SEPA", sous_module: "Échéancier",
    description: "Créer un échéancier SEPA",
    etapes: "SEPA → Échéancier → Choisir mandat + montant + nb → Créer",
    resultat_attendu: "N échéances créées avec dates mensuelles",
    priorite: "critique",
  },
  {
    id: "SE-03", module: "SEPA", sous_module: "Remises",
    description: "Générer une remise XML",
    etapes: "SEPA → Sélectionner échéances → Créer la remise XML",
    resultat_attendu: "Fichier XML ISO 20022 téléchargé",
    priorite: "critique",
  },
  {
    id: "SE-04", module: "SEPA", sous_module: "Remises",
    description: "Marquer remise comme déposée",
    etapes: "SEPA → Remises → Déposée",
    resultat_attendu: "Échéances en prélevé + encaissements créés dans le journal",
    priorite: "critique",
  },
  {
    id: "SE-05", module: "SEPA", sous_module: "Paiement",
    description: "Mise à jour paiement parent après prélèvement",
    etapes: "Déposer une remise liée à un paiement sepa_scheduled",
    resultat_attendu: "Paiement passe en partial puis paid quand tout est prélevé",
    priorite: "haute",
  },
  {
    id: "FO-01", module: "Forfaits", sous_module: "Création",
    description: "Créer un forfait annuel",
    etapes: "Forfaits → Nouveau → Famille + enfant + créneau → Créer",
    resultat_attendu: "Forfait créé + enfant inscrit sur toute la saison",
    priorite: "critique",
  },
  {
    id: "FO-02", module: "Forfaits", sous_module: "Réduction",
    description: "Réduction famille sur forfait",
    etapes: "Inscrire le 2ème enfant de la famille",
    resultat_attendu: "Réduction famille affichée et appliquée sur le forfait",
    priorite: "critique",
  },
  {
    id: "FO-03", module: "Forfaits", sous_module: "Gestion",
    description: "Suspendre/réactiver un forfait",
    etapes: "Forfaits → Clic forfait → Suspendre",
    resultat_attendu: "Statut suspendu, enfant reste inscrit",
    priorite: "haute",
  },
  {
    id: "FO-04", module: "Forfaits", sous_module: "Gestion",
    description: "Changement de créneau",
    etapes: "Forfaits → Clic forfait → Changer de créneau",
    resultat_attendu: "Enfant désinscrit de l'ancien, inscrit dans le nouveau",
    priorite: "haute",
  },
  {
    id: "CA-01", module: "Cavaliers", sous_module: "Famille",
    description: "Créer une famille",
    etapes: "Cavaliers → + Famille → Remplir nom/email/enfants → Enregistrer",
    resultat_attendu: "Famille créée avec fiche complète",
    priorite: "critique",
  },
  {
    id: "CA-02", module: "Cavaliers", sous_module: "Famille",
    description: "Modifier une famille",
    etapes: "Cavaliers → Clic famille → Modifier → Enregistrer",
    resultat_attendu: "Modifications sauvegardées",
    priorite: "haute",
  },
  {
    id: "CA-03", module: "Cavaliers", sous_module: "Enfant",
    description: "Ajouter un cavalier",
    etapes: "Fiche famille → Ajouter un cavalier → Prénom/date naissance",
    resultat_attendu: "Cavalier ajouté à la famille",
    priorite: "haute",
  },
  {
    id: "CA-04", module: "Cavaliers", sous_module: "Fiche",
    description: "Fiche cavalier — prochaines séances",
    etapes: "Ouvrir fiche cavalier d'un enfant inscrit",
    resultat_attendu: "Prochaines séances visibles, triées chronologiquement",
    priorite: "haute",
  },
  {
    id: "CA-05", module: "Cavaliers", sous_module: "Fiche",
    description: "Accordéon réservations",
    etapes: "Fiche cavalier → Voir les N autres",
    resultat_attendu: "Toutes les réservations affichées",
    priorite: "normale",
  },
  {
    id: "CA-06", module: "Cavaliers", sous_module: "Fiche",
    description: "Bilan PDF cavalier",
    etapes: "Fiche cavalier → Bilan PDF",
    resultat_attendu: "PDF de progression généré correctement",
    priorite: "normale",
  },
  {
    id: "CA-07", module: "Cavaliers", sous_module: "Progression",
    description: "Suivi de progression",
    etapes: "Cavaliers → Progression → Sélectionner enfant",
    resultat_attendu: "Objectifs et notes pédagogiques visibles",
    priorite: "normale",
  },
  {
    id: "CA-08", module: "Cavaliers", sous_module: "Documents",
    description: "Documents cavalier",
    etapes: "Fiche famille → Onglet Documents",
    resultat_attendu: "Documents uploadés visibles et téléchargeables",
    priorite: "normale",
  },
  {
    id: "CT-01", module: "Cartes", sous_module: "Création",
    description: "Créer une carte de séances",
    etapes: "Cartes → Créer → Famille + enfant + nb séances → Valider",
    resultat_attendu: "Carte créée avec nb séances et prix",
    priorite: "haute",
  },
  {
    id: "CT-02", module: "Cartes", sous_module: "Utilisation",
    description: "Débiter une séance",
    etapes: "Cartes → Sélectionner carte → Débiter",
    resultat_attendu: "Séance décomptée, historique mis à jour",
    priorite: "haute",
  },
  {
    id: "AV-01", module: "Avoirs", sous_module: "Création",
    description: "Avoir créé à l'annulation",
    etapes: "Annuler une facture réglée",
    resultat_attendu: "Avoir créé automatiquement avec le montant encaissé",
    priorite: "critique",
  },
  {
    id: "AV-02", module: "Avoirs", sous_module: "Utilisation",
    description: "Utiliser un avoir pour payer",
    etapes: "Encaisser → Mode Avoir → Utiliser le solde",
    resultat_attendu: "Avoir débité, paiement réglé",
    priorite: "haute",
  },
  {
    id: "AV-03", module: "Avoirs", sous_module: "PDF",
    description: "Télécharger avoir PDF",
    etapes: "Historique → Facture annulée → Icône PDF avoir",
    resultat_attendu: "PDF avoir généré correctement",
    priorite: "haute",
  },
  {
    id: "EC-01", module: "Espace cavalier", sous_module: "Connexion",
    description: "Connexion Google",
    etapes: "Espace cavalier → Se connecter avec Google",
    resultat_attendu: "Connexion réussie, dashboard affiché",
    priorite: "critique",
  },
  {
    id: "EC-02", module: "Espace cavalier", sous_module: "Réservation",
    description: "Réserver un cours (vue liste)",
    etapes: "Réserver → Vue Liste → Sélectionner cours → Enfant → Panier → Payer",
    resultat_attendu: "Enfant inscrit + paiement créé + redirection CAWL",
    priorite: "critique",
  },
  {
    id: "EC-03", module: "Espace cavalier", sous_module: "Réservation",
    description: "Réserver un stage semaine complète",
    etapes: "Réserver → Vue Liste → Stage → Semaine complète → Payer",
    resultat_attendu: "Enfant inscrit 5 jours + paiement total ou acompte",
    priorite: "critique",
  },
  {
    id: "EC-04", module: "Espace cavalier", sous_module: "Réservation",
    description: "Réserver un stage à la journée",
    etapes: "Réserver → Vue Liste → Stage → À la journée → Choisir jours → Payer",
    resultat_attendu: "Enfant inscrit uniquement sur les jours choisis",
    priorite: "critique",
  },
  {
    id: "EC-05", module: "Espace cavalier", sous_module: "Réservation",
    description: "Bandeau stages dans Timeline",
    etapes: "Réserver → Vue Timeline → Voir le bandeau stages",
    resultat_attendu: "Bandeau vert avec nb stages, clic bascule vers vue Liste",
    priorite: "haute",
  },
  {
    id: "EC-06", module: "Espace cavalier", sous_module: "Réservation",
    description: "Réduction fratrie stage client",
    etapes: "Inscrire 2 enfants au même stage depuis l'espace cavalier",
    resultat_attendu: "Réduction appliquée au 2ème enfant",
    priorite: "haute",
  },
  {
    id: "EC-07", module: "Espace cavalier", sous_module: "Paiement",
    description: "Paiement CB acompte stage",
    etapes: "Panier avec stage → Acompte (30€/enfant) → Payer",
    resultat_attendu: "CAWL appelé avec montant acompte, paiement partial",
    priorite: "critique",
  },
  {
    id: "EC-08", module: "Espace cavalier", sous_module: "Paiement",
    description: "Paiement CB total",
    etapes: "Panier → Payer tout → CB",
    resultat_attendu: "CAWL avec montant total, paiement paid",
    priorite: "critique",
  },
  {
    id: "EC-09", module: "Espace cavalier", sous_module: "Paiement",
    description: "Paiement par avoir",
    etapes: "Panier → Mode Avoir → Utiliser",
    resultat_attendu: "Avoir débité, paiement réglé ou partiel",
    priorite: "haute",
  },
  {
    id: "EC-10", module: "Espace cavalier", sous_module: "Factures",
    description: "Voir mes factures",
    etapes: "Espace cavalier → Factures",
    resultat_attendu: "Liste des factures avec statut et montant",
    priorite: "haute",
  },
  {
    id: "EC-11", module: "Espace cavalier", sous_module: "Profil",
    description: "Modifier profil",
    etapes: "Espace cavalier → Profil → Modifier",
    resultat_attendu: "Modifications sauvegardées",
    priorite: "normale",
  },
  {
    id: "EC-12", module: "Espace cavalier", sous_module: "Réservations",
    description: "Voir mes réservations",
    etapes: "Espace cavalier → Réservations",
    resultat_attendu: "Liste des réservations à venir",
    priorite: "haute",
  },
  {
    id: "EM-01", module: "Emails", sous_module: "Confirmation",
    description: "Email confirmation inscription stage",
    etapes: "Inscrire un enfant à un stage",
    resultat_attendu: "Email envoyé avec récap + acompte/solde",
    priorite: "critique",
  },
  {
    id: "EM-02", module: "Emails", sous_module: "Confirmation",
    description: "Email confirmation forfait annuel",
    etapes: "Inscrire un enfant en forfait annuel",
    resultat_attendu: "Email envoyé avec récap forfait",
    priorite: "haute",
  },
  {
    id: "EM-03", module: "Emails", sous_module: "Confirmation",
    description: "Email confirmation paiement CAWL",
    etapes: "Payer en ligne via CAWL",
    resultat_attendu: "Email de confirmation avec montant payé",
    priorite: "critique",
  },
  {
    id: "EM-04", module: "Emails", sous_module: "Relance",
    description: "Email relance impayé",
    etapes: "Admin → Relancer un impayé",
    resultat_attendu: "Email de relance envoyé",
    priorite: "haute",
  },
  {
    id: "EM-05", module: "Emails", sous_module: "Templates",
    description: "Templates email éditables",
    etapes: "Admin → Templates email → Modifier → Sauvegarder",
    resultat_attendu: "Template sauvegardé, utilisé pour les prochains envois",
    priorite: "haute",
  },
  {
    id: "EM-06", module: "Emails", sous_module: "Solde J-7",
    description: "Email rappel solde stage J-7",
    etapes: "Cron daily → Stage dans 7 jours avec solde restant",
    resultat_attendu: "Email envoyé avec lien de paiement",
    priorite: "haute",
  },
  {
    id: "CR-01", module: "Crons", sous_module: "Notifications",
    description: "Cron daily-notifications",
    etapes: "Déclencher /api/cron/daily-notifications",
    resultat_attendu: "Récap moniteurs + rappels J-1 + rappels solde J-7",
    priorite: "haute",
  },
  {
    id: "CR-02", module: "Crons", sous_module: "Solde stage",
    description: "Cron charge-stage-balances",
    etapes: "Déclencher /api/cron/charge-stage-balances",
    resultat_attendu: "Email solde J-7 envoyé aux familles avec paiement stage partial",
    priorite: "haute",
  },
  {
    id: "CR-03", module: "Crons", sous_module: "Push",
    description: "Notifications push FCM",
    etapes: "Vérifier réception push sur mobile/desktop",
    resultat_attendu: "Notification reçue avec titre et lien",
    priorite: "normale",
  },
  {
    id: "FP-01", module: "Factures", sous_module: "Proforma",
    description: "Générer une proforma",
    etapes: "Paiements → Commande pending → Proforma",
    resultat_attendu: "PDF proforma avec toutes les mentions légales",
    priorite: "haute",
  },
  {
    id: "FP-02", module: "Factures", sous_module: "Définitive",
    description: "Générer une facture définitive",
    etapes: "Paiements → Commande → Facture définitive",
    resultat_attendu: "PDF facture avec n° séquentiel, TVA, mentions légales",
    priorite: "critique",
  },
  {
    id: "FP-03", module: "Factures", sous_module: "Avoir",
    description: "Générer un avoir PDF",
    etapes: "Annuler une facture réglée → Avoir créé",
    resultat_attendu: "PDF avoir avec référence facture source",
    priorite: "haute",
  },
  {
    id: "FP-04", module: "Factures", sous_module: "Auth",
    description: "Authentification PDF API",
    etapes: "Télécharger un PDF depuis admin",
    resultat_attendu: "Pas d'erreur 401, PDF généré correctement",
    priorite: "critique",
  },
  {
    id: "PM-01", module: "Paramètres", sous_module: "Centre",
    description: "Paramètres du centre",
    etapes: "Paramètres → Centre → Modifier nom/adresse → Enregistrer",
    resultat_attendu: "Informations sauvegardées dans Firestore",
    priorite: "normale",
  },
  {
    id: "PM-02", module: "Paramètres", sous_module: "Dégressivité",
    description: "Sauvegarder dégressivité",
    etapes: "Paramètres → Dégressivité → Modifier % → Enregistrer",
    resultat_attendu: "Réductions sauvegardées dans settings/degressivite",
    priorite: "critique",
  },
  {
    id: "PM-03", module: "Paramètres", sous_module: "Tarifs",
    description: "Tarifs annuels",
    etapes: "Paramètres → Tarifs annuels → Modifier → Enregistrer",
    resultat_attendu: "Tarifs sauvegardés et utilisés pour les inscriptions",
    priorite: "haute",
  },
  {
    id: "PM-04", module: "Paramètres", sous_module: "Inscription",
    description: "Paramètres inscription annuelle",
    etapes: "Paramètres → Inscription → Modifier adhésion/licence → Enregistrer",
    resultat_attendu: "Paramètres sauvegardés dans settings/inscription",
    priorite: "haute",
  },
  {
    id: "PM-05", module: "Paramètres", sous_module: "Moniteurs",
    description: "Gestion des moniteurs",
    etapes: "Paramètres → Moniteurs → Ajouter/modifier",
    resultat_attendu: "Moniteurs visibles dans les sélecteurs de créneaux",
    priorite: "normale",
  },
  {
    id: "CV-01", module: "Cavalerie", sous_module: "Équidés",
    description: "Liste des équidés",
    etapes: "Cavalerie → Voir la liste des chevaux/poneys",
    resultat_attendu: "41 équidés affichés avec infos",
    priorite: "normale",
  },
  {
    id: "CV-02", module: "Cavalerie", sous_module: "Fiche",
    description: "Fiche équidé",
    etapes: "Cavalerie → Clic sur un équidé",
    resultat_attendu: "Fiche complète avec historique soins",
    priorite: "normale",
  },
  {
    id: "CV-03", module: "Cavalerie", sous_module: "Charge",
    description: "PoneyChargeView",
    etapes: "Cavalerie → Vue charge journalière",
    resultat_attendu: "Timeline de charge avec alertes surcharge",
    priorite: "normale",
  },
  {
    id: "SV-01", module: "Site vitrine", sous_module: "Accueil",
    description: "Page d'accueil",
    etapes: "Accéder à la homepage",
    resultat_attendu: "Affichage correct, hero, activités, contact",
    priorite: "haute",
  },
  {
    id: "SV-02", module: "Site vitrine", sous_module: "CMS",
    description: "Contenu vitrine admin",
    etapes: "Admin → Contenu site → Modifier textes/images",
    resultat_attendu: "Modifications visibles sur le site public",
    priorite: "haute",
  },
  {
    id: "SV-03", module: "Site vitrine", sous_module: "Tarifs",
    description: "Page tarifs",
    etapes: "Accéder à /tarifs",
    resultat_attendu: "Tarifs affichés correctement",
    priorite: "normale",
  },
  {
    id: "SV-04", module: "Site vitrine", sous_module: "RGPD",
    description: "Pages légales",
    etapes: "Accéder à /mentions-legales et /confidentialite",
    resultat_attendu: "Pages conformes RGPD affichées",
    priorite: "haute",
  },
  {
    id: "SV-05", module: "Site vitrine", sous_module: "Activités",
    description: "Page activités",
    etapes: "Accéder à /activites",
    resultat_attendu: "Activités listées avec filtres par catégorie",
    priorite: "normale",
  },
  {
    id: "CO-01", module: "Comptabilité", sous_module: "Export",
    description: "Export comptable",
    etapes: "Comptabilité → Sélectionner période → Exporter",
    resultat_attendu: "Fichier CSV avec écritures comptables",
    priorite: "haute",
  },
  {
    id: "CO-02", module: "Statistiques", sous_module: "Dashboard",
    description: "Tableau de bord statistiques",
    etapes: "Statistiques → Dashboard",
    resultat_attendu: "KPIs affichés: CA, inscriptions, taux remplissage",
    priorite: "normale",
  },
  {
    id: "FI-01", module: "Fidélité", sous_module: "Points",
    description: "Cumul de points",
    etapes: "Encaisser un paiement → Vérifier les points attribués",
    resultat_attendu: "Points ajoutés au solde famille",
    priorite: "normale",
  },
  {
    id: "FI-02", module: "Fidélité", sous_module: "Utilisation",
    description: "Utiliser des points",
    etapes: "Encaisser → Utiliser points fidélité",
    resultat_attendu: "Points déduits, réduction appliquée",
    priorite: "normale",
  },
  {
    id: "SC-01", module: "Sécurité", sous_module: "Auth",
    description: "Accès admin protégé",
    etapes: "Accéder à /admin sans être connecté",
    resultat_attendu: "Redirection vers la connexion",
    priorite: "critique",
  },
  {
    id: "SC-02", module: "Sécurité", sous_module: "Auth",
    description: "API protégées",
    etapes: "Appeler /api/invoice-pdf sans token",
    resultat_attendu: "Réponse 401 Unauthorized",
    priorite: "critique",
  },
  {
    id: "SC-03", module: "Sécurité", sous_module: "Moniteurs",
    description: "Accès moniteur limité",
    etapes: "Se connecter en tant que moniteur → Vérifier les accès",
    resultat_attendu: "Accès limité au planning et suivi péda uniquement",
    priorite: "haute",
  },
  {
    id: "NF-01", module: "Notifications", sous_module: "Push",
    description: "Recevoir une notification push",
    etapes: "Inscrire un enfant → Vérifier notification admin",
    resultat_attendu: "Notification reçue sur desktop/mobile",
    priorite: "haute",
  },
  {
    id: "NF-02", module: "Notifications", sous_module: "PWA",
    description: "Installation PWA",
    etapes: "Installer l'app depuis Chrome (Add to Home Screen)",
    resultat_attendu: "App installée, icône sur l'écran d'accueil",
    priorite: "normale",
  }
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
            <button onClick={async () => {
              if (!confirm(`Réinitialiser les ${TESTS.length} tests ?\n\nTous les statuts (OK/KO/Remarque) seront effacés.`)) return;
              setResults({});
              await setDoc(doc(db, "settings", "testMatrix"), { results: {}, updatedAt: new Date().toISOString() });
              setLastSaved(new Date().toLocaleString("fr-FR"));
            }} className="flex items-center gap-1 font-body text-xs text-red-500 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red-100">
              <Trash2 size={13}/> Réinitialiser
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
