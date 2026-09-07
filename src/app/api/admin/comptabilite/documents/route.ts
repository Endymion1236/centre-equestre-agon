import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { getClubInfo } from "@/lib/club-info";
import { ErreurDocumentsComptables, construireDocuments, lireJournalComptable, verifierPeriode, DOCUMENTS_COMPTABLES, type SourceComptable, type TypeDocumentComptable } from "@/lib/documents-comptables";
import { fluxExportComptable } from "@/lib/flux-export-comptable";
import { genererDocumentComptable } from "@/lib/documents-comptables-pdf";
import { construireEtatAnnuel, lireBalanceAnnuelle, verifierAffectations, verifierComparatif } from "@/lib/etats-annuels";
import { brouillonFiscalVide, construirePreparationFiscale, verifierBrouillonFiscal } from "@/lib/preparation-fiscale";
import { genererEtatsAnnuelsPdf, type DossierAnnuel } from "@/lib/etats-annuels-pdf";

import { chargerLignesMois } from "@/lib/lignes-mois";
import { preparerJournalAchats, verifierCorrectionsAchats, type JournalAchatsPreparatoire } from "@/lib/journal-achats-preparatoire";
import type { LigneMois } from "@/lib/bilan-justificatifs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // cinq PDF successifs pour un même jeu, sans changement de source
async function historique(periode: { debut: string; fin: string }): Promise<SourceComptable[]> {
  const snap = await adminDb.collection("historiqueComptableCeleris")
    .where("mois", ">=", periode.debut.slice(0, 7)).where("mois", "<=", periode.fin.slice(0, 7)).orderBy("mois").limit(20).get();
  if (snap.size >= 20) throw new ErreurDocumentsComptables("Trop de mois importés : réduisez la période.");
  return snap.docs.map(doc => ({ nom: `Céleris ${doc.id}`, lignes: doc.data().lignes }));
}
async function lireFichier(value: FormDataEntryValue | null, limite: number) {
  if (!(value instanceof File) || !value.size || value.size > limite) throw new ErreurDocumentsComptables(`Sélectionnez un fichier TXT ou CSV de ${limite / 1_000_000} Mo maximum.`);
  const bytes = new Uint8Array(await value.arrayBuffer()); let texte: string;
  try { texte = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { texte = new TextDecoder("windows-1252").decode(bytes); }
  return { nom: value.name.slice(0, 180), texte };
}
function jsonForm(form: FormData, key: string, fallback: unknown) {
  const raw = form.get(key); if (raw === null) return fallback;
  if (typeof raw !== "string" || raw.length > 350_000) throw new ErreurDocumentsComptables("Saisie annuelle trop volumineuse.");
  try { return JSON.parse(raw); } catch { throw new ErreurDocumentsComptables("Saisie annuelle non reconnue."); }
}
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Lecture seule : aucun journal, paiement ou justificatif modifié par la génération. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    if (Number(req.headers.get("content-length")) > 4_100_000) throw new ErreurDocumentsComptables("Fichier de 4 Mo maximum attendu.");
    const form = await req.formData();
    let taille = 0;
    for (const value of form.values()) taille += typeof value === "string" ? Buffer.byteLength(value) : value.size;
    if (taille > 4_000_000) throw new ErreurDocumentsComptables("Les fichiers N, N-1 et les saisies doivent totaliser moins de 4 Mo.");
    const periode = { debut: String(form.get("debut") || ""), fin: String(form.get("fin") || "") };
    verifierPeriode(periode);
    const source = form.get("source"), format = form.get("format");
    if (format !== "apercu" && format !== "zip" && format !== "fiscal" && !(typeof format === "string" && Object.hasOwn(DOCUMENTS_COMPTABLES, format))) throw new ErreurDocumentsComptables("Document inconnu.");
    let sources: SourceComptable[];
    if (source === "fichier") {
      const fichier = await lireFichier(form.get("fichier"), 4_000_000);
      sources = [{ nom: fichier.nom, lignes: lireJournalComptable(fichier.texte) }];
    } else if ((source === "celeris" || source === "celeris-achats")) {
      if (form.has("fichier")) throw new ErreurDocumentsComptables("Choisissez une seule source pour éviter les doubles comptes.");
      sources = await historique(periode);
    } else throw new ErreurDocumentsComptables("Source comptable inconnue.");
    let raccordement: JournalAchatsPreparatoire | null = null;
    const correctionsAchats = verifierCorrectionsAchats(jsonForm(form, "correctionsAchats", {}));
    if (source === "celeris-achats") {
      const mois: string[] = [];
      for (let m = periode.debut.slice(0, 7); m <= periode.fin.slice(0, 7);) {
        mois.push(m); const date = new Date(m + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth() + 1); m = date.toISOString().slice(0, 7);
      }
      const lignes: LigneMois[] = [];
      for (let i = 0; i < mois.length; i += 3) {
        const lots = await Promise.all(mois.slice(i, i + 3).map(m => chargerLignesMois(m)));
        for (const lot of lots) {
          if (lot.limite) throw new ErreurDocumentsComptables("La lecture des dépenses ou justificatifs atteint sa limite. Aucun export partiel n’est produit.");
          lignes.push(...lot.lignes);
        }
      }
      raccordement = preparerJournalAchats(lignes, periode, correctionsAchats, sources.flatMap(s => s.lignes).filter(l => l.date >= periode.debut && l.date <= periode.fin));
      const moisVentes = new Set(sources.flatMap(s => s.lignes.map(l => l.date.slice(0, 7))));
      const moisSansVentes = mois.filter(m => !moisVentes.has(m));
      if (moisSansVentes.length) raccordement.avertissements.push(`Aucune écriture Céleris de ventes pour : ${moisSansVentes.join(", ")}. Des achats sur ces mois ne complètent pas les ventes manquantes.`);
      if (raccordement.ecritures.length) sources.push({ nom: "Achats réglés de l’application — préparation", lignes: raccordement.ecritures });
      if (!sources.some(s => s.lignes.length) && raccordement.bloques) return NextResponse.json({ error: "Complétez les achats ci-dessous ; aucune écriture exploitable pour cette période.", raccordement: { ...raccordement, ecritures: undefined } }, { status: 422, headers });
    }
    const dossier = construireDocuments(sources, periode);
    if (raccordement) {
      dossier.perimetrePartiel = true;
      dossier.avertissements = dossier.avertissements.filter(a => !a.startsWith("Les dépenses, justificatifs"));
      dossier.avertissements.push(...raccordement.avertissements, `${raccordement.inclus} dépenses ajoutées ; ${raccordement.bloques} en attente ; ${raccordement.exclus} exclues. Le détail du raccordement accompagne le ZIP.`);
    }
    const affectations = verifierAffectations(jsonForm(form, "affectations", {}));
    const brouillon = verifierBrouillonFiscal(jsonForm(form, "fiscal", brouillonFiscalVide(Number(periode.fin.slice(0, 4)) <= 2025 ? 2025 : 2026)));
    const n = construireEtatAnnuel(dossier.balance, periode, affectations);
    let precedent = null, sourcePrecedente = null;
    const comparatif = String(form.get("comparatif") || "aucun");
    let alertesComparatif: string[] = [];
    if (comparatif !== "aucun") {
      const periodePrecedente = { debut: String(form.get("debutPrecedent") || ""), fin: String(form.get("finPrecedente") || "") };
      alertesComparatif = verifierComparatif(periode, periodePrecedente);
      if (comparatif === "celeris") {
        if (form.has("fichierPrecedent")) throw new ErreurDocumentsComptables("Choisissez une seule source N-1.");
        const d = construireDocuments(await historique(periodePrecedente), periodePrecedente);
        precedent = construireEtatAnnuel(d.balance, periodePrecedente, affectations); sourcePrecedente = d.sources.join(" ; ");
        alertesComparatif.push(...d.avertissements.map(a => `N-1 : ${a}`));
      } else if (comparatif === "balance" || comparatif === "journal") {
        const fichier = await lireFichier(form.get("fichierPrecedent"), comparatif === "balance" ? 1_000_000 : 4_000_000);
        const balance = comparatif === "balance" ? lireBalanceAnnuelle(fichier.texte) : construireDocuments([{ nom: fichier.nom, lignes: lireJournalComptable(fichier.texte) }], periodePrecedente).balance;
        precedent = construireEtatAnnuel(balance, periodePrecedente, affectations); sourcePrecedente = fichier.nom;
      } else throw new ErreurDocumentsComptables("Source N-1 inconnue.");
    } else if (form.has("fichierPrecedent")) throw new ErreurDocumentsComptables("Activez le comparatif pour inclure le fichier N-1.");
    const fiscal = construirePreparationFiscale(n, precedent, brouillon);
    const annuel: DossierAnnuel = { n, precedent, sourcePrecedente, fiscal, avertissements: [...dossier.avertissements, ...alertesComparatif], achats: raccordement?.controles };
    const empreinte = createHash("sha256").update(JSON.stringify({ version: 2, periode, lignes: dossier.lignes, sources: dossier.sources, precedent, sourcePrecedente, affectations, brouillon, correctionsAchats, raccordement })).digest("hex");
    if (format === "apercu") return NextResponse.json({ periode, empreinte, nombre: dossier.lignes.length, comptes: dossier.balance.length,
      sources: dossier.sources, totalDebit: dossier.totalDebit, totalCredit: dossier.totalCredit, resultat: dossier.resultat,
      avertissements: [...new Set([...annuel.avertissements, ...n.avertissements])], moisPresents: dossier.moisPresents,
      raccordement: raccordement ? { ...raccordement, ecritures: undefined } : null,
      achats: n.achats, comptesAchats: n.comptesAchats, charges: n.charges, comptesCharges: n.balance.filter(c => c.compte.startsWith("6")).length,
      annuel: { brut: n.brut, amortissements: n.amortissements, net: n.totalActif, precedent: precedent ? { periode: precedent.periode, net: precedent.totalActif, resultat: precedent.resultat, source: sourcePrecedente } : null, ventilation: [...n.ventilation, ...(precedent?.ventilation.filter(p => !n.ventilation.some(c => c.compte === p.compte)).map(p => ({ ...p, libelle: `${p.libelle} (N-1 uniquement)` })) || [])] }, fiscal }, { headers });
    if (form.get("empreinte") !== empreinte) return NextResponse.json({ error: "Les écritures, le comparatif ou les saisies ont changé. Relancez l’aperçu avant de télécharger." }, { status: 409, headers });
    if (raccordement?.bloques) return NextResponse.json({ error: `${raccordement.bloques} achats restent à compléter ou à exclure avec un motif. Aucun téléchargement partiel n’est produit.` }, { status: 422, headers });
    const club = await getClubInfo();
    const identite = { nom: club.legalName || club.nom, siret: club.siret };
    const suffixe = `${periode.debut}_${periode.fin}_preparatoire`;
    const pdfDocument = (type: TypeDocumentComptable) => type === "bilan" ? genererEtatsAnnuelsPdf(annuel, identite, empreinte, dossier.sources) : genererDocumentComptable(dossier, type, identite, empreinte);
    if (format === "zip") {
      const fichiers: Record<string, Uint8Array> = {};
      for (const type of Object.keys(DOCUMENTS_COMPTABLES) as TypeDocumentComptable[]) fichiers[`${type}_${suffixe}.pdf`] = new Uint8Array(await pdfDocument(type));
      if (raccordement) fichiers["RACCORDEMENT_ACHATS.json"] = strToU8(JSON.stringify({ ...raccordement, ecritures: undefined }, null, 2));
      fichiers["PERIMETRE_ET_CONTROLES.txt"] = strToU8([`Période : ${periode.debut} à ${periode.fin}`, `Sources : ${dossier.sources.join(" ; ")}`, `Empreinte : ${empreinte}`, `N-1 : ${sourcePrecedente || "Non fourni"}`, `Millésime fiscal : ${fiscal.millesime}`, `${fiscal.manquants} cases fiscales à compléter`, ...annuel.avertissements, ...n.avertissements, ...fiscal.controles].join("\n\n"));
      return new NextResponse(fluxExportComptable(zipSync(fichiers, { level: 0 })), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="documents_comptables_${suffixe}.zip"` } });
    }
    const pdf = format === "fiscal" ? await genererEtatsAnnuelsPdf(annuel, identite, empreinte, dossier.sources, true) : await pdfDocument(format as TypeDocumentComptable);
    return new NextResponse(fluxExportComptable(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${format}_${suffixe}.pdf"` } });
  } catch (e) {
    // Erreurs de validation explicites ; aucun détail d’infrastructure ou de données privées exposé.
    const validation = e instanceof ErreurDocumentsComptables;
    const message = validation ? e.message : "Lecture ou génération comptable impossible. Réessayez dans quelques instants.";
    return NextResponse.json({ error: message }, { status: validation ? 400 : 500, headers });
  }
}
