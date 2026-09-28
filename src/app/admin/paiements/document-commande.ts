import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { facturePdfEnBase64, type ParamsFacturePdf } from "@/lib/download-invoice";
import { emailTemplates } from "@/lib/email-templates";
import { authFetch } from "@/lib/auth-fetch";
import { echeancierSepaFacture } from "@/lib/echeancier-sepa-facture";
import type { DemandeConfirmation } from "@/components/ui/Confirm";
import { paymentModes } from "./types";

/**
 * Facture ou proforma d'une commande : téléchargement et envoi par email.
 *
 * Sorti de l'onglet Impayés pour servir aussi à l'Historique : une commande
 * réglée par prélèvement SEPA n'est plus dans les Impayés, et la famille qui
 * demandait sa facture ne pouvait plus la recevoir (septembre 2026).
 */

/**
 * Les données du PDF d'une commande : la facture si elle est numérotée, sinon
 * une proforma (référence PF-…). Le même document au téléchargement et à l'envoi.
 */
export function paramsPdfCommande(p: any, fam: any): ParamsFacturePdf {
  const items = p.items || [];
  const totalHT = items.reduce((s: number, i: any) => s + (i.priceHT || 0), 0);
  const totalTTC = p.totalTTC || 0;
  const invDate = p.date?.seconds ? new Date(p.date.seconds * 1000) : new Date();
  const invoiceNumber = p.invoiceNumber || `PF-${(p.orderId || p.id || "").slice(-6).toUpperCase()}`;
  const civilite = fam?.civilite ? `${fam.civilite} ` : "";
  const adresseLines = [fam?.address, [fam?.zipCode, fam?.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
  return { invoiceNumber, date: invDate.toLocaleDateString("fr-FR"), familyName: `${civilite}${p.familyName}`, familyEmail: fam?.parentEmail || "", familyAddress: adresseLines, serviceFacture: p.serviceFacture || undefined, items, totalHT, totalTVA: totalTTC - totalHT, totalTTC, paidAmount: p.paidAmount || 0, paymentMode: p.paymentMode ? (paymentModes.find(m => m.id === p.paymentMode)?.label || p.paymentMode) : "", paymentDate: p.paidAmount > 0 ? invDate.toLocaleDateString("fr-FR") : "", paymentId: p.id };
}

/** Montant des prélèvements SEPA encore à venir pour cette commande (0 s'il n'y en a pas). */
async function prelevementPrevu(p: any, resteDu: number): Promise<number> {
  if (resteDu <= 0) return 0;
  try {
    const [parPaiement, parCommande] = await Promise.all([
      getDocs(query(collection(db, "echeances-sepa"), where("paymentId", "==", p.id))),
      p.orderId ? getDocs(query(collection(db, "echeances-sepa"), where("orderId", "==", p.orderId))) : Promise.resolve(null),
    ]);
    const vues = new Map<string, any>();
    for (const d of [...parPaiement.docs, ...(parCommande?.docs || [])]) vues.set(d.id, d.data());
    return echeancierSepaFacture([...vues.values()], resteDu)?.montantPrevu || 0;
  } catch (e) {
    console.warn("[document] échéancier SEPA illisible:", e);
    return 0;
  }
}

export async function envoyerDocumentCommande(
  ctx: { families: any[]; confirmer: (d: DemandeConfirmation) => Promise<boolean> },
  rappels: {
    toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
    setEnvoiDocumentPour: (id: string | null) => void;
  },
  p: any,
) {
  const { families, confirmer } = ctx;
  const { toast, setEnvoiDocumentPour } = rappels;
  const fam = families.find(f => f.firestoreId === p.familyId);
  const email = fam?.parentEmail || "";
  if (!email) { toast("Pas d'email pour cette famille : complétez sa fiche.", "warning"); return; }
  const nature: "facture" | "proforma" = p.invoiceNumber ? "facture" : "proforma";
  const params = paramsPdfCommande(p, fam);
  const resteDu = Math.max(0, Math.round(((p.totalTTC || 0) - (p.paidAmount || 0)) * 100) / 100);
  const preleve = await prelevementPrevu(p, resteDu);
  const resteARegler = Math.max(0, Math.round((resteDu - preleve) * 100) / 100);
  if (!(await confirmer({
    titre: `Envoyer ${nature === "facture" ? `la facture ${p.invoiceNumber}` : "la facture proforma"} à ${email} ?`,
    details: [
      `${p.familyName} — ${(p.totalTTC || 0).toFixed(2)} €${preleve > 0 ? `, ${preleve.toFixed(2)} € prélevés selon l'échéancier` : ""}${resteARegler > 0 ? `, reste à régler ${resteARegler.toFixed(2)} €` : ""}.`,
      "Le PDF part en pièce jointe, sans lien de paiement.",
      ...(nature === "proforma" ? ["Une proforma n'est pas une facture définitive : l'email le précise."] : []),
    ],
    libelleConfirmer: "Envoyer",
  }))) return;
  setEnvoiDocumentPour(p.id);
  try {
    const contenu = await facturePdfEnBase64(params);
    const emailData = emailTemplates.envoiDocument({
      parentName: p.familyName || "", nature, numero: p.invoiceNumber || "", montant: p.totalTTC || 0, resteDu: resteARegler,
      prelevementPrevu: preleve,
      prestations: (p.items || []).map((i: any) => i.activityTitle).join(", "),
    });
    const res = await authFetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email, ...emailData,
        attachments: [{ filename: `${nature}-${params.invoiceNumber}.pdf`, content: contenu }],
        context: nature === "facture" ? "admin_envoi_facture" : "admin_envoi_proforma",
        template: "envoiDocument", familyId: p.familyId, paymentId: p.id,
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `erreur ${res.status}`);
    toast(`${nature === "facture" ? "Facture" : "Proforma"} envoyée à ${email}`, "success");
  } catch (e: any) {
    toast(`Envoi impossible : ${e?.message || e}`, "error");
  } finally {
    setEnvoiDocumentPour(null);
  }
}
