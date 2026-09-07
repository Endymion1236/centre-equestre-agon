/** Accepte l'habillage Markdown, jamais une réparation d'un JSON tronqué. */
export function lireJsonPageReleve(texte: string, stopReason: string | null): Record<string, unknown> {
  if (stopReason !== "end_turn") throw new Error(stopReason === "max_tokens"
    ? "Réponse trop longue pour cette page : lecture interrompue. Aucune opération validée."
    : "Lecture interrompue par le service d’analyse. Aucune opération validée.");
  const propre = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let data: unknown;
  try { data = JSON.parse(propre); }
  catch { throw new Error("Réponse JSON invalide ou incomplète pour cette page. Aucune opération validée ; relancez la page."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Format de réponse inattendu pour cette page. Aucune opération validée.");
  const objet = data as Record<string, unknown>;
  if (objet.erreur) throw new Error(String(objet.erreur).slice(0, 300));
  if (!Array.isArray(objet.operations)) throw new Error("Liste des opérations absente de la réponse. Aucune opération validée ; relancez la page.");
  return objet;
}
