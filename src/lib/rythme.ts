/**
 * src/lib/rythme.ts
 *
 * Rythme d'un forfait annuel : toutes les semaines ("hebdo") ou une semaine
 * sur deux ("quinzaine", cas des gardes alternées).
 *
 * Une seule règle décide de tout : un cavalier en quinzaine n'est attendu que
 * les semaines dont le numéro ISO a la parité de son forfait. Cette règle sert
 * à la fois à l'inscription (on ne le pose que sur ces séances-là), à
 * l'affichage du planning (badge + semaines grisées) et à la feuille d'appel
 * (il ne doit jamais compter comme présent ni comme absent une semaine où il
 * n'était pas attendu).
 *
 * Le calcul se fait sur le numéro ISO 8601 — celui qu'utilise déjà
 * src/app/admin/management/types.ts — et non sur un décompte relatif à la
 * rentrée : une semaine ISO est une donnée stable, partagée par tout le monde,
 * qui reste juste même si le forfait est créé en cours d'année ou si des
 * séances sautent pendant les vacances.
 */

export type Rythme = "hebdo" | "quinzaine";

/** Ce que porte un forfait (ou une ligne d'inscrit) au sujet du rythme. */
export type PorteurDeRythme = {
  rythme?: string | null;
  semainePaire?: boolean | null;
} | null | undefined;

/**
 * Numéro de semaine ISO 8601 (1 à 53).
 *
 * On travaille à midi pour ne pas se faire décaler d'un jour par les
 * changements d'heure : une date « 2026-03-29 » interprétée à minuit peut
 * basculer la veille selon le fuseau, et faire changer la semaine.
 */
export function numeroSemaineISO(date: string | Date): number {
  const d = typeof date === "string"
    ? new Date(`${date.slice(0, 10)}T12:00:00`)
    : new Date(date);
  d.setHours(12, 0, 0, 0);
  // Le jeudi de la semaine courante détermine l'année ISO.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const premiereSemaine = new Date(d.getFullYear(), 0, 4, 12, 0, 0);
  return 1 + Math.round(
    ((d.getTime() - premiereSemaine.getTime()) / 86400000
      - 3 + ((premiereSemaine.getDay() + 6) % 7)) / 7
  );
}

/** Le forfait (ou l'inscrit) est-il au rythme d'une semaine sur deux ? */
export function estQuinzaine(porteur: PorteurDeRythme): boolean {
  return porteur?.rythme === "quinzaine";
}

/**
 * Le cavalier est-il attendu à la séance de cette date ?
 *
 * Répond `true` pour tout ce qui n'est pas une quinzaine — un forfait hebdo,
 * une carte, une séance à l'unité, un forfait ancien sans champ `rythme`.
 * C'est volontaire : en cas de doute, le cavalier est attendu. Une absence
 * affichée à tort est visible et se corrige ; un cavalier silencieusement
 * retiré du planning ne se remarque que le jour où il se présente.
 *
 * `semainePaire` par défaut à `true` : un forfait marqué quinzaine sans parité
 * enregistrée est traité comme « semaines paires », la valeur proposée par
 * défaut à l'inscription.
 */
export function estSemaineAttendue(date: string | Date, porteur: PorteurDeRythme): boolean {
  if (!estQuinzaine(porteur)) return true;
  const semainePaire = porteur?.semainePaire !== false;
  return (numeroSemaineISO(date) % 2 === 0) === semainePaire;
}

/** Étiquette courte pour le planning : « 1 sem/2 · paires ». */
export function libelleRythme(porteur: PorteurDeRythme): string {
  if (!estQuinzaine(porteur)) return "";
  return porteur?.semainePaire !== false ? "1 sem/2 · paires" : "1 sem/2 · impaires";
}

/** Phrase complète, pour les infobulles et la feuille d'appel. */
export function expliqueRythme(date: string | Date, porteur: PorteurDeRythme): string {
  if (!estQuinzaine(porteur)) return "";
  const paires = porteur?.semainePaire !== false;
  const semaine = numeroSemaineISO(date);
  const attendu = estSemaineAttendue(date, porteur);
  return attendu
    ? `Une semaine sur deux (semaines ${paires ? "paires" : "impaires"}) — attendu cette semaine (S${semaine}).`
    : `Une semaine sur deux (semaines ${paires ? "paires" : "impaires"}) — pas attendu cette semaine (S${semaine}), ce n'est pas une absence.`;
}

/**
 * Coefficient de rythme : 1 pour un hebdo, 0,5 pour une quinzaine.
 * Une quinzaine ne représente que la moitié des séances d'un hebdo, donc la
 * moitié du volume horaire hebdomadaire.
 */
export function coefficientRythme(porteur: PorteurDeRythme): number {
  return estQuinzaine(porteur) ? 0.5 : 1;
}

/**
 * Fréquence hebdomadaire ÉQUIVALENTE d'un forfait, en cours par semaine.
 *
 * C'est la seule unité dans laquelle les forfaits d'un même enfant peuvent
 * s'additionner. Un forfait « 1×/semaine, une semaine sur deux » ne vaut pas
 * 1 : il vaut 0,5, parce que le cavalier ne vient qu'une semaine sur deux.
 *
 * Sans cette conversion, deux quinzaines sur des semaines alternées (le cas
 * d'une garde alternée : samedi les semaines paires, mercredi les impaires)
 * totalisent 2 au lieu de 1, et le second forfait est facturé au différentiel
 * vers le tarif 2×/semaine alors que l'enfant ne monte qu'une fois par semaine.
 */
export function frequenceEquivalente(frequence: unknown, porteur: PorteurDeRythme): number {
  return nombreDeCours(frequence) * coefficientRythme(porteur);
}

/**
 * Nombre de cours par semaine porté par un forfait, quel que soit le format
 * enregistré en base.
 *
 * Deux écrans écrivent ce champ et ils ne s'accordent pas : le panneau
 * d'inscription du planning enregistre un nombre (`1`), la page Forfaits
 * enregistre une chaîne (`"1x"`). Un simple `Number("2x")` vaut NaN, donc 0 :
 * le forfait devient invisible pour le cumul de fréquence, et l'heure ajoutée
 * ensuite est facturée à plein tarif au lieu du différentiel. On lit donc le
 * premier nombre présent, d'où qu'il vienne.
 */
export function nombreDeCours(frequence: unknown): number {
  if (typeof frequence === "number") return Number.isFinite(frequence) ? frequence : 0;
  const trouve = String(frequence ?? "").match(/\d+(?:[.,]\d+)?/);
  return trouve ? Number(trouve[0].replace(",", ".")) : 0;
}

/**
 * Affichage d'une fréquence éventuellement fractionnaire : « 1 », « 0,5 »,
 * « 1,5 ». Évite le « 0.5×/sem » à l'anglaise dans l'interface.
 */
export function formatFrequence(f: number): string {
  const arrondi = Math.round(f * 100) / 100;
  return Number.isInteger(arrondi) ? String(arrondi) : arrondi.toString().replace(".", ",");
}

/**
 * Nombre de séances réellement dues sur une liste de dates.
 * Sert à ne pas facturer, ni décompter, les semaines où le cavalier
 * n'est pas attendu.
 */
export function seancesAttendues(dates: (string | Date)[], porteur: PorteurDeRythme): number {
  if (!estQuinzaine(porteur)) return dates.length;
  return dates.filter(d => estSemaineAttendue(d, porteur)).length;
}
