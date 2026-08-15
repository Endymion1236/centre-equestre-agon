"use client";
/**
 * src/app/admin/planning/FormulaireEmailCreneau.tsx
 *
 * Écrire à toutes les familles inscrites sur un créneau (message de reprise,
 * changement d'horaire, matériel à prévoir…), avec assistance IA facultative.
 *
 * Présentationnel : l'envoi lui-même (une requête par destinataire + trace
 * dans `emailsReprise`) reste dans le panneau, parce qu'il touche à la liste
 * des inscrits et doit rester lisible d'un seul tenant.
 */

import { X, Loader2, Sparkles, Send } from "lucide-react";

export default function FormulaireEmailCreneau({
  nbDestinataires, emailSubject, setEmailSubject, emailBody, setEmailBody,
  emailGenerating, emailSending, onGenerer, onEnvoyer, onFermer,
}: {
  nbDestinataires: number;
  emailSubject: string;
  setEmailSubject: (v: string) => void;
  emailBody: string;
  setEmailBody: (v: string) => void;
  emailGenerating: boolean;
  emailSending: boolean;
  onGenerer: () => void;
  onEnvoyer: () => void;
  onFermer: () => void;
}) {
  return (
            <div className="mb-4 border border-blue-200 rounded-xl overflow-hidden">
              <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between">
                <span className="font-body text-xs font-semibold text-blue-700">📧 Email aux {nbDestinataires} famille{nbDestinataires > 1 ? "s" : ""}</span>
                <button onClick={onFermer} className="text-blue-400 hover:text-blue-600 bg-transparent border-none cursor-pointer"><X size={14} /></button>
              </div>
              <div className="p-4 space-y-3">
                <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                  placeholder="Objet de l'email"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm focus:outline-none focus:border-blue-500" />
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)}
                  placeholder="Votre message aux familles..."
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 font-body text-sm resize-y focus:outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <button onClick={onGenerer} disabled={emailGenerating}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-purple-100 disabled:opacity-50">
                    {emailGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Générer avec IA
                  </button>
                  <button onClick={onEnvoyer} disabled={emailSending || !emailSubject || !emailBody}
                    className="flex-1 flex items-center justify-center gap-1.5 font-body text-xs font-semibold text-white bg-blue-500 px-3 py-2 rounded-lg border-none cursor-pointer hover:bg-blue-600 disabled:opacity-50">
                    {emailSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Envoyer
                  </button>
                </div>
              </div>
            </div>
  );
}
