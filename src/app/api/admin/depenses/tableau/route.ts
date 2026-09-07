import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifyAuth } from "@/lib/api-auth";
import { dateValide, type DepenseCandidate } from "@/lib/justificatifs";
import { POSTES_DEPENSES, POSTE_HORS_DEPENSES, posteCommissionCarte } from "@/lib/postes-depenses";
import { verifierEcheance, verifierAssociationTableau, decisionCategorie, CATEGORIE_PERSONNELLE, CATEGORIE_IMMOBILISATION, CATEGORIE_COMPTE_FFE, justifiableParReleve } from "@/lib/tableau-depenses";
import { chargerLignesMois } from "@/lib/lignes-mois";
export const dynamic = "force-dynamic";
const mouvements = () => adminDb.collection("mouvements-rapprochement");
const idValide = (s: unknown): s is string => typeof s === "string" && /^[\w-]{1,150}$/.test(s);
const categories = [...POSTES_DEPENSES.map(p => p.nom), CATEGORIE_IMMOBILISATION, CATEGORIE_COMPTE_FFE, "Salaires", "Cotisations sociales", "Virements internes", "Emprunts", CATEGORIE_PERSONNELLE, POSTE_HORS_DEPENSES];
export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req, { adminOnly: true }); if (auth instanceof NextResponse) return auth;
  const mois = req.nextUrl.searchParams.get("mois") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  try {
    const { lignes, pieces, limite } = await chargerLignesMois(mois);
    return NextResponse.json({ lignes, pieces, categories, limite }, { headers: { "Cache-Control": "private, no-store" } });
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
      if (b.action === "justifier-releve") {
        if (typeof b.confirme !== "boolean") throw new Error("Confirmation requise");
        if (b.confirme && (d.data()!.source !== "releve-bancaire" || !justifiableParReleve(d.data()!.poste, d.data()!.fournisseur, posteCommissionCarte))) throw new Error("Seuls une commission ou des frais prélevés par la banque, ou une échéance d'emprunt, peuvent être justifiés par le relevé.");
        // Référence du relevé : son nom de fichier quand l'import l'a gardé,
        // sinon le compte et le mois — le relevé du mois reste retrouvable.
        const reference = d.data()!.note || `Relevé ${d.data()!.compte || "bancaire"} ${d.data()!.mois || ""}`.trim();
        tx.update(ref, { justificatifReleve: b.confirme, ...(b.confirme ? { poste: posteCommissionCarte(d.data()!.fournisseur) || d.data()!.poste, referenceJustificatifReleve: reference } : { referenceJustificatifReleve: null }) });
      } else if (b.action === "categorie") {
        // Un débit « hors dépenses » qui reçoit une catégorie de charge devient
        // une dépense, avec ou sans justificatif (règle du gérant : la charge
        // s'enregistre sur le débit, la pièce ne conditionne que la TVA).
        // Les salaires nets, virements internes et emprunts restent hors charges.
        const donnees = d.data()!;
        const ligne = { ...donnees, id: b.id } as DepenseCandidate;
        const memesMontants = ds.exists ? [] : (await tx.get(adminDb.collection("depenses").where("mois", "==", String(donnees.mois || "")).where("montant", "==", donnees.montant))).docs.map(x => ({ ...x.data(), id: x.id }) as DepenseCandidate);
        const decision = decisionCategorie({ estDepense: ds.exists, poste: b.poste, categories, postesCharges: POSTES_DEPENSES.map(p => p.nom), ligne, depensesDuMois: memesMontants });
        if (decision.decision === "refuser") throw new Error(decision.motif);
        if (decision.decision === "promouvoir") {
          // Même identifiant : les pièces et liens posés sur le mouvement
          // restent valables, et le tableau affiche la dépense à sa place.
          tx.create(dep, {
            mois: donnees.mois, dateOperation: donnees.dateOperation || "", montant: donnees.montant,
            fournisseur: donnees.fournisseur || "", compte: donnees.compte || "", note: donnees.note || "",
            source: "releve-bancaire", sourceOperation: donnees.sourceOperation || null,
            poste: b.poste, depensePersonnelle: false, immobilisation: b.poste === CATEGORIE_IMMOBILISATION,
            ...(donnees.statutTVA ? { statutTVA: donnees.statutTVA } : {}),
            ...(donnees.rapprochementExclu ? { rapprochementExclu: true } : {}),
            ...(donnees.justificatifReleve ? { justificatifReleve: true, referenceJustificatifReleve: donnees.referenceJustificatifReleve || null } : {}),
            promueDepuisMouvement: true, updatedAt: FieldValue.serverTimestamp(),
          });
          tx.update(mov, { poste: b.poste, promueVers: b.id, updatedAt: FieldValue.serverTimestamp() });
        } else {
          tx.update(ref, { poste: b.poste, depensePersonnelle: b.poste === CATEGORIE_PERSONNELLE, immobilisation: b.poste === CATEGORIE_IMMOBILISATION, avanceFfe: b.poste === CATEGORIE_COMPTE_FFE });
        }
      } else if (b.action === "exclure" || b.action === "tva") {
        if (b.action === "exclure" && typeof b.exclue !== "boolean") throw new Error("Choix invalide");
        if (b.action === "tva" && !["a-verifier", "sans-tva", "non-recuperee"].includes(b.statutTVA)) throw new Error("Statut TVA invalide");
        tx.update(ref, b.action === "tva" ? { statutTVA: b.statutTVA } : { rapprochementExclu: b.exclue });
      } else if (["rattacher", "detacher"].includes(b.action)) {
        if (!idValide(b.pieceId)) throw new Error("Pièce invalide");
        const pr = adminDb.collection("justificatifs").doc(b.pieceId), lr = adminDb.collection("justificatifs-liens").doc(b.id);
        const [piece, lien] = await tx.getAll(pr, lr); const p = piece.data();
        if (!piece.exists || !p) throw new Error("Pièce absente");
        const anciens = (p.paiementsAssocies || []) as { id: string; montant: number; dateOperation: string; fournisseur: string }[];
        let suivants = anciens.filter(a => a.id !== b.id);
        if (b.action === "rattacher") {
          if (b.confirme !== true || !["echeance", "per", "ffe"].includes(b.mode) || p.retire || d.data()!.rapprochementExclu || d.data()!.source !== "releve-bancaire") throw new Error("Confirmation et ligne bancaire active requises");
          if (p.depenseId && !anciens.length || p.modeRattachement && p.modeRattachement !== b.mode || lien.exists && lien.data()?.pieceId !== b.pieceId) throw new Error("Pièce ou paiement déjà associé autrement");
          if (b.montantEUR !== d.data()!.montant || !Number.isFinite(b.montantEUR) || b.montantEUR <= 0) throw new Error("Montant modifié ou invalide");
          if (anciens.length >= 100 && !anciens.some(a => a.id === b.id)) throw new Error("Maximum de 100 paiements par pièce atteint");
          if (b.mode === "echeance") {
            if (b.montantPiece !== p.extraction?.ttc || b.devise !== p.extraction?.devise) throw new Error("Facture modifiée : actualisez");
            verifierEcheance(p.extraction || {}, b.montantEUR, suivants.reduce((s, a) => s + a.montant, 0));
          } else if (b.mode === "per") {
            if (d.data()!.poste !== "Retraite / PER — à vérifier") throw new Error("Choisissez d’abord la catégorie Retraite / PER — à vérifier");
          } else if (d.data()!.poste !== CATEGORIE_COMPTE_FFE) throw new Error(`Choisissez d’abord la catégorie ${CATEGORIE_COMPTE_FFE} sur la ligne`);
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
        if (!piece.exists || !p) throw new Error("Pièce introuvable : actualisez le tableau.");
        if (p.retire) throw new Error("Cette pièce est archivée. Restaurez-la avant de l’associer.");
        if (!p.extraction) throw new Error("Cette pièce n’a pas encore été lue. Cliquez sur Lire cette pièce.");
        if (d.data()?.rapprochementExclu) throw new Error("Cette dépense est exclue du rapprochement. Réactivez-la avant association.");
        if (p.paiementsAssocies?.length) throw new Error("Cette pièce utilise des rattachements multiples. Choisissez Échéance d’une facture ou Attestation PER selon le document.");
        if (p.depenseId && p.depenseId !== b.id) throw new Error("Cette facture est déjà liée à un autre paiement. Pour un paiement fractionné, dissociez l’ancien lien unique puis utilisez Échéance d’une facture.");
        if (lien.exists && lien.data()?.pieceId !== b.pieceId) throw new Error("Ce paiement possède déjà un autre justificatif. Actualisez puis vérifiez la pièce associée avant de la dissocier.");
        const attendu = p.extraction.typeDocument === "paie" ? p.extraction.netAPayer : p.extraction.ttc;
        if (b.montantEUR !== d.data()!.montant || b.montantPiece !== attendu || b.devise !== p.extraction.devise) throw new Error("Montants modifiés : actualisez l’aperçu");
        if (d.data()!.source !== "releve-bancaire") throw new Error("Cette ligne est une saisie manuelle, pas un mouvement bancaire");
        const association = verifierAssociationTableau(p.extraction, { ...d.data(), id: b.id } as DepenseCandidate);
        tx.set(lr, { pieceId: b.pieceId });
        tx.update(pr, { depenseId: b.id, associationMode: "manuel", autoBloque: true,
          operationAssociee: { id: b.id, fournisseur: d.data()!.fournisseur || "", montant: d.data()!.montant, dateOperation: d.data()!.dateOperation || "", compte: d.data()!.compte || "" },
          associationDevise: association.nature === "devise" ? { deviseFacture: association.devisePiece, montantFacture: association.montantPiece, montantDebiteEUR: association.montantEUR } : null,
          associationEcart: association.nature === "escompte" && "ecart" in association ? association.ecart : null });
        tx.create(pr.collection("historique").doc(), { action: "associer-tableau", apres: b.id, ...association, uid: auth.uid, at: FieldValue.serverTimestamp() });
      } else throw new Error("Action inconnue");
      tx.create(adminDb.collection("tableau-depenses-historique").doc(), { action: b.action, id: b.id, avantJustificatifReleve: !!d.data()!.justificatifReleve, apresJustificatifReleve: b.action === "justifier-releve" ? b.confirme : null, avantTVA: d.data()!.statutTVA || "a-verifier", apresTVA: b.action === "tva" ? b.statutTVA : null, avantCategorie: d.data()!.poste || null, apresCategorie: b.poste || null, promueEnDepense: b.action === "categorie" && !ds.exists && (POSTES_DEPENSES.some(p => p.nom === b.poste) || b.poste === CATEGORIE_IMMOBILISATION), exclue: b.exclue ?? null, uid: auth.uid, at: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && !("code" in e)) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[depenses/tableau] erreur technique", e && typeof e === "object" && "code" in e ? e.code : "inconnue");
    return NextResponse.json({ error: "Erreur technique pendant l’enregistrement. Actualisez pour vérifier l’état avant de réessayer." }, { status: 500 });
  }
}
