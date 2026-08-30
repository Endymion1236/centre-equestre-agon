/**
 * Templates emails — Centre Équestre d'Agon-Coutainville
 *
 * Chaque template est une fonction qui prend des variables
 * et retourne { subject, html }.
 *
 * Utilisation :
 * const { subject, html } = emailTemplates.confirmationStage({ ... });
 * await fetch("/api/send-email", { body: JSON.stringify({ to, subject, html }) });
 *
 * ── Pourquoi cet habillage ────────────────────────────────────────────────
 *
 * Les emails avaient le contenu juste et l'allure d'un brouillon. Quatre
 * causes, toutes corrigées ici :
 *
 *   1. Chaque template inventait sa palette — encadré vert d'eau pour un
 *      stage, bleu pâle pour un cours, ambre pour un forfait, mauve pour un
 *      avoir. Sept jeux de couleurs qui n'étaient celles ni du site ni les
 *      unes des autres. Il n'y en a plus qu'un : fond sable, filet doré, et
 *      la couleur ne sert plus qu'à distinguer un état (réglé / dû).
 *
 *   2. Les émojis tenaient lieu d'iconographie (📅 🕐 💳 👧 📚). Ils se
 *      rendent différemment sur chaque client — carrés vides sous Outlook,
 *      dessin enfantin ailleurs — et c'est ce qui datait le plus ces
 *      messages. Ils sont remplacés par des intitulés en petites capitales.
 *
 *   3. `linear-gradient` et `box-shadow` sur le bandeau de paiement :
 *      Outlook ignore les deux et n'affichait qu'un aplat vert cerné d'un
 *      énorme ✅. Tout est en aplats, qui se rendent partout à l'identique.
 *
 *   4. `'Segoe UI'` n'existe que sous Windows ; ailleurs le rendu retombait
 *      sur Arial, sans rapport avec le site. On reprend le contraste du
 *      site — titres en serif, texte en sans — avec des polices présentes
 *      partout : Georgia rappelle le Libre Baskerville des titres, et la
 *      pile système remplace l'Outfit du texte. Aucune webfont : les
 *      messageries les bloquent pour la plupart.
 *
 * La structure est en <table> et non en <div> : c'est la seule qui tienne
 * sous Outlook, dont le moteur de rendu est celui de Word.
 */

const CLUB_NAME = "Centre Équestre d'Agon-Coutainville";
const CLUB_TEL = "02 44 84 99 96";
const CLUB_EMAIL = "ceagon@orange.fr";
const CLUB_MOBILE = "06 09 02 71 59";
const SITE_URL = "https://centre-equestre-agon.vercel.app";
/** Site vitrine, différent de l'application : c'est lui qu'on montre. */
const SITE_VITRINE = "https://www.centreequestreagon.com";
const ADRESSE = { rue: "56 Charrière du Commerce", cp: "50230", ville: "Agon-Coutainville" } as const;

// ═══ La palette, et rien d'autre ═══
// Reprise du site (cf. lib/config COLORS) pour que l'email et l'espace
// client se ressemblent. Un template qui a besoin d'une couleur la prend
// ici ; s'il n'y en a pas qui convienne, c'est le besoin qu'il faut revoir.
const C = {
  encre: "#0F2C56",   // titres, montants — le bleu nuit du site
  texte: "#3D4859",   // texte courant
  gris: "#7A8595",    // texte secondaire
  discret: "#9AA3B0", // mentions légales
  bleu: "#2050A0",    // action principale
  or: "#F0A010",      // filet d'accent
  sable: "#FAF6F0",   // fond des encadrés
  bord: "#E7E1D6",    // filets
  fond: "#F1EDE6",    // fond hors carte
  vert: "#15803D",    // état : réglé
  rouge: "#B3261E",   // état : dû
} as const;

const POLICE = "Georgia,'Times New Roman',serif";
const POLICE_TEXTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Montant à la française : virgule décimale et espace insécable avant l'euro.
 *
 * « 145.00€ » est une écriture de tableur. C'est le détail qui, répété à
 * chaque ligne, faisait le plus pour l'impression d'amateurisme — bien plus
 * qu'une couleur mal choisie. Intl.NumberFormat n'est pas utilisé ici : le
 * rendu doit être identique quel que soit le fuseau du serveur qui envoie.
 */
