import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { verifyAuth } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { getClubInfo } from "@/lib/club-info";
import { ErreurDocumentsComptables, construireDocuments, lireJournalComptable, verifierPeriode, DOCUMENTS_COMPTABLES, type SourceComptable, type TypeDocumentComptable } from "@/lib/documents-comptables";
import { genererDocumentComptable } from "@/lib/documents-comptables-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // cinq PDF successifs pour un même jeu, sans changement de source
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Lecture seule : aucun journal, paiement ou justificatif modifié par la génération. */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true });
  if (auth instanceof NextResponse) return auth;
  try {
    if (Number(req.headers.get("content-length")) > 4_100_000) throw new ErreurDocumentsComptables("Fichier de 4 Mo maximum attendu.");
    const form = await req.formData();
    const periode = { debut: String(form.get("debut") || ""), fin: String(form.get("fin") || "") };
    verifierPeriode(periode);
    const source = form.get("source"), format = form.get("format");
    if (format !== "apercu" && format !== "zip" && !(typeof format === "string" && Object.hasOwn(DOCUMENTS_COMPTABLES, format))) throw new ErreurDocumentsComptables("Document inconnu.");
    let sources: SourceComptable[];
    if (source === "fichier") {
      const fichier = form.get("fichier");
      if (!(fichier instanceof File) || !fichier.size || fichier.size > 4_000_000) throw new ErreurDocumentsComptables("Sélectionnez un journal TXT ou CSV de 4 Mo maximum.");
      const bytes = new Uint8Array(await fichier.arrayBuffer());
      let texte: string;
      try { texte = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { texte = new TextDecoder("windows-1252").decode(bytes); }
      sources = [{ nom: fichier.name.slice(0, 180), lignes: lireJournalComptable(texte) }];
    } else if (source === "celeris") {
      if (form.has("fichier")) throw new ErreurDocumentsComptables("Choisissez une seule source pour éviter les doubles comptes.");
      const snap = await adminDb.collection("historiqueComptableCeleris")
        .where("mois", ">=", periode.debut.slice(0, 7)).where("mois", "<=", periode.fin.slice(0, 7)).orderBy("mois").limit(20).get();
      if (snap.size >= 20) throw new ErreurDocumentsComptables("Trop de mois importés : réduisez la période.");
      sources = snap.docs.map(doc => ({ nom: `Céleris ${doc.id}`, lignes: doc.data().lignes }));
    } else throw new ErreurDocumentsComptables("Source comptable inconnue.");
    const dossier = construireDocuments(sources, periode);
    const empreinte = createHash("sha256").update(JSON.stringify({ periode, lignes: dossier.lignes })).digest("hex");
    if (format === "apercu") return NextResponse.json({ periode, empreinte, nombre: dossier.lignes.length, comptes: dossier.balance.length,
      sources: dossier.sources, totalDebit: dossier.totalDebit, totalCredit: dossier.totalCredit, resultat: dossier.resultat,
      avertissements: dossier.avertissements, moisPresents: dossier.moisPresents }, { headers });
    if (form.get("empreinte") !== empreinte) return NextResponse.json({ error: "Les écritures ou la période ont changé. Relancez l’aperçu avant de télécharger." }, { status: 409, headers });
    const club = await getClubInfo();
    const identite = { nom: club.legalName || club.nom, siret: club.siret };
    const suffixe = `${periode.debut}_${periode.fin}_preparatoire`;
    if (format === "zip") {
      const fichiers: Record<string, Uint8Array> = {};
      for (const type of Object.keys(DOCUMENTS_COMPTABLES) as TypeDocumentComptable[]) fichiers[`${type}_${suffixe}.pdf`] = new Uint8Array(await genererDocumentComptable(dossier, type, identite, empreinte));
      fichiers["PERIMETRE_ET_CONTROLES.txt"] = strToU8([`Période : ${periode.debut} à ${periode.fin}`, `Sources : ${dossier.sources.join(" ; ")}`, `Empreinte : ${empreinte}`, ...dossier.avertissements].join("\n\n"));
      return new NextResponse(Buffer.from(zipSync(fichiers, { level: 6 })), { headers: { ...headers, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="documents_comptables_${suffixe}.zip"` } });
    }
    const pdf = await genererDocumentComptable(dossier, format as TypeDocumentComptable, identite, empreinte);
    return new NextResponse(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${format}_${suffixe}.pdf"` } });
  } catch (e) {
    // Erreurs de validation explicites ; aucun détail d’infrastructure ou de données privées exposé.
    const validation = e instanceof ErreurDocumentsComptables;
    const message = validation ? e.message : "Lecture ou génération comptable impossible. Réessayez dans quelques instants.";
    return NextResponse.json({ error: message }, { status: validation ? 400 : 500, headers });
  }
}
