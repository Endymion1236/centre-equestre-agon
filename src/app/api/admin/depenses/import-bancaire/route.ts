import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type Transaction, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { ErreurImportBancaire, type SourceImport, type ExistanteImport, type LienImport, verifierDecisionsImport } from "@/lib/import-bancaire";
import { apercuImport, ecrituresImport, idLienImport, preparerSourceImport } from "@/lib/import-bancaire-ecritures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
class ApercuPerime extends Error {}
const collections = ["mouvements-rapprochement", "depenses", "depenses-doublons-archives"] as const;
function moisCouverts(s: SourceImport) {
  const debut = new Date(Date.parse(s.debut) - 3 * 86400000).toISOString().slice(0, 7);
  const fin = new Date(Date.parse(s.fin) + 3 * 86400000).toISOString().slice(0, 7);
  const mois: string[] = []; let courant = debut;
  while (courant <= fin && mois.length < 15) {
    mois.push(courant); const d = new Date(courant + "-01T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); courant = d.toISOString().slice(0, 7);
  }
  if (courant <= fin) throw new ErreurImportBancaire("Choisissez une période d’un an maximum.");
  return mois;
}
function projeter(id: string, collection: typeof collections[number], data: DocumentData): ExistanteImport {
  const d = collection === "depenses-doublons-archives" ? data.original || data : data;
  return { id, collection: collection === "mouvements-rapprochement" ? collection : "depenses", dateOperation: String(d.dateOperation || ""), mois: String(d.mois || data.mois || ""),
    fournisseur: String(d.fournisseur || ""), montant: Number(d.montant || 0), compte: String(d.compte || ""), compteBanqueConfirme: String(d.compteBanqueConfirme || ""),
    sourceOperation: String(d.sourceOperation || ""), source: String(d.source || ""), origineBancaire: String(d.origineBancaire || ""), poste: String(d.poste || ""),
    rapprochementExclu: d.rapprochementExclu === true, archive: collection === "depenses-doublons-archives" };
}
/** Même lecture dans l’aperçu et dans la transaction : les modifications concurrentes invalident l’aperçu. */
async function lireEtat(source: SourceImport, tx?: Transaction) {
  const existantes = new Map<string, ExistanteImport>(), liens: Record<string, LienImport> = {};
  // Ordre important : une dépense promue remplace son mouvement, une archive interdit sa recréation.
  for (const collection of collections) {
    const snapshots = await Promise.all(moisCouverts(source).map(mois => {
      const q = adminDb.collection(collection).where("mois", "==", mois).limit(2001);
      return tx ? tx.get(q) : q.get();
    }));
    for (const snapshot of snapshots) {
      if (snapshot.size > 2000) throw new ErreurImportBancaire("Plus de 2 000 mouvements existants sur un mois : import interrompu, aucune comparaison partielle.");
      for (const doc of snapshot.docs) existantes.set(doc.id, projeter(doc.id, collection, doc.data()));
    }
  }
  if (existantes.size > 15000) throw new ErreurImportBancaire("Trop de mouvements à comparer : réduisez la période du CSV.");
  for (let i = 0; i < source.operations.length; i += 200) {
    const ops = source.operations.slice(i, i + 200), refs = ops.map(o => adminDb.collection("imports-bancaires-liens").doc(idLienImport(source, o.ref)));
    const docs = tx ? await tx.getAll(...refs) : await adminDb.getAll(...refs);
    docs.forEach((d, j) => { if (d.exists) { const x = d.data()!; liens[ops[j].ref] = { cible: String(x.cible || ""), date: String(x.date || ""), centimes: Number(x.centimes), libelle: String(x.libelle || ""), ignore: x.ignore === true }; } });
  }
  // Une dépense déplacée depuis l’import reste liée ; elle ne doit jamais réapparaître comme nouvelle.
  const absentes = [...new Set(Object.values(liens).map(l => l.cible).filter(id => id && !existantes.has(id)))];
  for (const collection of collections) for (let i = 0; i < absentes.length; i += 200) {
    const refs = absentes.slice(i, i + 200).map(id => adminDb.collection(collection).doc(id));
    const docs = tx ? await tx.getAll(...refs) : await adminDb.getAll(...refs);
    for (const doc of docs) if (doc.exists) existantes.set(doc.id, projeter(doc.id, collection, doc.data()!));
  }
  return { existantes: [...existantes.values()], liens };
}
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true }); if (auth instanceof NextResponse) return auth;
  try {
    if (Number(req.headers.get("content-length")) > 3_000_000) throw new ErreurImportBancaire("Fichier trop volumineux.");
    const raw = await req.text(); if (Buffer.byteLength(raw) > 3_000_000) throw new ErreurImportBancaire("Fichier trop volumineux.");
    const b = JSON.parse(raw);
    if (!["apercu", "enregistrer"].includes(b.action)) throw new ErreurImportBancaire("Action inconnue.");
    const source = preparerSourceImport(b.source);
    const decisions = verifierDecisionsImport(b.decisions || {}, new Set(source.operations.map(o => o.ref)));
    if (b.action === "apercu") {
      const { existantes, liens } = await lireEtat(source);
      const apercu = apercuImport(source, existantes, liens, decisions);
      if (Buffer.byteLength(JSON.stringify(apercu)) > 3_500_000) throw new ErreurImportBancaire("Aperçu trop volumineux : importez une période plus courte. Aucune opération n’a été écartée.");
      return NextResponse.json(apercu, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (typeof b.version !== "string" || !/^[a-f0-9]{64}$/.test(b.version) || !Array.isArray(b.selection) || b.selection.some((r: unknown) => typeof r !== "string")) throw new ErreurImportBancaire("Vérifiez l’aperçu avant d’enregistrer.");
    const resultat = await adminDb.runTransaction(async tx => {
      const { existantes, liens } = await lireEtat(source, tx);
      const apercu = apercuImport(source, existantes, liens, decisions);
      if (apercu.version !== b.version) throw new ApercuPerime("Des opérations ont changé. Actualisez le rapprochement avant de confirmer à nouveau.");
      const writes = ecrituresImport(source, apercu.plan, existantes, b.selection, auth.uid, new Date().toISOString());
      for (const w of writes) {
        const ref = adminDb.collection(w.collection).doc(w.id);
        if (w.mode === "create") tx.create(ref, { ...w.data, ...(w.data.updatedAt ? { updatedAt: FieldValue.serverTimestamp() } : {}) }); else tx.update(ref, w.data);
      }
      tx.create(adminDb.collection("imports-bancaires-historique").doc(), { format: source.format, compte: source.compte, empreinte: source.empreinte,
        nom: source.nom, debut: source.debut, fin: source.fin, operations: b.selection, uid: auth.uid, at: FieldValue.serverTimestamp() });
      return { enregistrees: b.selection.length };
    });
    return NextResponse.json({ ok: true, ...resultat });
  } catch (e) {
    const connu = e instanceof ErreurImportBancaire || e instanceof ApercuPerime;
    return NextResponse.json({ error: connu ? e.message : "Import non confirmé. Actualisez l’aperçu avant de réessayer ; les lots déjà enregistrés sont conservés." },
      { status: e instanceof ApercuPerime ? 409 : connu || e instanceof SyntaxError ? 400 : 500 });
  }
}
