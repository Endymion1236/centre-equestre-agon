import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { construireDocuments, DOCUMENTS_COMPTABLES, type SourceComptable, type TypeDocumentComptable } from "../../src/lib/documents-comptables";
import { genererDocumentComptable } from "../../src/lib/documents-comptables-pdf";
import { fluxExportComptable } from "../../src/lib/flux-export-comptable";

const sources: SourceComptable[] = ["2026-07", "2026-08", "2026-09"].map((mois, m) => ({
  nom: `Céleris ${mois}`,
  lignes: Array.from({ length: 1000 }, (_, i) => {
    const commun = { journal: "VTE", piece: `F${m}-${i}`, date: `${mois}-01`, libelle: `Enseignement fictif ${i}` };
    return [
      { ...commun, compte: "41100000", libelleCompte: "Clients", debit: 12000, credit: 0 },
      { ...commun, compte: "70611400", libelleCompte: "Enseignement", debit: 0, credit: 10000 },
      { ...commun, compte: "44571000", libelleCompte: "TVA collectée", debit: 0, credit: 2000 },
    ];
  }).flat(),
}));
const dossier = construireDocuments(sources, { debut: "2026-07-01", fin: "2026-09-07" });

test("la période juillet-septembre conserve ses 9 000 lignes et ses totaux", () => {
  assert.equal(dossier.lignes.length, 9000);
  assert.equal(dossier.totalDebit, 36_000_000);
  assert.equal(dossier.totalCredit, 36_000_000);
  assert.equal(dossier.resultat, 30_000_000);
  assert.deepEqual(dossier.centralisateur.map(m => m.lignes), [3000, 3000, 3000]);
  assert.equal(dossier.balance.find(c => c.compte === "41100000")?.solde, 36_000_000);
  assert.equal(dossier.totalActif, dossier.totalPassif);
  assert.deepEqual(dossier.moisAbsents, []);
});

test("les cinq PDF acceptent le même dossier supérieur à 5 000 lignes", async () => {
  const empreinte = createHash("sha256").update(JSON.stringify(dossier.lignes)).digest("hex");
  for (const type of Object.keys(DOCUMENTS_COMPTABLES) as TypeDocumentComptable[]) {
    const bytes = await genererDocumentComptable(dossier, type, { nom: "Club fictif" }, empreinte);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getSubject(), `9000 lignes | ${empreinte}`);
    assert.equal(pdf.getTitle(), `${DOCUMENTS_COMPTABLES[type]} - préparatoire`);
    if (type === "journal" || type === "grand-livre") assert.ok(pdf.getPageCount() > 100, type);
    // Balance et centralisateur : données + contrôles. Bilan : actif, passif, résultat + contrôles.
    // Régression : un pied placé dans la marge créait une page vide à chaque fois.
    else assert.equal(pdf.getPageCount(), type === "bilan" ? 4 : 2, type);
  }
});

test("un export de plus de 4,5 Mo est transmis intégralement par morceaux", async () => {
  const contenu = Uint8Array.from({ length: 6_000_123 }, (_, i) => i % 251);
  const attendu = createHash("sha256").update(contenu).digest("hex");
  const reader = fluxExportComptable(contenu).getReader();
  const hash = createHash("sha256"); let taille = 0, morceaux = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    assert.ok(value.byteLength <= 64 * 1024);
    taille += value.byteLength; morceaux++; hash.update(value);
  }
  assert.ok(morceaux > 1); assert.equal(taille, contenu.length);
  assert.equal(hash.digest("hex"), attendu);
  assert.equal((await new Response(fluxExportComptable(new Uint8Array())).arrayBuffer()).byteLength, 0);
});
