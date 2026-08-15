"use client";
import React from "react";
import { CreditCard, Loader2, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import type { Family } from "@/types";

/**
 * src/app/admin/paiements/ModaleLienPaiement.tsx
 *
 * Envoi d'un lien de paiement en ligne (CAWL) par email pour une commande
 * impayée.
 *
 * Le destinataire n'est PAS forcément le titulaire du compte : grands-parents,
 * comité d'entreprise, mairie… d'où le champ email libre et la mention sous
 * le champ — l'encaissement est rattaché à la famille de la commande quel que
 * soit celui qui paie. Le montant est modifiable pour permettre un acompte,
 * plafonné au reste dû.
 *
 * Le bouton « Générer avec l'IA » ne fait que pré-remplir la zone de texte :
 * rien n'est envoyé tant que l'admin n'a pas relu et cliqué.
 */

interface ModaleLienPaiementProps {
  payLinkModal: any;
  setPayLinkModal: (val: any) => void;
  payLinkEmail: string;
  setPayLinkEmail: (val: string) => void;
  payLinkAmount: string;
  setPayLinkAmount: (val: string) => void;
  payLinkMessage: string;
  setPayLinkMessage: (val: string) => void;
  payLinkGenerating: boolean;
  setPayLinkGenerating: (val: boolean) => void;
  payLinkSending: boolean;
  setPayLinkSending: (val: boolean) => void;
  families: (Family & { firestoreId: string })[];
  toast: (message: string, type?: "error" | "success" | "warning" | "info", duration?: number) => void;
}

export function ModaleLienPaiement({
  payLinkModal, setPayLinkModal, payLinkEmail, setPayLinkEmail,
  payLinkAmount, setPayLinkAmount, payLinkMessage, setPayLinkMessage,
  payLinkGenerating, setPayLinkGenerating, payLinkSending, setPayLinkSending,
  families, toast,
}: ModaleLienPaiementProps) {
  const p = payLinkModal;
  const due = (p.totalTTC || 0) - (p.paidAmount || 0);
  const prestations = (p.items || []).map((i: any) => `${i.activityTitle}${i.childName ? ` — ${i.childName}` : ""}`).join(", ");

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPayLinkModal(null)}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h2 className="font-display text-lg font-bold text-blue-800">💳 Envoyer un lien de paiement</h2>
            <p className="font-body text-xs text-slate-500 mt-0.5">{p.familyName} · {prestations.slice(0, 60)}</p>
          </div>
          <button onClick={() => setPayLinkModal(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center cursor-pointer border-none"><X size={16} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Email destinataire</label>
            <input type="email" value={payLinkEmail} onChange={e => setPayLinkEmail(e.target.value)}
              placeholder="email@exemple.com"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none" />
            <p className="font-body text-[10px] text-slate-400 mt-1">Le paiement sera encaissé sur le compte de {p.familyName} quel que soit l'email</p>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-slate-600 block mb-1">Montant (€)</label>
            <input type="number" step="0.01" min="1" max={due} value={payLinkAmount} onChange={e => setPayLinkAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none" />
            <p className="font-body text-[10px] text-slate-400 mt-1">Reste dû : {due.toFixed(2)}€ — vous pouvez envoyer un montant partiel</p>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-body text-xs font-semibold text-slate-600">Message personnalisé</label>
              <button disabled={payLinkGenerating} onClick={async () => {
                setPayLinkGenerating(true);
                try {
                  const res = await authFetch("/api/ia", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt: `Tu es l'assistant du Centre Équestre d'Agon-Coutainville. Rédige un email court et chaleureux pour envoyer un lien de paiement.

Contexte :
- Famille : ${p.familyName}
- Prestations : ${prestations}
- Montant à payer : ${payLinkAmount}€
- Reste dû total : ${due.toFixed(2)}€
- Destinataire : ${payLinkEmail}
${payLinkEmail !== families.find(f => f.firestoreId === p.familyId)?.parentEmail ? `- Note : le destinataire n'est PAS le titulaire du compte (peut-être un grand-parent, CE, mairie...)` : ""}

Règles :
- Commence par "Bonjour" (pas de nom si le destinataire est différent du titulaire)
- Mentionne les prestations et le montant
- Ton chaleureux et professionnel
- 3-4 phrases max
- Pas de formule de politesse finale (le template email s'en charge)
- Format texte simple (pas de HTML)`,
                    }),
                  });
                  const data = await res.json();
                  const text = data.content?.[0]?.text || data.text || data.message || "";
                  setPayLinkMessage(text);
                } catch (e) { console.error(e); toast("Erreur IA", "error"); }
                setPayLinkGenerating(false);
              }}
                className="font-body text-[10px] text-purple-600 bg-purple-50 px-3 py-1 rounded-lg border-none cursor-pointer hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1">
                {payLinkGenerating ? <Loader2 size={10} className="animate-spin" /> : "✨"} Générer avec l'IA
              </button>
            </div>
            <textarea value={payLinkMessage} onChange={e => setPayLinkMessage(e.target.value)}
              rows={4} placeholder="Message optionnel qui sera inclus dans l'email..."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 font-body text-sm bg-white focus:border-blue-400 focus:outline-none resize-none" />
          </div>

          {/* Aperçu */}
          {payLinkMessage && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="font-body text-[10px] text-blue-500 font-semibold uppercase mb-1">Aperçu du message</div>
              <p className="font-body text-xs text-slate-600 whitespace-pre-wrap">{payLinkMessage}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={() => setPayLinkModal(null)}
            className="font-body text-sm text-slate-500 bg-white px-5 py-2.5 rounded-lg border border-gray-200 cursor-pointer">Annuler</button>
          <button disabled={payLinkSending || !payLinkEmail || !payLinkAmount || parseFloat(payLinkAmount) <= 0}
            onClick={async () => {
              setPayLinkSending(true);
              try {
                const res = await authFetch("/api/send-payment-link", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    paymentId: p.id,
                    recipientEmail: payLinkEmail,
                    amount: parseFloat(payLinkAmount),
                    message: payLinkMessage,
                    familyId: p.familyId,
                    familyName: p.familyName,
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Erreur");
                toast(`✅ Lien envoyé à ${payLinkEmail} — ${parseFloat(payLinkAmount).toFixed(2)}€`, "success");
                setPayLinkModal(null);
              } catch (e: any) {
                console.error(e);
                toast(e.message || "Erreur envoi", "error");
              }
              setPayLinkSending(false);
            }}
            className="font-body text-sm font-semibold text-white bg-indigo-500 px-6 py-2.5 rounded-lg border-none cursor-pointer hover:bg-indigo-400 disabled:opacity-50 flex items-center gap-2">
            {payLinkSending ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            Envoyer le lien
          </button>
        </div>
      </div>
    </div>
  );
}