export function euros(n: number): string {
  return n.toFixed(2).replace(".", ",") + "&nbsp;€";
}

/** Même chose pour un objet d'email, qui est du texte brut : pas d'entité HTML. */
export function eurosTexte(n: number): string {
  return n.toFixed(2).replace(".", ",") + "\u00A0€";
}

/**
 * Enveloppe commune : fond sable, carte blanche de 600 px, en-tête au logo,
 * pied de page discret. Tout est en table imbriquée — voir l'en-tête du
 * fichier pour la raison.
 */
function wrap(content: string, preheader = "") {
  // Ligne d'aperçu affichée par la messagerie à côté de l'objet. Sans elle,
  // l'aperçu reprend le premier texte du message — « Bonjour Marie », qui
  // n'apprend rien. Masquée dans le corps par une taille nulle ; les entités
  // en fin de chaîne empêchent la messagerie d'y accoler le début du texte.
  const apercu = preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.fond};">${preheader}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";
  return `${apercu}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fond};margin:0;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">

      <tr><td style="background:${C.encre};padding:22px 28px;border-radius:14px 14px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:12px;vertical-align:middle;">
            <img src="${SITE_URL}/images/logo-ce-agon.png" width="44" height="44" alt=""
                 style="display:block;width:44px;height:44px;border:0;border-radius:8px;background:#ffffff;" />
          </td>
          <td style="vertical-align:middle;">
            <div style="font-family:${POLICE};font-size:17px;line-height:1.25;color:#ffffff;font-weight:normal;">Centre Équestre</div>
            <div style="font-family:${POLICE_TEXTE};font-size:11px;line-height:1.4;color:#FFFFFF;opacity:0.62;letter-spacing:0.12em;text-transform:uppercase;">Agon-Coutainville</div>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="height:3px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td></tr>

      <tr><td style="background:#ffffff;padding:28px;border-left:1px solid ${C.bord};border-right:1px solid ${C.bord};font-family:${POLICE_TEXTE};font-size:15px;line-height:1.6;color:${C.texte};">
        ${content}
      </td></tr>

      <tr><td style="background:${C.sable};padding:18px 28px;border:1px solid ${C.bord};border-top:none;border-radius:0 0 14px 14px;text-align:center;font-family:${POLICE_TEXTE};font-size:11px;line-height:1.8;color:${C.discret};">
        ${CLUB_NAME}<br/>
        ${ADRESSE.rue}, ${ADRESSE.cp} ${ADRESSE.ville}<br/>
        ${CLUB_TEL} · ${CLUB_MOBILE} · <a href="mailto:${CLUB_EMAIL}" style="color:${C.discret};text-decoration:none;">${CLUB_EMAIL}</a><br/>
        <a href="${SITE_URL}/espace-cavalier" style="color:${C.bleu};text-decoration:none;font-weight:600;">Accéder à mon espace</a>
        &nbsp;·&nbsp;
        <a href="${SITE_VITRINE}" style="color:${C.discret};text-decoration:none;">${SITE_VITRINE.replace(/^https?:\/\//, "")}</a>
      </td></tr>

    </table>
  </td></tr>
</table>`;
}

/**
 * Bouton « bulletproof » (structure en table).
 *
 * Un <a> en inline-block avec du padding se casse des que le texte passe a
 * la ligne : le fond colore ne suit pas, et le bouton apparait coupe en deux
 * blocs qui se chevauchent — visible sur mobile en mode sombre.
 *
 * Ici le fond est porte par la cellule et le lien est en display:block a
 * l'interieur : la couleur enveloppe toujours le texte, quelle que soit la
 * largeur. C'est la structure qui passe partout, Outlook compris.
 */
function button(text: string, url: string, color: string = C.bleu) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;border-collapse:separate;">
    <tr>
      <td align="center" bgcolor="${color}" style="background:${color};border-radius:10px;">
        <a href="${url}" style="display:block;padding:14px 30px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;font-family:${POLICE_TEXTE};line-height:1.3;">${text}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * Encadré d'information : fond sable, filet doré à gauche.
 *
 * Remplace les sept encadrés pastel d'avant. Un seul encadré, quel que soit
 * le sujet : c'est le titre qui dit de quoi il s'agit, pas la couleur du
 * fond — laquelle ne voulait rien dire de toute façon.
 */
