/**
 * src/app/admin/paiements/encaissement-central.ts
 *
 * Source unique de vérité pour « de l'argent vient d'entrer sur cette
 * commande » : écriture au journal, recalcul du montant payé, statut,
 * numéro de facture et points de fidélité.
 *
 * Pourquoi une seule fonction pour tout le module : l'encaissement se
 * déclenche depuis six endroits (panier, impayés, échéances, chèques
 * différés, encaissement groupé, correction). Chacun avait sa version, et
 * les versions divergeaient — un paiement soldé sans numéro de facture,
 * un paidAmount écrit à la main qui ne collait plus au journal. Ici, le
 * paidAmount n'est JAMAIS incrémenté : il est toujours relu depuis la
 * somme des encaissements du paiement, après écriture.
 *
 * Aucune dépendance à l'état React : la fonction ne fait que parler à
 * Firestore, elle est donc appelable depuis n'importe quel onglet.
 */

import { collection, getDocs, updateDoc, setDoc, doc, getDoc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { createEncaissement } from "@/lib/compta-encaissement";
import { paymentModes } from "./types";
import { authFetch } from "@/lib/auth-fetch";

// ═══ FONCTION CENTRALE D'ENCAISSEMENT ═══
// Source unique de vérité : crée l'encaissement + recalcule paidAmount
export const enregistrerEncaissement = async (
  paymentId: string,
  paymentData: any,
  montant: number,
  mode: string,
  ref: string = "",
  activityTitle: string = "",
  customDate?: string, // format YYYY-MM-DD, si absent → serverTimestamp()
) => {
  // 1. Créer le doc encaissement (journal) — avec hash SHA-256 chaîné
  const explicitDate = customDate ? new Date(customDate + "T12:00:00") : undefined;
  await createEncaissement({
    paymentId,
    familyId: paymentData.familyId,
    familyName: paymentData.familyName,
    montant: Math.round(montant * 100) / 100,
    mode,
    modeLabel: paymentModes.find(m => m.id === mode)?.label || mode,
    ref,
    activityTitle: activityTitle || (paymentData.items || []).map((i: any) => i.activityTitle).join(", "),
    explicitDate,
    createdAt: serverTimestamp(), // heure réelle de l'encaissement (pour tri chronologique)
  });

  // 2. Recalculer paidAmount depuis TOUS les encaissements de ce payment
  // On relit APRÈS l'écriture — le snapshot contient forcément le doc qu'on vient de créer
  const encSnap = await getDocs(query(collection(db, "encaissements"), where("paymentId", "==", paymentId)));
  const totalEncaisse = Math.round(encSnap.docs.reduce((s, d) => s + safeNumber(d.data().montant), 0) * 100) / 100;
  const totalTTC = safeNumber(paymentData.totalTTC);
  const newStatus = totalEncaisse >= totalTTC ? "paid" : totalEncaisse > 0 ? "partial" : "pending";

  // 3. Déterminer le mode de paiement à afficher
  const allModes = encSnap.docs.map(d => d.data().mode).filter(Boolean);
  const uniqueModes = [...new Set(allModes)];
  const displayMode = uniqueModes.length === 1 ? uniqueModes[0] : uniqueModes.length > 1 ? "mixte" : mode;

  // 4. Mettre à jour le payment avec paidAmount calculé
  const updateData: any = {
    paidAmount: totalEncaisse,
    status: newStatus,
    paymentMode: displayMode,
    paymentModes: uniqueModes,
    updatedAt: serverTimestamp(),
  };

  // 4b. Attribuer un numéro de facture séquentiel quand le paiement est soldé
  //     via une transaction atomique côté serveur (évite doublons en cas de
  //     paiements simultanés — conformité CGI art. 242 nonies A)
  if (newStatus === "paid" && !paymentData.invoiceNumber) {
    try {
      const res = await authFetch("/api/invoice/next-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.invoiceNumber) {
          updateData.invoiceNumber = data.invoiceNumber;
        }
      } else {
        const errText = await res.text();
        console.error("Attribution numéro facture — API error:", res.status, errText);
        // Pas de fallback en local : on préfère un paiement sans numéro de
        // facture (facile à régulariser en admin) plutôt qu'un numéro hors
        // séquence qui casserait la continuité fiscale
      }
    } catch (e) {
      console.error("Attribution numéro facture — erreur réseau:", e);
    }
  }

  await updateDoc(doc(db, "payments", paymentId), updateData);

  // 5. Attribuer des points de fidélité (1 point par euro encaissé)
  // Ne pas attribuer sur les avoirs ni les remboursements
  if (montant > 0 && mode !== "avoir") {
    try {
      const settingsSnap = await getDoc(doc(db, "settings", "fidelite"));
      const fideliteEnabled = settingsSnap.exists() ? (settingsSnap.data()?.enabled !== false) : false;
      if (fideliteEnabled) {
        const pointsGagnes = Math.floor(montant);
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1);
        const fidRef = doc(db, "fidelite", paymentData.familyId);
        const fidSnap = await getDoc(fidRef);
        if (fidSnap.exists()) {
          const current = fidSnap.data() || {};
          await updateDoc(fidRef, {
            points: ((current.points as number) || 0) + pointsGagnes,
            history: [...((current.history as any[]) || []), {
              date: new Date().toISOString(),
              points: pointsGagnes,
              type: "gain",
              label: activityTitle || "Encaissement",
              expiry: expiry.toISOString(),
              montant,
            }],
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(fidRef, {
            familyId: paymentData.familyId,
            familyName: paymentData.familyName,
            points: pointsGagnes,
            history: [{
              date: new Date().toISOString(),
              points: pointsGagnes,
              type: "gain",
              label: activityTitle || "Encaissement",
              expiry: expiry.toISOString(),
              montant,
            }],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (e) { console.error("Erreur attribution points fidélité:", e); }
  }

  return { paidAmount: totalEncaisse, status: newStatus };
};
