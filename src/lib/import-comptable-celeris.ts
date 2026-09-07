export type EcritureCeleris = {
  journal: string; compte: string; piece: string; date: string;
  debit: number; credit: number; libelle: string; libelleCompte: string;
};
export type ImportCeleris = {
  mois: string; lignes: EcritureCeleris[];
  totaux: { ht: number; tva: number; ttc: number; debit: number; credit: number };
};
const entete = "Journal;N compte;N piece;Date ope;Debit;Credit;Libele ecriture;Libele compte";
function centimes(value: string): number {
  const normal = value.replace(/[ \u00a0\u202f]/g, "");
  if (!/^-?\d+(?:[,.]\d{1,2})?$/.test(normal)) throw new Error("Montant invalide");
  const montant = Math.round(Number(normal.replace(",", ".")) * 100);
  if (!Number.isSafeInteger(montant) || Math.abs(montant) > 1_000_000_000) throw new Error("Montant hors limite");
  return montant;
}
/** Montants en centimes. Un export mensuel complet ; aucun rapprochement de caisse implicite. */
export function analyserCeleris(texte: string): ImportCeleris {
  const brut = texte.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (brut.shift()?.trim() !== entete) throw new Error("En-tête Céleris non reconnu");
  if (!brut.length || brut.length > 10000) throw new Error("Export vide ou supérieur à 10 000 lignes");
  const groupes = new Map<string, number>();
  const mois = new Set<string>();
  const totaux = { ht: 0, tva: 0, ttc: 0, debit: 0, credit: 0 };
  const lignes = brut.map((ligne, index): EcritureCeleris => {
    try {
      const cells = ligne.split(";").map(c => c.trim());
      if (cells.length !== 8) throw new Error("8 colonnes attendues");
      const [journal, compte, piece, dateBrute, d, c, libelle, libelleCompte] = cells;
      if (!/^[A-Z0-9]{1,12}$/.test(journal) || !/^\d{1,15}$/.test(compte) || !piece || piece.length > 80) throw new Error("Référence invalide");
      if (!/^\d{2}-\d{2}-\d{4}$/.test(dateBrute)) throw new Error("Date invalide");
      const date = dateBrute.split("-").reverse().join("-");
      const parsed = new Date(date + "T00:00:00Z");
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Date inexistante");
      if (libelle.length > 1000 || libelleCompte.length > 1000) throw new Error("Libellé trop long");
      const debit = centimes(d), credit = centimes(c);
      mois.add(date.slice(0, 7));
      const key = JSON.stringify([journal, piece, date]);
      groupes.set(key, (groupes.get(key) || 0) + debit - credit);
      totaux.debit += debit; totaux.credit += credit;
      if (journal === "VTE") {
        if (compte.startsWith("7")) totaux.ht += credit - debit;
        if (compte.startsWith("445")) totaux.tva += credit - debit;
        if (compte.startsWith("411")) totaux.ttc += debit - credit;
      }
      return { journal, compte, piece, date, debit, credit, libelle, libelleCompte };
    } catch (e) { throw new Error(`Ligne ${index + 2} : ${e instanceof Error ? e.message : "invalide"}`); }
  });
  if (mois.size !== 1) throw new Error("Sélectionnez un export pour un seul mois complet");
  if ([...groupes.values()].some(v => v !== 0)) throw new Error("Écritures déséquilibrées : vérifiez que l’export est complet");
  // Tri canonique : ordre et fins de ligne ne permettent pas de contourner les doublons.
  lignes.sort((a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; });
  return { mois: [...mois][0], lignes, totaux };
}