function panneau(titre: string, contenu: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border-collapse:collapse;">
    <tr>
      <td width="3" style="width:3px;background:${C.or};font-size:0;line-height:0;">&nbsp;</td>
      <td style="background:${C.sable};padding:18px 20px;border:1px solid ${C.bord};border-left:none;border-radius:0 10px 10px 0;">
        ${titre ? `<div style="font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.gris};padding-bottom:10px;">${titre}</div>` : ""}
        ${contenu}
      </td>
    </tr>
  </table>`;
}

/** Une ligne « intitulé — valeur » dans un encadré. */
function ligne(label: string, valeur: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:3px 0;font-family:${POLICE_TEXTE};font-size:13px;color:${C.gris};">${label}</td>
      <td align="right" style="padding:3px 0;font-family:${POLICE_TEXTE};font-size:13px;color:${C.encre};font-weight:600;">${valeur}</td>
    </tr>
  </table>`;
}

/** Un montant mis en avant, en serif comme les titres du site. */
function montant(valeur: number, couleur: string = C.encre) {
  return `<div style="font-family:${POLICE};font-size:28px;line-height:1.2;color:${couleur};padding:2px 0;">${euros(valeur)}</div>`;
}

/** Titre de message, au-dessus du corps. */
function titre(texte: string) {
  return `<h1 style="margin:0 0 14px;font-family:${POLICE};font-size:22px;line-height:1.3;font-weight:normal;color:${C.encre};">${texte}</h1>`;
}

/** Paragraphe courant. */
function p(texte: string, taille = 15) {
  return `<p style="margin:0 0 12px;font-family:${POLICE_TEXTE};font-size:${taille}px;line-height:1.65;color:${C.texte};">${texte}</p>`;
}

/**
 * Bandeau d'état, en aplat.
 *
 * L'ancien bandeau « PAIEMENT CONFIRMÉ » cumulait dégradé, ombre portée et
 * un ✅ de 32 px : sous Outlook il ne restait qu'un rectangle vert et un
 * carré vide. Un aplat et une ligne de texte se rendent partout pareil.
 */
function etat(libelle: string, detail: string, couleur: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">
    <tr><td align="center" bgcolor="${couleur}" style="background:${couleur};padding:18px 20px;border-radius:10px;">
      <div style="font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#ffffff;opacity:0.85;">${libelle}</div>
      <div style="font-family:${POLICE};font-size:26px;line-height:1.25;color:#ffffff;padding-top:6px;">${detail}</div>
    </td></tr>
  </table>`;
}

/**
 * Signature de fin de message.
 *
 * Un email transactionnel qui s'arrête sur un bouton ressemble à un accusé
 * de réception automatique. Deux lignes signées suffisent à rappeler qu'il
 * y a un club derrière — et c'est la différence entre correct et soigné.
 */
function signature(mot = `Au plaisir de vous accueillir prochainement au ${CLUB_NAME}.`) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-collapse:collapse;border-top:1px solid ${C.bord};">
    <tr><td style="padding:16px 0 0;font-family:${POLICE_TEXTE};font-size:14px;line-height:1.6;color:${C.texte};">
      ${mot}<br/>
      <span style="font-family:${POLICE};font-size:15px;color:${C.encre};">L'équipe du centre équestre</span>
    </td></tr>
  </table>`;
}

/**
 * Points de fidélité gagnés sur un règlement.
 *
 * N'apparaît que si le programme est activé et que des points ont réellement
 * été crédités : annoncer « 0 point » ou parler d'un programme éteint serait
 * pire que se taire. La contrepartie en euros est indiquée, sinon un nombre
 * de points ne veut rien dire pour la famille.
 */
