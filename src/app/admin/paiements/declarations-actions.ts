import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
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
import { construireEcheancier, nombreEcheances } from "@/lib/echeancier-paiement";
import { todayLocalString } from "@/lib/date-local";
import { lignesDetailHtml } from "@/lib/email-prestations";

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
  paymentPlan?: string;
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

  for (const [index, forfaitPayload] of (declaration.forfaitPayloads || []).entries()) {
    try {
      // ID déterministe : si la validation est relancée après une coupure,
      // le même forfait est complété au lieu d'être créé une seconde fois.
      await setDoc(doc(db, "forfaits", `${declaration.id}-forfait-${index + 1}`), {
        ...forfaitPayload,
        paymentId: declaration.paymentId || null,
        sourceDeclarationId: declaration.id,
        createdAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error("Création forfait:", error);
    }
  }
}

async function creerEcheancierDeclaration(
  declaration: DeclarationPaiement,
  paymentRef: ReturnType<typeof doc>,
  payment: Record<string, any>,
): Promise<number> {
  const nb = nombreEcheances(declaration.paymentPlan || payment.paymentPlan);
  if (nb <= 1) return 1;

  // Si l'échéancier existe déjà, une nouvelle tentative ne doit jamais le
  // dupliquer. Les identifiants des échéances 2..N sont déterministes.
  if (Number(payment.echeancesTotal || 0) > 1) return nb;

  const echeancier = construireEcheancier({
    totalTTC: Number(payment.totalTTC || declaration.montant || 0),
    items: Array.isArray(payment.items) ? payment.items : [],
    paymentPlan: declaration.paymentPlan || payment.paymentPlan,
    dateDepart: todayLocalString(),
  });
  const sourcePaymentId = declaration.paymentId!;
  const forfaitRef = payment.forfaitRef || declaration.activityTitle || "Inscription annuelle";

  // Écrire d'abord 2..N, puis remplacer la commande d'origine par l'échéance 1.
  // En cas d'interruption, relancer écrase les mêmes IDs au lieu de doubler.
  for (let i = 1; i < echeancier.length; i++) {
    const echeance = echeancier[i];
    const ref = doc(db, "payments", `${sourcePaymentId}-echeance-${String(i + 1).padStart(2, "0")}`);
    await setDoc(ref, {
      ...payment,
      ...echeance,
      paymentMode: declaration.mode,
      paymentPlan: declaration.paymentPlan,
      paymentRef: "",
      status: "pending",
      paidAmount: 0,
      skipPayment: true,
      awaitingValidation: false,
      sourcePaymentId,
      forfaitRef,
      createdAt: payment.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await setDoc(paymentRef, {
    ...payment,
    ...echeancier[0],
    paymentMode: declaration.mode,
    paymentPlan: declaration.paymentPlan,
    paymentRef: "",
    status: "pending",
    paidAmount: 0,
    skipPayment: true,
    awaitingValidation: false,
    sourcePaymentId,
    forfaitRef,
    updatedAt: serverTimestamp(),
  });

  return nb;
}

/**
 * Prestations de la commande, avec date et horaires sous chacune.
 *
 * La lettre reprenait `declaration.activityTitle`, un simple titre : la
 * famille lisait « Paiement confirmé — Stage poney » sans jour ni heure.
 * Les lignes de la commande portent tout cela ; pour une inscription
 * annuelle, c'est le forfait qui connaît le créneau récurrent.
 */
async function prestationsDetaillees(declaration: DeclarationPaiement): Promise<string> {
  try {
    if (declaration.paymentId) {
      const paymentSnap = await getDoc(doc(db, "payments", declaration.paymentId));
      const items = paymentSnap.exists() ? (paymentSnap.data() as any).items : null;
      if (Array.isArray(items) && items.length > 0) {
        const detail = lignesDetailHtml(items);
        if (detail) return detail;
      }
    }
    const forfaits = (declaration.forfaitPayloads || []) as any[];
    if (forfaits.length > 0) {
      return forfaits
        .map((f) => `${f.childName || ""} — ${f.activityTitle || "Forfait"}<br/><span style="color:#888;font-size:12px;">${[f.dayLabel, f.startTime && f.endTime ? `${f.startTime}–${f.endTime}` : f.startTime].filter(Boolean).join(" · ")}</span>`)
        .join("<br/><br/>");
    }
  } catch {
    // Le détail enrichit la lettre ; à défaut, le titre de la déclaration suffit.
  }
  return declaration.activityTitle || "";
}

async function envoyerConfirmationDeclaration(declaration: DeclarationPaiement) {
  if (!declaration.familyEmail) return;
  const prestations = await prestationsDetaillees(declaration);

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

  const nb = nombreEcheances(declaration.paymentPlan);
  const avecEcheancier = nb > 1;
  const total = `${declaration.montant.toFixed(2).replace(".", ",")}&nbsp;€`;

  void authFetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: declaration.familyEmail,
      subject: avecEcheancier
        ? `Inscription confirmée — échéancier ${nb}×`
        : `Paiement confirmé — ${declaration.montant.toFixed(2)}€`,
      context: "admin_confirmation_declaration",
      template: "confirmationDeclaration",
      familyId: declaration.familyId,
      paymentId: declaration.paymentId,
      html: emailLayout([
        emailTitre(avecEcheancier ? "Inscription et échéancier confirmés" : "Règlement bien reçu"),
        P(`Bonjour <strong>${declaration.familyName}</strong>,`),
        P(avecEcheancier
          ? `Votre inscription est confirmée. Votre règlement est réparti en <strong>${nb} échéances mensuelles</strong>.`
          : "Nous avons bien reçu votre règlement, et votre inscription est confirmée."),
        emailPanneau("Détail", [
          emailLigne(avecEcheancier ? "Total de l'inscription" : "Montant", total),
          ...(avecEcheancier ? [emailLigne("Échéancier", `${nb} mensualités`)] : []),
          emailLigne("Mode de règlement", libelleModeDeclaration(declaration.mode)),
          emailLigne("Prestations", prestations),
        ].join("")),
        derouleHtml,
        encadreConditionsPourType(typeCgv),
        emailSignature("Merci de votre confiance."),
      ].join("\n"), avecEcheancier
        ? `${nb} échéances créées — ${declaration.activityTitle || ""}`
        : `${declaration.montant.toFixed(2).replace(".", ",")} € reçus — ${declaration.activityTitle || ""}`),
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
      const nb = nombreEcheances(declaration.paymentPlan || payment.paymentPlan);

      if (nb > 1) {
        // Valider un plan 3×/10× crée de vraies échéances. Cela ne signifie
        // pas que le total annuel a été reçu : aucun encaissement n'est écrit.
        await creerEcheancierDeclaration(declaration, paymentRef, payment);
      } else {
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
