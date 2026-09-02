/**
 * Templates emails — Centre Équestre d'Agon-Coutainville
 *
 * V2 : une papeterie sobre et légère. L'or devient un accent rare, les
 * titres redeviennent compacts et les blocs privilégient l'information.
 * La structure reste en tableaux et styles inline pour Outlook/Gmail.
 */

const CLUB_NAME = "Centre Équestre d'Agon-Coutainville";
const CLUB_TEL = "02 44 84 99 96";
const CLUB_EMAIL = "ceagon50@gmail.com";
const CLUB_MOBILE = "06 09 02 71 59";
const SITE_URL = "https://centre-equestre-agon.vercel.app";
const SITE_VITRINE = "https://www.centreequestreagon.com";
const ADRESSE = { rue: "56 Charrière du Commerce", cp: "50230", ville: "Agon-Coutainville" } as const;

/**
 * Dessins au trait (cf. scripts/generer-icones-email.mjs).
 *
 * Images distantes : une messagerie qui bloque les images les fera
 * disparaître. Ils restent donc purement décoratifs — alt vide, dimensions
 * fixées — et aucune information ne repose sur eux. Le message tient debout
 * sans une seule image, logo compris : l'en-tête porte le nom du club en
 * texte.
 */
function dessin(nom: string, px = 20) {
  return `<img src="${SITE_URL}/images/email/${nom}.png" width="${px}" height="${px}" alt="" `
    + `style="display:block;width:${px}px;height:${px}px;border:0;" />`;
}

const C = {
  encre: "#102C50",
  texte: "#3E4959",
  gris: "#758092",
  discret: "#98A0AB",
  bleu: "#173A68",
  or: "#C58A27",
  sable: "#FCFAF7",
  ivoire: "#FFFDFC",
  bord: "#E8E2D9",
  fond: "#F4F2EE",
  vert: "#247A4D",
  rouge: "#A93B35",
} as const;

const POLICE = "Georgia,'Times New Roman',serif";
const POLICE_TEXTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function euros(n: number): string {
  return n.toFixed(2).replace(".", ",") + "&nbsp;€";
}

export function eurosTexte(n: number): string {
  return n.toFixed(2).replace(".", ",") + "\u00A0€";
}

