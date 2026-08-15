/**
 * src/app/admin/paiements/reglement-famille.ts
 *
 * Les trois gestes du bloc « Impayés » d'une famille, dans l'onglet
 * Encaisser : solder avec un avoir, solder avec un bon cadeau, encaisser
 * réellement de l'argent sur toutes les commandes dues.
 *
 * Le point commun des trois : ils répartissent UN montant sur PLUSIEURS
 * commandes, de la plus ancienne à la plus récente, en s'arrêtant dès que
 * le montant est épuisé. C'est cette boucle de répartition qui décide de ce
 * qui reste dû à la famille — elle mérite d'être lisible d'un bloc, pas
 * dissoute dans un `onClick` au milieu du JSX.
 *
 * Avoir et bon cadeau passent par le mode « avoir » : c'est un crédit déjà
 * encaissé qu'on consomme, PAS une nouvelle recette. Les compter comme une
 * entrée d'argent gonflerait le chiffre d'affaires deux fois.
 */

import { updateDoc, doc, getDocs, query, where, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { emailTemplates } from "@/lib/email-templates";
import { authFetch } from "@/lib/auth-fetch";
import type { Family } from "@/types";
import { paymentModes, type PaymentMode } from "./types";
import type { PromoApplique } from "./calculs-encaisser";

/** Signature de la fonction centrale d'encaissement, passée par la page. */
type EnregistrerEncaissement = (
  paymentId: string, paymentData: any, montant: number,
  mode: string, ref?: string, activityTitle?: string, customDate?: string
) => Promise<any>;

type Toast = (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;

/**
 * Consomme le solde d'avoirs de la famille sur ses commandes dues.
 *
 * Deux temps : on décrémente d'abord les avoirs (un avoir vidé passe
 * « utilise »), puis on encaisse en mode « avoir » sur les commandes. Si la
 * deuxième moitié échoue, l'avoir a déjà été débité — d'où le `confirm`
 * avant de commencer.
 */
export const utiliserAvoirFamille = async (params: {
  familyAvoirs: any[];
  totalAvoir: number;
  totalPending: number;
  familyPending: any[];
  enregistrerEncaissement: EnregistrerEncaissement;
  toast: Toast;
  refreshAll: () => Promise<void>;
}) => {
  const { familyAvoirs, totalAvoir, totalPending, familyPending, enregistrerEncaissement, toast, refreshAll } = params;
  const toUse = Math.min(totalAvoir, totalPending);
  if (!confirm(`Utiliser ${toUse.toFixed(2)}€ d'avoir pour cette famille ?`)) return;
  try {
    let resteAUtiliser = toUse;
    // 1. Déduire des avoirs
    for (const a of familyAvoirs) {
      if (resteAUtiliser <= 0) break;
      const used = Math.min(a.remainingAmount || 0, resteAUtiliser);
      await updateDoc(doc(db, "avoirs", a.id), {
        usedAmount: (a.usedAmount || 0) + used,
        remainingAmount: (a.remainingAmount || 0) - used,
        status: (a.remainingAmount || 0) - used <= 0 ? "utilise" : "actif",
        updatedAt: serverTimestamp(),
      });
      resteAUtiliser -= used;
    }
    // 2. Encaisser en mode "avoir" sur les paiements
    let resteAPayer = toUse;
    for (const p of familyPending) {
      if (resteAPayer <= 0) break;
      const du = (p.totalTTC || 0) - (p.paidAmount || 0);
      const paye = Math.min(du, resteAPayer);
      await enregistrerEncaissement(p.id!, p, paye, "avoir", "", "Utilisation avoir");
      resteAPayer -= paye;
    }
    toast(`${toUse.toFixed(2)}€ d'avoir utilisé !`);
    await refreshAll();
  } catch (e) { console.error(e); toast("Erreur.", "error"); }
};

/**
 * Applique un bon cadeau saisi au code sur les commandes dues.
 *
 * Le bon est vérifié avant tout débit : existence, statut, solde, date de
 * validité. Le solde restant reste utilisable via le même code — un bon de
 * 100€ posé sur 60€ de dû garde 40€.
 */
export const appliquerBonCadeau = async (params: {
  codeBon: string;
  totalPending: number;
  familyPending: any[];
  selectedFamily: string;
  setBonBusy: (v: boolean) => void;
  setCodeBon: (v: string) => void;
  enregistrerEncaissement: EnregistrerEncaissement;
  toast: Toast;
  refreshAll: () => Promise<void>;
}) => {
  const { codeBon, totalPending, familyPending, selectedFamily, setBonBusy, setCodeBon, enregistrerEncaissement, toast, refreshAll } = params;
  const code = codeBon.trim().toUpperCase();
  setBonBusy(true);
  try {
    const snap = await getDocs(query(collection(db, "bons-cadeaux"), where("code", "==", code)));
    if (snap.empty) { toast("Bon introuvable.", "error"); setBonBusy(false); return; }
    const bonDoc = snap.docs[0];
    const bon = bonDoc.data() as any;
    const solde = typeof bon.solde === "number" ? bon.solde : (bon.montant || 0);
    if (bon.statut && bon.statut !== "actif") { toast(`Bon ${bon.statut}.`, "error"); setBonBusy(false); return; }
    if (solde <= 0) { toast("Bon déjà épuisé.", "error"); setBonBusy(false); return; }
    if (bon.validUntil) {
      const today = new Date().toISOString().split("T")[0];
      if (bon.validUntil < today) { toast("Bon expiré.", "error"); setBonBusy(false); return; }
    }
    const toUse = Math.min(solde, totalPending);
    if (!confirm(`Appliquer ${toUse.toFixed(2)}€ du bon ${code} sur les paiements de cette famille ?`)) { setBonBusy(false); return; }
    // Application directe en mode "avoir" (crédit, pas de nouvelle recette) sur les paiements dus.
    let reste = toUse;
    for (const p of familyPending) {
      if (reste <= 0) break;
      const du = (p.totalTTC || 0) - (p.paidAmount || 0);
      const paye = Math.min(du, reste);
      if (paye <= 0) continue;
      await enregistrerEncaissement(p.id!, p, paye, "avoir", "", `Bon cadeau ${code}`);
      reste -= paye;
    }
    // Décrément du solde du bon (le solde restant reste utilisable via le code).
    const nouveauSolde = solde - toUse;
    await updateDoc(doc(db, "bons-cadeaux", bonDoc.id), {
      solde: nouveauSolde,
      statut: nouveauSolde <= 0 ? "utilise" : "actif",
      usedFamilyId: selectedFamily || bon.usedFamilyId || "",
      updatedAt: serverTimestamp(),
    });
    toast(`${toUse.toFixed(2)}€ appliqués${nouveauSolde > 0 ? ` (reste ${nouveauSolde.toFixed(2)}€ sur le bon)` : ""} !`);
    setCodeBon("");
    await refreshAll();
  } catch (e) { console.error(e); toast("Erreur.", "error"); }
  setBonBusy(false);
};

/**
 * Encaisse un montant réel sur les commandes dues de la famille.
 *
 * Si une remise a été saisie, elle est d'abord retranchée du total de la
 * PREMIÈRE commande impayée (et l'ancien total conservé dans
 * `originalTotalTTC`) : une remise doit diminuer ce que la famille doit,
 * pas se transformer en encaissement fantôme.
 */
export const encaisserImpayesFamille = async (params: {
  paidAmount: string;
  totalPendingAfterDiscount: number;
  pendingDiscount: number;
  familyPending: any[];
  appliedPromo: PromoApplique | null;
  paymentMode: PaymentMode;
  paymentRef: string;
  encaissementDate: string;
  selectedFam: Family & { firestoreId: string };
  setPaidAmount: (v: string) => void;
  setPaymentRef: (v: string) => void;
  enregistrerEncaissement: EnregistrerEncaissement;
  toast: Toast;
  refreshAll: () => Promise<void>;
}) => {
  const {
    paidAmount, totalPendingAfterDiscount, pendingDiscount, familyPending, appliedPromo,
    paymentMode, paymentRef, encaissementDate, selectedFam,
    setPaidAmount, setPaymentRef, enregistrerEncaissement, toast, refreshAll,
  } = params;
  const montant = paidAmount ? safeNumber(paidAmount) : totalPendingAfterDiscount;
  if (montant <= 0) return;
  try {
    // Si réduction appliquée, d'abord réduire le totalTTC du premier impayé
    if (pendingDiscount > 0) {
      const firstP = familyPending[0];
      const newTotal = Math.max(0, (firstP.totalTTC || 0) - pendingDiscount);
      await updateDoc(doc(db, "payments", firstP.id), {
        totalTTC: newTotal,
        originalTotalTTC: firstP.totalTTC,
        discountApplied: pendingDiscount,
        discountLabel: appliedPromo?.label || `Remise ${pendingDiscount}€`,
        updatedAt: serverTimestamp(),
      });
    }
    let resteARegler = montant;
    for (const p of familyPending) {
      if (resteARegler <= 0) break;
      const du = pendingDiscount > 0 && p.id === familyPending[0].id
        ? Math.max(0, (p.totalTTC || 0) - pendingDiscount) - (p.paidAmount || 0)
        : (p.totalTTC || 0) - (p.paidAmount || 0);
      const paye = Math.min(du, resteARegler);
      // Passer encaissementDate (6e arg) pour permettre la saisie en différé.
      // Sans ce param, enregistrerEncaissement utilise serverTimestamp() = aujourd'hui.
      await enregistrerEncaissement(p.id!, p, paye, paymentMode, paymentRef, "", encaissementDate);
      resteARegler -= paye;
    }
    const resteFinal = totalPendingAfterDiscount - montant;
    toast(`${montant.toFixed(2)}€ encaissé (${paymentModes.find(m => m.id === paymentMode)?.label || paymentMode}) pour ${selectedFam.parentName} !${resteFinal > 0 ? `\nReste dû : ${resteFinal.toFixed(2)}€` : "\nTout est réglé !"}`);
    // Email confirmation paiement
    if (selectedFam.parentEmail && montant > 0) {
      try {
        const emailData = emailTemplates.confirmationPaiement({
          parentName: selectedFam.parentName || "",
          montant,
          mode: paymentModes.find(m => m.id === paymentMode)?.label || paymentMode,
          prestations: familyPending.flatMap(p => (p.items || []).map((i: any) => i.activityTitle)).join(", "),
        });
        authFetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: selectedFam.parentEmail,
            ...emailData,
            context: "admin_confirmation_paiement",
            template: "confirmationPaiement",
            familyId: selectedFam.firestoreId,
          }),
        }).catch(e => console.warn("Email:", e));
      } catch (e) { console.error("Email confirmation paiement:", e); }
    }
    setPaidAmount("");
    setPaymentRef("");
    await refreshAll();
  } catch (e) { console.error(e); toast("Erreur.", "error"); }
};
