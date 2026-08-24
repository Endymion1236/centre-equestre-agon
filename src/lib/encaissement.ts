/**
 * Enregistrement d'un encaissement — source unique de vérité.
 *
 * Toute somme reçue passe par ici, quel que soit l'écran : la caisse
 * (Paiements → Encaisser), l'encaissement d'un impayé, et l'acompte de stage
 * réglé au comptoir depuis le planning. Un encaissement enregistré autrement
 * ne serait ni journalisé ni chaîné, et la facture ne serait pas numérotée.
 *
 * La fonction fait, dans cet ordre :
 *   1. l'écriture au journal (NF525 : horodatage, hash SHA-256 chaîné au
 *      précédent) via createEncaissement ;
 *   2. le recalcul de `paidAmount` en relisant TOUS les encaissements du
 *      paiement — jamais une addition en mémoire, pour rester juste même si
 *      deux postes encaissent en même temps ;
 *   3. la mise à jour du paiement (statut, mode affiché, modes multiples) ;
 *   4. l'attribution du numéro de facture séquentiel quand le paiement est
 *      soldé, par transaction serveur (CGI art. 242 nonies A) ;
 *   5. les points de fidélité.
 *
 * Extrait de src/app/admin/paiements/page.tsx, où la fonction vivait dans le
 * corps du composant et n'était donc appelable que depuis cet écran.
 */

import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber } from "@/lib/utils";
import { createEncaissement } from "@/lib/compta-encaissement";
import { authFetch } from "@/lib/auth-fetch";
import { paymentModes } from "@/app/admin/paiements/types";

export interface ResultatEncaissement {
  paidAmount: number;
  status: "paid" | "partial" | "pending";
}

export async function enregistrerEncaissement(
  paymentId: string,
  paymentData: any,
  montant: number,
  mode: string,
  ref: string = "",
  activityTitle: string = "",
  customDate?: string, // format YYYY-MM-DD, si absent → serverTimestamp()
): Promise<ResultatEncaissement> {
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

  // 4c. Lever les « places tenues » de ce paiement. Une inscription en attente
  // de règlement (déclaration espèces/chèque de l'espace famille) garde un
  // marqueur pending+holdUntil sur le créneau ; seul le circuit CAWL le
  // levait — un encaissement au comptoir laissait la purge automatique
  // DÉSINSCRIRE un enfant dont le stage était pourtant payé. Non bloquant :
  // un échec ici n'annule pas l'encaissement, il se voit dans la console.
  if (totalEncaisse > 0) {
    try {
      await authFetch("/api/admin/confirmer-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
    } catch (e) { console.error("Confirmation des places tenues:", e); }
  }

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
}
