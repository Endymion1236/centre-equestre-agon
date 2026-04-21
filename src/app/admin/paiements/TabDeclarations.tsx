"use client";
import React, { useState } from "react";
import { updateDoc, addDoc, getDoc, doc, collection, query, where, getDocs, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeNumber, generateOrderId } from "@/lib/utils";
import { Card, Badge } from "@/components/ui";
import { Loader2, Check, X, CreditCard, Sparkles, AlertTriangle, Plus, Trash2, Search } from "lucide-react";
import { paymentModes } from "./types";
import { normalizePayment } from "./utils";
import { emailTemplates } from "@/lib/email-templates";
import { downloadInvoicePdf } from "@/lib/download-invoice";
import { authFetch } from "@/lib/auth-fetch";

interface TabDeclarationsProps {
  loading: boolean;
  payments: any[];
  declarations: any[];
  setDeclarations: React.Dispatch<React.SetStateAction<any[]>>;
  families: any[];
  avoirs: any[];
  broadcastSource: any | null;
  setBroadcastSource: React.Dispatch<React.SetStateAction<any | null>>;
  broadcastRows: any[];
  setBroadcastRows: React.Dispatch<React.SetStateAction<any[]>>;
  broadcastSearch: string;
  setBroadcastSearch: React.Dispatch<React.SetStateAction<string>>;
  broadcastSending: boolean;
  setBroadcastSending: React.Dispatch<React.SetStateAction<boolean>>;
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
  setPayments: React.Dispatch<React.SetStateAction<any[]>>;
}

