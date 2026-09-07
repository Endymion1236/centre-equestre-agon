/** Import des débits : lecture stricte et rapprochement sans mutation.
 * Les centimes sont entiers ; aucun mouvement illisible n'est omis silencieusement. */
import { fournisseurNormalise } from "./doublons-depenses";
import { compteBanque } from "./plan-comptable-achats";
import { posteCommissionCarte, POSTE_HORS_DEPENSES, POSTES_DEPENSES, estVersementCompteFfe } from "./postes-depenses";
import { CATEGORIE_PERSONNELLE, CATEGORIE_IMMOBILISATION, CATEGORIE_COMPTE_FFE } from "./tableau-depenses";

export class ErreurImportBancaire extends Error {}
export const CATEGORIES_IMPORT = [...POSTES_DEPENSES.map(p => p.nom), CATEGORIE_IMMOBILISATION, CATEGORIE_COMPTE_FFE, "Salaires", "Cotisations sociales", "Virements internes", "Emprunts", CATEGORIE_PERSONNELLE, POSTE_HORS_DEPENSES];
export type OperationImport = { ref: string; date: string; libelle: string; centimes: number; poste: string };
export type SourceImport = { format: "csv" | "pdf"; empreinte: string; compte: string; nom: string; debut: string; fin: string; operations: OperationImport[]; credits: number; creditsCentimes: number };
export type ExistanteImport = { id: string; collection: "depenses" | "mouvements-rapprochement"; dateOperation: string; mois: string; fournisseur: string; montant: number; compte?: string; compteBanqueConfirme?: string; sourceOperation?: string; source?: string; origineBancaire?: string; poste: string; rapprochementExclu?: boolean; archive?: boolean };
export type DecisionImport = { mode?: "lier" | "nouveau" | "ignorer"; cible?: string; motif?: string; poste?: string };
export type DecisionsImport = Record<string, DecisionImport>;
export type LienImport = { cible: string; date: string; centimes: number; libelle: string; ignore?: boolean };
export type LignePlanImport = { operation: OperationImport; etat: "nouveau" | "rapproche" | "deja" | "ambigu" | "ignore" | "archive"; cible: string | null; motif: string; candidats: ExistanteImport[]; manuel: boolean };
export const dateImportValide = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function dateCsv(s: string) {
  const fr = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const d = fr ? `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}` : s;
  if (!dateImportValide(d)) throw new ErreurImportBancaire(`Date bancaire invalide : ${s}.`);
  return d;
}
function argent(s: string, vide = true) {
  const t = s.replace(/[ \u00a0\u202f€]/g, "").replace(/EUR$/i, "");
  if (!t && vide) return 0;
  if (!/^[+-]?\d+(?:[,.]\d{1,2})?$/.test(t)) throw new ErreurImportBancaire(`Montant bancaire illisible : ${s}.`);
  const n = Math.round(Number(t.replace(",", ".")) * 100);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 1_000_000_000) throw new ErreurImportBancaire("Montant bancaire hors limite.");
  return n;
}
/** Point-virgule, tabulation ou virgule, guillemets doublés et libellés multilignes. */
function cellulesCsv(texte: string, separateur: string): string[][] {
  const rows: string[][] = []; let cells: string[] = [], cell = "", quoted = false, closed = false;
  const push = () => { cells.push(cell.trim()); cell = ""; closed = false; };
  for (let i = 0; i <= texte.length; i++) {
    const ch = i === texte.length ? "\n" : texte[i];
    if (quoted) { if (ch === '"' && texte[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') { quoted = false; closed = true; } else cell += ch; }
    else if (ch === separateur) push();
    else if (ch === "\n") { push(); if (cells.some(Boolean)) rows.push(cells); cells = []; }
    else if (ch === '"' && !cell.trim() && !closed) { cell = ""; quoted = true; }
    else if (ch === '"' || closed && ch.trim()) throw new ErreurImportBancaire("Guillemets CSV invalides.");
    else if (!closed) cell += ch;
  }
  if (quoted) throw new ErreurImportBancaire("Guillemets CSV non fermés.");
  return rows;
}
export function proposerPosteBancaire(libelle: string) {
  const commission = posteCommissionCarte(libelle); if (commission) return commission;
  if (estVersementCompteFfe(libelle)) return CATEGORIE_COMPTE_FFE;
  const n = fournisseurNormalise(libelle);
  const regles: [RegExp, string][] = [[/\b(salaire|paie)\b/, "Salaires"], [/\b(msa|urssaf)\b/, "Cotisations sociales"], [/\b(pret|emprunt)\b/, "Emprunts"],
    [/\b(agrial|nutrea|foin|paille|granules)\b/, "Aliments, litières, paille"], [/\b(marechal|ferrure|parage)\b/, "Maréchalerie & travail des chevaux"],
    [/\b(veterinaire|veterinaires|vetodiag)\b/, "Vétérinaire & santé des chevaux"], [/\b(edf|engie|saur|veolia)\b/, "Eau & électricité"],
    [/\b(arval|loyer)\b/, "Locations & loyers"], [/\b(allianz|groupama|generali)\b/, "Assurances"], [/\b(ghn|pignolet)\b/, "Honoraires & gestion (compta, juridique, GHN)"]];
  return regles.find(([re]) => re.test(n))?.[1] || POSTE_HORS_DEPENSES;
}
export function lireCsvDepenses(brut: string) {
  if (brut.length > 2_000_000) throw new ErreurImportBancaire("CSV de 2 Mo maximum.");
  const texte = brut.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  // Chercher l'en-tête après les mentions du compte et de la période.
  const lines = texte.split("\n");
  const header = lines.findIndex(l => /date/i.test(l) && /libell[eé]|label|description/i.test(l) && /montant|d[eé]bit|cr[eé]dit|amount/i.test(l));
  if (header < 0) throw new ErreurImportBancaire("En-tête non reconnu. Colonnes attendues : Date, Libellé, Débit/Crédit ou Montant signé.");
  const first = lines[header], sep = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
  const rows = cellulesCsv(lines.slice(header).join("\n"), sep), entete = rows.shift()!.map(normal);
  const find = (rx: RegExp) => entete.findIndex(c => rx.test(c));
  let date = find(/^(datedoperation|dateoperation|datecomptable)$/); if (date < 0) date = find(/^date$/);
  const libelle = find(/^(libelle.*|label|description.*)$/), debit = find(/^debit/), credit = find(/^credit/), montant = find(/^(montant|amount|montanteur|montanteuros)$/), devise = find(/^(devise|currency)$/);
  if (date < 0 || libelle < 0 || (debit < 0 || credit < 0) && montant < 0) throw new ErreurImportBancaire("Colonnes incomplètes : une date d’opération et un montant signé ou les deux colonnes débit/crédit sont nécessaires.");
  const operations: Omit<OperationImport, "ref">[] = []; let credits = 0, creditsCentimes = 0, zeros = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (/^(solde|total)/i.test(r[0]) && !r[date]?.match(/^\d{1,4}[/-]/)) continue;
    try {
      if (r.length !== entete.length) throw new ErreurImportBancaire("Nombre de colonnes différent de l’en-tête.");
      if (devise >= 0 && r[devise] && !/^(EUR|€)$/i.test(r[devise])) throw new ErreurImportBancaire("Seules les opérations en euros sont acceptées.");
      const d = dateCsv(r[date]), label = r[libelle].replace(/\s+/g, " ").trim();
      if (!label || label.length > 500) throw new ErreurImportBancaire("Libellé absent ou trop long.");
      let net: number;
      if (debit >= 0 && credit >= 0) {
        const deb = argent(r[debit]), cred = argent(r[credit]);
        if (deb < 0 || cred < 0 || deb && cred) throw new ErreurImportBancaire("Débit et crédit doivent être positifs, sur un seul côté de la ligne.");
        net = cred - deb;
      } else net = argent(r[montant], false);
      if (net > 0) { credits++; creditsCentimes += net; }
      else if (!net) zeros++;
      else operations.push({ date: d, libelle: label, centimes: -net, poste: proposerPosteBancaire(label) });
    } catch (e) { throw new ErreurImportBancaire(`Ligne ${header + i + 2} : ${(e as Error).message}`); }
  }
  if (!operations.length) throw new ErreurImportBancaire("Ce CSV ne contient aucun débit à importer dans les dépenses.");
  if (operations.length > 2000) throw new ErreurImportBancaire("Maximum 2 000 débits par import. Choisissez une période plus courte.");
  const dates = operations.map(o => o.date).sort();
  return { operations, credits, creditsCentimes, zeros, debut: dates[0], fin: dates.at(-1)! };
}
export function verifierDecisionsImport(value: unknown, refs: Set<string>): DecisionsImport {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 2000) throw new ErreurImportBancaire("Choix d’import invalides.");
  for (const [ref, d] of Object.entries(value)) {
    if (!refs.has(ref) || !d || typeof d !== "object" || Array.isArray(d)) throw new ErreurImportBancaire("Choix concernant une opération absente.");
    for (const [k, v] of Object.entries(d)) {
      if (k === "mode" ? !["lier", "nouveau", "ignorer"].includes(String(v)) : k === "poste" ? !CATEGORIES_IMPORT.includes(String(v)) : k === "cible" ? typeof v !== "string" || !/^[\w-]{1,150}$/.test(v) : k === "motif" ? typeof v !== "string" || v.length > 300 : true) throw new ErreurImportBancaire("Décision d’import invalide.");
    }
  }
  return value as DecisionsImport;
}
const banque = (e: ExistanteImport) => e.compteBanqueConfirme || compteBanque(e.compte).compte;
const cle = (date: string, centimes: number, libelle: string) => `${date}|${centimes}|${fournisseurNormalise(libelle)}`;
export function rapprocherImportBancaire(source: SourceImport, existantes: ExistanteImport[], liens: Record<string, LienImport>, decisions: DecisionsImport = {}) {
  const refs = new Set(source.operations.map(o => o.ref));
  if (refs.size !== source.operations.length) throw new ErreurImportBancaire("Opération chargée deux fois dans le même import.");
  verifierDecisionsImport(decisions, refs);
  const index = new Map(existantes.map(e => [e.id, { compte: banque(e), centimes: Math.round(e.montant * 100), libelle: fournisseurNormalise(e.fournisseur), date: dateImportValide(e.dateOperation) ? Date.parse(e.dateOperation) : null }]));
  const counts = new Map<string, number>();
  for (const o of source.operations) { const k = cle(o.date, o.centimes, o.libelle); counts.set(k, (counts.get(k) || 0) + 1); }
  const lignes: LignePlanImport[] = source.operations.map(operation => {
    const o = operation, d = decisions[o.ref] || {}, lien = liens[o.ref];
    const r: LignePlanImport = { operation: { ...o, poste: d.poste || o.poste }, etat: "nouveau", cible: null, motif: "Nouveau mouvement.", candidats: [], manuel: false };
    const libelleNormalise = fournisseurNormalise(o.libelle), dateMs = Date.parse(o.date);
    const sameAmount = (e: ExistanteImport) => index.get(e.id)!.centimes === o.centimes;
    const sameLabel = (e: ExistanteImport) => !!index.get(e.id)!.libelle && index.get(e.id)!.libelle === libelleNormalise;
    const inAccount = (e: ExistanteImport) => !index.get(e.id)!.compte || index.get(e.id)!.compte === source.compte;
    const proche = existantes.filter(e => inAccount(e) && (
      ((index.get(e.id)!.date !== null ? Math.abs(index.get(e.id)!.date! - dateMs) <= 3 * 86400000 : e.mois === o.date.slice(0, 7)) && (sameAmount(e) || sameLabel(e)))
      // La lecture du PDF peut se tromper de semaine : même fournisseur dans
      // la période => écart à contrôler, jamais recréation silencieuse.
      || (source.format === "pdf" && sameLabel(e) && e.dateOperation >= source.debut && e.dateOperation <= source.fin)));
    r.candidats = proche;
    if (lien && (lien.date !== o.date || lien.centimes !== o.centimes || lien.libelle !== o.libelle)) return { ...r, etat: "ambigu", motif: "Cette source a déjà été traitée avec d’autres informations. Vérifiez la lecture." };
    if (lien?.ignore) return { ...r, etat: "deja", motif: "Ignoré lors d’un précédent import de cette source." };
    const directe = lien ? existantes.find(e => e.id === lien.cible) : existantes.find(e => e.sourceOperation === o.ref && banque(e) === source.compte);
    if (lien || directe) {
      if (!directe) return { ...r, etat: "ambigu", motif: "Mouvement lié introuvable ou déplacé. Aucune recréation automatique." };
      if (directe.archive || directe.rapprochementExclu) return { ...r, etat: "archive", cible: directe.id, motif: "Opération archivée ou exclue : elle reste exclue." };
      if (!sameAmount(directe) || !inAccount(directe) || (lien ? (lien.date !== o.date || lien.centimes !== o.centimes || lien.libelle !== o.libelle) : (directe.dateOperation !== o.date || !sameLabel(directe)))) return { ...r, etat: "ambigu", cible: directe.id, motif: "Les informations diffèrent de la source déjà importée. Contrôler l’écart." };
      return { ...r, candidats: [directe], etat: "deja", cible: directe.id, motif: "Déjà importé ; catégorie et justificatifs conservés." };
    }
    if (d.mode === "ignorer") return d.motif?.trim() ? { ...r, etat: "ignore", motif: d.motif.trim(), manuel: true } : { ...r, etat: "ambigu", motif: "Motif requis pour ignorer une opération." };
    if (d.mode === "lier") {
      const cible = proche.find(e => e.id === d.cible && !e.archive && !e.rapprochementExclu && sameAmount(e));
      if (!cible) return { ...r, etat: "ambigu", motif: "Choisir un mouvement proposé de même montant, actif et du même compte." };
      return { ...r, etat: "rapproche", cible: cible.id, motif: "Correspondance confirmée ; données de la dépense conservées.", manuel: true };
    }
    const exactes = proche.filter(e => banque(e) === source.compte && e.dateOperation === o.date && sameAmount(e) && sameLabel(e));
    if (d.mode === "nouveau") {
      if (!d.motif?.trim()) return { ...r, etat: "ambigu", motif: "Expliquer pourquoi ce mouvement est distinct de ceux proposés." };
      if (exactes.some(e => e.archive || e.rapprochementExclu)) return { ...r, etat: "ambigu", motif: "Une opération identique est archivée ou exclue. La contrôler avant toute recréation." };
      return { ...r, motif: `Nouveau mouvement confirmé : ${d.motif.trim()}`, manuel: true };
    }
    if (exactes.length === 1 && counts.get(cle(o.date, o.centimes, o.libelle)) === 1) {
      const e = exactes[0]; return { ...r, candidats: [e], etat: e.archive || e.rapprochementExclu ? "archive" : "rapproche", cible: e.id, motif: e.archive || e.rapprochementExclu ? "Déjà archivé ou exclu : aucune réactivation." : "Même compte, date, montant et fournisseur ; informations existantes conservées." };
    }
    if (proche.length || (counts.get(cle(o.date, o.centimes, o.libelle)) || 0) > 1) return { ...r, etat: "ambigu", motif: "Plusieurs correspondances possibles ou un écart de date, montant ou libellé : choisir l’action." };
    return r;
  });
  if (lignes.reduce((n, l) => n + l.candidats.length, 0) > 6000) throw new ErreurImportBancaire("Trop de correspondances à vérifier. Importez une période plus courte ; aucune opération n’a été écartée.");
  // Une dépense existante ne peut absorber deux lignes du même fichier.
  const cibles = new Map<string, LignePlanImport[]>();
  for (const r of lignes) if (r.cible && ["rapproche", "deja"].includes(r.etat)) cibles.set(r.cible, [...(cibles.get(r.cible) || []), r]);
  for (const groupe of cibles.values()) if (groupe.length > 1) for (const r of groupe) { r.etat = "ambigu"; r.motif = "Deux lignes du fichier désignent la même dépense : confirmer les opérations distinctes."; }
  const retrouves = new Set(lignes.filter(r => ["rapproche", "deja", "archive"].includes(r.etat)).map(r => r.cible));
  const nonRetrouves = source.format === "pdf" ? existantes.filter(e => e.origineBancaire === "csv" && banque(e) === source.compte && !e.archive && !e.rapprochementExclu && e.dateOperation >= source.debut && e.dateOperation <= source.fin && !retrouves.has(e.id)) : [];
  return { lignes, nonRetrouves, nouveaux: lignes.filter(r => r.etat === "nouveau").length, rapproches: lignes.filter(r => r.etat === "rapproche").length,
    deja: lignes.filter(r => r.etat === "deja").length, ambigus: lignes.filter(r => r.etat === "ambigu").length,
    aEnregistrer: lignes.filter(r => ["nouveau", "rapproche", "ignore", "archive", "deja"].includes(r.etat) && !liens[r.operation.ref]).map(r => r.operation.ref) };
}
export type PlanImportBancaire = ReturnType<typeof rapprocherImportBancaire>;
