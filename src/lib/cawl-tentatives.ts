/**
 * src/lib/cawl-tentatives.ts
 *
 * Journal des tentatives de paiement CAWL non abouties.
 *
 * Écrit à chaque refus vu par la route de retour ou le webhook :
 *   - `cawl_tentatives/{auto}` : la tentative, avec son explication ;
 *   - `cawl_sessions/{hostedCheckoutId}.dernierEchec` ;
 *   - `payment-links/{lienId}` : `dernierEchec` et `checkout.echecAt`, ce
 *     qui interdit de RÉUTILISER cette page CAWL au prochain clic (une page
 *     CAWL dont le paiement a été refusé ne peut pas resservir : la famille
 *     qui recliquait dans les 100 minutes retombait sur une page morte) ;
 *   - `payments/{paymentId}.cawlDernierEchec`, visible dans l'administration.
 *
 * Non bloquant : une erreur est journalisée, jamais remontée.
 */

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { resumerEchecCawl, type ResumeEchecCawl } from "@/lib/cawl-echec";

export interface EchecEnregistre extends ResumeEchecCawl {
  at: string;
  source: "retour" | "webhook";
  hostedCheckoutId: string;
  paymentId: string;
  lienId: string;
  /** Jeton du lien de paiement à l'origine de la page CAWL, pour y renvoyer la famille. */
  lienToken: string;
}

export async function enregistrerEchecCawl(args: {
  source: "retour" | "webhook";
  hostedCheckoutId: string;
  paymentId?: string | null;
  paymentCawl: any;
}): Promise<EchecEnregistre> {
  const resume = resumerEchecCawl(args.paymentCawl);
  const at = new Date().toISOString();
  const echec: EchecEnregistre = { ...resume, at, source: args.source, hostedCheckoutId: args.hostedCheckoutId || "", paymentId: String(args.paymentId || ""), lienId: "", lienToken: "" };
  try {
    if (echec.hostedCheckoutId) {
      const sessRef = adminDb.collection("cawl_sessions").doc(echec.hostedCheckoutId);
      const sess = await sessRef.get();
      const s = sess.exists ? (sess.data() as any) : null;
      if (!echec.paymentId && s?.paymentId) echec.paymentId = String(s.paymentId);
      if (s?.lienId) echec.lienId = String(s.lienId);
      await sessRef.set({ dernierEchec: { at, statut: echec.statut, code: echec.code, explication: echec.explication, source: echec.source } }, { merge: true });
    }
    if (echec.lienId) {
      const lienRef = adminDb.collection("payment-links").doc(echec.lienId);
      const lien = await lienRef.get();
      if (lien.exists) {
        echec.lienToken = String((lien.data() as any)?.token || "");
        await lienRef.update({
          dernierEchec: { at, statut: echec.statut, code: echec.code, explication: echec.explication, moyen: echec.moyen, authentification: echec.authentification },
          "checkout.echecAt": at,
          echecs: FieldValue.increment(1),
        });
      }
    }
    if (echec.paymentId) {
      await adminDb.collection("payments").doc(echec.paymentId).update({
        cawlDernierEchec: { at, statut: echec.statut, code: echec.code, explication: echec.explication, moyen: echec.moyen, hostedCheckoutId: echec.hostedCheckoutId },
        cawlLastFailStatus: echec.statut || "REJECTED",
        updatedAt: FieldValue.serverTimestamp(),
      }).catch((e) => console.warn("[cawl-tentatives] commande non marquée :", e));
    }
    await adminDb.collection("cawl_tentatives").add({ ...echec, cawlPaymentId: String(args.paymentCawl?.id || ""), createdAt: FieldValue.serverTimestamp() });
    console.warn(`[cawl-tentatives] ${echec.source} : ${echec.explication} (commande ${echec.paymentId || "?"}, session ${echec.hostedCheckoutId || "?"})`);
  } catch (e) {
    console.error("[cawl-tentatives] enregistrement impossible :", e);
  }
  return echec;
}
