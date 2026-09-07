import assert from "node:assert/strict";
import { test } from "node:test";
import { lireCsvDepenses, rapprocherImportBancaire, verifierDecisionsImport, type SourceImport, type ExistanteImport, type LienImport, type DecisionsImport } from "../../src/lib/import-bancaire";
import { preparerSourceImport, apercuImport, ecrituresImport, idMouvementImport, idLienImport } from "../../src/lib/import-bancaire-ecritures";
import { doublonPossible } from "../../src/lib/doublons-depenses";
import { justifierCommissionsBancaires } from "../../src/lib/justification-paie";
import { posteCommissionCarte, POSTE_HORS_DEPENSES } from "../../src/lib/postes-depenses";
import { decisionCategorie } from "../../src/lib/tableau-depenses";

const csv = (rows = "01/09/2026;PRLV AGRIAL;125,34;\n02/09/2026;Com Carte;1,19;\n03/09/2026;CLIENT;;65,00") => preparerSourceImport({ format: "csv", compte: "51200000", nom: "mouvements-fictifs.csv", texte: "Date;Libellé;Débit;Crédit\n" + rows });
const pdf = (s: SourceImport): SourceImport => preparerSourceImport({ ...s, format: "pdf", nom: "releve-fictif.pdf", empreinte: "f".repeat(64), debut: "2026-09-01", fin: "2026-09-30", operations: s.operations.map((o, i) => ({ ...o, ref: `${"f".repeat(64)}:0:${i}` })) });
const existante = (s = csv(), index = 0): ExistanteImport => ({ id: "depense-preservee", collection: "depenses", source: "releve-bancaire", sourceOperation: s.operations[index].ref,
  origineBancaire: "csv", mois: "2026-09", dateOperation: s.operations[index].date, fournisseur: s.operations[index].libelle, montant: s.operations[index].centimes / 100, poste: "Aliments, litières, paille", compte: s.compte });
const unique = () => csv("01/09/2026;PRLV AGRIAL;125,34;");

