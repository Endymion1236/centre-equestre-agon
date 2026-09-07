import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { dateValide, type DepenseCandidate } from "@/lib/justificatifs";
import { POSTES_DEPENSES, POSTE_HORS_DEPENSES } from "@/lib/postes-depenses";
import { verifierEcheance, verifierAssociationTableau } from "@/lib/tableau-depenses";
export const dynamic = "force-dynamic";
const mouvements = () => adminDb.collection("mouvements-rapprochement");
const idValide = (s: unknown): s is string => typeof s === "string" && /^[\w-]{1,150}$/.test(s);
const categories = [...POSTES_DEPENSES.map(p => p.nom), "Salaires", "Cotisations sociales", "Virements internes", "Emprunts", POSTE_HORS_DEPENSES];
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true }); if (auth instanceof NextResponse) return auth;
  const mois = req.nextUrl.searchParams.get("mois") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  try {
    const [ds, ms, ps, ars] = await Promise.all([adminDb.collection("depenses").where("mois", "==", mois).limit(2001).get(), mouvements().where("mois", "==", mois).limit(2001).get(), adminDb.collection("justificatifs").limit(2001).get(), adminDb.collection("depenses-doublons-archives").where("mois", "==", mois).limit(2001).get()]);
    const pieces = ps.docs.map(d => ({ id: d.id, nom: d.data().nom, retire: !!d.data().retire, extraction: d.data().extraction || null, depenseId: d.data().depenseId || null, paieValidee: !!d.data().paieValidee, modeRattachement: d.data().modeRattachement || null, paiementsAssocies: d.data().paiementsAssocies || [] }));
    const archives = new Set(ars.docs.map(d => d.id));
    const lignes = new Map<string, Record<string, unknown>>();
    for (const d of ms.docs) if (!archives.has(d.id)) lignes.set(d.id, { ...d.data(), id: d.id, suivie: false });
    for (const d of ds.docs) if (!archives.has(d.id)) lignes.set(d.id, { ...d.data(), id: d.id, suivie: true });
    return NextResponse.json({ lignes: [...lignes.values()].map(l => ({ ...l, piece: pieces.find(p => p.depenseId === l.id || p.paiementsAssocies.some((a: { id: string }) => a.id === l.id)) || null })), pieces, categories,
      limite: [ds, ms, ps, ars].some(s => s.size > 2000) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Tableau indisponible" }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true }); if (auth instanceof NextResponse) return auth;
  try {
    const b = await req.json();
    if (b.action === "importer-autres") {
      if (typeof b.compte !== "string" || !b.compte.trim() || b.compte.length > 120 || !Array.isArray(b.lignes) || !b.lignes.length || b.lignes.length > 200) throw new Error("Compte et lot de 1 à 200 opérations requis");
      for (const l of b.lignes) if (!/^[a-f0-9]{64}:\d+:\d+$/.test(l.sourceOperation || "") || !dateValide(l.date) || l.mois !== l.date.slice(0, 7) || !Number.isFinite(l.montant) || l.montant <= 0 || !l.libelle || l.poste !== POSTE_HORS_DEPENSES) throw new Error("Opération bancaire invalide");
      const refs = b.lignes.map((l: { sourceOperation: string }) => mouvements().doc("pdf_" + createHash("sha256").update(JSON.stringify([b.compte, l.sourceOperation])).digest("hex")));
      await adminDb.runTransaction(async tx => {
        const docs = await tx.getAll(...refs);
        for (let i = 0; i < docs.length; i++) {
          const l = b.lignes[i], old = docs[i].data() as Record<string, unknown> | undefined;
          if (old && (old.montant !== l.montant || old.dateOperation !== l.date || old.fournisseur !== String(l.libelle).slice(0, 80))) throw new Error("La relecture diffère : vérifiez les mouvements existants");
        }
        const vus = new Set<string>();
        for (let i = 0; i < docs.length; i++) if (!docs[i].exists && !vus.has(refs[i].id)) {
          vus.add(refs[i].id); const l = b.lignes[i];
          tx.create(refs[i], { mois: l.mois, dateOperation: l.date, montant: l.montant, fournisseur: String(l.libelle).slice(0, 80), compte: b.compte, poste: POSTE_HORS_DEPENSES,
            source: "releve-bancaire", sourceOperation: l.sourceOperation, note: String(b.note || "").slice(0, 500), updatedAt: FieldValue.serverTimestamp() });
        }
      });
      return NextResponse.json({ ok: true });
    }
    if (!idValide(b.id)) throw new Error("Ligne invalide");
    await adminDb.runTransaction(async tx => {
      const dep = adminDb.collection("depenses").doc(b.id), mov = mouvements().doc(b.id);
      const [ds, ms] = await tx.getAll(dep, mov); const d = ds.exists ? ds : ms; const ref = ds.exists ? dep : mov;
      if (!d.exists) throw new Error("Ligne absente : actualisez le tableau");
      if (b.action === "categorie" || b.action === "exclure" || b.action === "tva") {
        if (b.action === "categorie" && !categories.includes(b.poste)) throw new Error("Catégorie invalide");
        // Les salaires nets ne deviennent pas des charges dans la synthèse de fonctionnement.
        if (b.action === "categorie" && ds.exists && !POSTES_DEPENSES.some(p => p.nom === b.poste)) throw new Error("Cette ligne participe déjà aux charges. Son changement de périmètre nécessite un contrôle comptable.");
        if (b.action === "exclure" && typeof b.exclue !== "boolean") throw new Error("Choix invalide");
        if (b.action === "tva" && !["a-verifier", "sans-tva", "non-recuperee"].includes(b.statutTVA)) throw new Error("Statut TVA invalide");
        tx.update(ref, b.action === "categorie" ? { poste: b.poste } : b.action === "tva" ? { statutTVA: b.statutTVA } : { rapprochementExclu: b.exclue });
      } else if (["rattacher", "detacher"].includes(b.action)) {
        if (!idValide(b.pieceId)) throw new Error("Pièce invalide");
        const pr = adminDb.collection("justificatifs").doc(b.pieceId), lr = adminDb.collection("justificatifs-liens").doc(b.id);
        const [piece, lien] = await tx.getAll(pr, lr); const p = piece.data();
        if (!piece.exists || !p) throw new Error("Pièce absente");
        const anciens = (p.paiementsAssocies || []) as { id: string; montant: number; dateOperation: string; fournisseur: string }[];
        let suivants = anciens.filter(a => a.id !== b.id);
        if (b.action === "rattacher") {
          if (b.confirme !== true || !["echeance", "per"].includes(b.mode) || p.retire || d.data()!.rapprochementExclu || d.data()!.source !== "releve-bancaire") throw new Error("Confirmation et ligne bancaire active requises");
          if (p.depenseId && !anciens.length || p.modeRattachement && p.modeRattachement !== b.mode || lien.exists && lien.data()?.pieceId !== b.pieceId) throw new Error("Pièce ou paiement déjà associé autrement");
          if (b.montantEUR !== d.data()!.montant || !Number.isFinite(b.montantEUR) || b.montantEUR <= 0) throw new Error("Montant modifié ou invalide");
          if (anciens.length >= 100 && !anciens.some(a => a.id === b.id)) throw new Error("Maximum de 100 paiements par pièce atteint");
          if (b.mode === "echeance") {
            if (b.montantPiece !== p.extraction?.ttc || b.devise !== p.extraction?.devise) throw new Error("Facture modifiée : actualisez");
            verifierEcheance(p.extraction || {}, b.montantEUR, suivants.reduce((s, a) => s + a.montant, 0));
          } else if (d.data()!.poste !== "Retraite / PER — à vérifier") throw new Error("Choisissez d’abord la catégorie Retraite / PER — à vérifier");
          suivants = [...suivants, { id: b.id, montant: b.montantEUR, dateOperation: d.data()!.dateOperation || "", fournisseur: d.data()!.fournisseur || "" }];
          tx.set(lr, { pieceId: b.pieceId });
        } else {
          if (!anciens.some(a => a.id === b.id) || !lien.exists || lien.data()?.pieceId !== b.pieceId) throw new Error("Association absente ou modifiée : actualisez");
          tx.delete(lr);
        }
        tx.update(pr, { paiementsAssocies: suivants, modeRattachement: suivants.length ? (p.modeRattachement || b.mode) : null, depenseId: suivants[0]?.id || null, operationAssociee: suivants[0] || null, associationMode: "manuel", autoBloque: true });
        tx.create(pr.collection("historique").doc(), { action: b.action, avant: anciens, apres: suivants, mode: p.modeRattachement || b.mode, uid: auth.uid, at: FieldValue.serverTimestamp() });
      } else if (b.action === "associer") {
        if (!idValide(b.pieceId) || b.confirme !== true) throw new Error("Confirmation et pièce requises");
        const pr = adminDb.collection("justificatifs").doc(b.pieceId), lr = adminDb.collection("justificatifs-liens").doc(b.id);
        const [piece, lien] = await tx.getAll(pr, lr); const p = piece.data();
        if (!piece.exists || p?.retire || !p?.extraction || d.data()?.rapprochementExclu) throw new Error("Restaurez la pièce et la ligne avant association");
        if (p.paiementsAssocies?.length || p.depenseId && p.depenseId !== b.id || lien.exists && lien.data()?.pieceId !== b.pieceId) throw new Error("Paiement ou pièce déjà associé ailleurs");
        const attendu = p.extraction.typeDocument === "paie" ? p.extraction.netAPayer : p.extraction.ttc;
        if (b.montantEUR !== d.data()!.montant || b.montantPiece !== attendu || b.devise !== p.extraction.devise) throw new Error("Montants modifiés : actualisez l’aperçu");
        if (d.data()!.source !== "releve-bancaire") throw new Error("Cette ligne est une saisie manuelle, pas un mouvement bancaire");
        const association = verifierAssociationTableau(p.extraction, { ...d.data(), id: b.id } as DepenseCandidate);
        tx.set(lr, { pieceId: b.pieceId });
        tx.update(pr, { depenseId: b.id, associationMode: "manuel", autoBloque: true,
          operationAssociee: { id: b.id, fournisseur: d.data()!.fournisseur || "", montant: d.data()!.montant, dateOperation: d.data()!.dateOperation || "", compte: d.data()!.compte || "" },
          associationDevise: association.nature === "devise" ? { deviseFacture: association.devisePiece, montantFacture: association.montantPiece, montantDebiteEUR: association.montantEUR } : null });
        tx.create(pr.collection("historique").doc(), { action: "associer-tableau", apres: b.id, ...association, uid: auth.uid, at: FieldValue.serverTimestamp() });
      } else throw new Error("Action inconnue");
      tx.create(adminDb.collection("tableau-depenses-historique").doc(), { action: b.action, id: b.id, avantTVA: d.data()!.statutTVA || "a-verifier", apresTVA: b.action === "tva" ? b.statutTVA : null, avantCategorie: d.data()!.poste || null, apresCategorie: b.poste || null, exclue: b.exclue ?? null, uid: auth.uid, at: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error && !("code" in e) ? e.message : "Opération non confirmée : actualisez." }, { status: 409 }); }
}
