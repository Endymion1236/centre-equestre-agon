/**
 * Templates emails — Centre Équestre d'Agon-Coutainville
 *
 * Habillage transactionnel premium, compatible avec les principaux clients
 * email. Toute la structure reste en tableaux et styles inline afin de tenir
 * correctement dans Outlook, Gmail et Apple Mail.
 */

const CLUB_NAME = "Centre Équestre d'Agon-Coutainville";
const CLUB_TEL = "02 44 84 99 96";
const CLUB_EMAIL = "ceagon50@gmail.com";
const CLUB_MOBILE = "06 09 02 71 59";
const SITE_URL = "https://centre-equestre-agon.vercel.app";
const SITE_VITRINE = "https://www.centreequestreagon.com";
const ADRESSE = { rue: "56 Charrière du Commerce", cp: "50230", ville: "Agon-Coutainville" } as const;

const C = {
  encre: "#0F2C56",
  texte: "#344155",
  gris: "#778296",
  discret: "#9AA3B0",
  bleu: "#173A68",
  or: "#D79A25",
  orFonce: "#9A6818",
  sable: "#FBF7F1",
  ivoire: "#FFFDF9",
  bord: "#E9DDCC",
  fond: "#F2EEE7",
  vert: "#15803D",
  rouge: "#B3261E",
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

  return `${apercu}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fond};margin:0;padding:28px 10px;">
  <tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;">

      <tr>
        <td style="background:${C.encre};padding:28px 34px 26px;border-radius:18px 18px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="74" style="width:74px;vertical-align:middle;padding-right:18px;">
                <img src="${SITE_URL}/images/logo-ce-agon.png" width="64" height="64" alt="Centre Équestre d'Agon-Coutainville"
                     style="display:block;width:64px;height:64px;border:0;border-radius:12px;background:#ffffff;" />
              </td>
              <td style="vertical-align:middle;">
                <div style="font-family:${POLICE};font-size:26px;line-height:1.1;color:#ffffff;font-weight:normal;letter-spacing:0.01em;">Centre Équestre</div>
                <div style="font-family:${POLICE_TEXTE};font-size:11px;line-height:1.5;color:${C.or};letter-spacing:0.20em;text-transform:uppercase;padding-top:7px;">Agon-Coutainville</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr>
                  <td width="54" style="height:1px;width:54px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td>
                  <td style="padding:0 9px;color:${C.or};font-family:${POLICE};font-size:12px;line-height:1;">&#9670;</td>
                  <td width="54" style="height:1px;width:54px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr><td style="height:3px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td></tr>

      <tr>
        <td style="background:#ffffff;padding:38px 38px 34px;border-left:1px solid ${C.bord};border-right:1px solid ${C.bord};font-family:${POLICE_TEXTE};font-size:15px;line-height:1.65;color:${C.texte};">
          ${content}
        </td>
      </tr>

      <tr>
        <td style="background:${C.encre};padding:20px 28px 22px;border-radius:0 0 18px 18px;border-top:2px solid ${C.or};text-align:center;font-family:${POLICE_TEXTE};font-size:11px;line-height:1.75;color:#E7EDF5;">
          <div style="font-family:${POLICE};font-size:14px;color:#ffffff;padding-bottom:5px;">${CLUB_NAME}</div>
          <div>${ADRESSE.rue} · ${ADRESSE.cp} ${ADRESSE.ville}</div>
          <div style="padding-top:2px;">${CLUB_TEL} · ${CLUB_MOBILE} · <a href="mailto:${CLUB_EMAIL}" style="color:#ffffff;text-decoration:none;">${CLUB_EMAIL}</a></div>
          <div style="padding-top:8px;">
            <a href="${SITE_URL}/espace-cavalier" style="color:${C.or};text-decoration:none;font-weight:700;">Mon espace cavalier</a>
            <span style="color:#73839A;"> &nbsp;·&nbsp; </span>
            <a href="${SITE_VITRINE}" style="color:#E7EDF5;text-decoration:none;">${SITE_VITRINE.replace(/^https?:\/\//, "")}</a>
          </div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>`;
}