test("CSV CA : préambule, accents, espaces de milliers ; seuls les débits, crédits comptés séparément", () => {
  const lu = lireCsvDepenses('\uFEFFListe des opérations du compte\r\n\r\nDate opération;Libellé;Débit euros;Crédit euros\r\n01/09/2026;"PRLV AGRIAL";"1\u202f234,50";\r\n02/09/2026;Encaissement;;25,50\r\n03/09/2026;Vide;0;0\r\nSolde final;;;');
  assert.equal(lu.operations.length, 1); assert.equal(lu.operations[0].centimes, 123450); assert.equal(lu.credits, 1); assert.equal(lu.creditsCentimes, 2550); assert.equal(lu.zeros, 1);
});
test("CSV montant signé, virgule séparatrice et libellé multilignes entre guillemets", () => {
  const lu = lireCsvDepenses('Date,Description,Montant\n2026-09-01,"CB FOURNISSEUR, matériel\nFACTURE ""12""",-30.15\n2026-09-02,CLIENT,48.00');
  assert.equal(lu.operations[0].libelle, 'CB FOURNISSEUR, matériel FACTURE "12"'); assert.equal(lu.operations[0].centimes, 3015); assert.equal(lu.creditsCentimes, 4800);
});
test("Date d’opération prioritaire sur date de valeur ; TSV pris en charge", () => {
  const lu = lireCsvDepenses("Date valeur\tDate d'opération\tLibellé\tMontant\n03/09/2026\t01/09/2026\tFOURNISSEUR\t-12,00");
  assert.equal(lu.operations[0].date, "2026-09-01");
});
test("Lignes illisibles : jamais d’import partiel silencieux", () => {
  for (const row of ["31/09/2026;A;1;", "01/09/2026;A;1,2x;", "01/09/2026;A;1;2", "01/09/2026;A;-10;", "01/09/2026;;10;", "01/09/2026;A;10", '01/09/2026;"A;10;']) {
    assert.throws(() => csv("01/09/2026;BON;10;\n" + row));
  }
  assert.throws(() => lireCsvDepenses("Date;Libellé;Montant;Devise\n01/09/2026;A;-10;USD"), /euros/);
  assert.throws(() => lireCsvDepenses("Date valeur;Libellé;Montant\n01/09/2026;A;-10"), /incomplètes/);
  assert.throws(() => csv("01/09/2026;CLIENT;;125"), /aucun débit/);
});
test("Un an et 2000 débits maximum ; aucun mois omis", () => {
  assert.throws(() => csv("01/01/2024;A;10;\n01/09/2026;B;10;"), /un an/);
  assert.throws(() => csv(Array.from({ length: 2001 }, (_, i) => `01/09/2026;Fournisseur ${i};10;`).join("\n")), /2 000/);
});
test("Compte explicitement choisi et PDF entier validé, dates et références vérifiées", () => {
  assert.throws(() => preparerSourceImport({ format: "csv", compte: "62710000", nom: "x", texte: "" }), /compte bancaire/);
  const p = pdf(unique());
  for (const patch of [{ debut: "2026-09-02" }, { operations: [{ ...p.operations[0], centimes: 12.345 }] }, { operations: [{ ...p.operations[0], ref: "faux:0:0" }] }, { operations: [p.operations[0], p.operations[0]] }])
    assert.throws(() => preparerSourceImport({ ...p, ...patch }));
});
test("Identité CSV stable malgré CRLF/BOM ; nouveau fichier distinct rapproché par opération", () => {
  const s = unique();
  const r = preparerSourceImport({ format: "csv", compte: s.compte, nom: "copie.csv", texte: "\uFEFFDate;Libellé;Débit;Crédit\r\n01/09/2026;PRLV AGRIAL;125,34;" });
  assert.equal(s.empreinte, r.empreinte); assert.equal(s.operations[0].ref, r.operations[0].ref);
  const autre = csv("01/09/2026;PRLV AGRIAL;125,34;\n20/09/2026;EDF;42;");
  const plan = rapprocherImportBancaire(autre, [existante(s)], {});
  assert.equal(plan.rapproches, 1); assert.equal(plan.nouveaux, 1);
});
test("Reconnaissance PDF : même compte, date, fournisseur normalisé et montant", () => {
  const p = pdf(unique()); p.operations[0].libelle = "AGRIAL";
  const r = rapprocherImportBancaire(p, [existante()], {});
  assert.equal(r.rapproches, 1); assert.equal(r.nonRetrouves.length, 0); assert.equal(r.lignes[0].cible, "depense-preservee");
});
test("Écarts de date, montant et libellé présentés à l’administrateur ; aucun changement implicite", () => {
  for (const patch of [{ dateOperation: "2026-09-02" }, { dateOperation: "2026-09-24" }, { montant: 127 }, { fournisseur: "AUTRE FOURNISSEUR" }, { dateOperation: "" }, { compte: "Compte courant" }]) {
    const r = rapprocherImportBancaire(pdf(unique()), [{ ...existante(), ...patch }], {});
    assert.equal(r.ambigus, 1); assert.equal(r.nouveaux, 0);
    assert.throws(() => ecrituresImport(pdf(unique()), r, [], [pdf(unique()).operations[0].ref], "admin", "2026-09-30"), /vérifier/);
  }
});
test("Compte FFE compétition distinct du club ; banque confirmée prioritaire", () => {
  const p = { ...pdf(unique()), compte: "51740000" };
  assert.equal(rapprocherImportBancaire(p, [{ ...existante(), compte: "FFE club" }], {}).nouveaux, 1);
  assert.equal(rapprocherImportBancaire(p, [{ ...existante(), compte: "FFE club", compteBanqueConfirme: "51740000" }], {}).rapproches, 1);
});
test("Lien manuel de même montant : conserve identifiant, catégorie, TVA, justificatifs, note et imputation", () => {
  const p = pdf(unique()), ref = p.operations[0].ref;
  const e = { ...existante(), dateOperation: "2026-09-02", poste: "Autres dépenses", statutTVA: "sans-tva", note: "Note corrigée", pieceId: "piece-originale", compteComptableConfirme: "60630000" };
  const d: DecisionsImport = { [ref]: { mode: "lier", cible: e.id, poste: "Assurances" } };
  const a = apercuImport(p, [e], {}, d), before = JSON.stringify(e);
  const writes = ecrituresImport(p, a.plan, [e], [ref], "admin-test", "2026-09-30");
  const update = writes.find(w => w.mode === "update")!;
  assert.equal(update.id, e.id); assert.deepEqual(Object.keys(update.data).sort(), ["compteBanqueConfirme", "compteBanqueConfirmeLe", "compteBanqueConfirmePar", "dernierReleveBancaire"]);
  const after = { ...e, ...update.data };
  for (const k of ["poste", "statutTVA", "note", "pieceId", "compteComptableConfirme", "dateOperation", "montant", "sourceOperation"] as const) assert.equal(after[k], e[k]);
  assert.equal(JSON.stringify(e), before); assert.ok(writes.every(w => !w.collection.startsWith("justificatifs")));
});
test("Un montant différent ne peut pas être lié manuellement", () => {
  const p = pdf(unique()); const d: DecisionsImport = { [p.operations[0].ref]: { mode: "lier", cible: "depense-preservee" } };
  assert.equal(rapprocherImportBancaire(p, [{ ...existante(), montant: 120 }], {}, d).ambigus, 1);
});
test("Deux lignes identiques dans le même CSV : jamais fusionnées, choix distincts motivés", () => {
  const s = csv("01/09/2026;AGRIAL;125,34;\n01/09/2026;AGRIAL;125,34;");
  assert.equal(rapprocherImportBancaire(s, [], {}).ambigus, 2);
  const d = Object.fromEntries(s.operations.map(o => [o.ref, { mode: "nouveau" as const, motif: "Deux règlements distincts sur le fichier" }]));
  const plan = rapprocherImportBancaire(s, [], {}, d); assert.equal(plan.nouveaux, 2);
  const docs = ecrituresImport(s, plan, [], plan.aEnregistrer, "admin", "2026-09-30").filter(w => w.collection === "depenses");
  assert.equal(docs.length, 2); assert.notEqual(docs[0].id, docs[1].id);
  const a = { ...docs[0].data, id: docs[0].id } as unknown as ExistanteImport & { operationsDistinctesDe: string[] };
  const b = { ...docs[1].data, id: docs[1].id } as typeof a;
  assert.equal(doublonPossible(a, b), false);
  assert.equal(doublonPossible(a, { ...b, id: "troisieme-suspecte", operationsDistinctesDe: [] }), true);
});
test("Un paiement existant ne peut absorber deux lignes PDF", () => {
  const s = csv("01/09/2026;AGRIAL;125,34;\n01/09/2026;AGRIAL;125,34;"); const p = pdf(s), e = existante(s);
  const d = Object.fromEntries(p.operations.map(o => [o.ref, { mode: "lier" as const, cible: e.id }]));
  assert.equal(rapprocherImportBancaire(p, [e], {}, d).ambigus, 2);
});
test("Archives et exclusions conservées sur un import d’une autre source", () => {
  const p = pdf(unique());
  for (const patch of [{ archive: true }, { rapprochementExclu: true }]) {
    const e = { ...existante(), ...patch }, plan = rapprocherImportBancaire(p, [e], {});
    assert.equal(plan.lignes[0].etat, "archive");
    const writes = ecrituresImport(p, plan, [e], plan.aEnregistrer, "admin", "2026-09-30");
    assert.deepEqual(writes.map(w => w.collection), ["imports-bancaires-liens"]);
    assert.equal(rapprocherImportBancaire(p, [e], {}, { [p.operations[0].ref]: { mode: "nouveau", motif: "à recréer" } }).ambigus, 1);
  }
});
test("Provenance déjà liée : identifiant stable ; source changée ou cible supprimée signalée", () => {
  const p = pdf(unique()), o = p.operations[0], e = existante();
  const liens = { [o.ref]: { cible: e.id, date: o.date, centimes: o.centimes, libelle: o.libelle } };
  assert.equal(rapprocherImportBancaire(p, [e], liens).deja, 1);
  assert.equal(rapprocherImportBancaire(p, [], liens).ambigus, 1);
  assert.equal(rapprocherImportBancaire(p, [{ ...e, montant: 1 }], liens).ambigus, 1);
  assert.equal(rapprocherImportBancaire({ ...p, operations: [{ ...o, libelle: "lecture différente" }] }, [e], liens).ambigus, 1);
  assert.equal(rapprocherImportBancaire(p, [{ ...e, rapprochementExclu: true }], liens).lignes[0].etat, "archive");
});
test("Ignorer nécessite un motif et reste enregistré sans création de dépense", () => {
  const s = unique(), ref = s.operations[0].ref;
  assert.equal(rapprocherImportBancaire(s, [], {}, { [ref]: { mode: "ignorer" } }).ambigus, 1);
  const plan = rapprocherImportBancaire(s, [], {}, { [ref]: { mode: "ignorer", motif: "Opération personnelle déjà suivie ailleurs" } });
  const writes = ecrituresImport(s, plan, [], [ref], "admin", "2026-09-30");
  assert.equal(writes.length, 1); assert.equal(writes[0].data.ignore, true);
  assert.equal(rapprocherImportBancaire(s, [], { [ref]: writes[0].data as unknown as LienImport }).deja, 1);
});
test("Écarts PDF : CSV absent, même compte et période seulement ; aucun effacement", () => {
  const p = pdf(unique());
  const manquant = { ...existante(), id: "manquant", dateOperation: "2026-09-20", fournisseur: "AUTRE", montant: 14 };
  const plan = rapprocherImportBancaire(p, [existante(), manquant, { ...manquant, id: "octobre", dateOperation: "2026-10-01" }, { ...manquant, id: "autrebanque", compte: "51220000" }, { ...manquant, id: "exclu", rapprochementExclu: true }], {});
  assert.deepEqual(plan.nonRetrouves.map(e => e.id), ["manquant"]);
  assert.equal(rapprocherImportBancaire(unique(), [manquant], {}).nonRetrouves.length, 0);
});
test("Aperçu périmé si catégorie, date, banque, montant ou exclusion a changé", () => {
  const s = unique(), e = existante(), avant = apercuImport(s, [e], {}, {}).version;
  for (const patch of [{ poste: "Assurances" }, { dateOperation: "2026-09-03" }, { compte: "51220000" }, { montant: 200 }, { rapprochementExclu: true }])
    assert.notEqual(apercuImport(s, [{ ...e, ...patch }], {}, {}).version, avant);
});
test("Catégories inconnues et décisions hors fichier refusées côté serveur", () => {
  const s = unique(), refs = new Set(s.operations.map(o => o.ref));
  assert.throws(() => verifierDecisionsImport({ inconnu: { mode: "nouveau" } }, refs));
  assert.throws(() => verifierDecisionsImport({ [s.operations[0].ref]: { poste: "inventé" } }, refs));
  assert.throws(() => verifierDecisionsImport({ [s.operations[0].ref]: { cible: "../autre" } }, refs));
});
test("Débits non classés, paie, avances FFE et emprunts restent des mouvements hors charges", () => {
  const s = csv("01/09/2026;INCONNU;3;\n10/09/2026;SALAIRE;50;\n15/09/2026;FFE;21;\n20/09/2026;EMPRUNT;75;");
  const p = rapprocherImportBancaire(s, [], {});
  const docs = ecrituresImport(s, p, [], p.aEnregistrer, "admin", "2026-09-30").filter(w => w.collection !== "imports-bancaires-liens");
  assert.ok(docs.every(w => w.collection === "mouvements-rapprochement"));
  assert.equal(docs[0].data.poste, POSTE_HORS_DEPENSES); assert.equal(docs[2].data.avanceFfe, true);
});
test("Commission importée en CSV : justificatif PDF attendu avant justification automatique", () => {
  const frais = { id: "commission", fournisseur: "Com Carte", montant: 1.19, source: "releve-bancaire", origineBancaire: "csv" };
  assert.equal(justifierCommissionsBancaires([frais], posteCommissionCarte, "Frais bancaires").size, 0);
  assert.equal(justifierCommissionsBancaires([{ ...frais, dernierReleveBancaire: { nom: "releve.pdf" } }], posteCommissionCarte, "Frais bancaires").size, 1);
});

