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

/**
 * Bloc HTML détaillé : une ligne par prestation, avec date, horaires et
 * moniteur en dessous.
 */
export function lignesDetailHtml(items: LigneEmail[]): string {
  return items
    .map((i) => {
      const infos: string[] = [];
      if (i.date) {
        const d = new Date(i.date);
        if (!Number.isNaN(d.getTime())) {
          infos.push(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
        }
      }
      if (i.startTime && i.endTime) infos.push(`${i.startTime}–${i.endTime}`);
      if (i.monitor) infos.push(`avec ${i.monitor}`);
      const detail = infos.length
        ? `<br/><span style="color:#888;font-size:12px;">${infos.join(" · ")}</span>`
        : "";
      return `${titrePrestation(i)}${detail}`;
    })
    .join("<br/><br/>");
}
