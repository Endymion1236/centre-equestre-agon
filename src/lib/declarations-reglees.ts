/**
 * src/lib/declarations-reglees.ts
 *
 * Une famille déclare « je paierai au bureau » (espèces, chèque, virement),
 * puis change d'avis et règle la même commande par carte depuis Mes
 * factures. La commande passe payée, les places deviennent définitives…
 * mais la déclaration restait dans l'onglet Déclarations, en attente de
 * confirmation. Deux risques : l'admin clique « Confirmer réception » et le
 * règlement est compté deux fois (trop-perçu) ; ou il se demande s'il peut
 * la supprimer sans casser l'inscription.
 *
 * Ici : dès qu'une commande est réglée en ligne, ses déclarations encore en
 * attente passent en « reglee_en_ligne ». Elles quittent l'onglet (qui ne
 * liste que `pending_confirmation`) et gardent la trace de ce qui s'est
 * passé. Aucun encaissement n'est écrit : le journal CAWL l'a déjà fait.
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export const STATUT_DECLARATION_REGLEE_EN_LIGNE = "reglee_en_ligne";

/** Statuts d'une déclaration encore ouverte, que la commande vient de dépasser. */
export const STATUTS_DECLARATION_OUVERTE = ["pending_confirmation"] as const;

export function declarationADeclasser(declaration: { status?: string | null } | null | undefined): boolean {
  return !!declaration && (STATUTS_DECLARATION_OUVERTE as readonly string[]).includes(String(declaration.status || ""));
}

/**
 * Referme les déclarations en attente d'une commande réglée en ligne.
 * Non bloquant : une erreur est journalisée, jamais remontée — la
 * confirmation du paiement ne doit pas dépendre de ce rangement.
 * Retourne le nombre de déclarations refermées.
 */
export async function cloreDeclarationsRegleesEnLigne(paymentId: string, reference: string): Promise<number> {
  if (!paymentId) return 0;
  let n = 0;
  try {
    // Un seul `where` : le filtre sur le statut se fait en mémoire pour ne
    // pas dépendre d'un index composite.
    const snap = await adminDb.collection("payment_declarations").where("paymentId", "==", paymentId).get();
    for (const d of snap.docs) {
      if (!declarationADeclasser(d.data())) continue;
      await d.ref.update({
        status: STATUT_DECLARATION_REGLEE_EN_LIGNE,
        regleeEnLigneAt: FieldValue.serverTimestamp(),
        regleeEnLigneRef: reference,
      });
      n++;
    }
    if (n) console.log(`[declarations] ${n} déclaration(s) refermée(s) : commande ${paymentId} réglée en ligne (${reference})`);
  } catch (e) {
    console.error("[declarations] clôture après règlement en ligne :", e);
  }
  return n;
}