function button(text: string, url: string, color: string = C.encre) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto;border-collapse:separate;">
    <tr>
      <td align="center" bgcolor="${color}" style="background:${color};border:1px solid ${C.or};border-radius:10px;">
        <a href="${url}" style="display:block;padding:14px 31px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;font-family:${POLICE_TEXTE};line-height:1.3;letter-spacing:0.01em;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function panneau(titrePanneau: string, contenu: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;border-collapse:separate;border-spacing:0;">
    <tr>
      <td width="4" style="width:4px;background:${C.or};font-size:0;line-height:0;border-radius:12px 0 0 12px;">&nbsp;</td>
      <td style="background:${C.sable};padding:20px 22px 19px;border:1px solid ${C.bord};border-left:none;border-radius:0 12px 12px 0;">
        ${titrePanneau ? `<div style="font-family:${POLICE_TEXTE};font-size:11px;font-weight:800;letter-spacing:0.17em;text-transform:uppercase;color:${C.orFonce};padding-bottom:12px;border-bottom:1px solid ${C.bord};margin-bottom:8px;">${titrePanneau}</div>` : ""}
        ${contenu}
      </td>
    </tr>
  </table>`;
}

function ligne(label: string, valeur: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:5px 0;font-family:${POLICE_TEXTE};font-size:13px;color:${C.gris};vertical-align:top;">${label}</td>
      <td align="right" style="padding:5px 0 5px 16px;font-family:${POLICE_TEXTE};font-size:13px;color:${C.encre};font-weight:700;vertical-align:top;white-space:nowrap;">${valeur}</td>
    </tr>
  </table>`;
}

function montant(valeur: number, couleur: string = C.encre) {
  return `<div style="font-family:${POLICE};font-size:31px;line-height:1.2;color:${couleur};padding:5px 0;">${euros(valeur)}</div>`;
}

function titre(texte: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 25px;border-collapse:collapse;">
    <tr><td align="center">
      <div style="font-family:${POLICE};font-size:28px;line-height:1.28;font-weight:normal;color:${C.encre};">${texte}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px auto 0;"><tr>
        <td width="36" style="height:1px;width:36px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:0 8px;color:${C.or};font-family:${POLICE};font-size:10px;line-height:1;">&#9670;</td>
        <td width="36" style="height:1px;width:36px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td>
      </tr></table>
    </td></tr>
  </table>`;
}

function p(texte: string, taille = 15) {
  return `<p style="margin:0 0 13px;font-family:${POLICE_TEXTE};font-size:${taille}px;line-height:1.68;color:${C.texte};">${texte}</p>`;
}

function etat(libelle: string, detail: string, couleur: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-collapse:separate;border-spacing:0;">
    <tr>
      <td align="center" style="background:${C.ivoire};padding:15px 20px 16px;border:1px solid ${C.bord};border-top:3px solid ${couleur};border-radius:11px;">
        <div style="font-family:${POLICE_TEXTE};font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:${couleur};">${libelle}</div>
        <div style="font-family:${POLICE};font-size:24px;line-height:1.25;color:${C.encre};padding-top:5px;">${detail}</div>
      </td>
    </tr>
  </table>`;
}

