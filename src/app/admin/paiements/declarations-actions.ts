import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createEncaissement } from "@/lib/compta-encaissement";
import {
  emailLayout,
  emailLigne,
  emailPanneau,
  emailParagraphe as P,
  emailSignature,
  emailTitre,
} from "@/lib/email-templates";
import { authFetch } from "@/lib/auth-fetch";
import { renderDerouleStage } from "@/lib/stage-deroule";
import { encadreConditionsPourType } from "@/lib/cgv-clauses";

export type DeclarationPaiement = {
  id: string;
  familyId?: string;
  familyName: string;
  familyEmail?: string;
  paymentId?: string;
  montant: number;
  mode: string;
  note?: string;
  chequeRef?: string;
  activityTitle?: string;
  dateEncaissement?: string;
  createdAt?: { seconds?: number };
  status?: string;
  type?: string;
  pendingEnrollments?: Array<{ creneauId: string; childId: string }>;
  reservationIds?: string[];
  forfaitPayloads?: Record<string, unknown>[];
};

export function libelleModeDeclaration(mode: string): string {
  if (mode === "cheque") return "Chèque";
  if (mode === "virement") return "Virement";
  if (mode === "cb_terminal") return "Carte bancaire au club";
  if (mode === "especes") return "Espèces";
  return "Règlement";
}

function referenceDeclaration(declaration: DeclarationPaiement): string {
  return declaration.chequeRef
    ? `Chèque n°${declaration.chequeRef}`
    : (declaration.note || "");
}

async function finaliserPlacesEtForfaits(declaration: DeclarationPaiement) {
  for (const pending of declaration.pendingEnrollments || []) {
    try {
      const creneauRef = doc(db, "creneaux", pending.creneauId);
      const creneauSnap = await getDoc(creneauRef);
      if (!creneauSnap.exists()) continue;
      const enrolled = (creneauSnap.data().enrolled || []).map((enrollment: any) =>
        enrollment.childId === pending.childId && enrollment.pending
          ? { ...enrollment, pending: false }
          : enrollment,
      );
      await updateDoc(creneauRef, { enrolled });
    } catch (error) {
      console.error("Finalisation créneau:", error);
    }
  }

  for (const reservationId of declaration.reservationIds || []) {
    try {
      await updateDoc(doc(db, "reservations", reservationId), {
        status: "confirmed",
        confirmedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Confirmation réservation:", error);
    }
  }

  for (const forfaitPayload of declaration.forfaitPayloads || []) {
    try {
      await addDoc(collection(db, "forfaits"), {
        ...forfaitPayload,
        paymentId: declaration.paymentId || null,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Création forfait:", error);
    }
  }
}

async function envoyerConfirmationDeclaration(declaration: DeclarationPaiement) {
  if (!declaration.familyEmail) return;

  let derouleHtml = "";
  let typeCgv = "";
  try {
    const creneauId = declaration.pendingEnrollments?.[0]?.creneauId;
    if (creneauId) {
      const creneauSnap = await getDoc(doc(db, "creneaux", creneauId));
      typeCgv = creneauSnap.exists()
        ? String((creneauSnap.data() as any).activityType || "")
        : "";
    }
    if (typeCgv === "stage" || typeCgv === "stage_journee") {
      const derouleSnap = await getDoc(doc(db, "settings", "stageDeroule"));
      derouleHtml = renderDerouleStage(derouleSnap.exists() ? (derouleSnap.data() as any) : null);
    }
  } catch {
    // Le déroulé et les CGV enrichissent l'email, ils ne bloquent pas la confirmation.
  }

  void authFetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: declaration.familyEmail,
      subject: `Paiement confirmé — ${declaration.montant.toFixed(2)}€`,
      context: "admin_confirmation_declaration",
      template: "confirmationDeclaration",
      familyId: declaration.familyId,
      paymentId: declaration.paymentId,
      html: emailLayout([
        emailTitre("Règlement bien reçu"),
        P(`Bonjour <strong>${declaration.familyName}</strong>,`),
        P("Nous avons bien reçu votre règlement, et votre inscription est confirmée."),
        emailPanneau("Détail", [
          emailLigne("Montant", `${declaration.montant.toFixed(2).replace(".", ",")}&nbsp;€`),
          emailLigne("Mode de règlement", libelleModeDeclaration(declaration.mode)),
          emailLigne("Prestations", declaration.activityTitle || ""),
        ].join("")),
        derouleHtml,
        encadreConditionsPourType(typeCgv),
        emailSignature("Merci de votre confiance."),
      ].join("\n"), `${declaration.montant.toFixed(2).replace(".", ",")} € reçus — ${declaration.activityTitle || ""}`),
    }),
  }).catch(() => {});
}

