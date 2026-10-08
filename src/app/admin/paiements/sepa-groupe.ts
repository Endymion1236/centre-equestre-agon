import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { champsCommandeSepaUnique, echeanceSepaUnique, mandatLePlusRecent } from "@/lib/sepa-unique";

/**
 * « Encaisser ensemble » en prélèvement SEPA (octobre 2026) : chaque facture
 * de la famille est programmée en un prélèvement de son reste dû, à la même
 * date, sur le mandat le plus récent (lib/sepa-unique). Rien n'est encaissé
 * ici : l'encaissement s'écrit au passage de la remise, et la pré-notification
 * est à vérifier dans Prélèvements SEPA.
 */
export async function programmerSepaCommandes(
  ctx: { familyId: string; payments: any[]; dateEcheance: string },
): Promise<{ ok: true; ids: string[]; total: number } | { ok: false; raison: string }> {
  const mandatsSnap = await getDocs(query(collection(db, "mandats-sepa"), where("familyId", "==", ctx.familyId), where("status", "==", "active")));
  const mandat: any = mandatLePlusRecent(mandatsSnap.docs.map(d => d.data() as any));
  if (!mandat?.mandatId) return { ok: false, raison: "Aucun mandat SEPA actif pour cette famille : créez-le dans Prélèvements SEPA." };
  const ids: string[] = [];
  let total = 0;
  for (const p of ctx.payments) {
    const du = Math.max(0, Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100);
    if (du <= 0) continue;
    const description = (p.items || []).map((i: any) => i.activityTitle).join(", ") || "Commande";
    await addDoc(collection(db, "echeances-sepa"), {
      ...echeanceSepaUnique({ familyId: p.familyId, familyName: p.familyName || "", mandatId: mandat.mandatId, montant: du, description, paymentId: p.id, ...(p.orderId ? { orderId: p.orderId } : {}), dateEcheance: ctx.dateEcheance }),
      createdAt: serverTimestamp(),
    });
    // Un acompte déjà reçu reste acquis : seul le reste dû est programmé.
    const { paidAmount: _ignore, ...champs } = champsCommandeSepaUnique(du, mandat.mandatId);
    await updateDoc(doc(db, "payments", p.id), { ...champs, updatedAt: serverTimestamp() });
    ids.push(p.id);
    total += du;
  }
  return { ok: true, ids, total: Math.round(total * 100) / 100 };
}
