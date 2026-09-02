/**
 * src/lib/email-prestations.ts — libellés des prestations dans les emails
 * de confirmation de paiement.
 *
 * ⚠️ Pourquoi ce module existe — audit du 29/08/2026.
 *
 * Les emails de confirmation partent de DEUX endroits : le retour navigateur
 * (`/api/cawl/status`) et la notification serveur (`/api/cawl/webhook`). Ils
 * construisaient chacun leurs variables de gabarit, et avaient divergé :
 *
 *   • le webhook passait `mode` au gabarit `confirmationPaiement`, la route de
 *     retour NON — la famille recevait « Mode de paiement : {mode} », le
 *     marqueur brut, non substitué ;
 *   • les deux collaient `childName` derrière `activityTitle`, alors que le
 *     panier a DÉJÀ construit `activityTitle` sous la forme
 *     « Activité — Prénom » : l'email affichait « Galop de bronze — ambre — ambre ».
 *
 * Concerne les cours ponctuels ET les balades : tout ce qui n'est pas un
 * stage passe par `confirmationPaiement`.
 */

/** Une ligne de commande, telle qu'elle est stockée sur le document `payments`. */
interface LigneEmail {
  activityTitle?: string;
  childName?: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  monitor?: string | null;
  /** Stage de vacances : tous les jours de la semaine, posés à l'achat. */
  stageDates?: { date?: string | null; startTime?: string | null; endTime?: string | null }[] | null;
  /** Stage : libellé déjà composé (« du lun. 26 au ven. 30 octobre · 10h00–12h00 »). Dernier recours. */
  stageSchedule?: string | null;
  /** Cours à l'année : le créneau récurrent (« mercredi · 14h00–15h00 »), la ligne n'ayant pas de date. */
  creneauLabel?: string | null;
}

/**
 * Libellé lisible du mode de règlement, pour le gabarit.
 *
 * Ne jamais renvoyer la valeur brute (`cb_online`) : elle apparaît telle
 * quelle dans l'email reçu par la famille.
 */
export function libelleModePaiement(mode?: string | null): string {
  switch (mode) {
    case "cb_online": return "Carte bancaire en ligne";
    case "cb": return "Carte bancaire";
    case "cb_terminal": return "Carte bancaire au club";
    case "cheque": return "Chèque";
    case "cheque_differe": return "Chèque différé";
    case "especes": return "Espèces";
    case "virement": return "Virement";
    case "sepa": return "Prélèvement SEPA";
    case "avoir": return "Avoir";
    case "ancv":
    case "cheque_vacances": return "Chèques vacances ANCV";
    case "pass_sport": return "Pass'Sport";
    default: return "Carte bancaire en ligne";
  }
}

/**
 * Titre d'une prestation SANS répétition du prénom.
 *
 * Le panier compose `activityTitle` en y intégrant déjà l'enfant
 * (« Découverte / Galop de bronze — ambre »). Les commandes saisies par
 * l'administration, elles, portent un titre nu. On ne rajoute donc le prénom
 * que s'il n'y est pas déjà.
 */
export function titrePrestation(ligne: LigneEmail): string {
  const titre = String(ligne.activityTitle || "").trim();
  const enfant = String(ligne.childName || "").trim();
  if (!enfant) return titre || "Prestation";
  if (!titre) return enfant;
  // Comparaison insensible à la casse et aux accents : « Ambre » et « ambre »
  // sont le même enfant, et le panier n'harmonise pas la casse.
  const normaliser = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return normaliser(titre).includes(normaliser(enfant)) ? titre : `${titre} — ${enfant}`;
}

/**
 * Titre d'une prestation DÉBARRASSÉ du prénom que le panier y a collé.
 *
 * Utile là où l'enfant est déjà affiché ailleurs — le gabarit de stage liste
 * les prénoms sur leur propre ligne, et « Stage Poney — ambre » en titre fait
 * doublon.
 */