function wrap(content: string, preheader = "") {
  const apercu = preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.fond};">${preheader}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";

  // Document complet plutôt que fragment : c'est le seul endroit où une
  // messagerie lit `color-scheme`, et sans elle plusieurs d'entre elles
  // inversent l'email en mode sombre — fond blanc devenu noir, sable devenu
  // gris anthracite. Apple Mail et Outlook respectent cette déclaration et
  // laissent le message tel quel. L'application Gmail sur Android, non : elle
  // inverse quoi qu'on écrive, et aucune balise ne l'en empêche.
  //
  // C'est pourquoi rien ici ne repose sur la clarté d'un fond : les textes
  // portent tous une couleur explicite, et l'en-tête bleu nuit reste lisible
  // dans les deux sens. Le message inversé est moins beau, jamais illisible.
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<style>:root{color-scheme:light;supported-color-schemes:light;}</style>
</head>
<body style="margin:0;padding:0;background:${C.fond};">
${apercu}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fond};margin:0;padding:18px 8px;">
  <tr><td align="center">
    <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;border-collapse:separate;border-spacing:0;">

      <tr>
        <td style="background:${C.encre};padding:18px 24px;border-radius:14px 14px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="54" style="width:54px;vertical-align:middle;padding-right:14px;">
                <img src="${SITE_URL}/images/logo-ce-agon.png" width="46" height="46" alt="Centre Équestre d'Agon-Coutainville"
                     style="display:block;width:46px;height:46px;border:0;" />
              </td>
              <td style="vertical-align:middle;">
                <div style="font-family:${POLICE};font-size:21px;line-height:1.15;color:#ffffff;font-weight:normal;">Centre Équestre</div>
                <div style="font-family:${POLICE_TEXTE};font-size:9px;line-height:1.4;color:#D5B16B;letter-spacing:0.18em;text-transform:uppercase;padding-top:5px;">Agon-Coutainville</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr><td style="height:2px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td></tr>

      <tr>
        <td style="background:#ffffff;padding:28px 30px 30px;border-left:1px solid ${C.bord};border-right:1px solid ${C.bord};font-family:${POLICE_TEXTE};font-size:15px;line-height:1.62;color:${C.texte};">
          ${content}
        </td>
      </tr>

      <tr>
        <td style="background:#F8F6F2;padding:15px 24px 17px;border:1px solid ${C.bord};border-top:none;border-radius:0 0 14px 14px;text-align:center;font-family:${POLICE_TEXTE};font-size:10px;line-height:1.65;color:#818A96;">
          <div style="font-family:${POLICE};font-size:12px;color:${C.encre};padding-bottom:9px;">${CLUB_NAME}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
            <td style="padding:0 9px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:6px;">${dessin("epingle", 14)}</td>
              <td style="font-family:${POLICE_TEXTE};font-size:10px;line-height:1.45;color:#818A96;text-align:left;">${ADRESSE.rue}<br/>${ADRESSE.cp} ${ADRESSE.ville}</td>
            </tr></table></td>
            <td style="padding:0 9px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:6px;">${dessin("telephone", 14)}</td>
              <td style="font-family:${POLICE_TEXTE};font-size:10px;line-height:1.45;color:#818A96;text-align:left;">${CLUB_TEL}<br/>${CLUB_MOBILE}</td>
            </tr></table></td>
          </tr></table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:9px auto 0;"><tr>
            <td style="padding:0 9px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:6px;">${dessin("enveloppe", 14)}</td>
              <td><a href="mailto:${CLUB_EMAIL}" style="font-family:${POLICE_TEXTE};font-size:10px;color:${C.encre};text-decoration:none;">${CLUB_EMAIL}</a></td>
            </tr></table></td>
            <td style="padding:0 9px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="padding-right:6px;">${dessin("globe", 14)}</td>
              <td><a href="${SITE_VITRINE}" style="font-family:${POLICE_TEXTE};font-size:10px;color:${C.encre};text-decoration:none;">${SITE_VITRINE.replace(/^https?:\/\//, "")}</a></td>
            </tr></table></td>
          </tr></table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(text: string, url: string, color: string = C.encre) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;border-collapse:separate;">
    <tr>
      <td align="center" bgcolor="${color}" style="background:${color};border-radius:8px;">
        <a href="${url}" style="display:block;padding:11px 20px;color:#ffffff;text-decoration:none;font-weight:650;font-size:13px;font-family:${POLICE_TEXTE};line-height:1.3;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function panneau(titrePanneau: string, contenu: string, icone?: string) {
  const entete = titrePanneau
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-bottom:10px;margin-bottom:5px;border-bottom:1px solid ${C.bord};"><tr>
         ${icone ? `<td width="28" style="width:28px;padding-right:9px;vertical-align:middle;">${dessin(icone, 19)}</td>` : ""}
         <td style="vertical-align:middle;font-family:${POLICE_TEXTE};font-size:10px;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:${C.encre};">${titrePanneau}</td>
       </tr></table>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:19px 0;border-collapse:separate;border-spacing:0;">
    <tr>
      <td style="background:${C.sable};padding:17px 18px;border:1px solid ${C.bord};border-radius:10px;">
        ${entete}
        ${contenu}
      </td>
    </tr>
  </table>`;
}

function ligne(label: string, valeur: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:5px 0;font-family:${POLICE_TEXTE};font-size:13px;color:${C.gris};vertical-align:top;">${label}</td>
      <td align="right" style="padding:5px 0 5px 14px;font-family:${POLICE_TEXTE};font-size:13px;color:${C.encre};font-weight:650;vertical-align:top;">${valeur}</td>
    </tr>
  </table>`;
}

function montant(valeur: number, couleur: string = C.encre) {
  return `<div style="font-family:${POLICE};font-size:27px;line-height:1.2;color:${couleur};padding:3px 0;">${euros(valeur)}</div>`;
}

/**
 * Titre de message : centré, sous un losange doré, souligné d'un filet court.
 *
 * Aligné à gauche et à peine plus gros que le texte, il s'y confondait. Le
 * centrage et l'ornement — un caractère, pas une image, donc rien à charger
 * et rien qu'une messagerie puisse bloquer — donnent au message l'allure d'un
 * courrier plutôt que celle d'une notification.
 */
function titre(texte: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 18px;">
    <tr><td align="center">
      <div style="font-family:${POLICE};font-size:12px;color:${C.or};padding-bottom:11px;">&#9671;</div>
      <h1 style="margin:0;font-family:${POLICE};font-size:26px;line-height:1.28;font-weight:normal;color:${C.encre};">${texte}</h1>
      <div style="width:48px;height:2px;background:${C.or};margin:13px auto 0;font-size:0;line-height:0;">&nbsp;</div>
    </td></tr>
  </table>`;
}

/**
 * Ligne mise en vedette : le nom du stage, de l'activité, du forfait.
 *
 * Il était noyé dans la phrase, en gras, à la taille du texte. Sur sa propre
 * ligne il devient ce que la famille cherche en ouvrant le message.
 */
function vedette(texte: string) {
  return `<div style="text-align:center;font-family:${POLICE};font-size:21px;line-height:1.3;color:${C.encre};margin:0 0 20px;">${texte}</div>`;
}

function p(texte: string, taille = 15) {
  return `<p style="margin:0 0 12px;font-family:${POLICE_TEXTE};font-size:${taille}px;line-height:1.65;color:${C.texte};">${texte}</p>`;
}

function etat(libelle: string, detail: string, couleur: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate;border-spacing:0;">
    <tr>
      <td style="background:${C.ivoire};padding:12px 15px;border:1px solid ${C.bord};border-radius:9px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:${POLICE_TEXTE};font-size:10px;font-weight:750;letter-spacing:0.10em;text-transform:uppercase;color:${couleur};">${libelle}</td>
          <td align="right" style="font-family:${POLICE};font-size:21px;line-height:1.2;color:${C.encre};">${detail}</td>
        </tr></table>
      </td>
    </tr>
  </table>`;
}

function signature(mot = `Au plaisir de vous accueillir prochainement au ${CLUB_NAME}.`) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:27px 0 0;border-collapse:collapse;border-top:1px solid ${C.bord};">
    <tr><td style="padding:16px 0 0;font-family:${POLICE_TEXTE};font-size:13px;line-height:1.6;color:${C.gris};">
      ${mot}<br/>
      <span style="display:inline-block;padding-top:3px;font-family:${POLICE};font-size:15px;font-style:italic;color:${C.encre};">L'équipe du Centre Équestre d'Agon-Coutainville</span>
    </td></tr>
  </table>`;
}

function fidelite(gagnes: number, total: number, taux: number, minPoints: number) {
  if (!gagnes || gagnes <= 0) return "";
  const valeur = taux > 0 ? total / taux : 0;
  const utilisable = total >= minPoints;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:17px 0 0;border-collapse:separate;border-spacing:0;">
    <tr><td style="background:${C.sable};padding:14px 17px;border:1px solid ${C.bord};border-radius:9px;">
      <div style="font-family:${POLICE_TEXTE};font-size:10px;font-weight:750;letter-spacing:0.09em;text-transform:uppercase;color:${C.gris};">Fidélité</div>
      <div style="font-family:${POLICE};font-size:19px;line-height:1.25;color:${C.encre};padding-top:3px;">+${gagnes} points</div>
      <div style="font-family:${POLICE_TEXTE};font-size:12px;line-height:1.55;color:${C.gris};padding-top:4px;">
        Votre solde est de <strong style="color:${C.encre};">${total} points</strong>, soit ${valeur.toFixed(2).replace(".", ",")}&nbsp;€ de réduction${utilisable
          ? " utilisables dès votre prochain règlement."
          : `. Utilisables à partir de ${minPoints} points.`}
      </div>
    </td></tr>
  </table>`;
}