test("Cycle complet en mémoire : CSV, catégorisation/pièce, CSV étendu, PDF, répétition PDF", () => {
  const lignes = new Map<string, ExistanteImport & Record<string, unknown>>(), aliases = new Map<string, LienImport>();
  const liens = (s: SourceImport) => Object.fromEntries(s.operations.flatMap(o => aliases.has(idLienImport(s, o.ref)) ? [[o.ref, aliases.get(idLienImport(s, o.ref))!]] : []));
  const importer = (s: SourceImport) => {
    const es = [...lignes.values()], plan = rapprocherImportBancaire(s, es, liens(s));
    if (!plan.aEnregistrer.length) return 0;
    assert.equal(plan.ambigus, 0);
    const writes = ecrituresImport(s, plan, es, plan.aEnregistrer, "admin", "2026-09-30");
    for (const w of writes) {
      if (w.collection === "imports-bancaires-liens") { assert.ok(!aliases.has(w.id)); aliases.set(w.id, w.data as unknown as LienImport); }
      else if (w.mode === "create") { assert.ok(!lignes.has(w.id)); lignes.set(w.id, { ...w.data, id: w.id, collection: w.collection } as typeof es[number]); }
      else { assert.ok(lignes.has(w.id)); lignes.set(w.id, { ...lignes.get(w.id)!, ...w.data }); }
    }
    return plan.nouveaux;
  };
  const initial = csv(); assert.equal(importer(initial), 2); assert.equal(importer(initial), 0);
  const id = idMouvementImport(initial, initial.operations[0].ref);
  lignes.set(id, { ...lignes.get(id)!, poste: "Autres dépenses", statutTVA: "sans-tva", pieceId: "facture-conservee", note: "Correction manuelle" });
  const extension = csv("01/09/2026;PRLV AGRIAL;125,34;\n02/09/2026;Com Carte;1,19;\n20/09/2026;EDF;68;");
  assert.equal(importer(extension), 1); assert.equal(lignes.size, 3);
  const releve = pdf(extension); assert.equal(importer(releve), 0); assert.equal(importer(releve), 0); assert.equal(lignes.size, 3);
  const finale = lignes.get(id)!;
  assert.equal(finale.poste, "Autres dépenses"); assert.equal(finale.pieceId, "facture-conservee"); assert.equal(finale.statutTVA, "sans-tva"); assert.equal(finale.note, "Correction manuelle");
  assert.ok(finale.dernierReleveBancaire); assert.equal(rapprocherImportBancaire(releve, [...lignes.values()], liens(releve)).nonRetrouves.length, 0);
});
test("Lot complet comparé avant découpage à 200 ; un doublon entre les lots bloque l’enregistrement", () => {
  const rows = Array.from({ length: 201 }, (_, i) => `01/09/2026;Fournisseur ${i};${i + 1};`); rows.push(rows[0]);
  const s = csv(rows.join("\n")), plan = rapprocherImportBancaire(s, [], {});
  assert.equal(plan.ambigus, 2); assert.throws(() => ecrituresImport(s, plan, [], plan.aEnregistrer.slice(0, 200), "admin", "2026-09-30"), /vérifier/);
});
test("Un mouvement distinct confirmé peut être promu sans être pris pour un doublon", () => {
  const a = { ...existante(), id: "a", operationsDistinctesDe: ["b"] }, b = { ...a, id: "b", operationsDistinctesDe: ["a"] };
  assert.equal(decisionCategorie({ estDepense: false, poste: "Assurances", categories: ["Assurances"], postesCharges: ["Assurances"], ligne: a, depensesDuMois: [b] }).decision, "promouvoir");
});
