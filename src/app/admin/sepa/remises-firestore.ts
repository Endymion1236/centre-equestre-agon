/**
 * src/app/admin/sepa/remises-firestore.ts
 *
 * Le cycle de vie d'une remise bancaire : la créer (fichier XML + écritures),
 * la re-télécharger, puis la marquer déposée une fois le fichier envoyé à la
 * banque.
 *
 * Pourquoi hors du composant : c'est la partie de l'écran qui touche à
 * l'argent réel et à la comptabilité. « Marquer déposée » ne change pas
 * seulement un statut : ça crée un encaissement par échéance dans le journal
 * et ça fait basculer les paiements de référence en `paid` ou `partial`. Cet
 * enchaînement doit se lire d'un bloc, sans être coupé par du JSX, parce qu'un
 * oubli au milieu laisse une famille marquée comme n'ayant pas payé alors que
 * la banque l'a bien débitée (ou l'inverse).
 *
 * Aucune de ces fonctions ne lit l'état de React : on leur passe les données
 * déjà chargées, `toast`, et la page se charge de recharger ensuite.
 */

import { collection, addDoc, updateDoc, doc, getDocs, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateSepaXml } from "@/lib/sepa";
import type { SepaRemise } from "@/lib/sepa";
import { construireTransactions, telechargerXml } from "./remise-xml";
import type { EcheanceSepa, MandatSepa, RemiseSepa, ToastFn } from "./types";

/**
 * Crée une remise à partir des échéances cochées : fabrique le XML, l'archive
 * dans `remises-sepa`, bascule les échéances en `remis` et télécharge le
 * fichier.
 *
 * La date de prélèvement retenue est la PLUS PROCHE parmi les échéances
 * sélectionnées : le fichier pain.008 ne porte qu'une seule date de collecte
 * pour tout le lot.
 *
 * Le XML est stocké dans le document (`xmlContent`) : c'est lui, et non une
 * regénération, qui sera re-téléchargé plus tard. Le fichier envoyé à la
 * banque et le fichier relu depuis l'historique sont ainsi le même octet près.
 */
export async function creerRemise(params: {
  echeances: EcheanceSepa[];
  selectedEcheances: Set<string>;
  mandats: MandatSepa[];
  remises: RemiseSepa[];
  toast: ToastFn;
  setSaving: (v: boolean) => void;
}): Promise<boolean> {
  const { echeances, selectedEcheances, mandats, remises, toast, setSaving } = params;

  setSaving(true);
  let creee = false;
  try {
    const selected = echeances.filter(e => selectedEcheances.has(e.id) && e.status === "pending");
    if (selected.length === 0) { toast("Aucune échéance sélectionnée", "error"); setSaving(false); return false; }

    const nextNum = remises.length + 1;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const msgId = `CEDC${nextNum}PRLV`;
    const total = selected.reduce((s, e) => s + e.montant, 0);

    // Trouver la date de prélèvement (= date la plus proche parmi les échéances)
    const datePrlv = selected.map(e => e.dateEcheance).sort()[0];

    // Construire les transactions XML
    const transactions = construireTransactions(selected, mandats, msgId, todayStr);

    const remiseData: SepaRemise = {
      msgId,
      creationDate: today.toISOString().split(".")[0],
      requestedDate: datePrlv,
      sequenceType: "RCUR",
      transactions,
    };

    // Générer le XML
    const xml = generateSepaXml(remiseData);
    const fileName = `SEPA_${nextNum}.xml`;

    // Sauvegarder la remise
    const remiseRef = await addDoc(collection(db, "remises-sepa"), {
      numero: nextNum,
      dateRemise: todayStr,
      datePrelevement: datePrlv,
      nbTransactions: selected.length,
      montantTotal: Math.round(total * 100) / 100,
      status: "generated",
      xmlFileName: fileName,
      xmlContent: xml,
      echeanceIds: selected.map(e => e.id),
      createdAt: serverTimestamp(),
    });

    // Mettre à jour les échéances
    for (const ech of selected) {
      await updateDoc(doc(db, "echeances-sepa", ech.id), {
        status: "remis",
        remiseId: remiseRef.id,
      });
    }

    // Télécharger le fichier XML
    telechargerXml(xml, fileName);

    toast(`Remise ${fileName} créée — ${selected.length} prélèvements · ${total.toFixed(2)}€`, "success");
    creee = true;
  } catch (e: any) { toast(e.message, "error"); }
  setSaving(false);
  return creee;
}

/** Re-télécharge le XML archivé d'une remise déjà générée. */
export async function telechargerRemise(remise: RemiseSepa, toast: ToastFn) {
  try {
    const snap = await getDocs(collection(db, "remises-sepa"));
    const r = snap.docs.find(d => d.id === remise.id);
    const xml = r?.data()?.xmlContent;
    if (!xml) { toast("XML non trouvé", "error"); return; }
    telechargerXml(xml, remise.xmlFileName || `SEPA_${remise.numero}.xml`);
  } catch (e: any) { toast(e.message, "error"); }
}

