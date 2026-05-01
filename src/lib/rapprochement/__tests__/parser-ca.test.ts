import { describe, it, expect } from "vitest";
import { parseCreditAgricoleCsv } from "../parser-ca";

describe("parseCreditAgricoleCsv", () => {
  it("parse le format CA avec colonnes Débit/Crédit", () => {
    const csv = `Compte numéro 12345
Du 01/05/2026 au 31/05/2026

Date;Libellé;Débit euros;Crédit euros;
05/05/2026;"VIR DE MME DUPONT
RIB 1234";;150,00;
06/05/2026;"REMISE CHEQUE 12";;320,50;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      date: "05/05/2026",
      label: "VIR DE MME DUPONT RIB 1234",
      amount: 150,
      matched: false,
      matchType: "",
      matchDetail: "",
    });
    expect(lines[1].amount).toBe(320.5);
  });

  it("ignore les débits (sortants) et garde uniquement les crédits", () => {
    const csv = `Date;Libellé;Débit euros;Crédit euros;
01/05/2026;"PRELEVEMENT URSSAF";450,00;;
02/05/2026;"VIR DE M MARTIN";;200,00;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toContain("MARTIN");
  });

  it("parse le format simple à 3 colonnes (Date;Libellé;Montant)", () => {
    const csv = `Date;Libellé;Montant
01/05/2026;Vir Dupont;100,00
02/05/2026;Prelevement;-50,00
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(100);
  });

  it("collapse les espaces multiples et retours à la ligne dans le libellé", () => {
    const csv = `Date;Libellé;Débit euros;Crédit euros;
05/05/2026;"VIR DE
   MME    DUPONT";;100,00;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines[0].label).toBe("VIR DE MME DUPONT");
    // NB: actual output observed at extraction time was "VIR DE MME DUPONT" (sans guillemets).
    // Le parseur de champs consomme les `"` comme caractères de toggle `fInQ` (cf. boucle interne)
    // et ne les pousse pas dans `field`, donc les guillemets disparaissent du libellé final.
  });

  it("ignore les lignes sans date valide", () => {
    const csv = `Date;Libellé;Débit euros;Crédit euros;
TOTAL;Solde;;500,00;
05/05/2026;Virement;;100,00;
`;
    const lines = parseCreditAgricoleCsv(csv);
    expect(lines).toHaveLength(1);
  });

  it("retourne un tableau vide pour un CSV sans en-tête détectable", () => {
    expect(parseCreditAgricoleCsv("")).toEqual([]);
    expect(parseCreditAgricoleCsv("garbage\nplus de garbage")).toEqual([]);
  });
});