export function titreSansEnfant(ligne?: LigneEmail | null): string {
  const titre = String(ligne?.activityTitle || "").trim();
  const enfant = String(ligne?.childName || "").trim();
  if (!titre || !enfant) return titre;
  // On ne retire QUE le suffixe « — Prénom » en fin de titre : une activité
  // qui contiendrait le prénom en son milieu n'est pas tronquée.
  const suffixe = new RegExp(`\\s*[—–-]\\s*${enfant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  return titre.replace(suffixe, "").trim() || titre;
}

/** Liste courte, pour la ligne « Prestations » d'un récapitulatif. */
export function prestationsCourtes(items: LigneEmail[]): string {
  const libelles = items.map((i) => titrePrestation(i)).filter(Boolean);
  return libelles.join(", ") || "Prestation";
}

/** « 10h00–12h00 », ou « 10h00 » seul si la fin n'est pas connue. Vide sans heure de début. */
function plageHoraire(startTime?: string | null, endTime?: string | null): string {
  if (!startTime) return "";
  return endTime ? `${startTime}–${endTime}` : startTime;
}

/**
 * Horaires d'un stage, lisibles dans un email.
 *
 * Trois envois de confirmation de stage remplissaient la ligne « Horaires »
 * chacun à leur façon : l'un lisait `startTime`/`endTime` de la ligne (vides
 * sur une commande saisie par l'administration, qui ne porte que
 * `stageSchedule`), les deux autres recopiaient `stageSchedule`, qui répète
 * les dates déjà annoncées juste au-dessus. Une famille inscrite au bureau et
 * réglant par le lien de paiement recevait « Horaires : » sans rien derrière.
 *
 * On lit d'abord les journées (`stageDates`) : « 10h00–12h00 » quand tous
 * les jours ont les mêmes heures, « lun. 26 : 10h00–12h00, mar. 27 :
 * 14h00–16h00 » sinon. À défaut, les heures de la ligne, puis
 * `stageSchedule` tel quel.
 */
export function horairesStage(items: LigneEmail[]): string {
  const jours: { date: string; plage: string }[] = [];
  const vu = new Set<string>();
  for (const i of items) {
    const liste = Array.isArray(i.stageDates) && i.stageDates.length
      ? i.stageDates
      : [{ date: i.date, startTime: i.startTime, endTime: i.endTime }];
    for (const j of liste) {
      const plage = plageHoraire(j?.startTime, j?.endTime);
      if (!plage) continue;
      const cle = `${j?.date || ""}|${plage}`;
      if (vu.has(cle)) continue;
      vu.add(cle);
      jours.push({ date: j?.date || "", plage });
    }
  }

  const plages = Array.from(new Set(jours.map((j) => j.plage)));
  if (plages.length === 1) return plages[0];
  if (plages.length > 1) {
    return jours
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((j) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date)) return j.plage;
        const d = new Date(`${j.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
        return `${d} : ${j.plage}`;
      })
      .join(", ");
  }

  return items.map((i) => String(i.stageSchedule || "").trim()).find(Boolean) || "";
}

/**
 * Bloc HTML détaillé : une ligne par prestation, avec date, horaires et
 * moniteur en dessous.
 *
 * Un stage annonce toute sa période (« du lundi 26 au vendredi 30 octobre
 * (5 jours) »), pas seulement son premier jour ; un cours à l'année, son
 * créneau récurrent ; une heure de début sans heure de fin reste affichée.
 */
