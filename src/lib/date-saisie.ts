/**
 * Saisie d'une date au clavier dans un champ `<input type="date">`.
 *
 * Le champ émet un `change` à CHAQUE frappe, y compris sur une date encore
 * incomplète. En tapant « 13/10/2026 », le navigateur envoie successivement
 * 0002-10-13, 0020-10-13, 0202-10-13, puis enfin 2026-10-13 — parce qu'il
 * décale les chiffres de l'année à mesure qu'on les tape.
 *
 * Un écran de navigation qui réagit à chacun de ces événements part donc sur
 * une année aberrante avant que la saisie soit finie : « Octobre 1902 » pour
 * une année lue à 26. Et s'il remet le champ à zéro après avoir navigué, la
 * saisie est interrompue en plein milieu et devient impossible à terminer.
 *
 * La règle : on n'accepte la date que lorsque l'année est plausible. Les
 * valeurs intermédiaires sont toujours inférieures à 2000 (l'année ne se
 * remplit que par la gauche), donc ce seuil suffit à distinguer « en cours de
 * frappe » de « saisie terminée », sans minuteur ni comparaison de longueur.
 */

/** Bornes de plausibilité d'une année saisie dans un écran de planning. */
export const ANNEE_MIN = 2000;
export const ANNEE_MAX = 2100;

/**
 * Convertit la valeur d'un champ date en `Date`, ou `null` si la saisie est
 * encore en cours (ou invalide). L'appelant ne fait rien tant qu'il reçoit
 * `null` : ni navigation, ni remise à zéro du champ.
 *
 * @param valeur valeur brute du champ, au format `AAAA-MM-JJ`
 */
export function dateSaisieComplete(valeur: string): Date | null {
  if (!valeur) return null;
  const [annee, mois, jour] = valeur.split("-").map(Number);
  if (!annee || !mois || !jour) return null;
  if (annee < ANNEE_MIN || annee > ANNEE_MAX) return null; // saisie encore en cours
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  const d = new Date(annee, mois - 1, jour);
  if (Number.isNaN(d.getTime())) return null;
  // Rejette les dates qui n'existent pas (31 février → 3 mars) : le navigateur
  // ne les propose pas, mais un collage ou un champ pré-rempli le peut.
  if (d.getFullYear() !== annee || d.getMonth() !== mois - 1 || d.getDate() !== jour) return null;
  return d;
}
