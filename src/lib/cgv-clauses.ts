/**
 * src/lib/cgv-clauses.ts
 *
 * Clauses d'annulation, ecrites UNE SEULE FOIS.
 *
 * Elles etaient auparavant recopiees a trois endroits — page CGV, ecran de
 * reservation, email de confirmation — avec des formulations divergentes.
 * Sur un texte contractuel, cet ecart se retourne contre le club en cas de
 * litige : la famille peut se prevaloir de la version qui l'arrange.
 *
 * Toute modification faite ici s'applique donc partout.
 *
 * ⚠️ Texte a portee contractuelle : ne pas reformuler sans validation.
 *
 * Redaction : trois cas ENUMERES plutot qu'un paragraphe a exceptions
 * imbriquees. Les versions precedentes disaient « au-dela de 3 semaines
 * avant le stage », qui se lit dans les deux sens (plus tot ? plus tard ?),
 * et n'annoncaient jamais le remboursement integral — une famille n'y
 * lisait que des restrictions.
 */

/** Delai au-dela duquel un stage n'est plus remboursable. */
export const STAGE_DELAI_ANNULATION = "3 semaines";

/**
 * Montant de l'acompte stage, PAR ENFANT.
 *
 * ⚠️ SOURCE UNIQUE. Ce montant etait ecrit en dur a six endroits (CGV,
 * repartition d'annulation, validation serveur, inscription admin,
 * reservation famille, boite IA) : en changer un sans les autres faisait
 * soit encaisser un mauvais montant, soit annoncer des CGV fausses.
 * Tous consomment desormais cette constante.
 */
export const STAGE_ACOMPTE_EUROS = 30;

/** Fin de validite des avoirs. */
export const AVOIR_FIN_VALIDITE = "30 juin";

/**
 * Nature exacte du justificatif accepte. « Certificat medical » tout court
 * etait trop large : un arret de travail ou un certificat pour une autre
 * activite ne vaut pas contre-indication a l'equitation.
 */
export const CERTIFICAT_MEDICAL =
  "certificat médical de contre-indication à la pratique de l'équitation";

export interface CasAnnulation {
  quand: string;
  consequence: string;
}

/**
 * Les trois situations possibles, dans l'ordre chronologique.
 * On commence par le cas favorable : c'est le plus frequent, et le taire
 * donnait l'impression qu'aucun remboursement n'existait.
 */
export const CGV_STAGES_CAS: CasAnnulation[] = [
  {
    quand: `Plus de ${STAGE_DELAI_ANNULATION} avant le début du stage`,
    consequence:
      `Remboursement intégral, acompte compris (hors frais bancaires).`,
  },
  {
    quand: `Moins de ${STAGE_DELAI_ANNULATION} avant le début du stage`,
    consequence: `Aucun remboursement.`,
  },
  {
    // « Certificat medical » seul etait trop large : c'est bien une
    // contre-indication a l'equitation qui est exigee, pas un arret de
    // travail ou un certificat pour une autre activite.
    quand: `Moins de ${STAGE_DELAI_ANNULATION} avant, sur présentation d'un ${CERTIFICAT_MEDICAL}, ` +
      `ou en cas de force majeure`,
    consequence:
      `L'acompte de ${STAGE_ACOMPTE_EUROS} € par stage est converti en avoir, valable sur toute ` +
      `prestation du centre jusqu'au ${AVOIR_FIN_VALIDITE}. Le reste des sommes versées est remboursé.`,
  },
];

/** Version phrase (page CGV, email) — reprend les trois cas a la suite. */
export const CGV_STAGES_LONG = CGV_STAGES_CAS
  .map((c) => `${c.quand} : ${c.consequence}`)
  .join(" ");

/** Bloc HTML en liste, plus lisible qu'un paragraphe dans un email. */
export const CGV_STAGES_HTML = `
  <ul style="margin:8px 0 0;padding-left:18px;color:#555;font-size:13px;line-height:1.6;">
    ${CGV_STAGES_CAS.map((c) => `<li><strong>${c.quand}</strong> : ${c.consequence}</li>`).join("")}
  </ul>`;

/**
 * Version courte (case a cocher avant paiement).
 * Enonce d'abord ce a quoi la famille a droit, puis la limite.
 */
export const CGV_STAGES_COURT =
  `remboursement intégral si j'annule plus de ${STAGE_DELAI_ANNULATION} avant le début du stage ; ` +
  `passé ce délai, aucun remboursement. Sur présentation d'un ${CERTIFICAT_MEDICAL} ` +
  `(ou en cas de force majeure), l'acompte de ${STAGE_ACOMPTE_EUROS} € par stage est converti ` +
  `en avoir valable jusqu'au ${AVOIR_FIN_VALIDITE} et le reste est remboursé.`;

