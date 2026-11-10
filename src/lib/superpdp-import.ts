/**
 * src/lib/superpdp-import.ts — import des factures fournisseurs reçues sur
 * Super PDP dans les pièces de Dépenses (serveur, Admin SDK).
 *
 * Règles et garde-fous : lib/superpdp-reception.ts (pur, testé). Utilisé par
 * le bouton de l'écran Super PDP et par le cron du matin.
 */
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { appelSuperPdp, roleConfigure } from "@/lib/superpdp";
import { pieceDepuisPlateforme } from "@/lib/superpdp-depenses";
import { nettoyerPiece } from "@/lib/justificatifs";
import { compteDeProductionDuClub, estAvoirPlateforme, facturesAImporter, idPiecePlateforme, mimeFichierRecu, nomPiecePlateforme } from "@/lib/superpdp-reception";

const EXPAND = "expand[]=en_invoice&expand[]=en_invoice.seller&expand[]=en_invoice.buyer";

export interface BilanImport { ok: boolean; raison?: string; importees: string[]; erreurs: string[]; restantes: number }

/** Importe au plus `max` factures reçues pas encore dans Dépenses. */
export async function importerFacturesRecues(auteur: string, max = 20): Promise<BilanImport> {
  const bilan: BilanImport = { ok: false, importees: [], erreurs: [], restantes: 0 };
  if (!roleConfigure("club")) return { ...bilan, raison: "Identifiants Super PDP du club absents dans Vercel." };
  const compte = await (await appelSuperPdp("club", "/v1.beta/companies/me")).json();
  const garde = compteDeProductionDuClub(compte);
  if (!garde.ok) return { ...bilan, raison: garde.raison };

  // Toutes les factures reçues, par pages de 100.
  const recues: any[] = [];
  let apres: number | null = null;
  for (let page = 0; page < 20; page++) {
    const q: string = `/v1.beta/invoices?direction=in&order=asc&limit=100&${EXPAND}${apres ? `&starting_after_id=${apres}` : ""}`;
    const d = await (await appelSuperPdp("club", q)).json();
    const lot: any[] = d.data || [];
    recues.push(...lot);
    if (lot.length < 100 || d.has_after === false) break;
    apres = lot[lot.length - 1].id;
  }
  const deja = await adminDb.collection("justificatifs").where("source", "==", "superpdp").select().get();
  const aFaire = facturesAImporter(recues, new Set(deja.docs.map((d) => d.id)));
  bilan.restantes = Math.max(0, aFaire.length - max);

  for (const f of aFaire.slice(0, max)) {
    const id = idPiecePlateforme(f.id);
    try {
      const res = await appelSuperPdp("club", `/v1.beta/invoices/${f.id}/download`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = mimeFichierRecu(res.headers.get("content-type"), bytes);
      if (!mime) throw new Error("format du fichier non reconnu");
      const extraction = nettoyerPiece(pieceDepuisPlateforme(f.en_invoice || {}) as any);
      // Avoir fournisseur : jamais rapproché d'un débit ; il se joint au crédit
      // du relevé dans Rapprochement (« Joindre l'avoir »).
      const avoir = estAvoirPlateforme(f.en_invoice);
      // Même convention que les pièces lues : un avoir porte des montants négatifs.
      if (avoir) for (const k of ["ht", "tva", "ttc"] as const) if (typeof extraction[k] === "number" && extraction[k]! > 0) extraction[k] = -extraction[k]!;
      const ref = adminDb.collection("justificatifs").doc(id);
      await adminStorage.bucket().file(`justificatifs-prives/${id}`).save(Buffer.from(bytes), { resumable: false, contentType: mime, metadata: { cacheControl: "private, no-store" } });
      await adminDb.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return;
        tx.create(ref, {
          nom: `${avoir ? "AVOIR — " : ""}${nomPiecePlateforme(extraction, mime)}`, mime, taille: bytes.length,
          ...(avoir ? { avoirPlateforme: true, autoBloque: true } : {}),
          createdAt: FieldValue.serverTimestamp(), createdBy: auteur,
          source: "superpdp", superpdpId: f.id,
          // Montants de la facture électronique elle-même : pas de lecture IA.
          extraction, analysedAt: FieldValue.serverTimestamp(), lueDepuis: "facture-electronique",
        });
        tx.create(ref.collection("historique").doc(), { action: "import-superpdp", apres: extraction, uid: auteur, at: FieldValue.serverTimestamp() });
      });
      bilan.importees.push(`${extraction.fournisseur || "?"} ${extraction.numero || ""} (${extraction.ttc ?? "?"} €)`);
    } catch (e: any) {
      bilan.erreurs.push(`facture ${f.id} : ${e?.message || e}`);
    }
  }
  bilan.ok = true;
  return bilan;
}
