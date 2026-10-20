/**
 * src/lib/email-dicte-ia.ts — email de la fiche client, dicté puis mis en
 * forme par l'IA.
 *
 * Octobre 2026, demande de Nicolas : depuis la fiche client, dicter le mail
 * au lieu de le taper, et le faire relire par l'IA si besoin. La dictée
 * passe par /api/whisper (comme les notes du montoir) ; ce module écrit la
 * consigne donnée à l'IA et lit sa réponse.
 *
 * L'IA met en forme ce qui a été dit, elle n'invente rien : aucun montant,
 * aucune date, aucune promesse qui ne soit dans la dictée. Ce qu'elle juge
 * douteux (montant à vérifier, information manquante) revient dans
 * `remarques`, affichées à côté du message, jamais dedans.
 *
 * Module pur, testé seul (tests/unit/email-dicte-ia.test.ts).
 */

import { CLUB_DEFAUTS } from "@/lib/club-info-defauts";

export interface ContexteEmailFamille {
  /** Nom de la famille tel qu'il est sur la fiche. */
  nomFamille: string;
  /** Reste dû sur les commandes en cours, pour que l'IA ne contredise pas la fiche. */
  resteDu?: number;
  /** Prestations en cours de la famille, en une ligne. */
  prestations?: string;
}

export interface EmailMisEnForme {
  objet: string;
  message: string;
  remarques: string[];
}

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

/** Consigne envoyée à l'IA (route /api/ia, rédaction libre). */
export function consigneMiseEnFormeEmail(brouillon: string, objet: string, ctx: ContexteEmailFamille): string {
  const situation = [
    `Famille destinataire : ${ctx.nomFamille || "(nom inconnu)"}.`,
    typeof ctx.resteDu === "number"
      ? (ctx.resteDu > 0.009 ? `Reste dû sur la fiche : ${euros(ctx.resteDu)}.` : "Aucun impayé sur la fiche.")
      : "",
    ctx.prestations ? `Prestations en cours : ${ctx.prestations}.` : "",
  ].filter(Boolean).join("\n");

  return `Tu aides le gérant du ${CLUB_DEFAUTS.nom} à écrire un email à une famille cliente.
Il a dicté (ou tapé) le brouillon ci-dessous ; la dictée peut contenir des hésitations, des répétitions ou des mots mal reconnus.

Ta tâche : en faire un email clair, poli et chaleureux, en français, au vouvoiement.

Règles impératives :
- Garder TOUT le fond du brouillon, et rien de plus : n'invente aucun montant, aucune date, aucun horaire, aucune promesse, aucun geste commercial qui n'y soit pas.
- Corriger les mots visiblement mal reconnus par la dictée quand le sens est évident ; sinon laisse le mot et signale-le dans "remarques".
- Texte brut : pas de Markdown, pas d'astérisques, pas de HTML. Paragraphes séparés par une ligne vide.
- Commencer par « Bonjour, » (ou « Bonjour Madame, Monsieur, » si rien ne précise), finir par « Cordialement, » puis « L'équipe du ${CLUB_DEFAUTS.nom} ».
- Rester bref : la longueur du brouillon, pas davantage.
- "remarques" : ce que le gérant doit vérifier avant d'envoyer (montant qui ne colle pas avec la fiche, information manquante, mot incompris, ton qui pourrait mal passer). Liste vide si rien à signaler.
- "objet" : reprendre l'objet donné s'il y en a un, sinon en proposer un court.

Situation connue de l'application (pour vérifier, pas pour compléter le mail) :
${situation}

Objet saisi : ${objet.trim() || "(aucun)"}

Brouillon :
"""
${brouillon.trim()}
"""

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"objet": "...", "message": "...", "remarques": ["..."]}`;
}

/** Lit la réponse de l'IA ; null si elle n'est pas exploitable. */
export function lireMiseEnForme(texte: string): EmailMisEnForme | null {
  const brut = String(texte || "");
  const debut = brut.indexOf("{");
  const fin = brut.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  try {
    const j = JSON.parse(brut.slice(debut, fin + 1));
    const message = typeof j.message === "string" ? j.message.trim() : "";
    if (!message) return null;
    return {
      objet: typeof j.objet === "string" ? j.objet.trim() : "",
      message,
      remarques: Array.isArray(j.remarques) ? j.remarques.filter((r: unknown) => typeof r === "string" && r.trim()).map((r: string) => r.trim()) : [],
    };
  } catch {
    return null;
  }
}

/** Ajoute une dictée au texte déjà saisi (à la ligne s'il y en a déjà). */
export function ajouterDictee(avant: string, dictee: string): string {
  const a = avant.replace(/\s+$/, "");
  const d = dictee.trim();
  if (!d) return avant;
  return a ? `${a}\n${d}` : d;
}
