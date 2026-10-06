/**
 * src/lib/destinataires-email.ts — adresses de destinataires nettoyées avant
 * l'envoi par Resend.
 *
 * Octobre 2026 : un devis à « Catherine.maulme@ac-normandie.fr » était refusé
 * par Resend (« Invalid `to` field ») alors que l'adresse paraissait juste à
 * l'écran. Une adresse copiée-collée depuis un mail ou un PDF emporte souvent
 * un caractère invisible (espace insécable, espace de largeur nulle, retour à
 * la ligne), parfois « mailto: » ou un point final ; une fiche peut aussi en
 * porter deux séparées par « ; ». Resend refuse tout le message.
 *
 * Module pur, testé seul (tests/unit/destinataires-email.test.ts).
 */

// Espaces insécables, espaces de largeur nulle, BOM, marques de direction.
const INVISIBLES = new RegExp("[\\u00a0\\u1680\\u2000-\\u200f\\u2028\\u2029\\u202f\\u205f\\u2060\\u3000\\ufeff]", "g");
const FORME_EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

/** Une adresse, débarrassée de ce qui l'entoure ; "" si ce n'en est pas une. */
export function nettoyerAdresse(brut: unknown): string {
  let s = String(brut ?? "").replace(INVISIBLES, " ").trim();
  const chevrons = /<([^<>]+)>/.exec(s); // « Catherine Maulme <c.maulme@…> »
  if (chevrons) s = chevrons[1];
  s = s.replace(/^mailto:/i, "").replace(/^["'(\[]+|["')\].,;:]+$/g, "").trim();
  return FORME_EMAIL.test(s) ? s : "";
}

/**
 * Destinataires d'un envoi : chaîne ou liste, adresses séparées par virgule,
 * point-virgule ou retour à la ligne. Doublons retirés (sans tenir compte des
 * majuscules), adresses invalides écartées.
 */
export function nettoyerDestinataires(to: unknown): string[] {
  const brutes = (Array.isArray(to) ? to : [to]).flatMap((t) => String(t ?? "").split(/[,;\n\r]+/));
  const vues = new Set<string>();
  const sortie: string[] = [];
  for (const b of brutes) {
    // Une adresse « Nom <x@y> » contient des espaces : on ne coupe sur les
    // espaces que hors chevrons.
    const morceaux = /<[^<>]+>/.test(b) ? [b] : b.replace(INVISIBLES, " ").trim().split(/\s+/);
    for (const m of morceaux) {
      const a = nettoyerAdresse(m);
      if (a && !vues.has(a.toLowerCase())) { vues.add(a.toLowerCase()); sortie.push(a); }
    }
  }
  return sortie;
}
