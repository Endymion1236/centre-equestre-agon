/** Livraison par blocs : évite une réponse HTTP tamponnée pour les gros PDF/ZIP.
 * Le fichier complet est validé et généré avant de commencer le téléchargement. */
export function fluxExportComptable(contenu: Uint8Array): ReadableStream<Uint8Array> {
  let position = 0;
  return new ReadableStream({
    pull(controller) {
      if (position >= contenu.byteLength) { controller.close(); return; }
      const fin = Math.min(position + 64 * 1024, contenu.byteLength);
      controller.enqueue(contenu.subarray(position, fin)); position = fin;
    },
  });
}
