import { PDFDocument } from "pdf-lib";

/** Copie les pages sans modifier leur contenu ; le PDF complet reste dans le navigateur. */
export async function preparerRelevePdf(bytes: Uint8Array) {
  if (bytes.length > 20_000_000) throw new Error("Relevé trop lourd : 20 Mo maximum. Séparez les comptes en plusieurs PDF.");
  const doc = await PDFDocument.load(bytes);
  const nombrePages = doc.getPageCount();
  if (!nombrePages || nombrePages > 150) throw new Error("Le relevé doit contenir entre 1 et 150 pages.");
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  const empreinte = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  async function extraire(indices: number[]) {
    const extrait = await PDFDocument.create();
    for (const page of await extrait.copyPages(doc, indices)) extrait.addPage(page);
    const base64 = await extrait.saveAsBase64();
    if (base64.length > 4_000_000) throw new Error("Cette page est trop lourde. Compressez le PDF avant de la relancer.");
    return base64;
  }
  return {
    empreinte, nombrePages,
    page: (index: number) => extraire([index]),
    resume: () => extraire(nombrePages === 1 ? [0] : [0, nombrePages - 1]),
  };
}