export function TabDeclarations({
  loading, payments, declarations, setDeclarations, families, avoirs,
  broadcastSource, setBroadcastSource, broadcastRows, setBroadcastRows,
  broadcastSearch, setBroadcastSearch, broadcastSending, setBroadcastSending,
  toast, setPayments,
}: TabDeclarationsProps) {
  const inputCls = "w-full px-3 py-2.5 rounded-lg border border-blue-500/8 font-body text-sm bg-cream focus:border-blue-500 focus:outline-none";
  const [confirmingDeclId, setConfirmingDeclId] = useState<string | null>(null);

  return (
<div className="flex flex-col gap-4">
  <div className="flex items-center justify-between">
    <h2 className="font-display text-lg font-bold text-blue-800">Déclarations de paiement</h2>
    <span className="font-body text-xs text-slate-500">{declarations.length} en attente de confirmation</span>
  </div>

  {declarations.length === 0 ? (
    <Card padding="lg" className="text-center">
      <p className="font-body text-sm text-slate-500">Aucune déclaration en attente.</p>
      <p className="font-body text-xs text-slate-400 mt-1">Les familles peuvent déclarer un paiement chèque ou espèces depuis leur espace.</p>
    </Card>
  ) : (
    <div className="flex flex-col gap-3">
      {declarations.map((decl: any) => {
        const date = decl.createdAt?.seconds ? new Date(decl.createdAt.seconds * 1000) : new Date();
        return (
          <Card key={decl.id} padding="md">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-body text-base font-bold text-blue-800">{decl.familyName}</span>
                  <span className={`font-body text-xs font-semibold px-2 py-0.5 rounded-full ${
                    decl.mode === "cheque" ? "bg-blue-50 text-blue-700" :
                    decl.mode === "virement" ? "bg-purple-50 text-purple-700" :
                    "bg-green-50 text-green-700"
                  }`}>
                    {decl.mode === "cheque" ? "📝 Chèque" : decl.mode === "virement" ? "🏦 Virement" : "💵 Espèces"}
                  </span>
                </div>
                <div className="font-body text-sm text-slate-600">{decl.activityTitle}</div>
                {decl.note && <div className="font-body text-xs text-slate-400 mt-1 italic">"{decl.note}"</div>}
                <div className="font-body text-xs text-slate-400 mt-1">{date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-body text-xl font-bold text-blue-500 mb-2">{(decl.montant || 0).toFixed(2)}€</div>
                <div className="flex flex-col gap-1.5">
                  <button disabled={confirmingDeclId === decl.id} onClick={async () => {
                    if (!confirm(`Confirmer réception de ${decl.montant.toFixed(2)}€ en ${decl.mode === "cheque" ? "chèque" : decl.mode === "virement" ? "virement" : "espèces"} de ${decl.familyName} ?`)) return;
                    setConfirmingDeclId(decl.id);
                    try {
                      // Vérification anti-doublon
                      const declSnap = await getDoc(doc(db, "payment_declarations", decl.id));
                      if (!declSnap.exists() || declSnap.data()?.status === "confirmed") {
                        toast("Déjà confirmé", "info");
                        setDeclarations(prev => prev.filter(d => d.id !== decl.id));
                        setConfirmingDeclId(null);
                        return;
                      }
                      // Mettre à jour le paiement
                      console.log("Confirmation déclaration:", decl.id, "paymentId:", decl.paymentId);
                      if (decl.paymentId) {
                        const paySnap = await getDoc(doc(db, "payments", decl.paymentId));
                        console.log("Payment trouvé:", paySnap.exists(), paySnap.data()?.status);
                        if (paySnap.exists()) {
                          const pData = paySnap.data();
                          const newPaid = Math.round(((pData.paidAmount || 0) + decl.montant) * 100) / 100;
                          const newStatus = newPaid >= (pData.totalTTC || 0) ? "paid" : "partial";
                          const chequeRef = decl.chequeRef ? `Chèque n°${decl.chequeRef}` : (decl.note || "");
                          await updateDoc(doc(db, "payments", decl.paymentId), {
                            paidAmount: newPaid, status: newStatus,
                            paymentMode: decl.mode,
                            paymentRef: chequeRef,
                            updatedAt: serverTimestamp(),
                          });
                          // Créer un encaissement
                          const encDate = decl.dateEncaissement
                            ? new Date(decl.dateEncaissement + "T12:00:00")
                            : new Date();
                          await addDoc(collection(db, "encaissements"), {
                            paymentId: decl.paymentId,
                            familyId: decl.familyId,
                            familyName: decl.familyName,
                            montant: decl.montant,
                            mode: decl.mode,
                            modeLabel: decl.mode === "cheque" ? `Chèque${decl.chequeRef ? ` n°${decl.chequeRef}` : ""}` : decl.mode === "virement" ? "Virement" : "Espèces",
                            ref: chequeRef,
                            activityTitle: decl.activityTitle,
                            date: Timestamp.fromDate(encDate),
                          });
                        }
                      }
                      // Marquer la déclaration comme confirmée
                      await updateDoc(doc(db, "payment_declarations", decl.id), {
                        status: "confirmed", confirmedAt: serverTimestamp(),
                      });
                      // Email confirmation à la famille
                      if (decl.familyEmail) {
                        authFetch("/api/send-email", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            to: decl.familyEmail,
                            subject: `✅ Paiement confirmé — ${decl.montant.toFixed(2)}€`,
                            context: "admin_confirmation_declaration",
                            template: "confirmationDeclaration",
                            familyId: decl.familyId,
                            paymentId: decl.paymentId,
                            html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                              <p>Bonjour <strong>${decl.familyName}</strong>,</p>
                              <p>Nous avons bien reçu votre règlement :</p>
                              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
                                <p style="margin:0;color:#166534;font-weight:600;">✅ ${decl.montant.toFixed(2)}€ — ${decl.mode === "cheque" ? "Chèque" : decl.mode === "virement" ? "Virement" : "Espèces"}</p>
                                <p style="margin:8px 0 0;color:#555;font-size:13px;">${decl.activityTitle}</p>
                              </div>
                              <p>À bientôt au centre équestre !</p>
                            </div>`,
                          }),
                        }).catch(() => {});
                      }
                      setDeclarations(prev => prev.filter(d => d.id !== decl.id));
                      toast(`✅ Paiement de ${decl.familyName} confirmé`, "success");
                    } catch (e) { console.error("Erreur confirmation:", e); toast("Erreur lors de la confirmation", "error"); }
                    finally { setConfirmingDeclId(null); }
                    setConfirmingDeclId(null);
                  }}
                    className={`font-body text-xs font-semibold text-white px-4 py-2 rounded-lg border-none cursor-pointer ${confirmingDeclId === decl.id ? "bg-gray-400 cursor-not-allowed" : "bg-green-500 hover:bg-green-600"}`}>
                    {confirmingDeclId === decl.id ? "⏳ Confirmation..." : "✓ Confirmer réception"}
                  </button>
                  <button onClick={async () => {
                    await updateDoc(doc(db, "payment_declarations", decl.id), { status: "rejected", rejectedAt: serverTimestamp() });
                    setDeclarations(prev => prev.filter(d => d.id !== decl.id));
                  }}
                    className="font-body text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer">
                    Rejeter
                  </button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  )}
</div>
  );
}
