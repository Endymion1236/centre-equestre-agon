/**
 * src/lib/transcription-params.ts
 *
 * Parametres de transcription adaptes a la generation du modele.
 *
 * Les modeles recents (gpt-transcribe, gpt-live-transcribe) ont change le
 * contrat : `languages` (liste) remplace `language` (singulier), et les
 * termes litteraux passent dans `keywords`, distinct du `prompt` reserve au
 * contexte libre.
 *
 * Sans cette adaptation, basculer WHISPER_MODEL sur gpt-transcribe aurait pu
 * echouer sur le parametre `language`… et le repli silencieux vers whisper-1
 * aurait masque l'echec : on aurait cru tester le nouveau modele en
 * utilisant l'ancien. Les journaux n'auraient montre qu'un warning discret.
 */

/** Le modele appartient-il a la nouvelle generation (contrat languages/keywords) ? */
export function estNouvelleGeneration(model: string): boolean {
  return /^gpt-(live-)?transcribe/.test(model);
}

export interface ContexteTranscription {
  /** Contexte libre : sujet, cadre de l'enregistrement. PAS de liste de mots. */
  contexte: string;
  /** Termes litteraux susceptibles d'apparaitre : noms propres, jargon. */
  motsCles: string[];
}

/**
 * Construit les parametres a passer a openai.audio.transcriptions.create
 * pour le modele donne, a fusionner avec { file, model }.
 */
export function paramsTranscription(model: string, ctx: ContexteTranscription): Record<string, unknown> {
  if (estNouvelleGeneration(model)) {
    return {
      languages: ["fr"],
      prompt: ctx.contexte,
      keywords: ctx.motsCles,
    };
  }
  // Anciens modeles (whisper-1, gpt-4o-transcribe) : un seul champ language,
  // et le vocabulaire se glisse dans le prompt faute de champ dedie.
  return {
    language: "fr",
    prompt: ctx.motsCles.length > 0 ? `${ctx.contexte} Vocabulaire : ${ctx.motsCles.join(", ")}.` : ctx.contexte,
  };
}