export const emailLayout = wrap;
export const emailButton = button;
export const emailPanneau = panneau;
export const emailLigne = ligne;
export const emailTitre = titre;
export const emailParagraphe = p;
export const emailCouleurs = C;
export const emailEtat = etat;
export const emailMontant = montant;
export const emailSignature = signature;
export const emailVedette = vedette;
export const emailFidelite = fidelite;

export const emailTemplates = {
  confirmationStage: (vars: {
    parentName: string;
    enfants: { name: string; prix: number; remise: number }[];
    stageTitle: string;
    dates: string;
    totalTTC: number;
    acompte?: number;
    solde?: number;
    paiementConfirme?: boolean;
    montantRegle?: number;
    acompteRegle?: boolean;
    lienSepare?: boolean;
    dateSolde?: string;
    derouleHtml?: string;
  }) => {
    const acompteDu = !vars.paiementConfirme && !vars.acompteRegle
      && !!vars.acompte && !!vars.solde && vars.solde > 0;

    return {
      subject: vars.paiementConfirme
        ? `Paiement confirmé — ${vars.stageTitle}`
        : acompteDu
          ? `Inscription enregistrée — acompte à régler — ${vars.stageTitle}`
          : `Inscription confirmée — ${vars.stageTitle}`,
      html: wrap(`
        ${vars.paiementConfirme
          ? etat("Paiement confirmé", `${euros(vars.montantRegle ?? vars.totalTTC)} réglés`, C.vert)
          : vars.acompteRegle && vars.acompte
            ? etat("Acompte reçu", `${euros(vars.acompte)}`, C.vert)
            : ""}
        ${titre(vars.paiementConfirme
          ? "Inscription validée et payée"
          : acompteDu ? "Il reste une étape" : "Votre inscription est confirmée")}
        ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
        ${p(acompteDu
          ? "Nous avons enregistré l'inscription au stage :"
          : "Nous sommes ravis de vous confirmer l'inscription au stage :")}
        ${vedette(vars.stageTitle)}
        ${acompteDu ? p("La place est retenue ; elle sera définitivement acquise dès réception de l'acompte.") : ""}
        ${panneau(`Votre stage · ${vars.dates}`, `
          ${vars.enfants.map(e => ligne(
            e.name + (e.remise > 0 ? ` <span style="color:${C.gris};font-size:12px;">(remise ${e.remise} €)</span>` : ""),
            euros(e.prix),
          )).join("")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:9px;border-top:1px solid ${C.bord};">
            <tr>
              <td style="padding:10px 0 0;font-family:${POLICE_TEXTE};font-size:12px;font-weight:700;color:${C.encre};">Total</td>
              <td align="right" style="padding:8px 0 0;font-family:${POLICE};font-size:24px;color:${C.encre};">${euros(vars.totalTTC)}</td>
            </tr>
          </table>
        `, "calendrier")}
        ${vars.derouleHtml || ""}
        ${acompteDu ? panneau("Ce qu'il reste à faire", `
          ${ligne("Acompte aujourd'hui", euros(vars.acompte!))}
          ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", euros(vars.solde!))}
          ${p(vars.lienSepare
            ? "Vous recevez le lien de paiement de l'acompte dans un message séparé. Le solde vous sera réclamé automatiquement une semaine avant le stage."
            : "L'acompte se règle depuis votre espace client. Le solde vous sera réclamé automatiquement une semaine avant le stage.", 12)}
        `, "carte") : ""}
        ${vars.acompteRegle && vars.solde && vars.solde > 0 ? panneau("Reste à venir", `
          ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", euros(vars.solde))}
          ${p("Un rappel avec le lien de paiement vous sera envoyé automatiquement.", 12)}
        `, "carte") : ""}
        ${acompteDu && !vars.lienSepare ? button("Régler l'acompte", `${SITE_URL}/espace-cavalier/factures`) : ""}
        ${signature()}
      `, acompteDu
          ? `Acompte de ${euros(vars.acompte!)} à régler · ${vars.dates}`
          : `${vars.dates} · ${vars.enfants.map((e) => e.name).join(", ")}`),
    };
  },

  /**
   * Confirmation d'inscription à un stage — un seul message par famille.
   *
   * Remplace `confirmationStage` sur le chemin du planning, pour deux raisons.
   *
   * 1. Inscrire cinq enfants répartis sur trois stages, c'est trois passages
   *    dans le panneau du planning : la famille recevait trois confirmations
   *    presque identiques dans la même minute, pour ce qui était à ses yeux
   *    une seule inscription — et un seul lien de paiement. Les stages sont
   *    maintenant mis en attente quelques minutes (lib/stage-confirmations)
   *    puis réunis ici : un panneau par stage, un total unique.
   *
   * 2. Le message annonçait « Votre inscription est confirmée » alors que
   *    rien n'était encaissé — c'est justement le cas courant depuis
   *    l'administration : on inscrit, la commande part aux impayés, le lien
   *    de paiement est envoyé ensuite. Tant que rien n'est reçu, la lettre
   *    parle donc de place retenue et de règlement attendu ; « confirmée »
   *    est réservé à ce qui est payé.
   */
  confirmationStages: (vars: {
    parentName: string;
    stages: {
      stageTitle: string;
      dates: string;
      /** « 10h00–12h00 » — la lettre ne disait pas à quelle heure venir. */
      horaires?: string;
      enfants: { name: string; prix: number; remise: number }[];
    }[];
    totalTTC: number;
    /** Ce qui est réclamé maintenant : l'acompte, ou la totalité s'il n'y a pas d'acompte. */
    aRegler: number;
    /** Reste dû après ce règlement (solde d'acompte). 0 quand tout est demandé maintenant. */
    solde: number;
    /** Déjà encaissé sur cette commande. */
    dejaRegle?: number;
    /** Le lien de paiement part dans un message séparé (pas de bouton ici). */
    lienSepare?: boolean;
    dateSolde?: string;
    derouleHtml?: string;
  }) => {
    const stages = vars.stages || [];
    const nbStages = stages.length;
    const nbInscriptions = stages.reduce((n, s) => n + s.enfants.length, 0);
    const prenoms = [...new Set(stages.flatMap((s) => s.enfants.map((e) => e.name)))];
    const intitule = nbStages === 1 ? stages[0]?.stageTitle || "Stage" : `${nbStages} stages`;
    const datesToutes = [...new Set(stages.map((s) => s.dates).filter(Boolean))].join(" · ");

    const dejaRegle = vars.dejaRegle || 0;
    const toutRegle = dejaRegle >= vars.totalTTC - 0.01;
    // Acompte : une partie maintenant, le reste avant le stage.
    const acompteDu = !toutRegle && vars.solde > 0 && vars.aRegler > 0;
    // Rien d'encaissé et pas d'acompte : c'est la totalité qui reste à régler.
    const totaliteDue = !toutRegle && !acompteDu && vars.aRegler > 0;
    // Acompte déjà reçu : il ne reste que le solde, réclamé automatiquement.
    const soldeSeul = !toutRegle && vars.aRegler <= 0 && vars.solde > 0;

    return {
      subject: toutRegle || soldeSeul
        ? `Inscription confirmée — ${intitule}`
        : acompteDu
          ? `Inscription enregistrée — acompte à régler — ${intitule}`
          : `Inscription enregistrée — règlement à venir — ${intitule}`,
      html: wrap(`
        ${toutRegle
          ? etat("Paiement confirmé", `${euros(dejaRegle)} réglés`, C.vert)
          : dejaRegle > 0
            ? etat(soldeSeul ? "Acompte reçu" : "Déjà réglé", euros(dejaRegle), C.vert)
            : ""}
        ${titre(toutRegle || soldeSeul
          ? (nbStages > 1 ? "Vos inscriptions sont confirmées" : "Votre inscription est confirmée")
          : "Il reste une étape")}
        ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
        ${p(nbStages > 1
          ? `Nous avons enregistré ${nbInscriptions} inscription${nbInscriptions > 1 ? "s" : ""} sur ${nbStages} stages :`
          : "Nous avons enregistré l'inscription au stage :")}
        ${nbStages === 1 ? vedette(stages[0]?.stageTitle || "Stage") : ""}
        ${!toutRegle && !soldeSeul ? p(nbStages > 1
          ? "Les places sont retenues ; elles seront définitivement acquises dès réception du règlement."
          : "La place est retenue ; elle sera définitivement acquise dès réception du règlement.") : ""}
        ${stages.map((s) => panneau(
          nbStages === 1 ? `Votre stage · ${s.dates}` : `${s.stageTitle} · ${s.dates}`,
          `${s.horaires ? ligne("Horaires", s.horaires) : ""}${s.enfants.map((e) => ligne(
            e.name + (e.remise > 0 ? ` <span style="color:${C.gris};font-size:12px;">(remise ${e.remise} €)</span>` : ""),
            euros(e.prix),
          )).join("")}`,
          "calendrier",
        )).join("")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 8px;border-top:1px solid ${C.bord};">
          <tr>
            <td style="padding:12px 0 0;font-family:${POLICE_TEXTE};font-size:12px;font-weight:700;color:${C.encre};">${nbStages > 1 ? `Total des ${nbStages} stages` : "Total"}</td>
            <td align="right" style="padding:10px 0 0;font-family:${POLICE};font-size:24px;color:${C.encre};">${euros(vars.totalTTC)}</td>
          </tr>
        </table>
        ${vars.derouleHtml || ""}
        ${acompteDu ? panneau("Ce qu'il reste à faire", `
          ${ligne(nbStages > 1 ? "Acompte aujourd'hui, pour l'ensemble des stages" : "Acompte aujourd'hui", euros(vars.aRegler))}
          ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", euros(vars.solde))}
          ${p(vars.lienSepare
            ? "Le lien de paiement de l'acompte vous parvient dans un message séparé : un seul règlement couvre l'ensemble. Le solde vous sera réclamé automatiquement une semaine avant le stage."
            : "L'acompte se règle depuis votre espace client, en une seule fois. Le solde vous sera réclamé automatiquement une semaine avant le stage.", 12)}
        `, "carte") : ""}
        ${totaliteDue ? panneau("Ce qu'il reste à faire", `
          ${ligne(nbStages > 1 ? "À régler, pour l'ensemble des stages" : "À régler", euros(vars.aRegler))}
          ${p(vars.lienSepare
            ? "Le lien de paiement vous parvient dans un message séparé : un seul règlement couvre l'ensemble des inscriptions ci-dessus."
            : "Vous recevrez sous peu un lien de paiement par email — un seul règlement pour l'ensemble. Le règlement reste possible depuis votre espace client ou directement au centre équestre.", 12)}
        `, "carte") : ""}
        ${soldeSeul ? panneau("Reste à venir", `
          ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", euros(vars.solde))}
          ${p("Un rappel avec le lien de paiement vous sera envoyé automatiquement.", 12)}
        `, "carte") : ""}
        ${(acompteDu || totaliteDue) && !vars.lienSepare
          ? button(acompteDu ? "Régler l'acompte" : "Régler mon inscription", `${SITE_URL}/espace-cavalier/factures`)
          : ""}
        ${signature()}
      `, toutRegle || soldeSeul
          ? `${datesToutes} · ${prenoms.join(", ")}`
          : acompteDu
            ? `Acompte de ${euros(vars.aRegler)} · ${intitule}`
            : `${euros(vars.aRegler)} à régler · ${intitule}`),
    };
  },

  confirmationCours: (vars: {
    parentName: string;
    childName: string;
    coursTitle: string;
    date: string;
    horaire: string;
    prix: number;
    regle?: boolean;
  }) => ({
    subject: `Réservation confirmée — ${vars.coursTitle}`,
    html: wrap(`
      ${titre("Votre réservation est confirmée")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`La réservation de <strong>${vars.childName}</strong> est confirmée.`)}
      ${panneau(vars.coursTitle, `
        ${ligne("Date", vars.date)}
        ${ligne("Horaire", vars.horaire)}
        ${ligne(vars.regle ? "Réglé" : "Montant", euros(vars.prix))}
      `)}
      ${vars.regle
        ? p(`<strong style="color:${C.vert};">Réglé</strong> — rien d'autre à prévoir.`, 14)
        : p(`<strong style="color:${C.encre};">Reste à régler : ${euros(vars.prix)}.</strong> La place est bien réservée ; le règlement peut se faire en ligne depuis votre espace, ou sur place au centre équestre.`, 14)}
      ${button(vars.regle ? "Voir mes réservations" : "Régler ma réservation",
               `${SITE_URL}/espace-cavalier/${vars.regle ? "reservations" : "factures"}`)}
      ${signature()}
    `, `${vars.childName} · ${vars.date}, ${vars.horaire}`),
  }),

  confirmationForfait: (vars: {
    parentName: string;
    childName: string;
    forfaitLabel: string;
    nbSeances: number;
    totalTTC: number;
    planPaiement: string;
  }) => ({
    subject: `Forfait annuel confirmé — ${vars.childName}`,
    html: wrap(`
      ${titre("Forfait annuel enregistré")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`Le forfait annuel de <strong>${vars.childName}</strong> est enregistré.`)}
      ${panneau(vars.forfaitLabel, `
        ${ligne("Séances", String(vars.nbSeances))}
        ${ligne("Paiement", vars.planPaiement)}
        ${ligne("Total", euros(vars.totalTTC))}
      `)}
      ${button("Voir mon espace", `${SITE_URL}/espace-cavalier`)}
      ${signature()}
    `, `${vars.forfaitLabel} · ${vars.nbSeances} séances`),
  }),

  lienPaiement: (vars: {
    parentName: string;
    label: string;
    montant: number;
    lienPaiement: string;
  }) => ({
    subject: `Lien de paiement — ${vars.label}`,
    html: wrap(`
      ${titre("Votre lien de paiement")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`Voici votre lien de paiement pour <strong>${vars.label}</strong>.`)}
      ${panneau("Montant à régler", `<div style="text-align:left;">${montant(vars.montant)}</div>`)}
      ${button("Payer en ligne", vars.lienPaiement)}
      ${p(`<span style="color:${C.discret};">Paiement sécurisé par CAWL — Crédit Agricole.</span>`, 11)}
    `, `${vars.label} — ${euros(vars.montant)}`),
  }),

  confirmationPaiement: (vars: {
    parentName: string;
    montant: number;
    mode: string;
    prestations: string;
    pointsGagnes?: number;
    pointsTotal?: number;
    tauxFidelite?: number;
    minPointsFidelite?: number;
  }) => ({
    subject: `Paiement reçu — ${eurosTexte(vars.montant)}`,
    html: wrap(`
      ${etat("Paiement reçu", euros(vars.montant), C.vert)}
      ${titre("Merci, votre paiement nous est parvenu")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${panneau("Détail du règlement", `
        ${ligne("Mode de règlement", vars.mode)}
        ${ligne("Prestation", vars.prestations)}
      `)}
      ${vars.pointsGagnes ? fidelite(vars.pointsGagnes, vars.pointsTotal ?? vars.pointsGagnes, vars.tauxFidelite ?? 100, vars.minPointsFidelite ?? 500) : ""}
      ${button("Voir mes factures", `${SITE_URL}/espace-cavalier/factures`)}
      ${signature("Merci de votre confiance.")}
    `, `${euros(vars.montant)} — ${vars.prestations}`),
  }),

  rappelCours: (vars: {
    parentName: string;
    childName: string;
    coursTitle: string;
    date: string;
    horaire: string;
    moniteur: string;
  }) => ({
    subject: `Rappel — ${vars.coursTitle} demain`,
    html: wrap(`
      ${titre("C'est demain")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`Petit rappel : <strong>${vars.childName}</strong> a cours demain.`)}
      ${panneau(vars.coursTitle, `
        ${ligne("Date", vars.date)}
        ${ligne("Horaire", vars.horaire)}
        ${ligne("Encadrement", vars.moniteur)}
      `)}
      ${p("À prévoir : bottes et bombe.", 14)}
      ${signature("À demain au centre équestre.")}
    `, `${vars.childName} — ${vars.date}, ${vars.horaire}`),
  }),

  rappelStage: (vars: {
    parentName: string;
    enfants: string[];
    stageTitle: string;
    dateDebut: string;
    horaire: string;
    derouleHtml?: string;
  }) => ({
    subject: `Rappel — ${vars.stageTitle} commence bientôt`,
    html: wrap(`
      ${titre("Le stage commence bientôt")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`Le stage <strong style="color:${C.encre};">${vars.stageTitle}</strong> approche.`)}
      ${panneau("Rendez-vous", `
        ${ligne("À partir du", vars.dateDebut)}
        ${ligne("Horaire", vars.horaire)}
        ${ligne(vars.enfants.length > 1 ? "Cavaliers" : "Cavalier", vars.enfants.join(", "))}
      `)}
      ${vars.derouleHtml || ""}
      ${p("<strong>À prévoir :</strong> bottes, bombe, pantalon long, un goûter et de l'eau.", 14)}
      ${signature()}
    `, `Départ le ${vars.dateDebut} à ${vars.horaire}`),
  }),

  rappelImpaye: (vars: {
    parentName: string;
    montant: number;
    prestations: string;
  }) => ({
    subject: `Rappel de paiement — ${eurosTexte(vars.montant)}`,
    html: wrap(`
      ${titre("Un solde reste dû")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p("Nous nous permettons de vous rappeler qu'un solde reste ouvert sur votre compte.")}
      ${panneau("Montant restant", `
        <div>${montant(vars.montant, C.rouge)}</div>
        ${p(`<span style="color:${C.gris};">${vars.prestations}</span>`, 13)}
      `)}
      ${button("Régler en ligne", `${SITE_URL}/espace-cavalier/factures`)}
      ${p("Merci de régulariser à votre convenance. Si ce règlement a déjà été fait, ce message est sans objet.", 13)}
      ${signature("Avec nos remerciements.")}
    `, `${euros(vars.montant)} — ${vars.prestations}`),
  }),

  bienvenueNouvelleFamille: (vars: {
    parentName: string;
  }) => ({
    subject: `Bienvenue au ${CLUB_NAME}`,
    html: wrap(`
      ${titre("Bienvenue au club")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p("Votre espace personnel est prêt. Vous pouvez dès maintenant :")}
      ${panneau("Votre espace cavalier", `
        <ul style="margin:0;padding-left:18px;font-family:${POLICE_TEXTE};font-size:14px;line-height:1.8;color:${C.texte};">
          <li>compléter le profil de votre famille ;</li>
          <li>inscrire vos enfants aux activités ;</li>
          <li>réserver des stages et des balades ;</li>
          <li>suivre vos paiements et vos factures.</li>
        </ul>
      `)}
      ${button("Accéder à mon espace", `${SITE_URL}/espace-cavalier`)}
      ${p(`Une question ? Appelez-nous au ${CLUB_TEL}.`, 14)}
      ${signature()}
    `, "Votre espace personnel est prêt."),
  }),

  desinscriptionAvoir: (vars: {
    parentName: string;
    childName: string;
    activite: string;
    montantAvoir: number;
    refAvoir: string;
  }) => ({
    subject: `Désinscription — Avoir de ${eurosTexte(vars.montantAvoir)}`,
    html: wrap(`
      ${titre("Désinscription enregistrée")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`La désinscription de <strong>${vars.childName}</strong> de <strong>${vars.activite}</strong> a été enregistrée.`)}
      ${panneau("Avoir créé sur votre compte", `
        <div>${montant(vars.montantAvoir)}</div>
        ${ligne("Référence", vars.refAvoir)}
      `)}
      ${p("Cet avoir sera automatiquement proposé lors de votre prochain règlement.", 14)}
      ${signature()}
    `, `Avoir de ${euros(vars.montantAvoir)} — réf. ${vars.refAvoir}`),
  }),
};

export type EmailTemplateName = keyof typeof emailTemplates;