function signature(mot = `Au plaisir de vous accueillir prochainement au ${CLUB_NAME}.`) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0;border-collapse:collapse;border-top:1px solid ${C.bord};">
    <tr><td align="center" style="padding:22px 8px 0;font-family:${POLICE_TEXTE};font-size:14px;line-height:1.65;color:${C.texte};">
      <div style="color:${C.or};font-family:${POLICE};font-size:14px;line-height:1;padding-bottom:9px;">&#9670;</div>
      ${mot}<br/>
      <span style="display:inline-block;padding-top:5px;font-family:${POLICE};font-size:17px;font-style:italic;color:${C.encre};">L'équipe du centre équestre</span>
    </td></tr>
  </table>`;
}

function fidelite(gagnes: number, total: number, taux: number, minPoints: number) {
  if (!gagnes || gagnes <= 0) return "";
  const valeur = taux > 0 ? total / taux : 0;
  const utilisable = total >= minPoints;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;border-collapse:separate;border-spacing:0;">
    <tr><td style="background:${C.encre};padding:17px 21px;border-radius:11px;border-bottom:2px solid ${C.or};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${POLICE_TEXTE};font-size:10px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#FFFFFF;opacity:0.65;">Fidélité</td>
        <td align="right" style="font-family:${POLICE};font-size:21px;color:${C.or};">+${gagnes} points</td>
      </tr></table>
      <div style="font-family:${POLICE_TEXTE};font-size:12px;line-height:1.6;color:#E7EDF5;padding-top:8px;">
        Votre solde : <strong style="color:#ffffff;">${total} points</strong>, soit ${valeur.toFixed(2).replace(".", ",")}&nbsp;€ de réduction${utilisable
          ? " — utilisables dès votre prochain règlement."
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
          ? `Nous avons enregistré l'inscription au stage <strong style="color:${C.encre};">${vars.stageTitle}</strong>. La place est retenue ; elle sera définitivement acquise dès réception de l'acompte.`
          : `L'inscription au stage <strong style="color:${C.encre};">${vars.stageTitle}</strong> est ${vars.paiementConfirme ? "validée et payée" : "confirmée"}.`)}
        ${panneau(vars.dates, `
          ${vars.enfants.map(e => ligne(
            e.name + (e.remise > 0 ? ` <span style="color:${C.gris};font-size:12px;">(remise ${e.remise} €)</span>` : ""),
            euros(e.prix),
          )).join("")}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:10px;border-top:1px solid ${C.bord};">
            <tr>
              <td style="padding:12px 0 0;font-family:${POLICE_TEXTE};font-size:13px;font-weight:800;color:${C.encre};text-transform:uppercase;letter-spacing:0.08em;">Total</td>
              <td align="right" style="padding:9px 0 0;font-family:${POLICE};font-size:26px;color:${C.encre};">${euros(vars.totalTTC)}</td>
            </tr>
          </table>
        `)}
        ${vars.derouleHtml || ""}
        ${acompteDu ? panneau("Modalités de paiement", `
          ${ligne("Acompte à régler maintenant", euros(vars.acompte!))}
          ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", euros(vars.solde!))}
          ${p(vars.lienSepare
            ? "Vous recevez le lien de paiement de l'acompte dans un message séparé. Le solde vous sera réclamé automatiquement une semaine avant le stage."
            : "L'acompte se règle depuis votre espace client. Le solde vous sera réclamé automatiquement une semaine avant le stage.", 12)}
        `) : ""}
        ${vars.acompteRegle && vars.solde && vars.solde > 0 ? panneau("Modalités de paiement", `
          ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", euros(vars.solde))}
          ${p("Un rappel avec le lien de paiement vous sera envoyé automatiquement.", 12)}
        `) : ""}
        ${acompteDu && !vars.lienSepare ? button("Régler l'acompte", `${SITE_URL}/espace-cavalier/factures`) : ""}
        ${signature()}
      `, acompteDu
          ? `Acompte de ${euros(vars.acompte!)} à régler · ${vars.dates}`
          : `${vars.dates} · ${vars.enfants.map((e) => e.name).join(", ")}`),
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
      ${panneau("Montant à régler", `<div style="text-align:center;">${montant(vars.montant)}</div>`)}
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
      ${panneau("Détail", `
        ${ligne("Mode de règlement", vars.mode)}
        ${ligne("Prestations", vars.prestations)}
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
        <div style="text-align:center;">${montant(vars.montant, C.rouge)}</div>
        ${p(`<span style="color:${C.gris};text-align:center;display:block;">${vars.prestations}</span>`, 13)}
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
        <ul style="margin:0;padding-left:18px;font-family:${POLICE_TEXTE};font-size:14px;line-height:1.9;color:${C.texte};">
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
        <div style="text-align:center;">${montant(vars.montantAvoir)}</div>
        ${ligne("Référence", vars.refAvoir)}
      `)}
      ${p("Cet avoir sera automatiquement proposé lors de votre prochain règlement.", 14)}
      ${signature()}
    `, `Avoir de ${euros(vars.montantAvoir)} — réf. ${vars.refAvoir}`),
  }),
};

export type EmailTemplateName = keyof typeof emailTemplates;
