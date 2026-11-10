/**
 * src/lib/pieces-zip.ts — noms des factures d'un mois dans une archive ZIP,
 * « date - fournisseur - montant EUR.pdf », comme dans le classeur du gérant.
 *
 * Partagé par le colis mensuel à la comptable (lib/lignes-mois, serveur) et
 * le bouton « Factures du mois (ZIP) » de Dépenses (navigateur) : novembre
 * 2026, la comptable demandait les factures de TVA du trimestre.
 * Pur, sans import, testé (tests/unit/pieces-zip.test.ts).
 */

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "application/xml": "xml" };
export const nomPropre = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

interface LignePiece {
  dateOperation?: string | null; mois?: string | null; fournisseur?: string | null; montant?: number | null;
  piece?: { id?: string; nom?: string; mime?: string } | null;
}

/** Une entrée par pièce (une pièce partagée par plusieurs débits n'y est qu'une fois), noms uniques. */
export function fichiersPieces(lignes: LignePiece[]): { id: string; nom: string }[] {
  const vues = new Set<string>();
  const noms = new Set<string>();
  const out: { id: string; nom: string }[] = [];
  for (const l of lignes) {
    const p = l.piece;
    if (!p?.id || vues.has(p.id)) continue;
    vues.add(p.id);
    const extNom = (p.nom || "").includes(".") ? (p.nom || "").split(".").pop()!.toLowerCase() : "";
    const ext = EXT[p.mime || ""] || extNom || "pdf";
    let nom = `${l.dateOperation || l.mois || ""} - ${nomPropre(l.fournisseur || "piece")} - ${(l.montant || 0).toFixed(2)} EUR.${ext}`;
    if (noms.has(nom)) nom = nom.replace(/\.(\w+)$/, ` (${p.id.slice(0, 6)}).$1`);
    noms.add(nom);
    out.push({ id: p.id, nom });
  }
  return out;
}