/**
 * Marque une remise comme déposée à la banque, et en tire les conséquences
 * comptables : un encaissement par échéance dans le journal, puis mise à jour
 * des paiements de référence (`paid` si tout est prélevé, `partial` sinon).
 *
 * Deux chemins de rattachement au paiement, parce que les échéances n'ont pas
 * toutes la même origine : celles issues d'une commande portent un `orderId`,
 * celles saisies à la main n'ont qu'un `paymentId`. Les deux sont traités,
 * sinon une famille resterait affichée comme impayée après un prélèvement
 * réussi.
 *
 * Les échecs de mise à jour de paiement sont attrapés et seulement journalisés :
 * la remise reste déposée et les encaissements enregistrés, quitte à ce qu'un
 * statut de commande soit à corriger — l'inverse (tout annuler) laisserait
 * l'argent prélevé sans trace dans le journal.
 */
export async function marquerRemiseDeposee(params: {
  remiseId: string;
  echeances: EcheanceSepa[];
  remises: RemiseSepa[];
  payments: any[];
  toast: ToastFn;
}) {
  const { remiseId, echeances, remises, payments, toast } = params;

  await updateDoc(doc(db, "remises-sepa", remiseId), { status: "deposited" });
  const remiseEcheances = echeances.filter(e => e.remiseId === remiseId);
  for (const ech of remiseEcheances) {
    await updateDoc(doc(db, "echeances-sepa", ech.id), { status: "preleve" });
  }

  // ── Créer les encaissements (1 par échéance = 1 mouvement dans le journal) ──
  const remiseDoc = remises.find(r => r.id === remiseId);
  for (const ech of remiseEcheances) {
    let linkedPaymentId = ech.paymentId || null;
    if (!linkedPaymentId && ech.orderId) {
      const payDoc = payments.find((p: any) => p.orderId === ech.orderId);
      if (payDoc) linkedPaymentId = payDoc.id;
    }
    await addDoc(collection(db, "encaissements"), {
      paymentId: linkedPaymentId,
      familyId: ech.familyId,
      familyName: ech.familyName,
      montant: ech.montant,
      mode: "prelevement_sepa",
      modeLabel: "Prélèvement SEPA",
      ref: `Remise n°${remiseDoc?.numero || "?"} — ${ech.mandatId}`,
      activityTitle: ech.description || `Échéance SEPA ${ech.mandatId}`,
      date: serverTimestamp(),
    });
  }

  // ── Mettre à jour les paiements de référence ──
  const orderIds = [...new Set(remiseEcheances.map(e => e.orderId).filter(Boolean))];
  for (const orderId of orderIds) {
    const allForOrder = echeances.filter(e => e.orderId === orderId);
    const allPreleve = allForOrder.every(e => e.remiseId === remiseId || e.status === "preleve");
    const totalPreleve = allForOrder
      .filter(e => e.remiseId === remiseId || e.status === "preleve")
      .reduce((s, e) => s + (e.montant || 0), 0);
    try {
      const paySnap = await getDocs(query(
        collection(db, "payments"),
        where("orderId", "==", orderId),
      ));
      for (const payDoc of paySnap.docs) {
        const payData = payDoc.data();
        if (payData.status === "cancelled") continue;
        await updateDoc(doc(db, "payments", payDoc.id), allPreleve ? {
          status: "paid",
          paidAmount: Math.round(totalPreleve * 100) / 100,
          paidAt: serverTimestamp(),
          paymentMode: "prelevement_sepa",
          paymentRef: `SEPA prélevé — remise n°${remiseDoc?.numero || remiseId.slice(-6)}`,
        } : {
          status: "partial",
          paidAmount: Math.round(totalPreleve * 100) / 100,
        });
      }
    } catch (e) { console.error("Mise à jour paiement SEPA:", e); }
  }

  // Échéances manuelles sans orderId mais avec paymentId
  const directPayIds = [...new Set(
    remiseEcheances.filter(e => !e.orderId && e.paymentId).map(e => e.paymentId!)
  )];
  for (const payId of directPayIds) {
    const allForPay = echeances.filter(e => e.paymentId === payId);
    const allPreleve = allForPay.every(e => e.remiseId === remiseId || e.status === "preleve");
    const totalPreleve = allForPay
      .filter(e => e.remiseId === remiseId || e.status === "preleve")
      .reduce((s, e) => s + (e.montant || 0), 0);
    try {
      await updateDoc(doc(db, "payments", payId), allPreleve ? {
        status: "paid",
        paidAmount: Math.round(totalPreleve * 100) / 100,
        paidAt: serverTimestamp(),
        paymentMode: "prelevement_sepa",
        paymentRef: `SEPA prélevé — remise n°${remiseDoc?.numero || remiseId.slice(-6)}`,
      } : {
        status: "partial",
        paidAmount: Math.round(totalPreleve * 100) / 100,
      });
    } catch (e) { console.error("Mise à jour directe paiement SEPA:", e); }
  }

  toast("Remise marquée comme déposée — encaissements enregistrés", "success");
}
