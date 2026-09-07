/**
 * src/lib/lignes-mois.ts — les lignes d'un mois du tableau des opérations,
 * chargées côté serveur (adminDb), avec leur pièce.
 *
 * Une seule lecture pour deux usages : l'écran (route tableau) et le colis
 * mensuel à la comptable (envoi-comptable). Sans ça, l'état « justifié » se
 * calculait deux fois, et divergeait.
 */
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { zipSync } from "fflate";
import type { LigneMois } from "@/lib/bilan-justificatifs";
import { justifierParMasseSalariale, justifierCommissionsBancaires, moisMoins, type LigneMasseSalariale } from "@/lib/justification-paie";
import { posteCommissionCarte } from "@/lib/postes-depenses";

const mouvements = () => adminDb.collection("mouvements-rapprochement");

export interface PieceMois {
  id: string; nom: string; retire: boolean; extraction: Record<string, unknown> | null; depenseId: string | null;
  paieValidee: boolean; modeRattachement: string | null; paiementsAssocies: { id: string; montant: number }[];
  associationDevise?: { deviseFacture: string; montantFacture: number; montantDebiteEUR: number } | null;
  associationEcart?: { type: string; taux: number; montant: number } | null;
  mime?: string;
}

export async function chargerLignesMois(mois: string): Promise<{ lignes: (LigneMois & Record<string, unknown>)[]; pieces: PieceMois[]; limite: boolean }> {
  const moisPaie = [0, 1, 2, 3].map(n => moisMoins(mois, n));
  const [ds, ms, ps, ars, mss] = await Promise.all([
    adminDb.collection("depenses").where("mois", "==", mois).limit(2001).get(),
    mouvements().where("mois", "==", mois).limit(2001).get(),
    adminDb.collection("justificatifs").limit(2001).get(),
    adminDb.collection("depenses-doublons-archives").where("mois", "==", mois).limit(2001).get(),
    adminDb.collection("masse-salariale").where("mois", "in", moisPaie).get().catch(e => { console.warn("[lignes-mois] masse salariale illisible", e); return null; }),
  ]);
  const masse: LigneMasseSalariale[] = (mss?.docs || []).map(d => { const r = d.data(); return { type: r.type === "charge" ? "charge" : "salaire", mois: r.mois || "", salarie: r.salarie || "", libelle: r.libelle || "", net: r.net ?? null, decaissement: r.decaissement ?? null, montant: r.montant ?? null }; });
  const pieces: PieceMois[] = ps.docs.map(d => {
    const p = d.data();
    return { id: d.id, nom: p.nom, retire: !!p.retire, extraction: p.extraction || null, depenseId: p.depenseId || null, paieValidee: !!p.paieValidee,
      modeRattachement: p.modeRattachement || null, paiementsAssocies: p.paiementsAssocies || [], associationDevise: p.associationDevise || null,
      associationEcart: p.associationEcart || null, mime: p.mime };
  });
  const archives = new Set(ars.docs.map(d => d.id));
  const lignes = new Map<string, Record<string, unknown>>();
  for (const d of ms.docs) if (!archives.has(d.id)) lignes.set(d.id, { ...d.data(), id: d.id, suivie: false });
  for (const d of ds.docs) if (!archives.has(d.id)) lignes.set(d.id, { ...d.data(), id: d.id, suivie: true });
  const avecPiece = [...lignes.values()].map(l => ({
    ...l,
    piece: pieces.find(p => p.depenseId === l.id || p.paiementsAssocies.some(a => a.id === l.id)) || null,
  })) as (LigneMois & Record<string, unknown>)[];
  // Salaires et cotisations : justifiés par l'écran Masse salariale, sans rien écrire.
  const ailleurs = justifierParMasseSalariale(avecPiece, masse);
  // Commissions et frais bancaires : le relevé fait foi, d'office.
  const banque = justifierCommissionsBancaires(avecPiece, posteCommissionCarte, "Frais bancaires & commissions (CB, Stripe)");
  for (const l of avecPiece) l.justifieeVia = ailleurs.get(l.id) || banque.get(l.id) || null;
  return { lignes: avecPiece, pieces, limite: [ds, ms, ps, ars].some(s => s.size > 2000) };
}

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const propre = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * Les pièces du mois dans une archive, nommées « date - fournisseur - montant »
 * comme dans le classeur du gérant. Plafond de taille : au-delà, on arrête
 * d'ajouter et on dit combien manquent — un email de 40 Mo ne part pas.
 */
export async function archiverPiecesDuMois(lignes: LigneMois[], plafondOctets = 20 * 1024 * 1024): Promise<{ zip: Uint8Array | null; nb: number; nonJointes: number }> {
  const vues = new Set<string>();
  const fichiers: Record<string, Uint8Array> = {};
  let total = 0, nb = 0, nonJointes = 0;
  for (const l of lignes) {
    const p = l.piece;
    if (!p?.id || vues.has(p.id)) continue;
    vues.add(p.id);
    const ext = EXT[(p as { mime?: string }).mime || ""] || (p.nom || "").split(".").pop()?.toLowerCase() || "pdf";
    const nom = `${l.dateOperation || l.mois || ""} - ${propre(l.fournisseur || "piece")} - ${(l.montant || 0).toFixed(2)} EUR.${ext}`;
    try {
      const [bytes] = await adminStorage.bucket().file(`justificatifs-prives/${p.id}`).download();
      if (total + bytes.length > plafondOctets) { nonJointes++; continue; }
      total += bytes.length; nb++;
      fichiers[fichiers[nom] ? nom.replace(/\.(\w+)$/, ` (${p.id.slice(0, 6)}).$1`) : nom] = new Uint8Array(bytes);
    } catch (e) { console.warn("[colis] pièce illisible", p.id, e); nonJointes++; }
  }
  return { zip: nb ? zipSync(fichiers, { level: 0 }) : null, nb, nonJointes };
}
