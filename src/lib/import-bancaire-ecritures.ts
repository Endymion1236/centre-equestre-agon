import { createHash } from "node:crypto";
import { COMPTES_BANQUE_DEPENSE } from "./banque-depense";
import { POSTES_DEPENSES } from "./postes-depenses";
import { CATEGORIE_IMMOBILISATION, CATEGORIE_PERSONNELLE, CATEGORIE_COMPTE_FFE } from "./tableau-depenses";
import { CATEGORIES_IMPORT, ErreurImportBancaire, dateImportValide, lireCsvDepenses, rapprocherImportBancaire, type SourceImport, type ExistanteImport, type LienImport, type DecisionsImport, type PlanImportBancaire } from "./import-bancaire";

export const hashImport = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const idLienImport = (s: SourceImport, ref: string) => hashImport([s.compte, s.format, ref]);
export const idMouvementImport = (s: SourceImport, ref: string) => "bank_" + idLienImport(s, ref);
export function preparerSourceImport(value: unknown): SourceImport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ErreurImportBancaire("Source d’import requise.");
  const b = value as Record<string, unknown>;
  if (!COMPTES_BANQUE_DEPENSE.some(c => c.compte === b.compte)) throw new ErreurImportBancaire("Sélectionnez le compte bancaire du fichier.");
  if (typeof b.nom !== "string" || !b.nom.trim() || b.nom.length > 180) throw new ErreurImportBancaire("Nom de fichier invalide.");
  const base = { compte: b.compte as string, nom: b.nom.trim() };
  if (b.format === "csv") {
    if (typeof b.texte !== "string") throw new ErreurImportBancaire("Contenu CSV requis.");
    const lu = lireCsvDepenses(b.texte), empreinte = hashImport(b.texte.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
    if (Date.parse(lu.fin) - Date.parse(lu.debut) > 370 * 86400000) throw new ErreurImportBancaire("Choisissez une période d’un an maximum.");
    return { ...base, format: "csv", empreinte, debut: lu.debut, fin: lu.fin, credits: lu.credits, creditsCentimes: lu.creditsCentimes,
      operations: lu.operations.map((o, i) => ({ ...o, ref: `${empreinte}:csv:${i}` })) };
  }
  if (b.format !== "pdf" || typeof b.empreinte !== "string" || !/^[a-f0-9]{64}$/.test(b.empreinte) || !Array.isArray(b.operations) || !b.operations.length || b.operations.length > 2000)
    throw new ErreurImportBancaire("Relevé PDF incomplet ou supérieur à 2 000 débits.");
  if (typeof b.debut !== "string" || typeof b.fin !== "string" || !dateImportValide(b.debut) || !dateImportValide(b.fin) || b.debut > b.fin || Date.parse(b.fin) - Date.parse(b.debut) > 370 * 86400000)
    throw new ErreurImportBancaire("Confirmez les dates couvertes par le relevé (un an maximum).");
  const operations = b.operations.map((o: unknown) => {
    if (!o || typeof o !== "object") throw new ErreurImportBancaire("Débit PDF invalide.");
    const r = o as Record<string, unknown>;
    if (typeof r.ref !== "string" || !new RegExp(`^${b.empreinte}:\\d{1,4}:\\d{1,4}$`).test(r.ref) || typeof r.date !== "string" || !dateImportValide(r.date)
      || r.date < (b.debut as string) || r.date > (b.fin as string) || typeof r.libelle !== "string" || !r.libelle.trim() || r.libelle.length > 500
      || typeof r.centimes !== "number" || !Number.isSafeInteger(r.centimes) || r.centimes <= 0 || r.centimes > 1_000_000_000 || typeof r.poste !== "string" || !CATEGORIES_IMPORT.includes(r.poste))
      throw new ErreurImportBancaire("Débit PDF invalide ou date hors période. Vérifiez la lecture et les dates du relevé.");
    return { ref: r.ref, date: r.date, libelle: r.libelle.trim(), centimes: r.centimes, poste: r.poste };
  });
  if (new Set(operations.map(o => o.ref)).size !== operations.length) throw new ErreurImportBancaire("Ligne PDF répétée dans la lecture.");
  return { ...base, format: "pdf", empreinte: b.empreinte, debut: b.debut, fin: b.fin, operations, credits: 0, creditsCentimes: 0 };
}