export const CGV_COURS_ANNUELS =
  `Toute séance non effectuée sans prévenir 24h à l'avance est due. ` +
  `En cas de maladie du cavalier (${CERTIFICAT_MEDICAL}), un report peut être accordé.`;

/** Délai d'annulation des promenades, en constante : une modification met
 *  à jour la page CGV et tout affichage qui consomme la clause. */
export const BALADE_DELAI_ANNULATION = "72h";

export const CGV_BALADES =
  `Annulation jusqu'à ${BALADE_DELAI_ANNULATION} avant : remboursement intégral. ` +
  `En deçà, aucun remboursement, sauf ${CERTIFICAT_MEDICAL} — ` +
  `les sommes versées sont alors intégralement remboursées.`;

/**
 * Balades collectives sous le minimum de participants.
 * Le seuil et le montant du supplément sont propres à chaque balade et
 * annoncés au moment de la réservation — la clause reste donc générique.
 */
export const BALADE_DELAI_PETIT_GROUPE = "2 jours";

export const CGV_BALADES_PETIT_GROUPE =
  `Certaines balades collectives requièrent un nombre minimum de participants, indiqué au moment ` +
  `de la réservation. Si ce minimum n'est pas atteint ${BALADE_DELAI_PETIT_GROUPE} avant le départ, ` +
  `le centre propose à chaque inscrit, au choix : le maintien de la balade en petit comité moyennant ` +
  `un supplément par cavalier (montant annoncé à la réservation), le report à une autre date, ` +
  `ou l'annulation avec remise d'un avoir du montant payé. Si le minimum est atteint entre-temps, ` +
  `la balade est maintenue sans supplément.`;

/**
 * Encadre de rappel des conditions d'annulation, a coller sous un email de
 * confirmation de stage.
 *
 * Ecrit ici plutot que dans chaque route d'envoi : le bloc etait recopie a la
 * main dans le retour de paiement CAWL, et absent des deux autres chemins de
 * confirmation (webhook, acompte encaisse au comptoir). Une famille recevait
 * donc le rappel ou non selon la facon dont son paiement s'etait termine.
 *
 * Volontairement hors du gabarit modifiable depuis l'admin : la clause doit
 * survivre a une reedition du gabarit. Ce n'est PAS ce qui rend la clause
 * opposable — l'acceptation a la commande le fait — mais ca evite la mauvaise
 * surprise et desamorce les litiges.
 */
export function encadreConditionsStage(): string {
  return `<div style="max-width:520px;margin:16px auto 0;padding:14px 16px;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;font-family:sans-serif;">
     <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#9a3412;">Conditions d'annulation</p>
     <div style="font-size:12px;line-height:1.6;color:#7c2d12;">
       ${CGV_STAGES_HTML}
     </div>
   </div>`;
}

export const CGV_ANNULATION_CENTRE =
  `En cas d'annulation par le centre (météo, force majeure) : report proposé ou remboursement intégral.`;

/** Même encadré que pour les stages, avec les clauses balades. */
export function encadreConditionsBalade(): string {
  return `<div style="max-width:520px;margin:16px auto 0;padding:14px 16px;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;font-family:sans-serif;">
     <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#9a3412;">Conditions d'annulation</p>
     <div style="font-size:12px;line-height:1.6;color:#7c2d12;">
       <p style="margin:0 0 6px;">${CGV_BALADES}</p>
       <p style="margin:0 0 6px;">${CGV_BALADES_PETIT_GROUPE}</p>
       <p style="margin:0;">${CGV_ANNULATION_CENTRE}</p>
     </div>
   </div>`;
}

/** Encadré générique (cours, anniversaires…) : clause utile + renvoi aux CGV. */
export function encadreConditionsGenerique(clause?: string): string {
  return `<div style="max-width:520px;margin:16px auto 0;padding:14px 16px;border:1px solid #fed7aa;background:#fff7ed;border-radius:10px;font-family:sans-serif;">
     <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#9a3412;">Conditions d'annulation</p>
     <div style="font-size:12px;line-height:1.6;color:#7c2d12;">
       ${clause ? `<p style="margin:0 0 6px;">${clause}</p>` : ""}
       <p style="margin:0;">${CGV_ANNULATION_CENTRE} Conditions complètes sur la page CGV du site.</p>
     </div>
   </div>`;
}

/**
 * L'encadré qui convient au TYPE d'activité — pour les emails transactionnels
 * (confirmation de liste d'attente, place libérée…). Un email sans aucune
 * condition d'annulation laisse la famille dans le flou ; un email avec les
 * clauses d'une autre activité serait pire. Source unique, comme le reste.
 */
export function encadreConditionsPourType(activityType?: string): string {
  if (activityType === "stage" || activityType === "stage_journee") return encadreConditionsStage();
  if (activityType === "balade") return encadreConditionsBalade();
  if (activityType === "cours") return encadreConditionsGenerique(CGV_COURS_ANNUELS);
  return encadreConditionsGenerique();
}