function fidelite(gagnes: number, total: number, taux: number, minPoints: number) {
  if (!gagnes || gagnes <= 0) return "";
  const valeur = taux > 0 ? total / taux : 0;
  const utilisable = total >= minPoints;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;border-collapse:collapse;">
    <tr><td style="background:${C.encre};padding:16px 20px;border-radius:10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font-family:${POLICE_TEXTE};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FFFFFF;opacity:0.55;">Fidélité</td>
        <td align="right" style="font-family:${POLICE};font-size:20px;color:${C.or};">+${gagnes} points</td>
      </tr></table>
      <div style="font-family:${POLICE_TEXTE};font-size:12px;line-height:1.6;color:#FFFFFF;opacity:0.72;padding-top:8px;">
        Votre solde : <strong style="opacity:1;">${total} points</strong>, soit ${valeur.toFixed(2).replace(".", ",")}&nbsp;€ de réduction${utilisable
          ? " — utilisables dès votre prochain règlement."
          : `. Utilisables à partir de ${minPoints} points.`}
      </div>
    </td></tr>
  </table>`;
}

/** Reutilisables hors de ce module (crons, routes API). */
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

  // ═══ INSCRIPTIONS ═══

  /**
   * Inscription à un stage. Trois états, et non deux.
   *
   * Le message annonçait « Inscription confirmée » puis réclamait un acompte
   * « à régler maintenant » dans le même souffle : la famille lisait qu'elle
   * était inscrite et qu'il lui restait à payer pour l'être. L'acompte
   * n'ayant pas encore été réglé, la place n'est justement pas acquise —
   * c'est même tout l'intérêt de demander un acompte.
   *
   *   paiementConfirme   le stage est payé en entier  → « validée et payée »
   *   acompte dû, non réglé  → « inscription enregistrée », place retenue
   *   acompteRegle       l'acompte est encaissé       → place acquise, solde à venir
   *
   * L'objet du message suit l'état : il n'y a rien de plus déroutant qu'un
   * objet qui dit « confirmée » au-dessus d'un corps qui demande de payer.
   */
  confirmationStage: (vars: {
    parentName: string;
    enfants: { name: string; prix: number; remise: number }[];
    stageTitle: string;
    dates: string;
    totalTTC: number;
    acompte?: number;
    solde?: number;
    paiementConfirme?: boolean; // Optionnel : true si paiement deja regle (webhook CAWL)
    montantRegle?: number; // Optionnel : montant effectivement regle si different du total
    /** L'acompte a été encaissé (comptoir ou en ligne) : la place est acquise. */
    acompteRegle?: boolean;
    /** Le lien de paiement part dans un message séparé : on l'annonce. */
    lienSepare?: boolean;
    /**
     * Date réelle d'échéance du solde, déjà formatée (« 12 octobre »).
     *
     * « 7 jours avant le stage » oblige la famille à compter, et donne au
     * message un ton de règlement intérieur. Une date se lit. Absente, on
     * retombe sur l'ancienne formulation plutôt que d'inventer une date.
     */
    dateSolde?: string;
    // Bloc « Comment se deroule la seance » (cf. lib/stage-deroule). Chaine
    // vide tant que le reglage n'est pas saisi : rien ne s'affiche alors.
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
        ? etat("Paiement confirmé", `${euros((vars.montantRegle ?? vars.totalTTC))} réglés`, C.vert)
        : vars.acompteRegle && vars.acompte
          ? etat("Acompte reçu", `${euros(vars.acompte)}`, C.vert)
          : ""}
      ${titre(vars.paiementConfirme
        ? "Inscription validée et payée"
        : acompteDu ? "Il reste une étape" : "Inscription confirmée")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(acompteDu
        ? `Nous avons enregistré l'inscription au stage <strong style="color:${C.encre};">${vars.stageTitle}</strong>. La place est retenue ; elle sera définitivement acquise dès réception de l'acompte.`
        : `L'inscription au stage <strong style="color:${C.encre};">${vars.stageTitle}</strong> est ${vars.paiementConfirme ? "validée et payée" : "confirmée"}.`)}
      ${panneau(vars.dates, `
        ${vars.enfants.map(e => ligne(
          e.name + (e.remise > 0 ? ` <span style="color:${C.gris};font-size:12px;">(remise ${e.remise} €)</span>` : ""),
          `${euros(e.prix)}`,
        )).join("")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;border-top:1px solid ${C.bord};">
          <tr>
            <td style="padding:9px 0 0;font-family:${POLICE_TEXTE};font-size:13px;font-weight:700;color:${C.encre};">Total</td>
            <td align="right" style="padding:9px 0 0;font-family:${POLICE};font-size:19px;color:${C.encre};">${euros(vars.totalTTC)}</td>
          </tr>
        </table>
      `)}
      ${vars.derouleHtml || ""}
      ${acompteDu ? panneau("Ce qu'il reste à faire", `
        ${ligne("Acompte aujourd'hui", `${euros(vars.acompte!)}`)}
        ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", `${euros(vars.solde!)}`)}
        ${p(vars.lienSepare
          ? "Vous recevez le lien de paiement de l'acompte dans un message séparé. Le solde vous sera réclamé automatiquement une semaine avant le stage."
          : "L'acompte se règle depuis votre espace client. Le solde vous sera réclamé automatiquement une semaine avant le stage.", 12)}
      `) : ""}
      ${vars.acompteRegle && vars.solde && vars.solde > 0 ? panneau("Reste à venir", `
        ${ligne(vars.dateSolde ? `Solde avant le ${vars.dateSolde}` : "Solde, 7 jours avant le stage", `${euros(vars.solde)}`)}
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
    /** true = deja encaisse. Sinon le montant reste du : l'email doit le dire. */
    regle?: boolean;
  }) => ({
    subject: `Réservation confirmée — ${vars.coursTitle}`,
    html: wrap(`
      ${titre("Réservation confirmée")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`La réservation de <strong>${vars.childName}</strong> est confirmée.`)}
      ${panneau(vars.coursTitle, `
        ${ligne("Date", vars.date)}
        ${ligne("Horaire", vars.horaire)}
        ${ligne(vars.regle ? "Réglé" : "Montant", `${euros(vars.prix)}`)}
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
        ${ligne("Total", `${euros(vars.totalTTC)}`)}
      `)}
      ${button("Voir mon espace", `${SITE_URL}/espace-cavalier`)}
      ${signature()}
    `, `${vars.forfaitLabel} · ${vars.nbSeances} séances`),
  }),

  // ═══ PAIEMENTS ═══

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
      ${panneau("", `<div style="text-align:center;">${montant(vars.montant)}</div>`)}
      ${button("Payer en ligne", vars.lienPaiement)}
      ${p(`<span style="color:${C.discret};">Paiement sécurisé par CAWL — Crédit Agricole.</span>`, 11)}
    `, `${vars.label} — ${euros(vars.montant)}`),
  }),

  confirmationPaiement: (vars: {
    parentName: string;
    montant: number;
    mode: string;
    prestations: string;
    // Fidélité : renseignée seulement si des points ont réellement été
    // crédités. Absente, le bloc ne s'affiche pas — le programme peut être
    // désactivé, et un email ne doit pas promettre ce qui n'existe pas.
    pointsGagnes?: number;
    pointsTotal?: number;
    tauxFidelite?: number;      // points pour 1 € de réduction (défaut 100)
    minPointsFidelite?: number; // seuil d'utilisation (défaut 500)
  }) => ({
    subject: `Paiement reçu — ${eurosTexte(vars.montant)}`,
    html: wrap(`
      ${etat("Paiement reçu", `${euros(vars.montant)}`, C.vert)}
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

  // ═══ RAPPELS ═══

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
    // Meme bloc que la confirmation : le rappel est souvent le seul mail
    // relu la veille, il doit porter la meme information.
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
      ${panneau("", `
        <div style="text-align:center;">${montant(vars.montant, C.rouge)}</div>
        ${p(`<span style="color:${C.gris};text-align:center;display:block;">${vars.prestations}</span>`, 13)}
      `)}
      ${button("Régler en ligne", `${SITE_URL}/espace-cavalier/factures`)}
      ${p("Merci de régulariser à votre convenance. Si ce règlement a déjà été fait, ce message est sans objet.", 13)}
      ${signature("Avec nos remerciements.")}
    `, `${euros(vars.montant)} — ${vars.prestations}`),
  }),

  // ═══ ADMINISTRATIF ═══

  bienvenueNouvelleFamille: (vars: {
    parentName: string;
  }) => ({
    subject: `Bienvenue au ${CLUB_NAME}`,
    html: wrap(`
      ${titre("Bienvenue au club")}
      ${p(`Bonjour <strong>${vars.parentName}</strong>,`)}
      ${p(`Votre espace personnel est prêt. Vous pouvez dès maintenant :`)}
      ${panneau("", `
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