export function apercuImport(s: SourceImport, existantes: ExistanteImport[], liens: Record<string, LienImport>, decisions: DecisionsImport) {
  const plan = rapprocherImportBancaire(s, existantes, liens, decisions);
  const version = hashImport([s, existantes.slice().sort((a, b) => a.id.localeCompare(b.id)), Object.entries(liens).sort(), Object.entries(decisions).sort()]);
  return { source: s, plan, version };
}
export type ApercuImport = ReturnType<typeof apercuImport>;
type EcritureImport = { collection: string; id: string; mode: "create" | "update"; data: Record<string, unknown> };
/** Écritures limitées à la provenance sur les lignes existantes. Aucune écriture de justificatif ou TVA. */
export function ecrituresImport(s: SourceImport, plan: PlanImportBancaire, existantes: ExistanteImport[], selection: string[], uid: string, date: string): EcritureImport[] {
  if (plan.ambigus) throw new ErreurImportBancaire("Résolvez les correspondances à vérifier avant d’enregistrer.");
  if (!selection.length || selection.length > 200 || new Set(selection).size !== selection.length || selection.some(r => !plan.aEnregistrer.includes(r)))
    throw new ErreurImportBancaire("Lot invalide ou déjà enregistré. Actualisez l’aperçu.");
  const ecritures: EcritureImport[] = [];
  for (const ref of selection) {
    const ligne = plan.lignes.find(l => l.operation.ref === ref)!, o = ligne.operation;
    const cible = ligne.cible || (ligne.etat === "nouveau" ? idMouvementImport(s, ref) : "");
    const provenance = { empreinte: s.empreinte, nom: s.nom, debut: s.debut, fin: s.fin, confirmeLe: date, confirmePar: uid };
    const meta = s.format === "pdf" ? { dernierReleveBancaire: provenance } : { dernierImportCSV: provenance };
    if (ligne.etat === "nouveau") {
      const suivie = POSTES_DEPENSES.some(p => p.nom === o.poste) || o.poste === CATEGORIE_IMMOBILISATION;
      // Les paiements distincts confirmés conservent une trace ciblée, jamais une exemption générale aux contrôles.
      const distinctes = ligne.manuel ? [...new Set([...ligne.candidats.filter(e => !e.archive).map(e => e.id),
        ...plan.lignes.filter(l => l.operation.ref !== ref && l.etat === "nouveau" && l.manuel).map(l => idMouvementImport(s, l.operation.ref))])] : [];
      ecritures.push({ collection: suivie ? "depenses" : "mouvements-rapprochement", id: cible, mode: "create", data: {
        mois: o.date.slice(0, 7), dateOperation: o.date, fournisseur: o.libelle, montant: o.centimes / 100, poste: o.poste,
        compte: s.compte, compteBanqueConfirme: s.compte, source: "releve-bancaire", sourceOperation: ref, origineBancaire: s.format,
        note: `${s.format === "csv" ? "CSV bancaire" : "Relevé"} ${s.nom}`, immobilisation: o.poste === CATEGORIE_IMMOBILISATION,
        depensePersonnelle: o.poste === CATEGORIE_PERSONNELLE, avanceFfe: o.poste === CATEGORIE_COMPTE_FFE,
        operationsDistinctesDe: distinctes, ...meta, updatedAt: date,
      } });
    } else if (cible && ligne.etat !== "archive") {
      const existante = existantes.find(e => e.id === cible)!;
      ecritures.push({ collection: existante.collection, id: cible, mode: "update", data: { ...meta,
        ...(ligne.manuel && !existante.compteBanqueConfirme ? { compteBanqueConfirme: s.compte, compteBanqueConfirmePar: uid, compteBanqueConfirmeLe: date } : {}) } });
    }
    ecritures.push({ collection: "imports-bancaires-liens", id: idLienImport(s, ref), mode: "create", data: {
      cible, date: o.date, centimes: o.centimes, libelle: o.libelle, ignore: ligne.etat === "ignore", format: s.format, compte: s.compte,
      ref, nom: s.nom, action: ligne.etat, motif: ligne.motif, uid, at: date,
    } });
  }
  return ecritures;
}
