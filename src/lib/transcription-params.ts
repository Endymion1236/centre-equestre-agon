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

/**
 * Extension de fichier pour un type audio. Le service de transcription
 * reconnaît le format au NOM du fichier : un enregistrement d'iPhone
 * (audio/mp4) envoyé sous le nom « note.webm » était refusé.
 */
export function extensionAudio(mime: string | undefined | null): string {
  const t = String(mime || "").toLowerCase();
  if (t.includes("webm")) return "webm";
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "m4a";
  if (t.includes("ogg") || t.includes("opus")) return "ogg";
  if (t.includes("wav")) return "wav";
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  return "webm";
}

/**
 * L'erreur du service de transcription, dite en clair au gérant : « Erreur
 * transcription : 429 You exceeded your current quota » ne dit pas quoi faire.
 */
export function messageErreurTranscription(err: { status?: number; code?: string; message?: string } | null | undefined): string {
  const status = Number(err?.status) || 0;
  const brut = String(err?.message || "");
  const texte = `${err?.code || ""} ${brut}`.toLowerCase();
  if (status === 401 || /invalid api key|incorrect api key/.test(texte)) {
    return "Clé OpenAI refusée : vérifiez OPENAI_API_KEY dans les réglages Vercel.";
  }
  if (/insufficient_quota|exceeded your current quota|billing/.test(texte)) {
    return "Crédit OpenAI épuisé : rechargez le compte sur platform.openai.com (Settings → Billing), puis réessayez.";
  }
  if (status === 429) return "Trop de dictées d'un coup : réessayez dans une minute.";
  if (/too short|minimum|audio_too_short/.test(texte)) return "Enregistrement trop court : parlez au moins une seconde avant d'arrêter.";
  if (/invalid file format|unsupported|could not be decoded|decode|format/.test(texte)) {
    return "Format audio non reconnu par le service de transcription. Réessayez ; si cela persiste, notez le téléphone et le navigateur utilisés.";
  }
  return brut ? `Transcription impossible : ${brut}` : "Transcription impossible (erreur inconnue).";
}
