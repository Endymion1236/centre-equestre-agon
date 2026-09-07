/** Une requête par fichier, aucune troncature et un échec n'interrompt pas le lot. */
export async function traiterSelection<T>(fichiers: readonly T[], envoyer: (fichier: T) => Promise<string>, progression: (index: number, total: number, fichier: T) => void) {
  const resultats: string[] = [];
  for (let i = 0; i < fichiers.length; i++) {
    progression(i + 1, fichiers.length, fichiers[i]);
    try { resultats.push(await envoyer(fichiers[i])); }
    catch (e) { resultats.push(e instanceof Error ? e.message : "Échec d’envoi"); }
  }
  return resultats;
}
