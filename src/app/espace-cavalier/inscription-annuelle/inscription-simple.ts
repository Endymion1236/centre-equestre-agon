/**
 * src/app/espace-cavalier/inscription-annuelle/inscription-simple.ts
 *
 * Inscription d'UN SEUL enfant, sans passer par le panier : la version
 * historique du parcours, avant que la validation groupée de la fratrie
 * (`validerPanier`) ne la remplace.
 *
 * ⚠️ CETTE FONCTION N'EST PLUS APPELÉE. Elle était déjà orpheline dans
 * `page.tsx` avant ce découpage : le bouton du récapitulatif appelle
 * `validerPanier`, qui traite le panier ET l'inscription en cours. Elle est
 * conservée telle quelle, sans la moindre modification, plutôt que supprimée :
 * la décision de jeter du code qui écrit des paiements ne se prend pas au
 * détour d'un refactoring, et son existence est signalée dans le rapport.
 *
 * Différences notables avec `validerPanier`, si on devait la réactiver :
 *  - elle ne connaît qu'un enfant, donc pas de dégressivité fratrie groupée ;
 *  - elle crée le paiement AVANT le checkout, sans y attacher les payloads de
 *    forfait, et ne gère ni chèque ni espèces (CB uniquement).
 */

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import type { CalculForfaitResult } from "@/lib/forfait-pricing";
import type {
  FamilleSession, PaymentPlan, UtilisateurSession, WeeklySlot,
} from "./types";

/**
 * Handle enrollment (mono-enfant, CB uniquement).
 * Voir l'avertissement en tête de fichier : non appelée aujourd'hui.
 */
export async function inscrireCavalierSeul(params: {
  user: UtilisateurSession | null;
  family: FamilleSession | null;
  child: any;
  selectedChild: string;
  selectedSlotsData: WeeklySlot[];
  forfaitType: "1x" | "2x" | "3x";
  frequence: 1 | 2 | 3;
  mode: "annuel" | "ponctuel";
  calcul: CalculForfaitResult;
  slotsPrices: { slot: WeeklySlot; sessions: number; forfaitPrice: number }[];
  grandTotal: number;
  paymentPlan: PaymentPlan;
  rangEnfant: number;
  licenceMoins18: boolean;
  setSubmitting: (v: boolean) => void;
  toast: (message: string, type?: "success" | "error") => void;
}): Promise<void> {
  const {
    user, family, child, selectedChild, selectedSlotsData, forfaitType, frequence,
    mode, calcul, slotsPrices, grandTotal, paymentPlan, rangEnfant, licenceMoins18,
    setSubmitting, toast,
  } = params;
  if (!user || !family || !child || selectedSlotsData.length === 0) return;
  setSubmitting(true);
  try {
    // Collect all creneauIds from all selected slots
    const allCreneauIds = selectedSlotsData.flatMap(s => s.creneauIds);

    // Inscription sécurisée côté serveur (audit P0 #3 + #7), marqueur forfait annuel.
    const enrollRes = await authFetch("/api/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollments: [{
          childId: selectedChild,
          childName: (child as any).firstName || "—",
          creneauIds: allCreneauIds,
          paymentSource: "forfait",
          forfaitId: null,
        }],
      }),
    });
    if (!enrollRes.ok) {
      const err = await enrollRes.json().catch(() => ({} as any));
      throw new Error(err.error || "Inscription refusée (créneau complet ?)");
    }

    // Create reservation records for tracking
    for (const slotData of selectedSlotsData) {
      await addDoc(collection(db, "reservations"), {
        familyId: user.uid,
        familyName: family.parentName,
        childId: selectedChild,
        childName: (child as any).firstName || "—",
        activityTitle: slotData.activityTitle,
        activityType: "cours",
        type: "annual",
        forfaitType,
        slotKey: slotData.key,
        dayOfWeek: slotData.dayOfWeek,
        dayLabel: slotData.dayLabel,
        startTime: slotData.startTime,
        endTime: slotData.endTime,
        totalSessions: slotData.totalSessions,
        creneauIds: slotData.creneauIds,
        status: "confirmed",
        createdAt: serverTimestamp(),
      });
    }

    // Create payment record
    if (mode === "annuel") {
      await addDoc(collection(db, "payments"), {
        familyId: user.uid,
        familyName: family.parentName,
        childId: selectedChild,
        childName: (child as any).firstName || "—",
        type: "inscription_annuelle",
        forfaitType,
        label: `Inscription annuelle ${forfaitType === "3x" ? "3×/sem" : forfaitType === "2x" ? "2×/sem" : "1×/sem"} — ${(child as any).firstName}`,
        items: [
          ...calcul.detailLignes.map(l => ({ label: l.label, amount: l.montantTTC })),
          ...slotsPrices.map(sp => ({
            label: `${sp.slot.activityTitle} — ${sp.slot.dayLabel} ${sp.slot.startTime}–${sp.slot.endTime} (${sp.sessions} séances)`,
            amount: 0, // détail informatif ; le prix forfait est déjà dans detailLignes
          })),
        ],
        totalTTC: grandTotal,
        paidAmount: 0,
        paymentPlan,
        // Toujours créer en "pending" côté client — les règles Firestore
        // durcies n'autorisent pas d'autres status à la création. Le passage
        // en "echeance"/"paid" se fait ensuite via admin ou webhook CAWL.
        status: "pending",
        skipPayment: true,
        source: "client",
        createdAt: serverTimestamp(),
      });
    }
    try {
      const res = await authFetch("/api/cawl/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: user.uid,
          familyEmail: family.parentEmail,
          familyName: family.parentName,
          items: [
            ...(calcul.prixAdhesion > 0 ? [{ name: "Adhésion annuelle", description: `Adhésion club (enfant ${rangEnfant})`, priceInCents: Math.round(calcul.prixAdhesion * 100), quantity: 1 }] : []),
            ...(calcul.prixLicence > 0 ? [{ name: "Licence FFE", description: licenceMoins18 ? "-18 ans" : "+18 ans", priceInCents: Math.round(calcul.prixLicence * 100), quantity: 1 }] : []),
            { name: `Forfait ${frequence}×/semaine`, description: `${selectedSlotsData.map(s => `${s.dayLabel} ${s.startTime}`).join(", ")}`, priceInCents: Math.round(calcul.prixForfaitNet * 100), quantity: 1 },
          ],
          metadata: {
            type: "inscription_annuelle",
            forfaitType,
            childId: selectedChild,
            childName: (child as any).firstName,
          },
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch (cawlErr) {
      console.error("CAWL checkout (non-bloquant):", cawlErr);
    }

    // Fallback: redirect with success
    window.location.href = "/espace-cavalier/reservations?success=true";
  } catch (e) {
    console.error("Erreur inscription:", e);
    toast("Erreur lors de l'inscription. Veuillez réessayer.", "error");
  } finally {
    setSubmitting(false);
  }
}
