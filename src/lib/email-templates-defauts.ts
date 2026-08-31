/**
 * Gabarits d'emails par défaut.
 *
 * Séparés du chargeur pour une raison pratique : le chargeur importe
 * firebase-admin, ce qui rend les gabarits impossibles à rendre hors d'un
 * déploiement — donc impossibles à relire avant de les envoyer. Ici, ils
 * n'importent que l'habillage, et `npm run preview:emails` peut les afficher.
 *
 * Ce sont les valeurs de repli : ce que l'administration enregistre dans
 * `settings/emailTemplates` les remplace, gabarit par gabarit.
 */

import {
  emailButton, emailPanneau, emailLigne, emailTitre,
  emailParagraphe as P, emailEtat, emailSignature, emailCouleurs as C,
} from "@/lib/email-templates";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://centre-equestre-agon.vercel.app";

// ── Templates par défaut (fallback si rien dans Firestore) ──
//
// Composés avec les briques partagées (emailPanneau, emailLigne…) pour que
// le rendu soit exactement celui de `email-templates.ts`. Le résultat reste
// une chaîne HTML avec des {variables} : c'est ce que la page
// d'administration met à disposition à l'édition, on ne peut donc pas y
// laisser d'appel de fonction.
const A_PREVOIR = "<strong>À prévoir :</strong> bottes, bombe, pantalon long, un goûter et de l'eau.";

