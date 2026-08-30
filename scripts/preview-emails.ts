/**
 * Aperçu des emails — `npm run preview:emails`
 *
 * Écrit un fichier HTML qui empile les messages types tels qu'ils partiront.
 * Sans cela, la seule façon de voir un email était de déclencher l'événement
 * qui l'envoie : on ne retouchait donc jamais la mise en forme.
 *
 * Le rendu réel dépend de la messagerie ; cet aperçu montre le cas favorable
 * (navigateur). Ce qui est vérifié ici, c'est la mise en page — pas la
 * compatibilité Outlook, qui tient à la structure en <table>.
 */
import { writeFileSync } from "node:fs";
import { emailTemplates as T, emailLayout, emailFidelite } from "../src/lib/email-templates";
import { DEFAULT_TEMPLATES } from "../src/lib/email-templates-defauts";
import { encadreConditionsStage } from "../src/lib/cgv-clauses";

/**
 * Rend un gabarit du chargeur sans passer par Firestore.
 *
 * Ce sont ceux-là qui partent sur les paiements ; les voir ici est le seul
 * intérêt de cet aperçu, puisque ce sont aussi les plus reçus.
 */
function rendre(cle: string, vars: Record<string, string>, supplement = "") {
  const t = DEFAULT_TEMPLATES[cle];
  let { subject, body } = { subject: t.subject, body: t.body };
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`\\{${k}\\}`, "g");
    subject = subject.replace(re, v);
    body = body.replace(re, v);
  }
  body = body.replace(/\{deroule\}/g, "");
  body = body.replace(/\{fidelite\}/g, emailFidelite(82, 340, 100, 500));
  body = body.replace(/\{[a-zA-Z]+\}/g, "");
  return { subject, html: emailLayout(body + supplement) };
}

const EXEMPLES = [
  // ── Ce que reçoit une famille après un paiement (gabarits du chargeur) ──
  rendre("confirmationStageAcompte", {
    parentName: "Marie Lefèvre", stageTitle: "Stage poney — Toussaint",
    dates: "Du lundi 19 au vendredi 23 octobre 2026", horaires: "9h30 – 12h00",
    enfants: "Léa, Tom", total: "275,00", acompte: "82,50", solde: "192,50",
    soldePhrase: "Le solde de 192,50 € sera prélevé automatiquement sur votre carte enregistrée environ une semaine avant le début du stage. Aucune action n'est requise.",
  }, encadreConditionsStage()),
  rendre("confirmationPaiement", {
    parentName: "Marie Lefèvre", montant: "82,50",
    prestations: "Stage poney Toussaint — Léa, Tom", mode: "Carte bancaire",
  }),
  // ── Gabarits de lib/email-templates ──
  T.confirmationStage({
    parentName: "Marie Lefèvre",
    enfants: [{ name: "Léa Lefèvre", prix: 145, remise: 0 }, { name: "Tom Lefèvre", prix: 130, remise: 15 }],
    stageTitle: "Stage poney — Toussaint",
    dates: "Du lundi 19 au vendredi 23 octobre 2026",
    totalTTC: 275, acompte: 82.5, solde: 192.5,
  }),
  T.confirmationStage({
    parentName: "Marie Lefèvre",
    enfants: [{ name: "Léa Lefèvre", prix: 145, remise: 0 }],
    stageTitle: "Stage poney — Toussaint",
    dates: "Du lundi 19 au vendredi 23 octobre 2026",
    totalTTC: 145, paiementConfirme: true, montantRegle: 145,
  }),
  T.confirmationCours({
    parentName: "Marie Lefèvre", childName: "Léa", coursTitle: "Cours Galop 2",
    date: "mercredi 14 octobre", horaire: "14h00 – 15h00", prix: 22,
  }),
  T.confirmationPaiement({
    parentName: "Marie Lefèvre", montant: 82.5, mode: "Carte bancaire",
    prestations: "Acompte stage Toussaint",
  }),
  T.rappelStage({
    parentName: "Marie Lefèvre", enfants: ["Léa", "Tom"],
    stageTitle: "Stage poney — Toussaint", dateDebut: "lundi 19 octobre", horaire: "9h30 – 12h00",
  }),
  T.rappelImpaye({
    parentName: "Marie Lefèvre", montant: 192.5, prestations: "Solde stage Toussaint",
  }),
  T.lienPaiement({
    parentName: "Marie Lefèvre", label: "Solde stage Toussaint", montant: 192.5, lienPaiement: "#",
  }),
  T.bienvenueNouvelleFamille({ parentName: "Marie Lefèvre" }),
  T.desinscriptionAvoir({
    parentName: "Marie Lefèvre", childName: "Tom", activite: "Stage poney — Toussaint",
    montantAvoir: 130, refAvoir: "AV-2026-0043",
  }),
];

const page = `<!doctype html><meta charset="utf-8"><title>Aperçu des emails</title>
<body style="margin:0;background:#DDD8CF;">
${EXEMPLES.map((e) => `
  <div style="max-width:640px;margin:0 auto;padding:30px 12px 0;">
    <div style="font:700 11px/1.5 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#8A8377;">Objet — ${e.subject}</div>
  </div>${e.html}`).join("")}
<div style="height:48px"></div></body>`;

const sortie = process.argv[2] || "apercu-emails.html";
writeFileSync(sortie, page, "utf-8");
console.log(`Aperçu écrit : ${sortie} (${EXEMPLES.length} messages)`);
