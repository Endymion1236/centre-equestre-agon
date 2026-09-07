import assert from "node:assert/strict";
import { test } from "node:test";
import { regrouperPages, remplacerPage } from "../../src/lib/import-releve-pages";
import { preparerRelevePdf } from "../../src/lib/releve-pdf-pages";
import { PDFDocument } from "pdf-lib";
const op = { date: "2026-07-01", mois: "2026-07", libelle: "Orange", montant: 66, poste: "Téléphone" };
test("relance : remplace une page, préserve deux vrais paiements identiques", () => {
  let pages = remplacerPage([], 1, { operations: [op, op], creditsClients: 5 });
  assert.deepEqual(regrouperPages(pages, 3, "hash").manquantes, [0,2]);
  assert.equal(regrouperPages(pages, 3, "hash").creditsClients, null);
  pages = remplacerPage(pages, 1, { operations: [op, op], creditsClients: 5 });
  assert.equal(regrouperPages(pages, 3, "hash").operations.length, 2);
  pages = remplacerPage(pages, 0, { operations: [], creditsClients: 0 });
  pages = remplacerPage(pages, 2, { operations: [op], creditsClients: 10 });
  const resultat = regrouperPages(pages, 3, "hash");
  assert.deepEqual(resultat.manquantes, []);
  assert.equal(resultat.creditsClients, 15);
  assert.equal(new Set(resultat.operations.map(o => o.sourceOperation)).size, 3);
  assert.equal(resultat.operations[0].pageReleve, 2);
  assert.equal(resultat.operations[0].date, "2026-07-01");
});
test("une page tronquée ne contribue jamais aux dépenses ni aux crédits", () => {
  const r = regrouperPages([{ index: 0, resultat: { operations: [op], creditsClients: 100, lectureIncomplete: true } }], 1, "hash");
  assert.equal(r.operations.length, 0); assert.equal(r.creditsClients, null); assert.deepEqual(r.manquantes, [0]);
});
test("découpage de 3 pages PDF : ordre, dimensions et contenu des pages conservés", async () => {
  const original = await PDFDocument.create();
  for (let i = 0; i < 3; i++) { const page = original.addPage([400 + i, 600 + i]); page.drawText(`PAGE ${i + 1}`); }
  const bytes = await original.save();
  const pdf = await preparerRelevePdf(bytes);
  assert.equal(pdf.nombrePages, 3);
  assert.equal(pdf.empreinte, (await preparerRelevePdf(bytes)).empreinte);
  for (let i = 0; i < 3; i++) {
    const extrait = await PDFDocument.load(await pdf.page(i));
    assert.equal(extrait.getPageCount(), 1); assert.equal(extrait.getPage(0).getWidth(), 400 + i);
    assert.ok(extrait.getPage(0).node.Contents());
  }
  const resume = await PDFDocument.load(await pdf.resume());
  assert.equal(resume.getPageCount(), 2);
  assert.equal(resume.getPage(1).getWidth(), 402);
});