export async function confirmerDeclarationPaiement(
  declaration: DeclarationPaiement,
): Promise<{ dejaConfirmee: boolean }> {
  const declarationRef = doc(db, "payment_declarations", declaration.id);
  const declarationSnap = await getDoc(declarationRef);
  if (!declarationSnap.exists() || declarationSnap.data()?.status === "confirmed") {
    return { dejaConfirmee: true };
  }

  if (declaration.paymentId) {
    const paymentRef = doc(db, "payments", declaration.paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (paymentSnap.exists()) {
      const payment = paymentSnap.data();
      const newPaid = Math.round(((payment.paidAmount || 0) + declaration.montant) * 100) / 100;
      const newStatus = newPaid >= (payment.totalTTC || 0) ? "paid" : "partial";
      const paymentReference = referenceDeclaration(declaration);

      await updateDoc(paymentRef, {
        paidAmount: newPaid,
        status: newStatus,
        paymentMode: declaration.mode,
        paymentRef: paymentReference,
        updatedAt: serverTimestamp(),
      });

      const explicitDate = declaration.dateEncaissement
        ? new Date(`${declaration.dateEncaissement}T12:00:00`)
        : new Date();
      await createEncaissement({
        paymentId: declaration.paymentId,
        familyId: declaration.familyId,
        familyName: declaration.familyName,
        montant: declaration.montant,
        mode: declaration.mode,
        modeLabel: declaration.mode === "cheque"
          ? `Chèque${declaration.chequeRef ? ` n°${declaration.chequeRef}` : ""}`
          : libelleModeDeclaration(declaration.mode),
        ref: paymentReference,
        activityTitle: declaration.activityTitle,
        explicitDate,
      });
    }
  }

  await finaliserPlacesEtForfaits(declaration);
  await updateDoc(declarationRef, {
    status: "confirmed",
    confirmedAt: serverTimestamp(),
  });
  await envoyerConfirmationDeclaration(declaration);

  return { dejaConfirmee: false };
}

export async function rejeterDeclarationPaiement(declaration: DeclarationPaiement): Promise<void> {
  if (declaration.type === "inscription_annuelle") {
    for (const pending of declaration.pendingEnrollments || []) {
      try {
        const creneauRef = doc(db, "creneaux", pending.creneauId);
        const creneauSnap = await getDoc(creneauRef);
        if (!creneauSnap.exists()) continue;
        const enrolled = (creneauSnap.data().enrolled || []).filter(
          (enrollment: any) => !(enrollment.childId === pending.childId && enrollment.pending),
        );
        await updateDoc(creneauRef, { enrolled, enrolledCount: enrolled.length });
      } catch (error) {
        console.error("Libération créneau:", error);
      }
    }

    for (const reservationId of declaration.reservationIds || []) {
      try {
        await deleteDoc(doc(db, "reservations", reservationId));
      } catch (error) {
        console.error("Suppression réservation:", error);
      }
    }

    if (declaration.paymentId) {
      try {
        await deleteDoc(doc(db, "payments", declaration.paymentId));
      } catch (error) {
        console.error("Suppression paiement:", error);
      }
    }
  }

  await updateDoc(doc(db, "payment_declarations", declaration.id), {
    status: "rejected",
    rejectedAt: serverTimestamp(),
  });
}