export const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  confirmationStageAcompte: {
    subject: "Acompte confirmé — {stageTitle}",
    body: [
      emailEtat("Acompte confirmé", "{acompte}&nbsp;€ réglés", C.vert),
      emailTitre("La place est réservée"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P('Votre acompte a bien été reçu : la place au stage <strong style="color:' + C.encre + ';">{stageTitle}</strong> est réservée.'),
      emailPanneau("Votre stage · {dates}", [
        emailLigne("Horaires", "{horaires}"),
        emailLigne("Cavaliers", "{enfants}"),
      ].join(""), "calendrier"),
      "{deroule}",
      emailPanneau("Récapitulatif du paiement", [
        emailLigne("Total du stage", "{total}&nbsp;€"),
        emailLigne("Acompte réglé ce jour", "−{acompte}&nbsp;€"),
        emailLigne('<strong style="color:' + C.encre + ';">Solde, avant le {dateSolde}</strong>', '<span style="color:' + C.rouge + ';">{solde}&nbsp;€</span>'),
        P("{soldePhrase}", 12),
      ].join(""), "carte"),
      "{fidelite}",
      P(A_PREVOIR, 14),
      emailSignature(),
    ].join("\n"),
  },
  confirmationStage: {
    subject: "Paiement confirmé — {stageTitle}",
    body: [
      emailEtat("Paiement confirmé", "{montant}&nbsp;€ réglés", C.vert),
      emailTitre("Inscription validée et payée"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P('L\'inscription au stage <strong style="color:' + C.encre + ';">{stageTitle}</strong> est validée et payée.'),
      emailPanneau("Votre stage · {dates}", [
        emailLigne("Horaires", "{horaires}"),
        emailLigne("Cavaliers", "{enfants}"),
        emailLigne('<strong style="color:' + C.encre + ';">Total réglé</strong>', "{montant}&nbsp;€"),
      ].join(""), "calendrier"),
      "{deroule}",
      "{fidelite}",
      P(A_PREVOIR, 14),
      emailSignature(),
    ].join("\n"),
  },
  confirmationCours: {
    subject: "Réservation confirmée — {coursTitle}",
    body: [
      emailTitre("Réservation confirmée"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P("La réservation de <strong>{childName}</strong> est confirmée."),
      emailPanneau("{coursTitle}", [
        emailLigne("Date", "{date}"),
        emailLigne("Horaire", "{horaire}"),
        emailLigne("Encadrement", "{moniteur}"),
        emailLigne("Montant", "{prix}&nbsp;€"),
      ].join("")),
      P("À prévoir : bottes et bombe.", 14),
      emailSignature(),
    ].join("\n"),
  },
  confirmationForfait: {
    subject: "Forfait annuel confirmé — {childName}",
    body: [
      emailTitre("Forfait annuel enregistré"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P("Le forfait annuel de <strong>{childName}</strong> est enregistré."),
      emailPanneau("{forfaitLabel}", [
        emailLigne("Séances", "{nbSeances}"),
        emailLigne("Paiement", "{planPaiement}"),
        emailLigne('<strong style="color:' + C.encre + ';">Total</strong>', "{totalTTC}&nbsp;€"),
      ].join("")),
      emailButton("Voir mon espace", SITE_URL + "/espace-cavalier"),
      emailSignature(),
    ].join("\n"),
  },
  rappelJ1: {
    subject: "Rappel — {coursTitle} demain",
    body: [
      emailTitre("C'est demain"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P("Petit rappel pour demain{childrenStr} :"),
      "{lignes}",
      emailPanneau("", P("Casque obligatoire, tenue adaptée recommandée.", 13)),
      emailSignature("À demain au centre équestre."),
    ].join("\n"),
  },
  rappelImpaye: {
    subject: "Rappel de paiement — {montant} €",
    body: [
      emailTitre("Un solde reste dû"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P("Nous nous permettons de vous rappeler qu'un solde reste ouvert sur votre compte."),
      emailPanneau("", [
        '<div style="text-align:center;font-family:Georgia,serif;font-size:28px;line-height:1.2;color:' + C.rouge + ';padding:2px 0;">{montant}&nbsp;€</div>',
        P('<span style="color:' + C.gris + ';">{prestations}</span>', 13),
      ].join("")),
      emailButton("Régler en ligne", SITE_URL + "/espace-cavalier/factures"),
      P("Merci de régulariser à votre convenance. Si ce règlement a déjà été fait, ce message est sans objet.", 13),
      emailSignature("Avec nos remerciements."),
    ].join("\n"),
  },
  bienvenue: {
    subject: "Bienvenue au Centre Équestre d'Agon-Coutainville",
    body: [
      emailTitre("Bienvenue au club"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P("Votre espace personnel est prêt : vous pouvez y inscrire vos enfants, réserver stages et balades, et suivre vos règlements."),
      emailButton("Accéder à mon espace", SITE_URL + "/espace-cavalier"),
      P("Une question ? Appelez-nous au 02 44 84 99 96.", 14),
      emailSignature(),
    ].join("\n"),
  },
  confirmationPaiement: {
    subject: "Paiement reçu — {montant} €",
    body: [
      emailEtat("Paiement reçu", "{montant}&nbsp;€", C.vert),
      emailTitre("Merci, votre paiement nous est parvenu"),
      P("Bonjour <strong>{parentName}</strong>,"),
      emailPanneau("Détail", [
        emailLigne("Prestations", "{prestations}"),
        emailLigne("Mode de règlement", "{mode}"),
      ].join(""), "carte"),
      "{fidelite}",
      emailButton("Voir mes factures", SITE_URL + "/espace-cavalier/factures"),
      emailSignature("Merci de votre confiance."),
    ].join("\n"),
  },
  confirmationPromenade: {
    subject: "Promenade confirmée — {date}",
    body: [
      emailTitre("Promenade confirmée"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P("Votre réservation de promenade est confirmée."),
      emailPanneau("Promenade à cheval", [
        emailLigne("Date", "{date}"),
        emailLigne("Horaire", "{horaire}"),
        emailLigne("Participants", "{participants}"),
        emailLigne("Montant", "{prix}&nbsp;€"),
      ].join("")),
      P("<strong>Rendez-vous</strong> au parking du centre équestre, 15 minutes avant le départ.", 14),
      P("<strong>À prévoir :</strong> pantalon long, chaussures fermées. Bombe fournie si besoin.", 14),
      emailSignature("Bonne balade !"),
    ].join("\n"),
  },
  confirmationAbonnement: {
    subject: "Inscription confirmée — Paiement en {nbEcheances} fois",
    body: [
      emailTitre("Inscription confirmée"),
      P("Bonjour <strong>{parentName}</strong>,"),
      P("Votre inscription est confirmée avec un paiement en <strong>{nbEcheances} mensualités</strong>."),
      emailPanneau("Échéancier", [
        emailLigne("1<sup>re</sup> échéance reçue", "{montant}&nbsp;€"),
        emailLigne("Mensualités restantes", "{nbRestantes} × {montant}&nbsp;€"),
      ].join("")),
      P("Les prochaines mensualités seront prélevées automatiquement. Aucune action n'est requise.", 14),
      emailSignature(),
    ].join("\n"),
  },
};