export function lignesDetailHtml(items: LigneEmail[]): string {
  return items
    .map((i) => {
      const infos: string[] = [];
      const plusieursJours = Array.isArray(i.stageDates) && i.stageDates.length > 1;
      if (plusieursJours) {
        const periode = datesStage([i]);
        if (periode) infos.push(periode);
        const horaires = horairesStage([i]);
        if (horaires) infos.push(horaires);
      } else {
        if (i.date) {
          // Midi plutôt que minuit : « 2026-10-23 » seul est lu comme minuit
          // UTC, et une messagerie rendue depuis un fuseau en retard affichait
          // la veille. Même précaution que `datesStage` plus bas.
          const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(i.date) ? `${i.date}T12:00:00` : i.date);
          if (!Number.isNaN(d.getTime())) {
            infos.push(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
          }
        }
        const plage = plageHoraire(i.startTime, i.endTime);
        if (plage) infos.push(plage);
      }
      if (i.creneauLabel) infos.push(String(i.creneauLabel));
      if (i.monitor) infos.push(`avec ${i.monitor}`);
      const detail = infos.length
        ? `<br/><span style="color:#888;font-size:12px;">${infos.join(" · ")}</span>`
        : "";
      return `${titrePrestation(i)}${detail}`;
    })
    .join("<br/><br/>");
}

/**
 * Dates d'un stage, lisibles dans un email.
 *
 * Un stage de vacances court sur toute une semaine, et la commande le sait :
 * chaque ligne porte `stageDates`, la liste de ses journées. Les trois envois
 * de confirmation l'ignoraient pourtant, chacun à sa manière — l'un joignait
 * les `date` des lignes (une seule par ligne), les deux autres reprenaient le
 * champ `stageDate`, qui ne contient que le premier jour.
 *
 * La famille lisait donc « lun. 26 octobre » pour une semaine entière, sans
 * rien qui l'indique. Confirmer 30 € d'acompte sur ce qui ressemble à une
 * séance de deux heures invite à croire qu'on s'est trompé de montant.
 *
 * Rendu : « du lundi 26 au vendredi 30 octobre (5 jours) », ou la seule date
 * quand il n'y en a qu'une.
 */
export function datesStage(
  items: LigneEmail[],
  repli?: string | null,
): string {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", opts);

  // Une plage par LIGNE, jamais une plage globale. Deux enfants inscrits à
  // deux stages différents tiennent dans une seule commande : réduire
  // l'ensemble à son premier et son dernier jour aurait annoncé « du lundi
  // 26 octobre au vendredi 20 février (10 jours) » — une période que
  // personne n'a achetée.
  const plages: string[] = [];
  for (const i of items) {
    const jours = Array.from(new Set(
      Array.isArray(i.stageDates) && i.stageDates.length
        ? i.stageDates.map(d => d?.date).filter((d): d is string => !!d)
        : i.date ? [i.date] : [],
    )).sort();
    if (jours.length === 0) continue;

    if (jours.length === 1) {
      plages.push(fmt(jours[0], { weekday: "long", day: "numeric", month: "long" }));
      continue;
    }
    const debut = new Date(`${jours[0]}T12:00:00`);
    const fin = new Date(`${jours[jours.length - 1]}T12:00:00`);
    const memeMois = debut.getMonth() === fin.getMonth() && debut.getFullYear() === fin.getFullYear();
    const d = fmt(jours[0], memeMois ? { weekday: "long", day: "numeric" } : { weekday: "long", day: "numeric", month: "long" });
    const f = fmt(jours[jours.length - 1], { weekday: "long", day: "numeric", month: "long" });
    plages.push(`du ${d} au ${f} (${jours.length} jours)`);
  }

  // Deux enfants sur le MÊME stage donnent deux lignes identiques : une seule
  // mention suffit.
  const uniques = Array.from(new Set(plages));
  if (uniques.length === 0) return repli || "";
  return uniques.join(" · ");
}

/**
 * Date à laquelle le solde d'un stage est réclamé : sept jours avant son
 * premier jour, la règle du cron `charge-stage-balances`.
 *
 * Écrire « avant le 12 octobre » plutôt que « 7 jours avant le stage » évite
 * à la famille de compter, et donne au message le ton d'une échéance plutôt
 * que celui d'un règlement intérieur. Renvoie "" si la date est inexploitable,
 * auquel cas l'appelant garde son ancienne formulation.
 */
export function dateEcheanceSolde(premierJour?: string | null): string {
  if (!premierJour) return "";
  const d = new Date(premierJour);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - 7);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
